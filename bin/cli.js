#!/usr/bin/env node

import { Command } from "commander"
import { runScan } from "../src/index.js"
import { serveDashboard } from "../src/reporting/dashboard-server.js"

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function normalizePatterns(values) {
  if (!values || values.length === 0) return []
  return values
    .flatMap((entry) => entry.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeWcagLevel(value) {
  const level = String(value || "AAA").trim().toUpperCase()
  if (!["A", "AA", "AAA"].includes(level)) {
    console.error(`Error: --wcag-level must be one of: A, AA, AAA (received "${value}")`)
    process.exit(1)
  }
  return level
}

const program = new Command()

program
  .name("includa")
  .description("Includa — large-scale accessibility scanner powered by Playwright + axe-core")
  .argument("[url]", "target URL (required for CLI, optional for dashboard mode)")
  .option("--max-pages <number>", "maximum pages to scan", (v) => parseNumber(v, 2000), 2000)
  .option("--concurrency <number>", "parallel page scans", (v) => parseNumber(v, 10), 10)
  .option("--exclude <patterns...>", "exclude URL patterns (supports re: prefix for regex)")
  .option("--include <patterns...>", "include URL patterns (supports re: prefix for regex)")
  .option("--locale <locale>", "axe locale (reserved for future use)", "en")
  .option("--wcag-level <level>", "WCAG conformance level: A, AA, AAA (default: AAA)", normalizeWcagLevel, "AAA")
  .option("--sitemap <url>", "explicit sitemap URL")
  .option("--depth <number>", "crawl depth", (v) => parseNumber(v, 6), 6)
  .option("--report-dir <dir>", "output directory", "./a11y-report")
  .option("--format <formats>", "comma-separated: html,json,csv", "html,json,csv")
  .option("--sample-templates <number>", "Sample N pages per unique page structure (groups structurally similar pages); 0 = off", (v) => parseNumber(v, 0), 0)
  .option("--timeout <ms>", "page timeout in milliseconds", (v) => parseNumber(v, 30000), 30000)
  .option("--headless", "run browser in headless mode", true)
  .option("--no-headless", "run browser with UI")
  .option("--fail-on-critical", "exit code 2 when critical issues exist", false)
  .option("--fail-on-serious", "exit code 2 when serious issues exist", false)
  .option("--check-keyboard", "run keyboard traversal checks", true)
  .option("--check-aria", "run ARIA attribute checks", true)
  .option("--check-focus-order", "run focus order checks", true)
  .option("--contrast-screenshots", "capture screenshots for color contrast issues", false)
  .option("--element-screenshots", "capture element-level screenshots for each violation (adds scan time)", true)
  .option("--dashboard", "serve the interactive dashboard (can start scans from UI)", false)
  .option("--port <number>", "dashboard server port", (v) => parseNumber(v, 4173), 4173)
  .option("--data-dir <dir>", "directory for multi-project data (dashboard mode)", "./a11y-projects")
  .action(async (url, options) => {
    const normalizedOptions = {
      ...options,
      exclude: normalizePatterns(options.exclude),
      include: normalizePatterns(options.include)
    }

    if (options.dashboard) {
      await serveDashboard({
        dataDir: options.dataDir,
        port: options.port,
        defaultOptions: normalizedOptions,
        initialUrl: url || null
      })
      return
    }

    if (!url) {
      console.error("Error: Provide a URL to scan, or use --dashboard for interactive mode")
      console.error("  includa https://example.com")
      console.error("  includa --dashboard")
      process.exit(1)
    }

    const result = await runScan(url, normalizedOptions)

    if (result.exitCode > 0) {
      process.exitCode = result.exitCode
    }

    process.exit(process.exitCode || 0)
  })

program.parseAsync(process.argv).catch((error) => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
