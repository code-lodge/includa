import fs from "node:fs/promises"
import path from "node:path"
import { discoverUrls } from "./crawler/crawler.js"
import { scanPages } from "./scanner/page-scanner.js"
import { buildWcagSummary, buildSeveritySummary } from "./analysis/wcag-grouping.js"
import { buildRuleSummary } from "./analysis/rule-grouping.js"
import { annotateTemplates, buildTemplateSummary } from "./analysis/template-detection.js"
import { buildUniqueViolations } from "./analysis/deduplication.js"
import { generateReports } from "./reporting/generate-reports.js"
import { createLiveStateTracker } from "./reporting/live-state.js"
import { createLogger } from "./utils/logger.js"

function parseFormats(formatString) {
  return new Set(
    String(formatString || "html,json,csv")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  )
}

function buildManualChecklist(level) {
  const base = [
    "Validate alternative text quality for key journeys and product media.",
    "Review keyboard interaction flows for complex widgets and modals.",
    "Verify focus visibility and logical focus movement through checkout/account flows.",
    "Confirm error messaging clarity and recovery guidance in forms."
  ]

  const aa = [
    "Assess captions/transcripts quality for prerecorded media.",
    "Review meaningful sequence and reading order in responsive layouts."
  ]

  const aaa = [
    "Assess plain-language readability for critical content and instructions.",
    "Review context-dependent AAA media requirements (audio description/sign language where applicable).",
    "Run human UX review for cognitive load, navigation predictability, and comprehension."
  ]

  if (level === "A") return base
  if (level === "AA") return [...base, ...aa]
  return [...base, ...aa, ...aaa]
}

function totalByImpact(results, impact) {
  return results.reduce((acc, page) => {
    const pageCount = page.violations.reduce((sum, violation) => {
      if (violation.impact !== impact) return sum
      return sum + Math.max(1, violation.nodes.length)
    }, 0)
    return acc + pageCount
  }, 0)
}

function resumeMetaPath(reportDir) {
  return path.join(reportDir, "raw", "resume-state.json")
}

function resumeResultsPath(reportDir) {
  return path.join(reportDir, "raw", "resume-results.jsonl")
}

async function saveResumeMeta(reportDir, meta) {
  const dir = path.join(reportDir, "raw")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(resumeMetaPath(reportDir), JSON.stringify(meta), "utf8")
}

async function appendResumeResult(reportDir, pageResult) {
  await fs.appendFile(resumeResultsPath(reportDir), JSON.stringify(pageResult) + "\n", "utf8")
}

async function loadResumeState(reportDir) {
  try {
    const raw = await fs.readFile(resumeMetaPath(reportDir), "utf8")
    const meta = JSON.parse(raw)

    let completedResults = []
    try {
      const lines = (await fs.readFile(resumeResultsPath(reportDir), "utf8")).split("\n")
      completedResults = lines.filter(Boolean).map((line) => JSON.parse(line))
    } catch {}

    return { ...meta, completedResults }
  } catch {
    return null
  }
}

async function clearResumeState(reportDir) {
  try { await fs.unlink(resumeMetaPath(reportDir)) } catch {}
  try { await fs.unlink(resumeResultsPath(reportDir)) } catch {}
}

