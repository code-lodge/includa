import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import path from "node:path"
import { discoverUrls } from "./crawler/crawler.js"
import { scanPages } from "./scanner/page-scanner.js"
import { generateReports } from "./reporting/generate-reports.js"
import { createLiveStateTracker } from "./reporting/live-state.js"
import { createLogger } from "./utils/logger.js"
import { detectTemplate } from "./utils/url-utils.js"

const KNOWN_IMPACTS = new Set(["critical", "serious", "moderate", "minor"])
const WCAG_TAGS = ["wcag2a","wcag2aa","wcag2aaa","wcag21a","wcag21aa","wcag21aaa","wcag22a","wcag22aa","wcag22aaa"]
const IMPACT_WEIGHT = { critical: 4, serious: 3, moderate: 2, minor: 1, unknown: 0.5 }
const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3, unknown: 4 }
// Lighthouse-style audit weights — used to compute pass-rate score across rules
const LIGHTHOUSE_WEIGHT = { critical: 10, serious: 7, moderate: 3, minor: 1 }
function lhWeight(impact) { return LIGHTHOUSE_WEIGHT[impact] || 3 }

async function* streamJsonl(filePath) {
  try {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    for await (const line of rl) {
      if (line.trim()) yield JSON.parse(line)
    }
  } catch { /* file missing or empty */ }
}

