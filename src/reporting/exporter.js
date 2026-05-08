import fs from "node:fs/promises"
import path from "node:path"
import { ZipWriter } from "./zip-writer.js"

// Paths inside a scan dir that don't belong in a shareable export.
const SKIP_RELATIVE = new Set([
  "raw/resume-state.json",
  "raw/resume-results.jsonl",
  "raw/live-state.json",
  "raw/scan-logs.json",
  // The live dashboard depends on the dashboard server and the scan API; replace it.
  "index.html"
])

async function* walk(root, base = root) {
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full, base)
    } else if (entry.isFile()) {
      yield { fullPath: full, relPath: path.relative(base, full).replace(/\\/g, "/") }
    }
  }
}

// Strip the "← Back to Live Dashboard" link from report.html — broken in static exports.
function rewriteReportHtml(html) {
  return html.replace(
    /<a class="back-link" href="\.\/index\.html">[^<]*<\/a>/,
    ""
  )
}

const REDIRECT_INDEX = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=report.html">
<title>Accessibility Report</title>
<style>body{font-family:system-ui,sans-serif;padding:2rem;background:#0f1117;color:#e2e8f0}a{color:#7c6af7}</style>
</head>
<body>
<p>Opening <a href="report.html">accessibility report</a>...</p>
</body>
</html>
`

const README = (project) => `Accessibility Report — ${project.name}
URL: ${project.url}
Exported: ${new Date().toISOString()}

Open index.html (or report.html directly) in a browser.

Sub-pages:
  report.html          Static accessibility report (main entry)
  unique-issues.html   Deduplicated issues with AI Fix Prompts
  pages/               Per-page detail reports
  rules/               Per-rule detail reports
  templates/           Per-template detail reports
  raw/                 JSON/CSV data exports

This export is fully static — no server required. Upload to any
web host (Netlify, Vercel, GitHub Pages, S3, etc.) and share the URL.
`

export async function exportScanToZip(scanDir, project, outStream) {
  const zip = new ZipWriter(outStream)
  let reportHtmlBuffer = null
  let reportHtmlMtime = new Date()

  for await (const { fullPath, relPath } of walk(scanDir)) {
    if (SKIP_RELATIVE.has(relPath)) continue

    if (relPath === "report.html") {
      const buf = await fs.readFile(fullPath)
      const stat = await fs.stat(fullPath)
      const rewritten = Buffer.from(rewriteReportHtml(buf.toString("utf8")), "utf8")
      reportHtmlBuffer = rewritten
      reportHtmlMtime = stat.mtime
      await zip.addBuffer(relPath, rewritten, stat.mtime)
      continue
    }

    await zip.addFile(relPath, fullPath)
  }

  // Replace removed live-dashboard index.html with a redirect to the static report.
  await zip.addBuffer("index.html", Buffer.from(REDIRECT_INDEX, "utf8"), reportHtmlMtime)
  await zip.addBuffer("README.txt", Buffer.from(README(project), "utf8"))

  await zip.finish()
}

export function safeExportFilename(name, when = new Date()) {
  const slug = String(name || "scan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "scan"
  const ts = when.toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `a11y-${slug}-${ts}.zip`
}