export async function runScan(targetUrl, options, signal) {
  const logger = createLogger()
  const formats = parseFormats(options.format)
  const reportDir = path.resolve(options.reportDir)
  const manualChecklist = buildManualChecklist(options.wcagLevel)
  const liveTracker = await createLiveStateTracker(reportDir, targetUrl)
  await liveTracker.setChecklist(options.wcagLevel, manualChecklist)

  // Check for resume state
  const resumeState = await loadResumeState(reportDir)
  let discovered
  let priorResults = []

  if (resumeState && resumeState.targetUrl === targetUrl && resumeState.remaining?.length > 0) {
    // Resume: use the remaining URLs from the saved state
    discovered = resumeState.remaining
    priorResults = resumeState.completedResults || []
    logger.info(`Resuming scan: ${priorResults.length} pages already done, ${discovered.length} remaining`)
    await liveTracker.setDiscoveredPages(discovered.length + priorResults.length)
    await liveTracker.setLogs(logger.logs)
    await liveTracker.setStatus("scanning", `Resuming scan — ${discovered.length} pages remaining...`)

    // Replay prior results into the live tracker so the dashboard shows them
    for (const result of priorResults) {
      await liveTracker.onPageScanned(result)
    }
  } else {
    // Fresh scan: clear any stale resume files
    await clearResumeState(reportDir)
    await liveTracker.setStatus("discovering", "Discovering URLs...")
    logger.info(`Discovering URLs for ${targetUrl}`)
    discovered = await discoverUrls(targetUrl, {
      maxPages: options.maxPages,
      concurrency: options.concurrency,
      include: options.include,
      exclude: options.exclude,
      depth: options.depth,
      sitemap: options.sitemap,
      sampleTemplates: options.sampleTemplates,
      timeout: options.timeout,
      headless: options.headless
    }, logger)

    logger.success(`Found ${discovered.length} pages`)
    await liveTracker.setDiscoveredPages(discovered.length)
    await liveTracker.setLogs(logger.logs)
    await liveTracker.setStatus("scanning", `Scanning ${discovered.length} pages...`)
  }

  // Save resume metadata (results are already in the JSONL file from prior run)
  await saveResumeMeta(reportDir, {
    targetUrl,
    options,
    allUrls: [...(priorResults.map((r) => r.url)), ...discovered],
    remaining: discovered,
  })

  const scannedUrls = new Set()
  const newResults = []

  const scanResults = await scanPages(discovered, {
    concurrency: options.concurrency,
    locale: options.locale,
    wcagLevel: options.wcagLevel,
    timeout: options.timeout,
    headless: options.headless,
    reportDir,
    checkKeyboard: options.checkKeyboard,
    checkAria: options.checkAria,
    checkFocusOrder: options.checkFocusOrder,
    contrastScreenshots: options.contrastScreenshots,
    elementScreenshots: options.elementScreenshots,
    onPageResult: async (pageResult) => {
      scannedUrls.add(pageResult.url)
      newResults.push(pageResult)
      await liveTracker.onPageScanned(pageResult)
      await liveTracker.setLogs(logger.logs)

      // Append result to JSONL + update remaining URLs in metadata
      await appendResumeResult(reportDir, pageResult)
      const remaining = discovered.filter((u) => !scannedUrls.has(u))
      await saveResumeMeta(reportDir, {
        targetUrl,
        options,
        allUrls: [...(priorResults.map((r) => r.url)), ...discovered],
        remaining,
      })
    }
  }, logger, signal)

  // If aborted, save metadata and return early without generating final reports
  // (results were already appended to JSONL incrementally)
  if (signal?.aborted) {
    const remaining = discovered.filter((u) => !scannedUrls.has(u))
    await saveResumeMeta(reportDir, {
      targetUrl,
      options,
      allUrls: [...(priorResults.map((r) => r.url)), ...discovered],
      remaining,
    })
    logger.warn(`Scan stopped — ${newResults.length} pages scanned, ${remaining.length} remaining`)
    await liveTracker.setLogs(logger.logs)
    await liveTracker.setStatus("stopped", `Stopped — ${remaining.length} pages remaining. Resume to continue.`)
    return { exitCode: 0, reportDir, summary: null, criticalCount: 0, seriousCount: 0, stopped: true }
  }

  // Scan completed normally — combine prior + new results
  const allResults = [...priorResults, ...scanResults]
  const resultsWithTemplates = annotateTemplates(allResults)
  const severitySummary = buildSeveritySummary(resultsWithTemplates)
  const wcagSummary = buildWcagSummary(resultsWithTemplates)
  const ruleSummary = buildRuleSummary(resultsWithTemplates)
  const templateSummary = buildTemplateSummary(resultsWithTemplates)
  const uniqueViolations = buildUniqueViolations(resultsWithTemplates)

  const summary = {
    targetUrl,
    scannedPages: resultsWithTemplates.length,
    totalViolations: severitySummary.totalViolations,
    totalRulesTriggered: Object.keys(ruleSummary.rules).length,
    startedAt: logger.startedAt,
    finishedAt: new Date().toISOString(),
    options: {
      maxPages: options.maxPages,
      concurrency: options.concurrency,
      include: options.include,
      exclude: options.exclude,
      depth: options.depth,
      locale: options.locale,
      wcagLevel: options.wcagLevel,
      sitemap: options.sitemap,
      sampleTemplates: options.sampleTemplates,
      timeout: options.timeout,
      headless: options.headless,
      manualChecklist
    }
  }

  await liveTracker.setStatus("reporting", "Generating reports...")

  await generateReports({
    reportDir,
    formats,
    summary,
    pages: resultsWithTemplates,
    severitySummary,
    wcagSummary,
    ruleSummary,
    templateSummary,
    uniqueViolations,
    logs: logger.logs
  })

  await liveTracker.setLogs(logger.logs)
  await liveTracker.complete()
  await clearResumeState(reportDir)

  const primaryOutput = formats.has("html")
    ? path.join(reportDir, "index.html")
    : path.join(reportDir, "raw", "results.json")

  logger.success(`Report generated at ${primaryOutput}`)

  const criticalCount = totalByImpact(resultsWithTemplates, "critical")
  const seriousCount = totalByImpact(resultsWithTemplates, "serious")

  let exitCode = 0
  if (options.failOnCritical && criticalCount > 0) {
    logger.error(`Failing because critical violations were found (${criticalCount})`)
    exitCode = 2
  }

  if (options.failOnSerious && seriousCount > 0) {
    logger.error(`Failing because serious violations were found (${seriousCount})`)
    exitCode = 2
  }

  return {
    exitCode,
    reportDir,
    summary,
    criticalCount,
    seriousCount
  }
}
