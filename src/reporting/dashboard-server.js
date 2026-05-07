import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { runScan } from "../index.js"
import { writeDashboard } from "./html-dashboard.js"
import { ProjectStore } from "../store/project-store.js"
import { renderProjectsHome } from "./projects-home.js"

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
      if (ch === "\\") { i++ }
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

async function readResumeState(resumePath) {
  try {
    const raw = await fs.readFile(resumePath, "utf8")
    return JSON.parse(raw)
  } catch { /* fall through */ }

  let fd
  try {
    fd = await fs.open(resumePath, "r")
    const buf = Buffer.alloc(4 * 1024 * 1024)
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
    const partial = buf.subarray(0, bytesRead).toString("utf8")

    const urlMatch = partial.match(/"targetUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (!urlMatch) return null
    const targetUrl = JSON.parse(`"${urlMatch[1]}"`)

    const options = extractJsonValue(partial, '"options"')
    if (!options) return null

    const remaining = extractJsonValue(partial, '"remaining"') ?? []
    const slim = { targetUrl, options, allUrls: [], remaining }
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

function sendHtml(res, html) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
  res.end(html)
}

function resumeMetaPath(scanDir) {
  return path.join(scanDir, "raw", "resume-state.json")
}

export async function serveDashboard({ dataDir, port, defaultOptions = {}, initialUrl = null }) {
  const store = new ProjectStore(path.resolve(dataDir))
  await fs.mkdir(path.resolve(dataDir), { recursive: true })

  // Per-project scan state: projectId → { scanRunning, scanAbort, currentScanDir }
  const scanState = new Map()

  function getState(projectId) {
    if (!scanState.has(projectId)) {
      scanState.set(projectId, { scanRunning: false, scanAbort: null, currentScanDir: null })
    }
    return scanState.get(projectId)
  }

  function buildScanOptions(project, overrides = {}) {
    const merged = { ...defaultOptions, ...(project.options || {}), ...overrides }
    const wcagLevel = WCAG_LEVELS.has(merged.wcagLevel) ? merged.wcagLevel : "AAA"
    return {
      format: merged.format || "html,json,csv",
      locale: merged.locale || "en",
      wcagLevel,
      maxPages: Number(merged.maxPages ?? 2000),
      concurrency: Number(merged.concurrency ?? 10),
      depth: Number(merged.depth ?? 6),
      sampleTemplates: Number(merged.sampleTemplates ?? 0),
      timeout: Number(merged.timeout ?? 30000),
      headless: merged.headless ?? true,
      include: merged.include?.length ? merged.include : [],
      exclude: merged.exclude?.length ? merged.exclude : [],
      sitemap: merged.sitemap || null,
      checkKeyboard: merged.checkKeyboard ?? true,
      checkAria: merged.checkAria ?? true,
      checkFocusOrder: merged.checkFocusOrder ?? true,
      contrastScreenshots: merged.contrastScreenshots ?? false,
      elementScreenshots: merged.elementScreenshots ?? true,
      failOnCritical: false,
      failOnSerious: false,
      projectId: project.id,
      projectUrl: project.url,
      reportDir: store.scanDir(project.id)
    }
  }

  async function startProjectScan(project, overrides = {}) {
    const state = getState(project.id)
    const scanOptions = buildScanOptions(project, overrides)
    const scanDir = scanOptions.reportDir

    await fs.mkdir(scanDir, { recursive: true })
    await writeDashboard(scanDir, { projectId: project.id, projectUrl: project.url })

    state.currentScanDir = scanDir
    state.scanRunning = true
    state.scanAbort = new AbortController()

    await store.update(project.id, {
      lastScanAt: new Date().toISOString(),
      lastScanDir: scanDir,
      lastScanStatus: "running"
    })

    runScan(project.url, scanOptions, state.scanAbort.signal)
      .then(async (result) => {
        await store.update(project.id, {
          lastScanStatus: result.stopped ? "stopped" : "completed",
          lastViolations: result.summary?.totalViolations ?? null,
          lastPages: result.summary?.scannedPages ?? null,
          lastScanDir: scanDir
        })
      })
      .catch(async (err) => {
        console.log(`\n[project:${project.id}] Scan failed: ${err.message}`)
        if (err.stack) console.log(err.stack)
        await store.update(project.id, { lastScanStatus: "failed" })
      })
      .finally(() => {
        state.scanRunning = false
        state.scanAbort = null
      })
  }

  async function hasResumeState(scanDir) {
    return fs.stat(resumeMetaPath(scanDir)).then(() => true).catch(() => false)
  }

  function projectStaticRoot(project) {
    const state = getState(project.id)
    return (state.scanRunning && state.currentScanDir) ? state.currentScanDir : project.lastScanDir
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/"

    // --- Home: GET / ---
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      const projects = await store.list()
      const augmented = projects.map((p) => ({
        ...p,
        scanRunning: getState(p.id).scanRunning
      }))
      sendHtml(res, renderProjectsHome(augmented))
      return
    }

    // --- GET /api/projects ---
    if (req.method === "GET" && url.startsWith("/api/projects") && !url.match(/^\/api\/projects\/[^/]/)) {
      const projects = await store.list()
      sendJson(res, 200, projects.map((p) => ({
        ...p,
        scanRunning: getState(p.id).scanRunning
      })))
      return
    }

    // --- POST /api/projects ---
    if (req.method === "POST" && url === "/api/projects") {
      try {
        const body = JSON.parse(await readBody(req) || "{}")
        if (!body.name || !body.url) { sendJson(res, 400, { error: "name and url are required" }); return }
        try { new URL(body.url) } catch { sendJson(res, 400, { error: "Invalid URL" }); return }
        const project = await store.create({ name: body.name, url: body.url, options: body.options || {} })
        sendJson(res, 201, project)
      } catch (err) { sendJson(res, 400, { error: err.message }) }
      return
    }

    // Match /api/projects/:id and /api/projects/:id/*
    const projectApiMatch = url.match(/^\/api\/projects\/([^/]+)(\/.*)?$/)
    if (projectApiMatch) {
      const projectId = projectApiMatch[1]
      const sub = projectApiMatch[2] || ""
      const project = await store.get(projectId)

      // --- PATCH /api/projects/:id ---
      if (req.method === "PATCH" && sub === "") {
        if (!project) { sendJson(res, 404, { error: "Project not found" }); return }
        try {
          const body = JSON.parse(await readBody(req) || "{}")
          const updated = await store.update(projectId, { name: body.name, url: body.url })
          sendJson(res, 200, updated)
        } catch (err) { sendJson(res, 400, { error: err.message }) }
        return
      }

      // --- DELETE /api/projects/:id ---
      if (req.method === "DELETE" && sub === "") {
        const state = getState(projectId)
        if (state.scanRunning) { sendJson(res, 409, { error: "Cannot delete project while scan is running" }); return }
        await store.delete(projectId)
        sendJson(res, 200, { status: "deleted" })
        return
      }

      if (!project) { sendJson(res, 404, { error: "Project not found" }); return }
      const state = getState(projectId)

      // --- POST /api/projects/:id/scan ---
      if (req.method === "POST" && sub === "/scan") {
        if (state.scanRunning) { sendJson(res, 409, { error: "A scan is already running for this project" }); return }
        try {
          const body = JSON.parse(await readBody(req) || "{}")
          await startProjectScan(project, body)
          sendJson(res, 202, { status: "started", url: project.url })
        } catch (err) { sendJson(res, 400, { error: err.message }) }
        return
      }

      // --- POST /api/projects/:id/scan/stop ---
      if (req.method === "POST" && sub === "/scan/stop") {
        if (!state.scanRunning || !state.scanAbort) { sendJson(res, 400, { error: "No scan is running" }); return }
        state.scanAbort.abort()
        sendJson(res, 200, { status: "stopping" })
        return
      }

      // --- POST /api/projects/:id/scan/resume ---
      if (req.method === "POST" && sub === "/scan/resume") {
        if (state.scanRunning) { sendJson(res, 409, { error: "A scan is already running" }); return }
        const lastDir = project.lastScanDir
        if (!lastDir || !(await hasResumeState(lastDir))) {
          sendJson(res, 400, { error: "No stopped scan to resume" }); return
        }
        try {
          const resumeData = await readResumeState(resumeMetaPath(lastDir))
          if (!resumeData?.targetUrl) { sendJson(res, 400, { error: "Resume state missing or corrupt. Start a new scan." }); return }
          // Resume re-uses the existing scan dir so live-state and reports update in place
          const scanOptions = buildScanOptions(project, resumeData.options || {})
          scanOptions.reportDir = lastDir
          scanOptions.projectId = project.id
          scanOptions.projectUrl = project.url

          state.currentScanDir = lastDir
          state.scanRunning = true
          state.scanAbort = new AbortController()
          await store.update(project.id, { lastScanStatus: "running" })

          runScan(project.url, scanOptions, state.scanAbort.signal)
            .then(async (result) => {
              await store.update(project.id, {
                lastScanStatus: result.stopped ? "stopped" : "completed",
                lastViolations: result.summary?.totalViolations ?? null,
                lastPages: result.summary?.scannedPages ?? null
              })
            })
            .catch(async (err) => {
              console.log(`\n[project:${project.id}] Resume failed: ${err.message}`)
              await store.update(project.id, { lastScanStatus: "failed" })
            })
            .finally(() => {
              state.scanRunning = false
              state.scanAbort = null
            })

          sendJson(res, 202, { status: "resumed", url: project.url })
        } catch (err) { sendJson(res, 400, { error: err.message }) }
        return
      }

      // --- GET /api/projects/:id/status ---
      if (req.method === "GET" && sub === "/status") {
        const canResume = !state.scanRunning && project.lastScanDir ? await hasResumeState(project.lastScanDir) : false
        sendJson(res, 200, { scanRunning: state.scanRunning, canResume, projectId })
        return
      }

      // --- GET /api/projects/:id/report-dir ---
      if (req.method === "GET" && sub === "/report-dir") {
        sendJson(res, 200, { reportDir: project.lastScanDir || "" })
        return
      }

      // --- POST /api/projects/:id/report-dir (no-op in project mode — dir is managed by server) ---
      if (req.method === "POST" && sub === "/report-dir") {
        sendJson(res, 200, { reportDir: project.lastScanDir || "" })
        return
      }

      sendJson(res, 404, { error: "Unknown API route" })
      return
    }

    // --- GET /projects/:id → redirect to /projects/:id/ ---
    const projectPageMatch = url.match(/^\/projects\/([^/]+)(\/.*)?$/)
    if (projectPageMatch) {
      const projectId = projectPageMatch[1]
      const sub = projectPageMatch[2] || "/"
      const project = await store.get(projectId)

      if (!project) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
        res.end("Project not found")
        return
      }

      if (sub === "") {
        res.writeHead(302, { location: `/projects/${projectId}/` })
        res.end()
        return
      }

      const staticRoot = projectStaticRoot(project)
      if (!staticRoot) {
        sendHtml(res, `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#0f1117;color:#e2e8f0">
          <h2>No scan results yet</h2>
          <p>Start a scan from <a href="/" style="color:#7c6af7">All Projects</a> first.</p>
        </body></html>`)
        return
      }

      const filePath = safeResolve(staticRoot, sub)
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
        res.end("Not found")
      }
      return
    }

    // 404 for anything else
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    res.end("Not found")
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })

  console.log(`Dashboard available at http://127.0.0.1:${port}`)
  console.log("Press Ctrl+C to stop the server")

  if (initialUrl) {
    console.log(`Starting scan for ${initialUrl}...`)
    let project = (await store.list()).find((p) => p.url === initialUrl)
    if (!project) {
      const name = new URL(initialUrl).hostname
      project = await store.create({ name, url: initialUrl, options: defaultOptions })
    }
    await startProjectScan(project)
  }
}
