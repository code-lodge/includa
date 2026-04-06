import fs from "node:fs/promises"
import path from "node:path"
import { writeDashboard } from "./html-dashboard.js"
import { safeSlug, detectTemplate } from "../utils/url-utils.js"

async function writeState(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8")
}

async function writePageDetail(reportDir, pageResult, template) {
  const detailsDir = path.join(reportDir, "raw", "page-details")
  await fs.mkdir(detailsDir, { recursive: true })

  const fileName = `${safeSlug(pageResult.url)}.json`
  const relativePath = `raw/page-details/${fileName}`
  const payload = {
    url: pageResult.url,
    title: pageResult.title,
    status: pageResult.status,
    scannedAt: pageResult.scannedAt,
    durationMs: pageResult.durationMs,
    template,
    checks: pageResult.checks,
    error: pageResult.error,
    rulesRun: pageResult.rulesRun || [],
    passes: pageResult.passes || [],
    violations: pageResult.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      description: violation.description,
      helpUrl: violation.helpUrl,
      tags: violation.tags,
      nodes: violation.nodes
    })),
    incomplete: pageResult.incomplete || [],
    inapplicable: pageResult.inapplicable || []
  }

  await fs.writeFile(path.join(reportDir, relativePath), JSON.stringify(payload, null, 2), "utf8")
  return relativePath
}

function newRuleEntry(rule) {
  return {
    id: rule.id,
    help: rule.help,
    helpUrl: rule.helpUrl,
    count: 0,
    pages: []
  }
}

async function writeRuleFile(reportDir, rule) {
  const ruleDir = path.join(reportDir, "raw", "rule-index")
  await fs.mkdir(ruleDir, { recursive: true })
  const fileName = `${safeSlug(rule.id)}.json`
  const relativePath = `raw/rule-index/${fileName}`

  await fs.writeFile(path.join(reportDir, relativePath), JSON.stringify(rule, null, 2), "utf8")
  return relativePath
}