function normalizeSelector(target) {
  const raw = Array.isArray(target) ? target.join(" >> ") : String(target ?? "")
  return raw
    .replace(/#([a-zA-Z_-]*)\d+[a-zA-Z0-9_-]*/g, "#[id]")
    .replace(/\[id="[^"]*\d+[^"]*"\]/g, "[id]")
    .replace(/:nth-child\(\d+\)/g, ":nth-child(n)")
    .replace(/:nth-of-type\(\d+\)/g, ":nth-of-type(n)")
}

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
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function clearResumeState(reportDir) {
  try { await fs.unlink(resumeMetaPath(reportDir)) } catch {}
  try { await fs.unlink(resumeResultsPath(reportDir)) } catch {}
}

export async function runScan(targetUrl, options, signal) {
  const reportDir = path.resolve(options.reportDir)
  // Create the live-state tracker before anything that can fail, so an error
  // anywhere in the pipeline (e.g. the browser engine missing) is reported to
  // the dashboard's live view instead of vanishing into an invisible
  // console.log. setStatus mutates the shared state object, so it survives any
  // already-scheduled flush.
  const liveTracker = await createLiveStateTracker(reportDir, targetUrl, { projectId: options.projectId ?? null, projectUrl: options.projectUrl ?? null })
  try {
    return await executeScan(targetUrl, options, signal, { reportDir, liveTracker })
  } catch (err) {
    try { await liveTracker.setStatus("failed", `Scan failed: ${err.message}`) } catch { /* ignore */ }
    throw err
  }
}

async function executeScan(targetUrl, options, signal, { reportDir, liveTracker }) {
  const logger = createLogger()
  const formats = parseFormats(options.format)
  const manualChecklist = buildManualChecklist(options.wcagLevel)
  await liveTracker.setChecklist(options.wcagLevel, manualChecklist)

  const resumeState = await loadResumeState(reportDir)
  let discovered
  let totalDiscovered

  if (resumeState && resumeState.targetUrl === targetUrl && resumeState.remaining?.length > 0) {
    discovered = resumeState.remaining
    totalDiscovered = resumeState.totalDiscovered ?? discovered.length
    await liveTracker.setDiscoveredPages(totalDiscovered)
    await liveTracker.setLogs(logger.logs)
    await liveTracker.setStatus("scanning", `Resuming scan — ${discovered.length} pages remaining...`)

    let priorCount = 0
    for await (const result of streamJsonl(resumeResultsPath(reportDir))) {
      priorCount += 1
      await liveTracker.onPageScanned(result)
    }
    logger.info(`Resuming scan: ${priorCount} pages already done, ${discovered.length} remaining`)
  } else {
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

    totalDiscovered = discovered.length
    logger.success(`Found ${discovered.length} pages`)
    await liveTracker.setDiscoveredPages(discovered.length)
    await liveTracker.setLogs(logger.logs)
    await liveTracker.setStatus("scanning", `Scanning ${discovered.length} pages...`)
  }

  await saveResumeMeta(reportDir, { targetUrl, options, totalDiscovered, remaining: discovered })

  const scannedUrls = new Set()

  await scanPages(discovered, {
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
      await liveTracker.onPageScanned(pageResult)
      await liveTracker.setLogs(logger.logs)
      await appendResumeResult(reportDir, pageResult)
      const remaining = discovered.filter((u) => !scannedUrls.has(u))
      await saveResumeMeta(reportDir, { targetUrl, options, totalDiscovered, remaining })
    }
  }, logger, signal)

  if (signal?.aborted) {
    const remaining = discovered.filter((u) => !scannedUrls.has(u))
    await saveResumeMeta(reportDir, { targetUrl, options, totalDiscovered, remaining })
    logger.warn(`Scan stopped — ${scannedUrls.size} pages scanned, ${remaining.length} remaining`)
    await liveTracker.setLogs(logger.logs)
    await liveTracker.setStatus("stopped", `Stopped — ${remaining.length} pages remaining. Resume to continue.`)
    return { exitCode: 0, reportDir, summary: null, criticalCount: 0, seriousCount: 0, stopped: true }
  }

  // Single-pass streaming analysis — build all summaries from JSONL without loading pages into memory
  const severity = {
    impacts: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
    totalViolations: 0, totalPasses: 0, totalIncomplete: 0
  }
  const wcagLevels = Object.fromEntries(WCAG_TAGS.map((t) => [t, 0]))
  const ruleAcc = {}
  const passesRuleAcc = {}
  const templateAcc = {}
  const dedupeMap = new Map()
  const incompleteDedupeMap = new Map()
  const pagesLite = []
  const pagesByTemplate = {}
  let skippedPages = 0

  for await (const page of streamJsonl(resumeResultsPath(reportDir))) {
    // Non-HTML endpoints (markdown, JSON, plain text, ...) are recorded as
    // "skipped" by the scanner — they aren't real pages, so they are excluded
    // from every report metric (score, templates, page lists).
    if (page.status === "skipped") {
      skippedPages += 1
      continue
    }

    const template = page.template || page.cms?.templateFile || detectTemplate(page.url)

    if (!templateAcc[template]) {
      templateAcc[template] = { pages: 0, totalViolations: 0, impacts: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 } }
    }
    templateAcc[template].pages += 1

    let violationCount = 0
    let topImpact = "unknown"

    for (const v of page.violations) {
      const nodeCount = Math.max(1, v.nodes.length)
      const impactKey = KNOWN_IMPACTS.has(v.impact) ? v.impact : "unknown"

      severity.impacts[impactKey] += nodeCount
      severity.totalViolations += nodeCount
      violationCount += nodeCount
      if ((IMPACT_ORDER[v.impact] ?? 4) < (IMPACT_ORDER[topImpact] ?? 4)) topImpact = v.impact

      if (v.tags) {
        for (const tag of WCAG_TAGS) {
          if (v.tags.includes(tag)) wcagLevels[tag] += nodeCount
        }
      }

      if (!ruleAcc[v.id]) {
        ruleAcc[v.id] = { id: v.id, help: v.help, helpUrl: v.helpUrl, impact: v.impact, occurrences: 0, pages: [] }
      }
      ruleAcc[v.id].occurrences += nodeCount
      ruleAcc[v.id].pages.push({
        url: page.url, title: page.title, template,
        nodes: v.nodes.map((n) => ({ target: n.target })),
        impact: v.impact
      })

      templateAcc[template].totalViolations += nodeCount
      if (Object.hasOwn(templateAcc[template].impacts, impactKey)) {
        templateAcc[template].impacts[impactKey] += nodeCount
      }

      for (const node of v.nodes) {
        const fp = `${v.id}::${normalizeSelector(node.target)}`
        if (!dedupeMap.has(fp)) {
          dedupeMap.set(fp, {
            fingerprint: fp, ruleId: v.id, impact: v.impact,
            help: v.help, helpUrl: v.helpUrl, description: v.description,
            templates: new Set(), affectedPages: new Set(),
            occurrences: 0, exampleNode: node,
            exampleTemplate: template, examplePageUrl: page.url,
            cms: page.cms || null
          })
        }
        const entry = dedupeMap.get(fp)
        entry.occurrences += 1
        entry.templates.add(template)
        entry.affectedPages.add(page.url)
        if (node.screenshotPath && !entry.exampleNode.screenshotPath) {
          entry.exampleNode = node
          entry.exampleTemplate = template
          entry.examplePageUrl = page.url
        }
      }
    }

    if (page.passes) {
      for (const p of page.passes) {
        severity.totalPasses += Math.max(1, p.nodes.length)
        if (!passesRuleAcc[p.id]) {
          passesRuleAcc[p.id] = { id: p.id, impact: p.impact || null }
        } else if (!passesRuleAcc[p.id].impact && p.impact) {
          passesRuleAcc[p.id].impact = p.impact
        }
      }
    }
    if (page.incomplete) {
      for (const item of page.incomplete) {
        severity.totalIncomplete += Math.max(1, item.nodes.length)
        // Dedupe "needs review" items the same way as violations, kept separate
        // so the unique-issues report can surface them behind a toggle.
        for (const node of item.nodes) {
          const fp = `${item.id}::${normalizeSelector(node.target)}`
          if (!incompleteDedupeMap.has(fp)) {
            incompleteDedupeMap.set(fp, {
              fingerprint: fp, ruleId: item.id, impact: item.impact,
              help: item.help, helpUrl: item.helpUrl, description: item.description,
              templates: new Set(), affectedPages: new Set(),
              occurrences: 0, exampleNode: node,
              exampleTemplate: template, examplePageUrl: page.url,
              cms: page.cms || null
            })
          }
          const entry = incompleteDedupeMap.get(fp)
          entry.occurrences += 1
          entry.templates.add(template)
          entry.affectedPages.add(page.url)
          if (node.screenshotPath && !entry.exampleNode.screenshotPath) {
            entry.exampleNode = node
            entry.exampleTemplate = template
            entry.examplePageUrl = page.url
          }
        }
      }
    }

    pagesLite.push({
      url: page.url, template, status: page.status,
      networkSettled: page.networkSettled,
      violationCount,
      passCount: (page.passes || []).length,
      incompleteCount: (page.incomplete || []).length,
      topImpact
    })

    if (!pagesByTemplate[template]) pagesByTemplate[template] = []
    pagesByTemplate[template].push({ url: page.url, violationCount, status: page.status })
  }

  // Lighthouse-style score: sum(weights of rules passed) / sum(weights of all rules that ran)
  // A rule counts as "failed" if it produced any violation across the scan.
  // Rules in passes that never failed count as "passed". For passes axe omits impact,
  // so unknown impact gets a moderate default weight (3).
  let lhFailedWeight = 0
  let lhPassedWeight = 0
  let lhFailedCount = 0
  let lhPassedCount = 0
  for (const ruleId of Object.keys(ruleAcc)) {
    lhFailedWeight += lhWeight(ruleAcc[ruleId].impact)
    lhFailedCount += 1
  }
  for (const ruleId of Object.keys(passesRuleAcc)) {
    if (ruleAcc[ruleId]) continue
    lhPassedWeight += lhWeight(passesRuleAcc[ruleId].impact)
    lhPassedCount += 1
  }
  const lhTotalWeight = lhFailedWeight + lhPassedWeight
  const lighthouseScore = lhTotalWeight > 0
    ? Math.round((lhPassedWeight / lhTotalWeight) * 100)
    : (pagesLite.length > 0 ? 100 : null)
  const scoreSummary = {
    score: lighthouseScore,
    passedRuleCount: lhPassedCount,
    failedRuleCount: lhFailedCount,
    totalRuleCount: lhPassedCount + lhFailedCount,
    passedWeight: lhPassedWeight,
    failedWeight: lhFailedWeight
  }

  const dedupeItems = Array.from(dedupeMap.values()).map((entry) => ({
    fingerprint: entry.fingerprint, ruleId: entry.ruleId, impact: entry.impact, category: "violation",
    help: entry.help, helpUrl: entry.helpUrl, description: entry.description,
    templates: Array.from(entry.templates), affectedPages: Array.from(entry.affectedPages),
    pageCount: entry.affectedPages.size, occurrences: entry.occurrences,
    priorityScore: (IMPACT_WEIGHT[entry.impact] ?? 0.5) * entry.occurrences,
    exampleNode: entry.exampleNode, exampleTemplate: entry.exampleTemplate,
    examplePageUrl: entry.examplePageUrl, cms: entry.cms,
  }))
  dedupeItems.sort((a, b) => b.priorityScore - a.priorityScore || b.occurrences - a.occurrences)
  const uniqueViolations = { uniqueViolations: dedupeItems, totalUnique: dedupeItems.length }

  const incompleteItems = Array.from(incompleteDedupeMap.values()).map((entry) => ({
    fingerprint: entry.fingerprint, ruleId: entry.ruleId, impact: entry.impact || "unknown", category: "incomplete",
    help: entry.help, helpUrl: entry.helpUrl, description: entry.description,
    templates: Array.from(entry.templates), affectedPages: Array.from(entry.affectedPages),
    pageCount: entry.affectedPages.size, occurrences: entry.occurrences,
    priorityScore: (IMPACT_WEIGHT[entry.impact] ?? 0.5) * entry.occurrences,
    exampleNode: entry.exampleNode, exampleTemplate: entry.exampleTemplate,
    examplePageUrl: entry.examplePageUrl, cms: entry.cms,
  }))
  incompleteItems.sort((a, b) => b.priorityScore - a.priorityScore || b.occurrences - a.occurrences)
  const uniqueIncomplete = { uniqueIncomplete: incompleteItems, totalUnique: incompleteItems.length }

  if (skippedPages > 0) {
    logger.info(`Excluded ${skippedPages} non-HTML endpoint${skippedPages === 1 ? "" : "s"} from the report`)
  }

  const summary = {
    targetUrl,
    scannedPages: pagesLite.length,
    skippedPages,
    totalViolations: severity.totalViolations,
    totalRulesTriggered: Object.keys(ruleAcc).length,
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

  // Bucket WCAG violation counts by level so reports can show real compliance.
  const wcagViolations = {
    a: (wcagLevels.wcag2a || 0) + (wcagLevels.wcag21a || 0) + (wcagLevels.wcag22a || 0),
    aa: (wcagLevels.wcag2aa || 0) + (wcagLevels.wcag21aa || 0) + (wcagLevels.wcag22aa || 0),
    aaa: (wcagLevels.wcag2aaa || 0) + (wcagLevels.wcag21aaa || 0) + (wcagLevels.wcag22aaa || 0)
  }

  await generateReports({
    reportDir,
    formats,
    summary,
    jsonlPath: resumeResultsPath(reportDir),
    pagesLite,
    pagesByTemplate,
    severitySummary: severity,
    wcagSummary: { levels: wcagLevels },
    wcagViolations,
    ruleSummary: { rules: ruleAcc },
    templateSummary: { templates: templateAcc },
    uniqueViolations,
    uniqueIncomplete,
    scoreSummary,
    logs: logger.logs
  })

  await liveTracker.setLogs(logger.logs)

  const uniqueImpacts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
  for (const item of dedupeItems) {
    const key = KNOWN_IMPACTS.has(item.impact) ? item.impact : "unknown"
    uniqueImpacts[key] += 1
  }
  const uniqueViolationsSummary = { ...uniqueImpacts, total: dedupeItems.length }

  await liveTracker.complete({ wcagViolations, uniqueViolationsSummary, scoreSummary })
  await clearResumeState(reportDir)

  const primaryOutput = formats.has("html")
    ? path.join(reportDir, "index.html")
    : path.join(reportDir, "raw", "results.json")

  logger.success(`Report generated at ${primaryOutput}`)

  const criticalCount = severity.impacts.critical
  const seriousCount = severity.impacts.serious

  let exitCode = 0
  if (options.failOnCritical && criticalCount > 0) {
    logger.error(`Failing because critical violations were found (${criticalCount})`)
    exitCode = 2
  }

  if (options.failOnSerious && seriousCount > 0) {
    logger.error(`Failing because serious violations were found (${seriousCount})`)
    exitCode = 2
  }

  return { exitCode, reportDir, summary, criticalCount, seriousCount }
}
