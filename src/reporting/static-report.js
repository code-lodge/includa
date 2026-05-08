import fs from "node:fs/promises"
import path from "node:path"
import { escapeHtml, safeSlug, templateFolder } from "../utils/url-utils.js"

// Lighthouse-style score: weighted % of axe rules that passed across the scan.
// scoreSummary is computed in src/index.js and passed in via the payload.
function scoreColor(score) {
  if (score >= 90) return "#22c55e"
  if (score >= 50) return "#fb923c"
  return "#ef4444"
}

function scoreLabel(score) {
  if (score >= 90) return "Good"
  if (score >= 50) return "Needs Work"
  return "Poor"
}

function bar(value, max, color) {
  const pct = Math.round((value / Math.max(max, 1)) * 100)
  return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>`
}

const IMPACT_COLOR = {
  critical: "#ef4444",
  serious: "#fb923c",
  moderate: "#facc15",
  minor: "#60a5fa",
  unknown: "#9ca3af"
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3, unknown: 4 }

function formatDate(iso) {
  if (!iso) return "–"
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    })
  } catch {
    return iso
  }
}

function pagePath(page) {
  const folder = templateFolder(page.template)
  return `pages/${folder}/${safeSlug(page.url)}.html`
}

export async function writeStaticReport(reportDir, payload) {
  const { summary, severitySummary, ruleSummary, templateSummary, pagesLite } = payload
  const uniqueItems = (payload.uniqueViolations && payload.uniqueViolations.uniqueViolations) || null
  const impacts = severitySummary.impacts || {}
  const scoreSummary = payload.scoreSummary || {}
  const score = typeof scoreSummary.score === "number" ? scoreSummary.score : 100
  const color = scoreColor(score)
  const label = scoreLabel(score)

  const impactOrder = IMPACT_ORDER
  const violationRules = Object.values(ruleSummary.rules)
    .sort((a, b) => (impactOrder[a.impact] ?? 4) - (impactOrder[b.impact] ?? 4) || b.occurrences - a.occurrences)

  const templateData = Object.entries(templateSummary.templates)
    .filter(([, t]) => t.totalViolations > 0)
    .sort((a, b) => b[1].totalViolations - a[1].totalViolations)

  const pagesWithViolations = pagesLite
    .filter((p) => p.violationCount > 0)
    .sort((a, b) => b.violationCount - a.violationCount)

  const uniqueImpacts = {}
  const uniqueTotal = uniqueItems ? uniqueItems.length : null
  if (uniqueItems) {
    for (const u of uniqueItems) {
      uniqueImpacts[u.impact] = (uniqueImpacts[u.impact] || 0) + 1
    }
  }

  const maxImpact = Math.max(...Object.values(impacts), 1)
  const maxTemplate = Math.max(...templateData.map(([, t]) => t.totalViolations), 1)
  const maxRule = Math.max(...violationRules.map((r) => r.occurrences), 1)
  const targetUrl = summary.targetUrl || "–"
  const wcagLevel = (summary.options && summary.options.wcagLevel) || "AAA"

  const severityRows = ["critical", "serious", "moderate", "minor", "unknown"]
    .filter((k) => (impacts[k] || 0) > 0)
    .map((k) => `
      <div class="bar-row">
        <span class="bar-label">${k}</span>
        ${bar(impacts[k] || 0, maxImpact, IMPACT_COLOR[k])}
        <strong class="bar-count">${impacts[k] || 0}</strong>
      </div>`).join("")

  const templateRows = templateData.map(([name, t]) => `
    <div class="bar-row">
      <a href="./templates/${safeSlug(name)}.html" class="bar-label" style="color:inherit;text-decoration:underline;text-underline-offset:2px">${escapeHtml(name)}</a>
      ${bar(t.totalViolations, maxTemplate, "#2dd4bf")}
      <strong class="bar-count">${t.totalViolations}</strong>
    </div>`).join("")

  const ruleTableRows = violationRules.map((rule) => {
    const impactBadge = `<span class="badge badge-${escapeHtml(rule.impact || "unknown")}">${escapeHtml(rule.impact || "unknown")}</span>`
    const docLink = rule.helpUrl
      ? `<a href="${escapeHtml(rule.helpUrl)}" target="_blank" rel="noreferrer">docs</a>`
      : ""
    return `<tr>
      <td>${impactBadge}</td>
      <td><code>${escapeHtml(rule.id)}</code></td>
      <td>${escapeHtml(rule.help)}</td>
      <td class="num">${rule.occurrences}</td>
      <td class="num">${rule.pages.length}</td>
      <td>${docLink}</td>
    </tr>`
  }).join("")

  const pageTableRows = pagesWithViolations.map((page) => {
    const link = `<a href="./${escapeHtml(pagePath(page))}">${escapeHtml(page.url)}</a>`
    return `<tr>
      <td>${link}</td>
      <td>${escapeHtml(page.template || "–")}</td>
      <td><span class="badge badge-${escapeHtml(page.topImpact)}">${escapeHtml(page.topImpact)}</span></td>
      <td class="num">${page.violationCount}</td>
    </tr>`
  }).join("")

  const allPagesSorted = [...pagesLite].sort((a, b) => a.url.localeCompare(b.url))
  const allPagesTableRows = allPagesSorted.map((page) => {
    const link = `<a href="./${escapeHtml(pagePath(page))}">${escapeHtml(page.url)}</a>`
    const status = page.status === "error"
      ? '<span class="badge badge-critical">error</span>'
      : page.violationCount > 0
        ? '<span class="badge badge-serious">' + page.violationCount + ' violations</span>'
        : '<span class="badge" style="background:rgba(34,197,94,0.2);color:#86efac">clean</span>'
    const settled = page.networkSettled === false
      ? ' <span class="muted" title="networkidle was not reached — results may be incomplete">*</span>'
      : ""
    return `<tr>
      <td>${link}${settled}</td>
      <td>${escapeHtml(page.template || "–")}</td>
      <td>${status}</td>
      <td class="num">${page.violationCount}</td>
      <td class="num">${page.passCount}</td>
      <td class="num">${page.incompleteCount}</td>
    </tr>`
  }).join("")

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>a11y-scan Report — ${escapeHtml(targetUrl)}</title>
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
      max-width: 1300px;
      margin: 0 auto;
      padding: 1.6rem 1.2rem 3rem;
    }

    .hero {
      border: 1px solid var(--stroke);
      border-radius: 18px;
      background: linear-gradient(120deg, rgba(18, 40, 56, 0.9), rgba(11, 27, 40, 0.85));
      box-shadow: var(--shadow);
      padding: 1.5rem 1.5rem;
      margin-bottom: 1.2rem;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 1rem;
      align-items: center;
    }

    .hero-meta h1 {
      margin: 0 0 0.2rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: clamp(1.3rem, 2.5vw, 1.9rem);
    }

    .hero-meta p { margin: 0.2rem 0; color: var(--muted); font-size: 0.9rem; }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.84rem;
      color: var(--accent-2);
      margin-bottom: 0.65rem;
    }

    .score-ring {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 6px solid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .score-num {
      font-family: "Space Grotesk", sans-serif;
      font-size: 2.4rem;
      font-weight: 700;
      line-height: 1;
    }

    .score-lbl {
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-top: 0.15rem;
    }

    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.85rem;
      margin-bottom: 1.2rem;
    }

    .stat {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, rgba(12, 30, 44, 0.85), rgba(9, 23, 35, 0.9));
      box-shadow: var(--shadow);
      padding: 0.95rem;
    }

    .stat-label {
      color: var(--muted);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .stat-value {
      margin-top: 0.3rem;
      font-size: 1.75rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1.2rem;
    }

    .panel {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      box-shadow: var(--shadow);
      padding: 1rem;
    }

    .panel h2 {
      margin: 0 0 0.85rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: 1rem;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 100px 1fr 54px;
      gap: 0.5rem;
      align-items: center;
      margin: 0.45rem 0;
      font-size: 0.86rem;
    }

    .bar-label { text-transform: capitalize; }

    .bar-track {
      height: 8px;
      border-radius: 999px;
      background: rgba(105, 146, 173, 0.22);
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s ease;
    }

    .bar-count { text-align: right; font-weight: 700; }

    .panel-full {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      box-shadow: var(--shadow);
      padding: 1rem;
      margin-bottom: 1.2rem;
      overflow: auto;
    }

    .panel-full h2 {
      margin: 0 0 0.85rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: 1rem;
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
    td.num { text-align: right; }

    a { color: var(--accent-2); }
    a:visited { color: #a78bfa; }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
      background: rgba(8, 23, 36, 0.9);
      border: 1px solid rgba(120, 158, 182, 0.25);
      border-radius: 5px;
      padding: 0.06rem 0.26rem;
    }

    .badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.18rem 0.5rem;
      border-radius: 999px;
      background: rgba(100, 120, 140, 0.3);
      color: #cde;
    }

    .badge-critical { background: rgba(239, 68, 68, 0.22); color: #fca5a5; }
    .badge-serious  { background: rgba(251, 146, 60, 0.22); color: #fdba74; }
    .badge-moderate { background: rgba(250, 204, 21, 0.18); color: #fde68a; }
    .badge-minor    { background: rgba(96, 165, 250, 0.2);  color: #93c5fd; }
    .badge-unknown  { background: rgba(156, 163, 175, 0.2); color: #d1d5db; }

    .muted { color: var(--muted); }

    #pageSearch, #allPageSearch {
      padding: 0.4rem 0.6rem;
      border-radius: 8px;
      border: 1px solid var(--stroke);
      background: rgba(5, 17, 27, 0.82);
      color: var(--text);
      font-size: 0.86rem;
      min-width: 260px;
      margin-bottom: 0.75rem;
    }

    .empty { color: var(--muted); font-size: 0.9rem; padding: 0.5rem 0; }

    @media (max-width: 900px) {
      .grid-2 { grid-template-columns: 1fr; }
      .hero { grid-template-columns: 1fr; }
      .score-ring { margin: 0 auto; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <a class="back-link" href="./index.html">← Back to Live Dashboard</a>

    <div style="margin-bottom:1rem">
      <a href="./unique-issues.html" style="
        display:inline-flex;align-items:center;gap:0.5rem;
        padding:0.55rem 1.1rem;border-radius:999px;
        background:rgba(45,212,191,0.12);border:1px solid rgba(45,212,191,0.4);
        color:#2dd4bf;font-weight:600;font-size:0.88rem;text-decoration:none;
      ">View Unique Issues — deduplicated, priority-ordered →</a>
    </div>

    <header class="hero">
      <div class="hero-meta">
        <h1>Accessibility Report</h1>
        <p><strong>URL:</strong> ${escapeHtml(targetUrl)}</p>
        <p><strong>WCAG Level:</strong> ${escapeHtml(wcagLevel)}</p>
        <p><strong>Scanned:</strong> ${escapeHtml(formatDate(summary.startedAt))} → ${escapeHtml(formatDate(summary.finishedAt))}</p>
        ${summary.totalViolations === 0
          ? '<p style="color:#22c55e;font-weight:600;margin-top:0.5rem">No violations found — great job!</p>'
          : `<p style="color:#9fb4c3;margin-top:0.5rem">Below are the issues that need to be fixed to improve accessibility.</p>`}
      </div>
      <div>
        <div class="score-ring" style="border-color:${color};color:${color}" aria-label="Score: ${score}/100 — ${label}">
          <span class="score-num">${score}</span>
          <span class="score-lbl">${escapeHtml(label)}</span>
        </div>
        ${scoreSummary.totalRuleCount ? `<p style="margin:0.5rem 0 0;font-size:0.72rem;color:var(--muted);text-align:center;max-width:170px">${scoreSummary.passedRuleCount}/${scoreSummary.totalRuleCount} axe rules passed across the scan. Heuristic — does not prove WCAG conformance.</p>` : ""}
      </div>
    </header>

    <p style="margin:0 0 0.35rem;font-size:0.74rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">All pages — raw totals</p>
    <section class="grid-stats" aria-label="Summary statistics">
      <article class="stat">
        <div class="stat-label">Pages Scanned</div>
        <div class="stat-value">${summary.scannedPages}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Total Violations</div>
        <div class="stat-value" style="color:#ef4444">${severitySummary.totalViolations}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Critical</div>
        <div class="stat-value" style="color:#ef4444">${impacts.critical || 0}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Serious</div>
        <div class="stat-value" style="color:#fb923c">${impacts.serious || 0}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Moderate</div>
        <div class="stat-value" style="color:#facc15">${impacts.moderate || 0}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Minor</div>
        <div class="stat-value" style="color:#60a5fa">${impacts.minor || 0}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Total Passes</div>
        <div class="stat-value" style="color:#22c55e">${severitySummary.totalPasses || 0}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Incomplete</div>
        <div class="stat-value" style="color:#facc15">${severitySummary.totalIncomplete || 0}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Pages with Violations</div>
        <div class="stat-value">${pagesWithViolations.length}</div>
      </article>
      <article class="stat">
        <div class="stat-label">Rules Triggered</div>
        <div class="stat-value">${violationRules.length}</div>
      </article>
    </section>

    ${uniqueTotal !== null ? `
    <p style="margin:1.1rem 0 0.35rem;font-size:0.74rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent)">Unique actionable issues — deduplicated</p>
    <section class="grid-stats" aria-label="Unique actionable issues" style="border-color:rgba(45,212,191,0.2)">
      <article class="stat" style="border-color:rgba(45,212,191,0.2)">
        <div class="stat-label">Unique Issues</div>
        <div class="stat-value" style="color:var(--accent)">${uniqueTotal}</div>
      </article>
      <article class="stat" style="border-color:rgba(45,212,191,0.2)">
        <div class="stat-label">Critical (unique)</div>
        <div class="stat-value" style="color:#ef4444">${uniqueImpacts.critical || 0}</div>
      </article>
      <article class="stat" style="border-color:rgba(45,212,191,0.2)">
        <div class="stat-label">Serious (unique)</div>
        <div class="stat-value" style="color:#fb923c">${uniqueImpacts.serious || 0}</div>
      </article>
      <article class="stat" style="border-color:rgba(45,212,191,0.2)">
        <div class="stat-label">Moderate (unique)</div>
        <div class="stat-value" style="color:#facc15">${uniqueImpacts.moderate || 0}</div>
      </article>
      <article class="stat" style="border-color:rgba(45,212,191,0.2)">
        <div class="stat-label">Minor (unique)</div>
        <div class="stat-value" style="color:#60a5fa">${uniqueImpacts.minor || 0}</div>
      </article>
    </section>` : ""}

    ${severityRows || templateRows ? `
    <div class="grid-2">
      ${severityRows ? `
      <article class="panel">
        <h2>Violations by Severity</h2>
        ${severityRows}
      </article>` : ""}
      ${templateRows ? `
      <article class="panel">
        <h2>Violations by Template</h2>
        ${templateRows}
      </article>` : ""}
    </div>` : ""}

    ${violationRules.length > 0 ? `
    <div class="panel-full">
      <h2>Rules to Fix (${violationRules.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Impact</th>
            <th>Rule</th>
            <th>Description</th>
            <th class="num">Occurrences</th>
            <th class="num">Pages</th>
            <th>Docs</th>
          </tr>
        </thead>
        <tbody>
          ${ruleTableRows}
        </tbody>
      </table>
    </div>` : ""}

    ${pagesWithViolations.length > 0 ? `
    <div class="panel-full">
      <h2>Pages with Violations (${pagesWithViolations.length})</h2>
      <input id="pageSearch" type="search" placeholder="Filter by URL…" aria-label="Filter pages by URL" />
      <table id="pageTable">
        <thead>
          <tr>
            <th>URL</th>
            <th>Template</th>
            <th>Worst Impact</th>
            <th class="num">Violations</th>
          </tr>
        </thead>
        <tbody id="pageBody">
          ${pageTableRows}
        </tbody>
      </table>
    </div>` : '<div class="panel-full"><p class="empty">No pages with violations found.</p></div>'}

    <div class="panel-full">
      <h2>All Pages Scanned (${pagesLite.length})</h2>
      <p class="muted" style="margin:0 0 0.6rem;font-size:0.82rem">Every page that was scanned, including clean pages. Pages marked with <strong>*</strong> did not reach network-idle and results may be incomplete.</p>
      <input id="allPageSearch" type="search" placeholder="Filter by URL…" aria-label="Filter all scanned pages by URL" />
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>Template</th>
            <th>Status</th>
            <th class="num">Violations</th>
            <th class="num">Passes</th>
            <th class="num">Incomplete</th>
          </tr>
        </thead>
        <tbody id="allPageBody">
          ${allPagesTableRows}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const search = document.getElementById('pageSearch')
    const rows = document.querySelectorAll('#pageBody tr')
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase()
        for (const row of rows) {
          const url = row.querySelector('td')?.textContent?.toLowerCase() || ''
          row.hidden = q.length > 0 && !url.includes(q)
        }
      })
    }
    const allSearch = document.getElementById('allPageSearch')
    const allRows = document.querySelectorAll('#allPageBody tr')
    if (allSearch) {
      allSearch.addEventListener('input', () => {
        const q = allSearch.value.toLowerCase()
        for (const row of allRows) {
          const url = row.querySelector('td')?.textContent?.toLowerCase() || ''
          row.hidden = q.length > 0 && !url.includes(q)
        }
      })
    }
  </script>
</body>
</html>`

  await fs.mkdir(reportDir, { recursive: true })
  await fs.writeFile(path.join(reportDir, "report.html"), html, "utf8")
}
