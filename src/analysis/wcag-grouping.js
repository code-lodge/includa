const KNOWN_IMPACTS = new Set(["critical", "serious", "moderate", "minor"])

const WCAG_A_TAGS = ["wcag2a", "wcag21a", "wcag22a"]
const WCAG_AA_TAGS = ["wcag2aa", "wcag21aa", "wcag22aa"]
const WCAG_AAA_TAGS = ["wcag2aaa", "wcag21aaa", "wcag22aaa"]

/**
 * Given the wcagSummary produced by buildWcagSummary(), determine the highest
 * WCAG conformance level the site actually achieves:
 *   "AAA" — no violations at any level
 *   "AA"  — no A or AA violations, but has AAA violations
 *   "A"   — no A violations, but has AA violations
 *   "None"— has A-level violations (fails the baseline)
 */
export function computeComplianceLevel(wcagSummary) {
  const levels = wcagSummary?.levels || {}
  if (WCAG_A_TAGS.some((t) => (levels[t] || 0) > 0)) return "None"
  if (WCAG_AA_TAGS.some((t) => (levels[t] || 0) > 0)) return "A"
  if (WCAG_AAA_TAGS.some((t) => (levels[t] || 0) > 0)) return "AA"
  return "AAA"
}

function newImpactCounter() {
  return { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
}

export function buildSeveritySummary(results) {
  const impacts = newImpactCounter()
  let totalViolations = 0
  let totalPasses = 0
  let totalIncomplete = 0

  for (const page of results) {
    for (const violation of page.violations) {
      const count = Math.max(1, violation.nodes.length)
      const key = KNOWN_IMPACTS.has(violation.impact) ? violation.impact : "unknown"
      impacts[key] += count
      totalViolations += count
    }

    if (page.passes) {
      for (const pass of page.passes) {
        totalPasses += Math.max(1, pass.nodes.length)
      }
    }

    if (page.incomplete) {
      for (const item of page.incomplete) {
        totalIncomplete += Math.max(1, item.nodes.length)
      }
    }
  }

  return { totalViolations, totalPasses, totalIncomplete, impacts }
}

export function buildWcagSummary(results) {
  const levels = {
    wcag2a: 0,
    wcag2aa: 0,
    wcag2aaa: 0,
    wcag21a: 0,
    wcag21aa: 0,
    wcag21aaa: 0,
    wcag22a: 0,
    wcag22aa: 0,
    wcag22aaa: 0
  }

  for (const page of results) {
    for (const violation of page.violations) {
      const count = Math.max(1, violation.nodes.length)
      for (const key of Object.keys(levels)) {
        if (violation.tags.includes(key)) levels[key] += count
      }
    }
  }

  return { levels }
}
