// One-off script: boot the dashboard server pointed at the local a11y-projects
// data dir, capture screenshots of the projects home, the live dashboard for a
// completed scan, the unique-issues report, and the static report. Drops PNGs
// into site/images/ for use on the landing page.

import { chromium } from "playwright"
import path from "node:path"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { serveDashboard } from "../src/reporting/dashboard-server.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")

const PORT = 4188
const DATA_DIR = path.join(projectRoot, "a11y-projects")
const OUT_DIR = path.join(projectRoot, "site", "images")
const VIEWPORT = { width: 1440, height: 900 }

// Scenery en Zo — Shopify storefront with 2,503 violations across 12,261 pages.
const TARGET_PROJECT_ID = "034b6db613be"

async function shoot(page, url, file, opts = {}) {
  console.log(`  → ${file}`)
  await page.goto(url, { waitUntil: "networkidle" })
  // Settle: some dashboards animate stats in via setTimeout/poll
  await page.waitForTimeout(opts.settleMs ?? 1500)
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: false, ...opts })
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  console.log(`Starting dashboard on :${PORT}…`)
  await serveDashboard({ dataDir: DATA_DIR, port: PORT })

  const browser = await chromium.launch()
  try {
    // 1.5x DPR — sharper than 1x on retina, half the bytes of 2x.
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 })
    const page = await ctx.newPage()

    console.log("Capturing screenshots…")

    // 1. Projects home — multi-project list with stats
    await shoot(page, `http://127.0.0.1:${PORT}/`, "projects-home.png")

    // 2. Live dashboard for the completed Scenery en Zo scan
    await shoot(page, `http://127.0.0.1:${PORT}/projects/${TARGET_PROJECT_ID}/`, "live-dashboard.png", { settleMs: 2500 })

    // 3. Unique issues — capture viewport (the full page is huge, just grab the top)
    await shoot(page, `http://127.0.0.1:${PORT}/projects/${TARGET_PROJECT_ID}/unique-issues.html`, "unique-issues.png")

    // 4. Static report
    await shoot(page, `http://127.0.0.1:${PORT}/projects/${TARGET_PROJECT_ID}/report.html`, "static-report.png")

    await ctx.close()
  } finally {
    await browser.close()
  }

  console.log(`Done. Screenshots in ${OUT_DIR}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
