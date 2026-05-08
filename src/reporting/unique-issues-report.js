import fs from "node:fs/promises"
import path from "node:path"
import { escapeHtml } from "../utils/url-utils.js"

const IMPACT_COLOR = {
  critical: "#ef4444",
  serious:  "#fb923c",
  moderate: "#facc15",
  minor:    "#60a5fa",
  unknown:  "#9ca3af"
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3, unknown: 4 }

function badge(impact) {
  return `<span class="badge badge-${escapeHtml(impact)}">${escapeHtml(impact)}</span>`
}

function templateBadges(templates) {
  return templates.map((t) => `<span class="tmpl-badge">${escapeHtml(t)}</span>`).join(" ")
}

function renderRows(items, totalPages) {
  return items.map((item, idx) => {
    const exampleSelector = item.exampleNode?.target
      ? (Array.isArray(item.exampleNode.target) ? item.exampleNode.target.join(" >> ") : item.exampleNode.target)
      : "—"

    const exampleHtml = item.exampleNode?.html ?? ""
    const failureSummary = item.exampleNode?.failureSummary ?? ""

    const screenshotBlock = item.exampleNode?.screenshotPath
      ? `<div class="screenshot-wrap">
           <img src="${escapeHtml(item.exampleNode.screenshotPath)}"
                alt="Screenshot of failing element for ${escapeHtml(item.ruleId)}"
                class="element-screenshot"
                loading="lazy" />
         </div>`
      : ""

    const pagePercent = totalPages > 0 ? Math.round((item.pageCount / totalPages) * 100) : 0
    const docLink = item.helpUrl
      ? `<a href="${escapeHtml(item.helpUrl)}" target="_blank" rel="noreferrer" class="doc-link">WCAG docs ↗</a>`
      : ""

    return `
    <details class="issue impact-${escapeHtml(item.impact)}" data-impact="${escapeHtml(item.impact)}" data-templates="${escapeHtml(item.templates.join(","))}">
      <summary class="issue-summary">
        <span class="rank">#${idx + 1}</span>
        <span class="rule-info">
          <span class="rule-id"><code>${escapeHtml(item.ruleId)}</code></span>
          <span class="rule-help">${escapeHtml(item.help)}</span>
        </span>
        <span class="issue-meta">
          ${badge(item.impact)}
          <span class="stat-pill" title="${item.pageCount} pages affected">${item.pageCount} pages</span>
          <span class="stat-pill muted-pill" title="${item.occurrences} total occurrences">${item.occurrences}×</span>
          ${templateBadges(item.templates)}
        </span>
      </summary>
      <div class="issue-detail">
        <div class="detail-cols">
          <div class="detail-main">
            <p class="description">${escapeHtml(item.description)}</p>
            ${failureSummary ? `<p class="failure-summary"><strong>Why it fails:</strong> ${escapeHtml(failureSummary)}</p>` : ""}
            <div class="selector-block">
              <span class="selector-label">Example selector</span>
              <code class="selector">${escapeHtml(exampleSelector)}</code>
            </div>
            ${exampleHtml ? `<div class="html-block"><span class="selector-label">Example HTML</span><pre class="html-snippet">${escapeHtml(exampleHtml)}</pre></div>` : ""}
            <div class="detail-footer">
              <span class="muted">Found on ${pagePercent}% of scanned pages (${item.pageCount} of ${totalPages})</span>
              <span class="example-source muted">Example from: <a href="${escapeHtml(item.examplePageUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.examplePageUrl)}</a></span>
              ${docLink}
            </div>
          </div>
          ${screenshotBlock ? `<div class="detail-screenshot">${screenshotBlock}</div>` : ""}
        </div>
      </div>
    </details>`
  }).join("\n")
}

function groupedByTemplate(items) {
  const groups = {}
  for (const item of items) {
    for (const tmpl of item.templates) {
      if (!groups[tmpl]) groups[tmpl] = []
      groups[tmpl].push(item)
    }
  }
  return groups
}

