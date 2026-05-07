import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { runScan } from "../index.js"
import { writeDashboard } from "./html-dashboard.js"

/**
 * Walk a JSON fragment and find the closing bracket/brace that matches the
 * opening character at `start`, respecting nested structures and strings.
 * Returns the parsed value or null on failure.
 */
function extractJsonValue(text, key) {
  const keyIdx = text.indexOf(key)
  if (keyIdx === -1) return null
  const colonIdx = text.indexOf(":", keyIdx + key.length)
  if (colonIdx === -1) return null

  let start = colonIdx + 1
  while (start < text.length && /\s/.test(text[start])) start++
  if (start >= text.length) return null

  const opener = text[start]
  const closer = opener === "{" ? "}" : opener === "[" ? "]" : null
  if (!closer) return null

  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") { i++ } // skip escaped char
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === opener) depth++
      else if (ch === closer) {
        depth--
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
        }
      }
    }
  }
  return null
}

/**
 * Read and parse resume-state.json.  If the file is too large or corrupt
 * (e.g. an old format that stored full axe results), fall back to a partial
 * read of the first 4 MB which always contains targetUrl, options, and the
 * remaining[] URL list (these appear before the massive completedResults
 * array in the old format).  On successful recovery the corrupt file is
 * replaced with a clean slim version so the next resume works normally.
 */
async function readResumeState(resumePath) {
  // Fast path: normal parse (works for every new slim-format file)
  try {
    const raw = await fs.readFile(resumePath, "utf8")
    return JSON.parse(raw)
  } catch {
    // Fall through to partial-read recovery
  }

  let fd
  try {
    fd = await fs.open(resumePath, "r")
    // 4 MB is enough to capture targetUrl, options, and the remaining[] array
    // even for very large sites (12 000 URLs × ~60 chars ≈ 720 KB).
    const buf = Buffer.alloc(4 * 1024 * 1024)
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
    const partial = buf.subarray(0, bytesRead).toString("utf8")

    // Pull targetUrl — a plain string value
    const urlMatch = partial.match(/"targetUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (!urlMatch) return null
    const targetUrl = JSON.parse(`"${urlMatch[1]}"`)

    const options = extractJsonValue(partial, '"options"')
    if (!options) return null

    const remaining = extractJsonValue(partial, '"remaining"') ?? []
    const completedUrls = extractJsonValue(partial, '"completedUrls"') ?? []

    // Overwrite the corrupt/oversized file with a clean slim version so
    // subsequent resume attempts (and index.js loadResumeState) work normally.
    const slim = { targetUrl, options, allUrls: [], remaining, completedUrls }
    await fs.writeFile(resumePath, JSON.stringify(slim, null, 2), "utf8")
    console.log(`[resume] Recovered corrupt resume-state.json — ${remaining.length} pages remaining`)
    return slim
  } catch (err) {
    console.log(`[resume] Could not recover resume-state.json: ${err.message}`)
    return null
  } finally {
    await fd?.close()
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
}

const WCAG_LEVELS = new Set(["A", "AA", "AAA"])

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream"
}

function safeResolve(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0])
  const relative = decoded === "/" ? "/index.html" : decoded
  const normalized = path.normalize(relative).replace(/^([.]{2}[\\/])+/, "")
  return path.join(root, normalized)
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => { body += chunk })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(payload))
}

