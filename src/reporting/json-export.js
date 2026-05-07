import fs from "node:fs/promises"
import path from "node:path"

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8")
}

function escapeCsv(value) {
  const stringValue = String(value ?? "")
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

export async function exportJsonAndCsv(reportDir, payload) {
  const summaryDir = path.join(reportDir, "summary")
  const rawDir = path.join(reportDir, "raw")

  await writeJson(path.join(summaryDir, "scan-summary.json"), payload.summary)
  await writeJson(path.join(summaryDir, "wcag-summary.json"), payload.wcagSummary)
  await writeJson(path.join(summaryDir, "severity-summary.json"), payload.severitySummary)
  await writeJson(path.join(rawDir, "results.json"), payload.pages)
  await writeJson(path.join(rawDir, "rules.json"), payload.ruleSummary)
  await writeJson(path.join(rawDir, "templates.json"), payload.templateSummary)
  await writeJson(path.join(rawDir, "scan-logs.json"), payload.logs)
  if (payload.uniqueViolations) {
    await writeJson(path.join(rawDir, "unique-violations.json"), payload.uniqueViolations)
  }

  // CSV: use node counts for both "violations" column and per-severity columns
  // so the numbers are internally consistent.
  const rows = [
    ["url", "title", "status", "template", "violations", "critical", "serious", "moderate", "minor"]
  ]

  for (const page of payload.pages) {
    const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    let totalNodeCount = 0

    for (const violation of page.violations) {
      const count = Math.max(1, violation.nodes.length)
      totalNodeCount += count
      if (Object.hasOwn(impacts, violation.impact)) {
        impacts[violation.impact] += count
      }
    }

    rows.push([
      page.url,
      page.title,
      page.status,
      page.template,
      totalNodeCount,
      impacts.critical,
      impacts.serious,
      impacts.moderate,
      impacts.minor
    ])
  }

  // UTF-8 BOM for Excel compatibility
  const bom = "\uFEFF"
  const csv = bom + rows.map((row) => row.map(escapeCsv).join(",")).join("\n")
  await fs.writeFile(path.join(rawDir, "results.csv"), csv, "utf8")
}
