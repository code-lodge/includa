import fs from "node:fs/promises"
import path from "node:path"
import { safeSlug, templateFolder, escapeHtml } from "../utils/url-utils.js"
import { faviconLink } from "../utils/favicon.js"

function renderTemplatePage(template, pages, metrics) {
  const rows = pages.map((page) => `
    <tr>
      <td><a href="../pages/${templateFolder(template)}/${safeSlug(page.url)}.html">${escapeHtml(page.url)}</a></td>
      <td>${page.violationCount}</td>
      <td>${escapeHtml(page.status)}</td>
    </tr>
  `).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(template)} template report</title>
  ${faviconLink()}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #08131d;
      --panel: rgba(12, 29, 42, 0.84);
      --panel-strong: rgba(10, 24, 35, 0.96);
      --stroke: rgba(157, 197, 220, 0.22);
      --text: #e9f2f8;
      --muted: #9fb4c3;
      --accent: #2dd4bf;
      --accent-2: #38bdf8;
      --radius: 14px;
      --shadow: 0 10px 35px rgba(2, 8, 14, 0.45);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--text);
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background:
        radial-gradient(1300px 600px at 8% -12%, rgba(45, 212, 191, 0.2), transparent 60%),
        radial-gradient(1000px 500px at 95% 0%, rgba(56, 189, 248, 0.2), transparent 64%),
        linear-gradient(160deg, #051019 0%, #0a1823 42%, #0e1f2f 100%);
      min-height: 100vh;
    }

    .shell {
      max-width: 1100px;
      margin: 0 auto;
      padding: 1.6rem 1.2rem 3rem;
    }

    h1 {
      font-family: "Space Grotesk", sans-serif;
      font-size: clamp(1.2rem, 2.5vw, 1.7rem);
      margin: 0 0 0.4rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.84rem;
      color: var(--accent-2);
      margin-bottom: 0.65rem;
    }

    .stat-line {
      font-size: 0.88rem;
      color: var(--muted);
      margin-bottom: 1.2rem;
    }

    .stat-line strong {
      color: var(--text);
      font-family: "Space Grotesk", sans-serif;
    }

    .panel-full {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      box-shadow: var(--shadow);
      padding: 1rem;
      overflow: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }

    th, td {
      border-bottom: 1px solid rgba(159, 180, 195, 0.16);
      text-align: left;
      vertical-align: top;
      padding: 0.48rem 0.5rem;
      line-height: 1.35;
    }

    th { color: #c3d9e7; font-weight: 600; }

    caption {
      text-align: left;
      font-size: 0.82rem;
      color: var(--muted);
      margin-bottom: 0.6rem;
    }

    a { color: var(--accent-2); }
    a:visited { color: #a78bfa; }

    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <div class="shell">
    <a class="back-link" href="../report.html">\u2190 Back to Report</a>
    <h1>Template: ${escapeHtml(template)}</h1>
    <p class="stat-line">Pages: <strong>${metrics.pages}</strong> &middot; Violations: <strong>${metrics.totalViolations}</strong></p>
    <div class="panel-full">
      <table>
        <caption>Pages using the ${escapeHtml(template)} template</caption>
        <thead><tr><th>Page</th><th>Violations</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`
}

export async function writeTemplateReports(reportDir, templateSummary, pagesByTemplate) {
  const outputDir = path.join(reportDir, "templates")
  await fs.mkdir(outputDir, { recursive: true })

  for (const [template, metrics] of Object.entries(templateSummary.templates)) {
    const templatePages = pagesByTemplate[template] || []
    const filePath = path.join(outputDir, `${safeSlug(template)}.html`)
    await fs.writeFile(filePath, renderTemplatePage(template, templatePages, metrics), "utf8")
  }
}