export async function serveDashboard({ reportDir, port, defaultOptions = {}, initialUrl = null }) {
  let root = path.resolve(reportDir)
  let scanRunning = false
  let scanAbort = null // AbortController for current scan
  let lastScanUrl = null
  let lastScanOverrides = null

  // Always write fresh dashboard HTML so stale generated files never cause JS errors
  await writeDashboard(root)

  function buildScanOptions(overrides = {}) {
    const wcagLevel = WCAG_LEVELS.has(overrides.wcagLevel) ? overrides.wcagLevel : (defaultOptions.wcagLevel || "AAA")
    return {
      format: defaultOptions.format || "html,json,csv",
      locale: defaultOptions.locale || "en",
      wcagLevel,
      maxPages: Number(overrides.maxPages ?? defaultOptions.maxPages ?? 2000),
      concurrency: Number(overrides.concurrency ?? defaultOptions.concurrency ?? 10),
      depth: Number(overrides.depth ?? defaultOptions.depth ?? 6),
      sampleTemplates: Number(overrides.sampleTemplates ?? defaultOptions.sampleTemplates ?? 0),
      timeout: Number(defaultOptions.timeout ?? 30000),
      headless: defaultOptions.headless ?? true,
      include: overrides.include?.length ? overrides.include : (defaultOptions.include || []),
      exclude: overrides.exclude?.length ? overrides.exclude : (defaultOptions.exclude || []),
      sitemap: defaultOptions.sitemap || null,
      checkKeyboard: defaultOptions.checkKeyboard ?? true,
      checkAria: defaultOptions.checkAria ?? true,
      checkFocusOrder: defaultOptions.checkFocusOrder ?? true,
      contrastScreenshots: defaultOptions.contrastScreenshots ?? false,
      elementScreenshots: defaultOptions.elementScreenshots ?? true,
      failOnCritical: false,
      failOnSerious: false,
      reportDir: root
    }
  }

  async function startScan(url, overrides = {}) {
    const scanOptions = buildScanOptions(overrides)
    scanAbort = new AbortController()
    lastScanUrl = url
    lastScanOverrides = overrides

    scanRunning = true
    runScan(url, scanOptions, scanAbort.signal)
      .catch((err) => {
        console.log(`\nScan failed: ${err.message}`)
        if (err.stack) console.log(err.stack)
      })
      .finally(() => {
        scanRunning = false
        scanAbort = null
      })
  }

  function hasResumeState() {
    const resumePath = path.join(root, "raw", "resume-state.json")
    return fs.stat(resumePath).then(() => true).catch(() => false)
  }

  const server = http.createServer(async (req, res) => {
    // POST /api/scan — start a new scan
    if (req.method === "POST" && req.url === "/api/scan") {
      if (scanRunning) {
        sendJson(res, 409, { error: "A scan is already running" })
        return
      }

      try {
        const raw = await readBody(req)
        const params = JSON.parse(raw || "{}")
        const { url, ...overrides } = params

        if (!url || typeof url !== "string") {
          sendJson(res, 400, { error: "url is required" })
          return
        }

        try { new URL(url) } catch {
          sendJson(res, 400, { error: "Invalid URL" })
          return
        }

        await startScan(url, overrides)
        sendJson(res, 202, { status: "started", url })
      } catch (err) {
        sendJson(res, 400, { error: err.message })
      }
      return
    }

    // POST /api/scan/stop — stop the running scan
    if (req.method === "POST" && req.url === "/api/scan/stop") {
      if (!scanRunning || !scanAbort) {
        sendJson(res, 400, { error: "No scan is running" })
        return
      }
      scanAbort.abort()
      sendJson(res, 200, { status: "stopping" })
      return
    }

    // POST /api/scan/resume — resume a stopped scan
    if (req.method === "POST" && req.url === "/api/scan/resume") {
      if (scanRunning) {
        sendJson(res, 409, { error: "A scan is already running" })
        return
      }

      const canResume = await hasResumeState()
      if (!canResume) {
        sendJson(res, 400, { error: "No stopped scan to resume" })
        return
      }

      try {
        const resumeData = await readResumeState(path.join(root, "raw", "resume-state.json"))
        if (!resumeData?.targetUrl) {
          sendJson(res, 400, { error: "Resume state is missing or could not be recovered. Please start a new scan." })
          return
        }
        await startScan(resumeData.targetUrl, resumeData.options)
        sendJson(res, 202, { status: "resumed", url: resumeData.targetUrl })
      } catch (err) {
        sendJson(res, 400, { error: err.message })
      }
      return
    }

    // GET /api/status — check scan state
    if (req.method === "GET" && req.url?.startsWith("/api/status")) {
      const canResume = !scanRunning && await hasResumeState()
      sendJson(res, 200, { scanRunning, canResume })
      return
    }

    // POST /api/report-dir — change the report output directory
    if (req.method === "POST" && req.url === "/api/report-dir") {
      if (scanRunning) {
        sendJson(res, 409, { error: "Cannot change directory while scan is running" })
        return
      }
      try {
        const raw = await readBody(req)
        const { dir } = JSON.parse(raw || "{}")
        if (!dir || typeof dir !== "string") {
          sendJson(res, 400, { error: "dir is required" })
          return
        }
        const resolved = path.resolve(dir)
        await fs.mkdir(resolved, { recursive: true })
        root = resolved
        await writeDashboard(root)
        sendJson(res, 200, { status: "ok", reportDir: resolved })
      } catch (err) {
        sendJson(res, 400, { error: err.message })
      }
      return
    }

    // GET /api/report-dir — get the current report directory
    if (req.method === "GET" && req.url?.startsWith("/api/report-dir")) {
      sendJson(res, 200, { reportDir: root })
      return
    }

    // Static file serving
    const filePath = safeResolve(root, req.url || "/")
    try {
      const stat = await fs.stat(filePath)
      const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath
      const data = await fs.readFile(finalPath)
      const ct = contentType(finalPath)
      const headers = { "content-type": ct }
      if (ct.startsWith("text/html")) headers["cache-control"] = "no-store"
      res.writeHead(200, headers)
      res.end(data)
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      res.end("Not found. Run a scan first to generate dashboard files.")
    }
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })

  console.log(`Dashboard available at http://127.0.0.1:${port}`)
  console.log("Press Ctrl+C to stop the server")

  if (initialUrl) {
    console.log(`Starting scan for ${initialUrl}...`)
    await startScan(initialUrl)
  }
}
