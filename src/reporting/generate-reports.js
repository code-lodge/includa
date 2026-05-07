import { exportJsonAndCsv } from "./json-export.js"
import { writeDashboard } from "./html-dashboard.js"
import { writePageReports } from "./page-report.js"
import { writeRuleReports } from "./rule-report.js"
import { writeTemplateReports } from "./template-report.js"
import { writeStaticReport } from "./static-report.js"
import { writeUniqueIssuesReport } from "./unique-issues-report.js"

export async function generateReports(payload) {
  if (payload.formats.has("json") || payload.formats.has("csv")) {
    await exportJsonAndCsv(payload.reportDir, payload)
  }

  if (payload.formats.has("html")) {
    await writePageReports(payload.reportDir, payload.jsonlPath)
    await writeRuleReports(payload.reportDir, payload.ruleSummary)
    await writeTemplateReports(payload.reportDir, payload.templateSummary, payload.pagesByTemplate)
    await writeStaticReport(payload.reportDir, payload)
    await writeUniqueIssuesReport(payload.reportDir, payload.uniqueViolations, payload.pagesLite.length)
    await writeDashboard(payload.reportDir, payload)
  }
}
