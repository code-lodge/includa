import fs from "node:fs/promises"
import path from "node:path"
import { safeSlug, templateFolder, escapeHtml } from "../utils/url-utils.js"

function renderRulePage(rule) {
  const rows = rule.pages.map((entry) => {
    const nodes = entry.nodes
      .map((node) => `<li><code>${escapeHtml((node.target || []).join(" "))}</code></li>`)
      .join("")

    return `<tr>
      <td><a href="../pages/${templateFolder(entry.template)}/${safeSlug(entry.url)}.html">${escapeHtml(entry.url)}</a></td>
      <td>${escapeHtml(entry.impact)}</td>
      <td><ul>${nodes}</ul></td>
    </tr>`
  }).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(rule.id)} - includa</title>
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

    .subtitle {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0.2rem 0 0.3rem;
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

    ul { padding-left: 1.2rem; margin: 0.3rem 0; }
    li { margin-bottom: 0.2rem; }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
      background: rgba(8, 23, 36, 0.9);
      border: 1px solid rgba(120, 158, 182, 0.25);
      border-radius: 5px;
      padding: 0.06rem 0.26rem;
    }

    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <div class="shell">
    <a class="back-link" href="../report.html">\u2190 Back to Report</a>
    <h1><code>${escapeHtml(rule.id)}</code></h1>
    <p class="subtitle">${escapeHtml(rule.help)} &mdash; <a href="${escapeHtml(rule.helpUrl)}" target="_blank" rel="noreferrer">WCAG docs</a></p>
    <p class="stat-line">Total occurrences: <strong>${rule.occurrences}</strong></p>
    <div class="panel-full">
      <table>
        <caption>Pages affected by ${escapeHtml(rule.id)}</caption>
        <thead><tr><th>Page</th><th>Impact</th><th>Elements</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`
}

export async function writeRuleReports(reportDir, ruleSummary) {
  const outputDir = path.join(reportDir, "rules")
  await fs.mkdir(outputDir, { recursive: true })

  for (const rule of Object.values(ruleSummary.rules)) {
    await fs.writeFile(path.join(outputDir, `${safeSlug(rule.id)}.html`), renderRulePage(rule), "utf8")
  }
}