export async function writeUniqueIssuesReport(reportDir, uniqueViolationsData, totalPages) {
  const { uniqueViolations } = uniqueViolationsData
  if (!uniqueViolations || uniqueViolations.length === 0) return

  const impactCounts = {}
  for (const item of uniqueViolations) {
    impactCounts[item.impact] = (impactCounts[item.impact] || 0) + 1
  }

  const templateGroups = groupedByTemplate(uniqueViolations)
  const templateNames = Object.keys(templateGroups).sort()

  const filterOptions = ["all", ...Object.keys(IMPACT_ORDER).filter((k) => impactCounts[k])]
  const templateFilterOptions = ["all", ...templateNames]

  const impactFilterHtml = filterOptions.map((k) => {
    const label = k === "all" ? "All impacts" : k
    const count = k === "all" ? uniqueViolations.length : (impactCounts[k] || 0)
    return `<button class="filter-btn" data-filter-impact="${escapeHtml(k)}">${escapeHtml(label)} <span class="filter-count">${count}</span></button>`
  }).join("\n        ")

  const templateFilterHtml = templateFilterOptions.map((t) => {
    const label = t === "all" ? "All templates" : t
    const count = t === "all" ? uniqueViolations.length : (templateGroups[t]?.length || 0)
    return `<button class="filter-btn" data-filter-template="${escapeHtml(t)}">${escapeHtml(label)} <span class="filter-count">${count}</span></button>`
  }).join("\n        ")

  const promptData = JSON.stringify(uniqueViolations.map((item) => ({
    ruleId: item.ruleId,
    impact: item.impact,
    help: item.help,
    description: item.description,
    selector: item.exampleNode?.target
      ? (Array.isArray(item.exampleNode.target) ? item.exampleNode.target.join(" >> ") : item.exampleNode.target)
      : null,
    html: item.exampleNode?.html || null,
    failureSummary: item.exampleNode?.failureSummary || null,
    helpUrl: item.helpUrl,
    templates: item.templates,
    pageCount: item.pageCount,
    occurrences: item.occurrences,
    examplePageUrl: item.examplePageUrl,
    cms: item.cms ? {
      platform: item.cms.platform,
      templateFile: item.cms.templateFile,
      hierarchy: item.cms.hierarchy,
      label: item.cms.label || null,
      isBlockTheme: item.cms.isBlockTheme || false,
      templateParts: item.cms.templateParts || [],
      pageBuilder: item.cms.pageBuilder || null,
      noEdit: item.cms.noEdit || false,
    } : null,
  })))

  const promptTemplateOptions = templateNames.map((t) =>
    `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
  ).join("\n            ")

  const allRows = renderRows(uniqueViolations, totalPages)

  const topIssues = [...uniqueViolations]
    .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 4) - (IMPACT_ORDER[b.impact] ?? 4) || b.pageCount - a.pageCount)
    .slice(0, 5)

  const topPagesAffected = new Set(topIssues.flatMap((i) => i.affectedPages)).size
  const topPercent = totalPages > 0 ? Math.round((topPagesAffected / totalPages) * 100) : 0

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Unique Issues — Includa</title>
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

    .shell { max-width: 1200px; margin: 0 auto; padding: 1.6rem 1.2rem 4rem; }

    .back-link {
      display: inline-flex; align-items: center; gap: 0.4rem;
      font-size: 0.84rem; color: var(--accent-2); margin-bottom: 0.7rem;
      text-decoration: none;
    }

    .page-header { margin-bottom: 1.4rem; }
    .page-header h1 {
      margin: 0 0 0.3rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: clamp(1.3rem, 2.5vw, 2rem);
    }
    .page-header p { margin: 0; color: var(--muted); font-size: 0.9rem; }

    .callout {
      border: 1px solid rgba(45, 212, 191, 0.3);
      border-radius: var(--radius);
      background: rgba(45, 212, 191, 0.07);
      padding: 1rem 1.2rem;
      margin-bottom: 1.4rem;
      font-size: 0.9rem;
    }
    .callout strong { color: var(--accent); }

    .stats-row {
      display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.4rem;
    }
    .stat-card {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, rgba(12, 30, 44, 0.85), rgba(9, 23, 35, 0.9));
      padding: 0.75rem 1rem;
      min-width: 130px;
    }
    .stat-card-label { color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .stat-card-value { font-family: "Space Grotesk", sans-serif; font-size: 1.6rem; font-weight: 700; margin-top: 0.2rem; }

    .filters {
      display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; align-items: center;
    }
    .filter-group { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .filter-separator { width: 1px; height: 24px; background: var(--stroke); margin: 0 0.25rem; align-self: center; }

    .filter-btn {
      padding: 0.28rem 0.7rem;
      border-radius: 999px;
      border: 1px solid var(--stroke);
      background: rgba(12, 29, 42, 0.7);
      color: var(--muted);
      font-size: 0.78rem;
      cursor: pointer;
      display: inline-flex; align-items: center; gap: 0.3rem;
      transition: border-color 0.15s, color 0.15s;
    }
    .filter-btn:hover { border-color: var(--accent-2); color: var(--text); }
    .filter-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(45, 212, 191, 0.1); }
    .filter-count { font-size: 0.7rem; opacity: 0.7; }

    .search-bar {
      width: 100%; padding: 0.45rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--stroke);
      background: rgba(5, 17, 27, 0.82);
      color: var(--text);
      font-size: 0.86rem;
      margin-bottom: 0.85rem;
    }

    .results-count { font-size: 0.82rem; color: var(--muted); margin-bottom: 0.75rem; }

    .issue {
      border: 1px solid var(--stroke);
      border-left: 5px solid var(--muted);
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      box-shadow: var(--shadow);
      margin-bottom: 0.75rem;
      overflow: hidden;
    }
    .issue[open] { border-left-width: 5px; }
    .impact-critical { border-left-color: #ef4444; }
    .impact-serious  { border-left-color: #fb923c; }
    .impact-moderate { border-left-color: #facc15; }
    .impact-minor    { border-left-color: #60a5fa; }
    .impact-unknown  { border-left-color: #9ca3af; }

    .issue-summary {
      display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
      padding: 0.85rem 1rem; cursor: pointer; list-style: none;
      user-select: none;
    }
    .issue-summary::-webkit-details-marker { display: none; }
    .issue-summary::before {
      content: "▶"; font-size: 0.65rem; color: var(--muted);
      transition: transform 0.2s; flex-shrink: 0;
    }
    details[open] .issue-summary::before { transform: rotate(90deg); }

    .rank {
      font-family: "Space Grotesk", sans-serif;
      font-size: 0.75rem; font-weight: 700;
      color: var(--muted); min-width: 28px;
    }

    .rule-info { flex: 1; min-width: 200px; }
    .rule-id { display: block; font-size: 0.9rem; font-weight: 600; margin-bottom: 0.15rem; }
    .rule-help { font-size: 0.83rem; color: var(--muted); }

    .issue-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; flex-shrink: 0; }

    .stat-pill {
      font-size: 0.75rem; font-weight: 600;
      padding: 0.18rem 0.55rem; border-radius: 999px;
      background: rgba(56, 189, 248, 0.15); color: #7dd3fc;
      white-space: nowrap;
    }
    .muted-pill { background: rgba(100, 120, 140, 0.2); color: var(--muted); }

    .tmpl-badge {
      font-size: 0.7rem; padding: 0.1rem 0.45rem;
      border-radius: 999px; border: 1px solid rgba(157, 197, 220, 0.3);
      color: var(--muted);
    }

    .issue-detail {
      border-top: 1px solid var(--stroke);
      padding: 1rem 1.2rem 1.2rem;
    }

    .detail-cols { display: flex; gap: 1.2rem; }
    .detail-main { flex: 1; min-width: 0; }
    .detail-screenshot { flex-shrink: 0; }

    .description { margin: 0 0 0.6rem; font-size: 0.88rem; color: var(--muted); }
    .failure-summary { margin: 0 0 0.8rem; font-size: 0.85rem; color: var(--text); }

    .selector-block, .html-block { margin-bottom: 0.75rem; }
    .selector-label {
      display: block; font-size: 0.7rem; text-transform: uppercase;
      letter-spacing: 0.07em; color: var(--muted); margin-bottom: 0.3rem;
    }
    .selector {
      display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem; padding: 0.45rem 0.65rem;
      background: rgba(5, 15, 24, 0.9);
      border: 1px solid rgba(120, 158, 182, 0.25);
      border-radius: 6px; word-break: break-all;
    }
    .html-snippet {
      margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem; padding: 0.5rem 0.7rem;
      background: rgba(5, 15, 24, 0.9);
      border: 1px solid rgba(120, 158, 182, 0.25);
      border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;
      max-height: 120px;
    }

    .detail-footer {
      display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center;
      margin-top: 0.6rem; font-size: 0.8rem;
    }
    .muted { color: var(--muted); }
    .example-source { font-size: 0.78rem; }
    .doc-link { color: var(--accent-2); font-weight: 600; }

    .screenshot-wrap {
      border: 1px solid var(--stroke);
      border-radius: 8px; overflow: hidden;
      background: rgba(5, 15, 24, 0.7);
    }
    .element-screenshot {
      display: block; max-width: 300px; max-height: 220px;
      object-fit: contain;
    }

    .badge {
      display: inline-block; font-size: 0.72rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em;
      padding: 0.18rem 0.5rem; border-radius: 999px;
    }
    .badge-critical { background: rgba(239, 68, 68, 0.22);  color: #fca5a5; }
    .badge-serious  { background: rgba(251, 146, 60, 0.22);  color: #fdba74; }
    .badge-moderate { background: rgba(250, 204, 21, 0.18);  color: #fde68a; }
    .badge-minor    { background: rgba(96, 165, 250, 0.2);   color: #93c5fd; }
    .badge-unknown  { background: rgba(156, 163, 175, 0.2);  color: #d1d5db; }

    a { color: var(--accent-2); }
    a:visited { color: #a78bfa; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.82rem;
      background: rgba(8, 23, 36, 0.9);
      border: 1px solid rgba(120, 158, 182, 0.25);
      border-radius: 5px; padding: 0.06rem 0.26rem;
    }

    .prompt-section {
      border: 1px solid rgba(45, 212, 191, 0.3);
      border-radius: var(--radius);
      background: linear-gradient(180deg, rgba(12, 30, 44, 0.85), rgba(9, 23, 35, 0.9));
      padding: 1.2rem;
      margin-top: 2rem;
    }
    .prompt-section h2 {
      margin: 0 0 0.4rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: 1.15rem;
      color: var(--accent);
    }
    .prompt-section > p { margin: 0 0 1rem; font-size: 0.88rem; color: var(--muted); }
    .prompt-controls {
      display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;
      margin-bottom: 0.85rem;
    }
    .prompt-select {
      padding: 0.4rem 0.65rem;
      border-radius: 8px;
      border: 1px solid var(--stroke);
      background: rgba(5, 17, 27, 0.82);
      color: var(--text);
      font-size: 0.86rem;
      min-width: 220px;
    }
    .prompt-copy-btn {
      padding: 0.4rem 1rem;
      border-radius: 8px;
      border: 1px solid rgba(45, 212, 191, 0.5);
      background: rgba(45, 212, 191, 0.12);
      color: var(--accent);
      font-weight: 600;
      font-size: 0.84rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .prompt-copy-btn:hover { background: rgba(45, 212, 191, 0.22); border-color: var(--accent); }
    .prompt-output {
      margin: 0;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid var(--stroke);
      background: rgba(5, 15, 24, 0.92);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 500px;
      overflow-y: auto;
    }

    .hidden { display: none !important; }

    @media (max-width: 700px) {
      .detail-cols { flex-direction: column; }
      .element-screenshot { max-width: 100%; }
      .issue-summary { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <a class="back-link" href="./report.html">← Back to Report</a>

    <header class="page-header">
      <h1>Unique Issues</h1>
      <p>Every distinct accessibility problem, deduplicated across all ${totalPages} scanned pages. Fix these to resolve violations at scale.</p>
    </header>

    <div class="callout">
      Fixing the top 5 highest-priority issues below would eliminate violations on
      <strong>${topPercent}%</strong> of scanned pages (${topPagesAffected} of ${totalPages}).
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-card-label">Unique Issues</div>
        <div class="stat-card-value">${uniqueViolations.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Pages Scanned</div>
        <div class="stat-card-value">${totalPages}</div>
      </div>
      ${Object.entries(impactCounts)
        .sort(([a], [b]) => (IMPACT_ORDER[a] ?? 4) - (IMPACT_ORDER[b] ?? 4))
        .map(([impact, count]) => `
      <div class="stat-card">
        <div class="stat-card-label">${impact}</div>
        <div class="stat-card-value" style="color:${IMPACT_COLOR[impact] ?? "#9ca3af"}">${count}</div>
      </div>`).join("")}
    </div>

    <div class="filters">
      <div class="filter-group" id="impactFilters">
        ${impactFilterHtml}
      </div>
      <div class="filter-separator"></div>
      <div class="filter-group" id="templateFilters">
        ${templateFilterHtml}
      </div>
    </div>

    <input class="search-bar" type="search" id="searchBar" placeholder="Filter by rule ID or description…" aria-label="Search unique issues" />

    <p class="results-count" id="resultsCount">${uniqueViolations.length} unique issues</p>

    <div id="issueList">
      ${allRows}
    </div>

    <div class="prompt-section">
      <h2>AI Fix Prompts</h2>
      <p>Select a template to generate a ready-to-paste prompt with all the accessibility issues an AI needs to fix. Copy the prompt and paste it into your preferred AI assistant.</p>
      <div class="prompt-controls">
        <select class="prompt-select" id="promptTemplateSelect">
          <option value="__all__">All templates combined</option>
          ${promptTemplateOptions}
        </select>
        <button class="prompt-copy-btn" id="promptCopyBtn">Copy Prompt</button>
      </div>
      <pre class="prompt-output" id="promptOutput"></pre>
    </div>
  </div>

  <script>
    let activeImpact = 'all'
    let activeTemplate = 'all'
    let searchQuery = ''

    function applyFilters() {
      const items = document.querySelectorAll('#issueList details')
      let visible = 0
      for (const item of items) {
        const impact = item.dataset.impact || ''
        const templates = (item.dataset.templates || '').split(',')
        const text = item.textContent.toLowerCase()

        const impactOk = activeImpact === 'all' || impact === activeImpact
        const templateOk = activeTemplate === 'all' || templates.includes(activeTemplate)
        const searchOk = searchQuery === '' || text.includes(searchQuery)

        const show = impactOk && templateOk && searchOk
        item.classList.toggle('hidden', !show)
        if (show) visible++
      }
      document.getElementById('resultsCount').textContent = visible + ' unique issue' + (visible !== 1 ? 's' : '')
    }

    document.getElementById('impactFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn')
      if (!btn) return
      activeImpact = btn.dataset.filterImpact
      document.querySelectorAll('#impactFilters .filter-btn').forEach((b) => b.classList.toggle('active', b === btn))
      applyFilters()
    })

    document.getElementById('templateFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn')
      if (!btn) return
      activeTemplate = btn.dataset.filterTemplate
      document.querySelectorAll('#templateFilters .filter-btn').forEach((b) => b.classList.toggle('active', b === btn))
      applyFilters()
    })

    document.getElementById('searchBar').addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim()
      applyFilters()
    })

    // Set initial active state on "all" buttons
    document.querySelector('[data-filter-impact="all"]')?.classList.add('active')
    document.querySelector('[data-filter-template="all"]')?.classList.add('active')

    // AI prompt builder
    var PROMPT_DATA = ${promptData};

    function buildPrompt(templateName) {
      var issues = templateName === '__all__'
        ? PROMPT_DATA
        : PROMPT_DATA.filter(function(item) { return item.templates.indexOf(templateName) !== -1 })

      if (issues.length === 0) return 'No violations found for this template.'

      var groups = { critical: [], serious: [], moderate: [], minor: [], unknown: [] }
      for (var i = 0; i < issues.length; i++) {
        var sev = issues[i].impact || 'unknown'
        if (!groups[sev]) groups[sev] = []
        groups[sev].push(issues[i])
      }

      var cmsInfo = null
      for (var c = 0; c < issues.length; c++) {
        if (issues[c].cms) { cmsInfo = issues[c].cms; break }
      }

      var lines = []
      lines.push('You are an accessibility remediation expert. Your task is to fix the WCAG accessibility violations listed below.')
      lines.push('')
      lines.push('CONTEXT:')
      lines.push('- ' + issues.length + ' unique accessibility violations were found' + (templateName !== '__all__' ? ' in the "' + templateName + '" template' : ' across all templates') + '.')
      lines.push('- These were detected by axe-core during an automated scan.')

      if (cmsInfo) {
        var PLATFORM_LABEL = { wordpress: 'WordPress', shopify: 'Shopify', drupal: 'Drupal', ghost: 'Ghost', hubspot: 'HubSpot', magento2: 'Magento 2', squarespace: 'Squarespace' }
        var platformName = PLATFORM_LABEL[cmsInfo.platform] || cmsInfo.platform || 'Unknown CMS'
        var platformDetail = ''
        if (cmsInfo.pageBuilder === 'pagefly') platformDetail = ' + PageFly page builder'
        else if (cmsInfo.platform === 'wordpress') platformDetail = cmsInfo.isBlockTheme ? ' (Block/FSE theme)' : ' (Classic theme)'
        else if (cmsInfo.label) platformDetail = ' (' + cmsInfo.label + ')'
        lines.push('- CMS: ' + platformName + platformDetail)
        if (cmsInfo.templateFile) lines.push('- Active template file: ' + cmsInfo.templateFile)
        if (cmsInfo.hierarchy && cmsInfo.hierarchy.length > 1) lines.push('- Template hierarchy: ' + cmsInfo.hierarchy.join(' → '))
        if (cmsInfo.isBlockTheme) {
          lines.push('- Template parts to check: ' + (cmsInfo.templateParts || []).join(', '))
          lines.push('- Design tokens are defined in theme.json (colors, typography, spacing)')
        }
      }

      lines.push('')
      lines.push('INSTRUCTIONS:')
      lines.push('- For each violation, provide the corrected HTML/CSS code.')
      lines.push('- Show before and after code snippets so the developer knows exactly what to change.')

      if (cmsInfo && cmsInfo.pageBuilder === 'pagefly') {
        lines.push('- This page is built with PageFly on Shopify. The HTML is generated by PageFly sections — elements have data-pf-type attributes.')
        lines.push('- For each violation, describe which PageFly element to select in the visual editor and exactly which setting to change.')
        lines.push('- Map the CSS selector to the PageFly element type (e.g. data-pf-type="Row", "Column", "Heading", "Image", "Button").')
        lines.push('- If the fix requires custom CSS or HTML, show the code to paste into PageFly\\'s Custom CSS or Custom HTML fields for that element.')
        lines.push('- If the fix cannot be done in PageFly\\'s UI (e.g. missing ARIA attributes), provide a Liquid snippet for the theme\\'s custom code or a JavaScript fix to add via PageFly\\'s custom code section.')
        lines.push('- Common PageFly a11y fixes: alt text via Image element settings, heading levels via Heading element dropdown, link text via Button/Link element content, color contrast via element Style tab.')
      } else if (cmsInfo && cmsInfo.platform === 'wordpress' && cmsInfo.isBlockTheme) {
        lines.push('- This is a WordPress Block (FSE) theme. Templates are HTML files in templates/ and template parts are in parts/.')
        lines.push('- Fixes may require editing block markup (<!-- wp:group -->, etc.), theme.json, or custom block code.')
        lines.push('- For color/contrast issues, check theme.json palette definitions under settings.color.palette.')
      } else if (cmsInfo && cmsInfo.platform === 'wordpress') {
        lines.push('- This is a WordPress Classic theme. Templates are PHP files in the theme root.')
        lines.push('- If the fix requires changes to a CMS template, identify which template file is likely responsible.')
      } else if (cmsInfo && cmsInfo.platform === 'shopify') {
        lines.push('- This is a Shopify store. Templates are Liquid files in the theme.')
        lines.push('- Fixes may require editing Liquid templates (sections/, snippets/, templates/) or theme settings.')
        lines.push('- For styling issues, check assets/ CSS files or inline styles in Liquid templates.')
      } else if (cmsInfo && cmsInfo.platform === 'drupal') {
        lines.push('- This is a Drupal site. Templates are Twig files in the active theme.')
        lines.push('- If the fix requires changes to a template, identify which Twig file is likely responsible.')
      } else if (cmsInfo) {
        lines.push('- If the fix requires changes to a CMS template, identify which template file is likely responsible.')
      } else {
        lines.push('- If the fix requires changes to a template, identify which file is likely responsible.')
      }

      lines.push('- Explain WHY each fix resolves the accessibility issue.')
      lines.push('- Prioritize critical and serious issues first.')
      lines.push('')
      lines.push('='.repeat(60))
      lines.push('VIOLATIONS TO FIX')
      lines.push('='.repeat(60))

      var severityOrder = ['critical', 'serious', 'moderate', 'minor', 'unknown']
      for (var s = 0; s < severityOrder.length; s++) {
        var sev = severityOrder[s]
        var group = groups[sev]
        if (!group || group.length === 0) continue

        lines.push('')
        lines.push('-'.repeat(40))
        lines.push(sev.toUpperCase() + ' (' + group.length + ' issue' + (group.length !== 1 ? 's' : '') + ')')
        lines.push('-'.repeat(40))

        for (var j = 0; j < group.length; j++) {
          var issue = group[j]
          lines.push('')
          lines.push((j + 1) + '. ' + issue.ruleId)
          lines.push('   Impact: ' + issue.impact)
          lines.push('   Problem: ' + issue.help)
          if (issue.description) lines.push('   Description: ' + issue.description)
          if (issue.selector) lines.push('   Selector: ' + issue.selector)
          if (issue.html) lines.push('   Example HTML: ' + issue.html)
          if (issue.failureSummary) lines.push('   Failure reason: ' + issue.failureSummary)
          lines.push('   Found on: ' + issue.pageCount + ' page' + (issue.pageCount !== 1 ? 's' : '') + ' (' + issue.occurrences + ' total occurrences)')
          if (issue.templates.length > 0) lines.push('   Templates: ' + issue.templates.join(', '))
          if (issue.cms && issue.cms.templateFile) lines.push('   Template file: ' + issue.cms.templateFile)
          if (issue.cms && issue.cms.hierarchy && issue.cms.hierarchy.length > 1) lines.push('   Hierarchy: ' + issue.cms.hierarchy.join(' → '))
          if (issue.examplePageUrl) lines.push('   Example page: ' + issue.examplePageUrl)
          if (issue.helpUrl) lines.push('   WCAG docs: ' + issue.helpUrl)
        }
      }

      lines.push('')
      lines.push('='.repeat(60))
      lines.push('PRIORITY GUIDANCE')
      lines.push('='.repeat(60))
      lines.push('Focus on critical and serious issues first — these have the highest impact on users with disabilities.')
      lines.push('Issues affecting more pages should be prioritized as they have the widest reach.')
      lines.push('Template-level fixes will resolve violations across all pages using that template.')

      return lines.join('\\n')
    }

    var promptSelect = document.getElementById('promptTemplateSelect')
    var promptOutput = document.getElementById('promptOutput')
    var promptCopyBtn = document.getElementById('promptCopyBtn')

    function updatePrompt() {
      promptOutput.textContent = buildPrompt(promptSelect.value)
    }

    promptSelect.addEventListener('change', updatePrompt)
    updatePrompt()

    promptCopyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(promptOutput.textContent).then(function() {
        promptCopyBtn.textContent = 'Copied!'
        setTimeout(function() { promptCopyBtn.textContent = 'Copy Prompt' }, 2000)
      })
    })
  </script>
</body>
</html>`

  await fs.mkdir(reportDir, { recursive: true })
  await fs.writeFile(path.join(reportDir, "unique-issues.html"), html, "utf8")
}