export async function createLiveStateTracker(reportDir, targetUrl) {
  const livePath = path.join(reportDir, "raw", "live-state.json")

  const state = {
    targetUrl,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "initializing",
    statusMessage: "Initializing scan",
    wcagLevel: "AAA",
    manualChecklist: [],
    discoveredPages: 0,
    scannedPages: 0,
    totalViolations: 0,
    totalPasses: 0,
    totalIncomplete: 0,
    totalInapplicable: 0,
    totalRulesTriggered: 0,
    rulesRun: [],
    severity: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
    templateTotals: {},
    rules: {},
    ruleCatalog: [],
    passesRules: {},
    passesRuleCatalog: [],
    incompleteRules: {},
    incompleteRuleCatalog: [],
    inapplicableRules: {},
    inapplicableRuleCatalog: [],
    pageIndex: [],
    recentPages: [],
    logs: []
  }
  const ruleIndex = {}
  const dirtyRules = new Set()
  const passesRuleIndex = {}
  const dirtyPassesRules = new Set()
  const incompleteRuleIndex = {}
  const dirtyIncompleteRules = new Set()
  const inapplicableRuleIndex = {}
  const dirtyInapplicableRules = new Set()

  // Throttle: only write live-state.json at most every 800ms during scanning
  let lastFlushTime = 0
  let flushScheduled = false

  await writeDashboard(reportDir)
  await writeState(livePath, { ...state, topRules: [] })

  async function flushNow() {
    lastFlushTime = Date.now()
    flushScheduled = false

    const topRules = Object.entries(state.rules)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    for (const ruleId of dirtyRules) {
      const rule = ruleIndex[ruleId]
      if (!rule) continue
      const file = await writeRuleFile(reportDir, rule)
      state.ruleCatalog = state.ruleCatalog.filter((entry) => entry.id !== ruleId)
      state.ruleCatalog.push({
        id: rule.id,
        help: rule.help,
        count: rule.count,
        pages: rule.pages.length,
        file
      })
    }
    dirtyRules.clear()

    for (const ruleId of dirtyPassesRules) {
      const rule = passesRuleIndex[ruleId]
      if (!rule) continue
      const file = await writeRuleFile(reportDir, rule)
      state.passesRuleCatalog = state.passesRuleCatalog.filter((entry) => entry.id !== ruleId)
      state.passesRuleCatalog.push({
        id: rule.id,
        help: rule.help,
        count: rule.count,
        pages: rule.pages.length,
        file
      })
    }
    dirtyPassesRules.clear()

    for (const ruleId of dirtyIncompleteRules) {
      const rule = incompleteRuleIndex[ruleId]
      if (!rule) continue
      const file = await writeRuleFile(reportDir, rule)
      state.incompleteRuleCatalog = state.incompleteRuleCatalog.filter((entry) => entry.id !== ruleId)
      state.incompleteRuleCatalog.push({
        id: rule.id,
        help: rule.help,
        count: rule.count,
        pages: rule.pages.length,
        file
      })
    }
    dirtyIncompleteRules.clear()

    for (const ruleId of dirtyInapplicableRules) {
      const rule = inapplicableRuleIndex[ruleId]
      if (!rule) continue
      const file = await writeRuleFile(reportDir, rule)
      state.inapplicableRuleCatalog = state.inapplicableRuleCatalog.filter((entry) => entry.id !== ruleId)
      state.inapplicableRuleCatalog.push({
        id: rule.id,
        help: rule.help,
        count: rule.count,
        pages: rule.pages.length,
        file
      })
    }
    dirtyInapplicableRules.clear()

    state.ruleCatalog.sort((a, b) => b.count - a.count)
    state.passesRuleCatalog.sort((a, b) => b.count - a.count)
    state.incompleteRuleCatalog.sort((a, b) => b.count - a.count)
    state.inapplicableRuleCatalog.sort((a, b) => b.count - a.count)

    await writeState(livePath, {
      ...state,
      totalRulesTriggered: Object.keys(state.rules).length,
      topRules,
      logs: state.logs.slice(-150)
    })
  }

  async function flush(force = false) {
    if (force) {
      await flushNow()
      return
    }

    const elapsed = Date.now() - lastFlushTime
    if (elapsed >= 800) {
      await flushNow()
    } else if (!flushScheduled) {
      flushScheduled = true
      setTimeout(() => flushNow().catch(() => {}), 800 - elapsed)
    }
  }

  return {
    setChecklist: async (wcagLevel, manualChecklist) => {
      state.wcagLevel = wcagLevel
      state.manualChecklist = manualChecklist
      await flush(true)
    },
    setStatus: async (status, statusMessage) => {
      state.status = status
      state.statusMessage = statusMessage
      await flush(true)
    },
    setDiscoveredPages: async (count) => {
      state.discoveredPages = count
      await flush(true)
    },
    onPageScanned: async (pageResult) => {
      state.scannedPages += 1
      const template = detectTemplate(pageResult.url)
      const detailPath = await writePageDetail(reportDir, pageResult, template)
      const pageViolationCount = pageResult.violations.reduce((sum, item) => sum + Math.max(1, item.nodes.length), 0)
      const pagePassCount = (pageResult.passes || []).reduce((sum, item) => sum + Math.max(1, item.nodes.length), 0)
      const pageIncompleteCount = (pageResult.incomplete || []).reduce((sum, item) => sum + Math.max(1, item.nodes.length), 0)
      const pageInapplicableCount = (pageResult.inapplicable || []).length

      state.totalViolations += pageViolationCount
      state.totalPasses += pagePassCount
      state.totalIncomplete += pageIncompleteCount
      state.totalInapplicable += pageInapplicableCount
      state.templateTotals[template] = (state.templateTotals[template] || 0) + pageViolationCount

      const rulesRun = pageResult.rulesRun || []
      for (const ruleId of rulesRun) {
        if (!state.rulesRun.includes(ruleId)) {
          state.rulesRun.push(ruleId)
        }
      }

      for (const violation of pageResult.violations) {
        const count = Math.max(1, violation.nodes.length)
        const impact = violation.impact || "unknown"
        state.severity[impact] = (state.severity[impact] || 0) + count
        state.rules[violation.id] = (state.rules[violation.id] || 0) + count

        if (!ruleIndex[violation.id]) ruleIndex[violation.id] = newRuleEntry(violation)
        ruleIndex[violation.id].count += count
        ruleIndex[violation.id].pages.push({
          url: pageResult.url,
          title: pageResult.title,
          template,
          status: pageResult.status,
          impact,
          nodeCount: count,
          detailPath
        })
        dirtyRules.add(violation.id)
      }

      for (const pass of pageResult.passes || []) {
        const count = Math.max(1, pass.nodes.length)
        state.passesRules[pass.id] = (state.passesRules[pass.id] || 0) + count

        if (!passesRuleIndex[pass.id]) passesRuleIndex[pass.id] = newRuleEntry(pass)
        passesRuleIndex[pass.id].count += count
        passesRuleIndex[pass.id].pages.push({
          url: pageResult.url,
          title: pageResult.title,
          template,
          status: pageResult.status,
          nodeCount: count,
          detailPath
        })
        dirtyPassesRules.add(pass.id)
      }

      for (const item of pageResult.incomplete || []) {
        const count = Math.max(1, item.nodes.length)
        state.incompleteRules[item.id] = (state.incompleteRules[item.id] || 0) + count

        if (!incompleteRuleIndex[item.id]) incompleteRuleIndex[item.id] = newRuleEntry(item)
        incompleteRuleIndex[item.id].count += count
        incompleteRuleIndex[item.id].pages.push({
          url: pageResult.url,
          title: pageResult.title,
          template,
          status: pageResult.status,
          impact: item.impact,
          nodeCount: count,
          detailPath
        })
        dirtyIncompleteRules.add(item.id)
      }

      for (const item of pageResult.inapplicable || []) {
        state.inapplicableRules[item.id] = (state.inapplicableRules[item.id] || 0) + 1

        if (!inapplicableRuleIndex[item.id]) inapplicableRuleIndex[item.id] = newRuleEntry(item)
        inapplicableRuleIndex[item.id].count += 1
        inapplicableRuleIndex[item.id].pages.push({
          url: pageResult.url,
          title: pageResult.title,
          template,
          status: pageResult.status,
          detailPath
        })
        dirtyInapplicableRules.add(item.id)
      }

      state.recentPages.unshift({
        url: pageResult.url,
        template,
        violations: pageViolationCount,
        passes: pagePassCount,
        incomplete: pageIncompleteCount,
        inapplicable: pageInapplicableCount,
        status: pageResult.status
      })
      state.recentPages = state.recentPages.slice(0, 200)

      state.pageIndex.push({
        url: pageResult.url,
        title: pageResult.title,
        template,
        status: pageResult.status,
        networkSettled: pageResult.networkSettled !== false,
        violations: pageViolationCount,
        passes: pagePassCount,
        incomplete: pageIncompleteCount,
        inapplicable: pageInapplicableCount,
        detailPath
      })

      await flush()
    },
    setLogs: async (logs) => {
      state.logs = logs
      await flush()
    },
    complete: async () => {
      state.status = "completed"
      state.statusMessage = "Scan complete"
      state.finishedAt = new Date().toISOString()
      await flush(true)
    }
  }
}
