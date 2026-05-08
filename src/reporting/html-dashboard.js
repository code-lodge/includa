import fs from "node:fs/promises"
import path from "node:path"
import { faviconLink } from "../utils/favicon.js"

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Includa dashboard</title>
  __FAVICON_LINK__
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #08131d;
      --bg-soft: #102436;
      --panel: rgba(12, 29, 42, 0.84);
      --panel-strong: rgba(10, 24, 35, 0.96);
      --stroke: rgba(157, 197, 220, 0.22);
      --text: #e9f2f8;
      --muted: #9fb4c3;
      --accent: #2dd4bf;
      --accent-2: #38bdf8;
      --warn: #fb923c;
      --critical: #ef4444;
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
      max-width: 1480px;
      margin: 0 auto;
      padding: 1.4rem 1.2rem 2rem;
    }

    .hero {
      border: 1px solid var(--stroke);
      border-radius: 18px;
      background: linear-gradient(120deg, rgba(18, 40, 56, 0.9), rgba(11, 27, 40, 0.85));
      box-shadow: var(--shadow);
      padding: 1.25rem 1.3rem;
      margin-bottom: 1rem;
    }

    .hero h1 {
      margin: 0;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.01em;
      font-size: clamp(1.4rem, 3vw, 2rem);
    }

    .hero p {
      margin: 0.4rem 0 0;
      color: var(--muted);
      font-size: 0.96rem;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.85rem;
      background: rgba(45, 212, 191, 0.13);
      color: #dcfdf7;
      border: 1px solid rgba(45, 212, 191, 0.35);
      border-radius: 999px;
      font-size: 0.84rem;
      padding: 0.35rem 0.72rem;
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 99px;
      background: var(--accent);
      box-shadow: 0 0 0 6px rgba(45, 212, 191, 0.13);
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      70% { transform: scale(1.2); opacity: 0.5; }
      100% { transform: scale(1); opacity: 1; }
    }

    .top-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.85rem;
      margin-bottom: 1rem;
    }

    .stat {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, rgba(12, 30, 44, 0.85), rgba(9, 23, 35, 0.9));
      box-shadow: var(--shadow);
      padding: 0.95rem;
    }

    .label {
      color: var(--muted);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .value {
      margin-top: 0.35rem;
      font-size: 1.75rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
    }

    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.9rem;
    }

    .tab {
      border: 1px solid var(--stroke);
      background: rgba(15, 34, 49, 0.8);
      color: var(--text);
      border-radius: 10px;
      padding: 0.45rem 0.74rem;
      cursor: pointer;
      font-size: 0.86rem;
      transition: transform 120ms ease, background 120ms ease;
    }

    .tab.active {
      background: linear-gradient(90deg, rgba(45, 212, 191, 0.2), rgba(56, 189, 248, 0.22));
      border-color: rgba(45, 212, 191, 0.5);
      color: #f0fdfa;
    }

    .tab:hover { transform: translateY(-1px); }

    .view { display: none; }
    .view.active {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.9rem;
      animation: reveal 180ms ease;
    }

    @keyframes reveal {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .panel {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      box-shadow: var(--shadow);
      padding: 0.95rem;
      min-height: 160px;
    }

    .panel h2 {
      margin: 0 0 0.72rem;
      font-size: 1.02rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 125px 1fr 60px;
      gap: 0.58rem;
      margin: 0.5rem 0;
      align-items: center;
      font-size: 0.88rem;
    }

    .bar {
      height: 8px;
      border-radius: 999px;
      background: rgba(105, 146, 173, 0.28);
      overflow: hidden;
    }

    .bar span {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
    }

    a { color: var(--accent-2); }
    a:visited { color: #a78bfa; }

    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .sr-only {
      position: absolute;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      border: 0;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      margin-bottom: 0.72rem;
    }

    input, select {
      min-height: 34px;
      border-radius: 8px;
      border: 1px solid var(--stroke);
      background: rgba(5, 17, 27, 0.82);
      color: var(--text);
      padding: 0.42rem 0.52rem;
      font-size: 0.86rem;
    }

    button {
      min-height: 34px;
      border-radius: 8px;
      border: 1px solid rgba(45, 212, 191, 0.4);
      background: linear-gradient(90deg, rgba(45, 212, 191, 0.92), rgba(56, 189, 248, 0.9));
      color: #032430;
      padding: 0.42rem 0.65rem;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
    }

    button.ghost {
      background: rgba(16, 36, 51, 0.78);
      color: var(--text);
      border-color: var(--stroke);
      font-weight: 600;
    }

    .btn-stop {
      background: linear-gradient(90deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9));
      border-color: rgba(239, 68, 68, 0.5);
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      font-size: 0.84rem;
    }

    .btn-resume {
      background: linear-gradient(90deg, rgba(45, 212, 191, 0.9), rgba(56, 189, 248, 0.85));
      border-color: rgba(45, 212, 191, 0.5);
      padding: 0.35rem 0.85rem;
      border-radius: 999px;
      font-size: 0.84rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }

    th, td {
      border-bottom: 1px solid rgba(159, 180, 195, 0.2);
      text-align: left;
      vertical-align: top;
      padding: 0.46rem;
      line-height: 1.35;
    }

    th { color: #c3d9e7; }
    .muted { color: var(--muted); }

    .sub-label {
      margin-top: 0.22rem;
      font-size: 0.74rem;
      color: var(--muted);
    }

    .detail-box {
      border: 1px solid rgba(159, 180, 195, 0.22);
      background: rgba(4, 15, 24, 0.76);
      border-radius: 10px;
      padding: 0.72rem;
      max-height: 460px;
      overflow: auto;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      background: rgba(8, 23, 36, 0.94);
      border: 1px solid rgba(120, 158, 182, 0.3);
      border-radius: 6px;
      padding: 0.08rem 0.28rem;
    }

    .span-2 { grid-column: span 2; }

    .scan-form-wrap {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(120deg, rgba(18, 40, 56, 0.85), rgba(11, 27, 40, 0.8));
      box-shadow: var(--shadow);
      margin-bottom: 1rem;
      overflow: hidden;
    }

    .scan-form-wrap summary {
      padding: 0.75rem 1rem;
      cursor: pointer;
      font-family: "Space Grotesk", sans-serif;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--accent);
      list-style: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      user-select: none;
    }

    .scan-form-wrap summary::before {
      content: "▶";
      font-size: 0.65rem;
      transition: transform 150ms;
    }

    .scan-form-wrap[open] summary::before { transform: rotate(90deg); }

    .scan-form {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.65rem 0.75rem;
      padding: 0 1rem 0.85rem;
    }

    .scan-field {
      display: flex;
      flex-direction: column;
      gap: 0.28rem;
    }

    .scan-field--url { grid-column: 1 / -1; }
    .scan-field--wide { grid-column: span 2; }

    .scan-field label {
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .scan-hint {
      font-weight: 400;
      text-transform: none;
      letter-spacing: 0;
      font-size: 0.72rem;
    }

    .scan-form-actions {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding-top: 0.35rem;
    }

    #scanFormMsg {
      font-size: 0.84rem;
      color: var(--accent);
    }

    #scanFormMsg.error { color: var(--critical); }

    .checklist li {
      margin-bottom: 0.45rem;
      color: #d9e8f2;
    }

    .rules-list {
      max-height: 200px;
      overflow-y: auto;
      font-size: 0.82rem;
    }

    .rules-list code {
      display: inline-block;
      margin: 0.15rem 0.1rem;
      padding: 0.12rem 0.35rem;
    }

    .sort-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .sort-controls label {
      font-size: 0.78rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-right: 0.1rem;
    }

    .sort-btn {
      min-height: 28px;
      padding: 0.22rem 0.52rem;
      font-size: 0.78rem;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid var(--stroke);
      background: rgba(5, 17, 27, 0.82);
      color: var(--muted);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
    }

    .sort-btn:hover { color: var(--text); }

    .sort-btn.active {
      background: linear-gradient(90deg, rgba(45, 212, 191, 0.18), rgba(56, 189, 248, 0.18));
      border-color: rgba(45, 212, 191, 0.45);
      color: #f0fdfa;
    }

    .sort-btn .arrow { font-size: 0.68rem; margin-left: 0.2rem; }

    .virtual-scroll-container {
      max-height: 520px;
      overflow-y: auto;
      position: relative;
    }

    .virtual-scroll-container table {
      position: relative;
    }

    .virtual-scroll-container thead {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--panel-strong);
    }

    @media (max-width: 1200px) {
      .view.active { grid-template-columns: 1fr; }
      .span-2 { grid-column: span 1; }
    }
  </style>
</head>
<body>
  <a href="#main-content" class="sr-only">Skip to main content</a>
  <div class="shell" id="main-content">
    <header class="hero">
      <h1>Includa Live Dashboard</h1>
      <p>Streaming accessibility findings for large websites, with rule-level drilldowns and page troubleshooting.</p>
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-top:0.85rem">
        <div class="status-pill"><span class="dot"></span><span id="scanStatus">Waiting for scan data...</span></div>
        <button id="stopScanBtn" type="button" class="btn-stop" style="display:none">Stop Scan</button>
        <button id="resumeScanBtn" type="button" class="btn-resume" style="display:none">Resume Scan</button>
        <a id="viewReportBtn" href="./report.html" style="display:none;padding:0.35rem 0.85rem;border-radius:999px;background:linear-gradient(90deg,rgba(45,212,191,0.9),rgba(56,189,248,0.85));color:#032430;font-weight:700;font-size:0.84rem;text-decoration:none">View Report →</a>
        <!-- BACK_LINK -->
      </div>
    </header>

    <details class="scan-form-wrap" id="scanFormWrap">
      <summary>Start New Scan</summary>
      <div class="scan-form">
        <div class="scan-field scan-field--url">
          <label for="scanUrl">Target URL *</label>
          <input id="scanUrl" type="url" placeholder="https://example.com" />
        </div>
        <div class="scan-field">
          <label for="scanWcag">WCAG Level</label>
          <select id="scanWcag">
            <option value="AAA">AAA (strictest)</option>
            <option value="AA">AA</option>
            <option value="A">A</option>
          </select>
        </div>
        <div class="scan-field">
          <label for="scanMaxPages">Max Pages</label>
          <input id="scanMaxPages" type="number" value="2000" min="1" max="50000" />
        </div>
        <div class="scan-field">
          <label for="scanSampleTemplate">Pages per Structure <span class="scan-hint">(0 = off, groups similar pages)</span></label>
          <input id="scanSampleTemplate" type="number" value="0" min="0" max="100" />
        </div>
        <div class="scan-field">
          <label for="scanDepth">Crawl Depth</label>
          <input id="scanDepth" type="number" value="6" min="1" max="20" />
        </div>
        <div class="scan-field">
          <label for="scanConcurrency">Concurrency</label>
          <input id="scanConcurrency" type="number" value="10" min="1" max="50" />
        </div>
        <div class="scan-field scan-field--wide" __REPORT_DIR_STYLE__>
          <label for="scanReportDir">Report Directory <span class="scan-hint">(where reports are saved)</span></label>
          <div style="display:flex;gap:0.4rem">
            <input id="scanReportDir" type="text" placeholder="./a11y-report" style="flex:1" />
            <button id="applyReportDir" type="button" class="ghost" style="white-space:nowrap">Apply</button>
          </div>
        </div>
        <div class="scan-field scan-field--wide">
          <label for="scanInclude">Include Patterns <span class="scan-hint">(comma-separated, e.g. /products/)</span></label>
          <input id="scanInclude" type="text" placeholder="/products/, /blog/" />
        </div>
        <div class="scan-field scan-field--wide">
          <label for="scanExclude">Exclude Patterns <span class="scan-hint">(comma-separated, e.g. /admin/)</span></label>
          <input id="scanExclude" type="text" placeholder="/admin/, /cart/" />
        </div>
        <div class="scan-form-actions">
          <button id="startScanBtn" type="button">Start Scan</button>
          <span id="scanFormMsg" role="status" aria-live="polite"></span>
        </div>
      </div>
    </details>

    <section class="top-grid">
      <article class="stat" title="WCAG conformance level the scan tested against. Not a compliance result."><div class="label">Tested at</div><div id="wcagLevel" class="value">AAA</div></article>
      <article class="stat" title="Binary WCAG result from automated checks. Manual review still required for full conformance."><div class="label">WCAG Compliance</div><div id="complianceLevel" class="value">–</div></article>
      <article class="stat"><div class="label">Discovered Pages</div><div id="discoveredPages" class="value">0</div></article>
      <article class="stat"><div class="label">Scanned Pages</div><div id="scannedPages" class="value">0</div></article>
      <article class="stat"><div class="label">Violations</div><div id="totalViolations" class="value" style="color: var(--critical)">0</div><div id="uniqueViolations" class="sub-label">0 unique rules</div></article>
      <article class="stat"><div class="label">Passes</div><div id="totalPasses" class="value" style="color: #22c55e">0</div><div id="uniquePasses" class="sub-label">0 unique rules</div></article>
      <article class="stat"><div class="label">Incomplete</div><div id="totalIncomplete" class="value" style="color: var(--warn)">0</div><div id="uniqueIncomplete" class="sub-label">0 unique rules</div></article>
      <article class="stat"><div class="label">Inapplicable</div><div id="totalInapplicable" class="value" style="color: var(--muted)">0</div><div id="uniqueInapplicable" class="sub-label">0 unique rules</div></article>
      <article class="stat"><div class="label">Rules Run</div><div id="rulesRunCount" class="value">0</div></article>
      <article class="stat" title="Weighted % of axe rules passed across the scan. Heuristic — does not prove WCAG conformance."><div class="label">Score</div><div id="liveScore" class="value" style="font-size:1.6rem">–</div><div id="scoreSubLabel" class="sub-label">–</div></article>
    </section>

    <div id="reportLinks" style="display:none;margin:-0.5rem 0 1rem;gap:0.75rem;flex-wrap:wrap">
      <a id="viewUniqueIssuesBtn" href="./unique-issues.html" style="padding:0.35rem 0.85rem;border-radius:999px;background:linear-gradient(90deg,rgba(251,146,60,0.9),rgba(239,68,68,0.85));color:#fff;font-weight:700;font-size:0.84rem;text-decoration:none">View Unique Issues →</a>
    </div>

    <nav class="tabs" role="tablist" aria-label="Dashboard sections">
      <button class="tab active" role="tab" aria-selected="true" aria-controls="view-overview" data-view="overview" type="button">Overview</button>
      <button class="tab" role="tab" aria-selected="false" aria-controls="view-violations" data-view="violations" type="button">Violations</button>
      <button class="tab" role="tab" aria-selected="false" aria-controls="view-passes" data-view="passes" type="button">Passes</button>
      <button class="tab" role="tab" aria-selected="false" aria-controls="view-incomplete" data-view="incomplete" type="button">Incomplete</button>
      <button class="tab" role="tab" aria-selected="false" aria-controls="view-inapplicable" data-view="inapplicable" type="button">Inapplicable</button>
      <button class="tab" role="tab" aria-selected="false" aria-controls="view-pages" data-view="pages" type="button">Pages</button>
      <button class="tab" role="tab" aria-selected="false" aria-controls="view-logs" data-view="logs" type="button">Logs & Checklist</button>
    </nav>

    <section id="view-overview" role="tabpanel" class="view active">
      <article class="panel">
        <h2>Results by Type</h2>
        <div id="resultTypeBars" class="muted">No data yet</div>
      </article>
      <article class="panel">
        <h2>Violations by Severity</h2>
        <div id="severityBars" class="muted">No data yet</div>
      </article>
      <article class="panel">
        <h2>Violations by Template</h2>
        <div id="templateBars" class="muted">No data yet</div>
      </article>
      <article class="panel">
        <h2>Rules Executed</h2>
        <div id="rulesList" class="muted">No data yet</div>
      </article>
      <article class="panel span-2">
        <h2>Top Rules</h2>
        <table>
          <thead><tr><th>Rule</th><th>Count</th></tr></thead>
          <tbody id="ruleRows"></tbody>
        </table>
      </article>
      <article class="panel span-2">
        <h2>Pages Scanned</h2>
        <p class="muted" style="margin:0 0 0.5rem;font-size:0.82rem">All pages included in this scan. Pages marked with <strong>*</strong> did not reach network-idle.</p>
        <input id="overviewPageSearch" placeholder="Filter by URL" style="margin-bottom:0.5rem" />
        <div class="sort-controls">
          <label>Sort by:</label>
          <button class="sort-btn active" type="button" data-sort-target="overview" data-sort-key="url" data-sort-dir="asc">URL <span class="arrow">▲</span></button>
          <button class="sort-btn" type="button" data-sort-target="overview" data-sort-key="violations" data-sort-dir="desc">Violations</button>
          <button class="sort-btn" type="button" data-sort-target="overview" data-sort-key="passes" data-sort-dir="desc">Passes</button>
          <button class="sort-btn" type="button" data-sort-target="overview" data-sort-key="incomplete" data-sort-dir="desc">Incomplete</button>
        </div>
        <div id="overviewVirtualScroll" class="virtual-scroll-container">
          <table>
            <thead><tr><th>URL</th><th>Template</th><th>Status</th><th>Violations</th><th>Passes</th><th>Incomplete</th></tr></thead>
            <tbody id="overviewPageRows"></tbody>
          </table>
        </div>
      </article>
    </section>

    <section id="view-violations" role="tabpanel" class="view">
      <article class="panel">
        <h2>Violations Explorer (Rule -> Page -> Nodes)</h2>
        <div class="controls">
          <select id="ruleSelect"><option value="__all__">All rules</option><option value="">— Select a specific rule —</option></select>
          <input id="rulePageSearch" placeholder="Filter pages for selected rule" />
        </div>
        <div class="controls">
          <select id="rulePageSelect"><option value="">Select a page</option></select>
          <button id="rulePageView" type="button">Load Rule Details</button>
        </div>
        <p class="muted">This hierarchy avoids rendering every DOM node at once on large scans.</p>
      </article>
      <article class="panel">
        <h2>Selected Rule Details</h2>
        <div id="ruleDetails" class="detail-box muted">Pick a rule, then a page, then load details.</div>
      </article>
    </section>

    <section id="view-passes" role="tabpanel" class="view">
      <article class="panel">
        <h2>Passes Explorer (Rule -> Page -> Nodes)</h2>
        <div class="controls">
          <select id="passRuleSelect"><option value="__all__">All rules</option><option value="">— Select a specific rule —</option></select>
          <input id="passRulePageSearch" placeholder="Filter pages for selected rule" />
        </div>
        <div class="controls">
          <select id="passRulePageSelect"><option value="">Select a page</option></select>
          <button id="passRulePageView" type="button">Load Pass Details</button>
        </div>
        <p class="muted">These are accessibility checks that passed successfully.</p>
      </article>
      <article class="panel">
        <h2>Selected Pass Details</h2>
        <div id="passRuleDetails" class="detail-box muted">Pick a rule, then a page, then load details.</div>
      </article>
    </section>

    <section id="view-incomplete" role="tabpanel" class="view">
      <article class="panel">
        <h2>Incomplete Explorer (Rule -> Page -> Nodes)</h2>
        <div class="controls">
          <select id="incompleteRuleSelect"><option value="__all__">All rules</option><option value="">— Select a specific rule —</option></select>
          <input id="incompleteRulePageSearch" placeholder="Filter pages for selected rule" />
        </div>
        <div class="controls">
          <select id="incompleteRulePageSelect"><option value="">Select a page</option></select>
          <button id="incompleteRulePageView" type="button">Load Incomplete Details</button>
        </div>
        <p class="muted">These are checks that could not be completed and need manual review.</p>
      </article>
      <article class="panel">
        <h2>Selected Incomplete Details</h2>
        <div id="incompleteRuleDetails" class="detail-box muted">Pick a rule, then a page, then load details.</div>
      </article>
    </section>

    <section id="view-inapplicable" role="tabpanel" class="view">
      <article class="panel">
        <h2>Inapplicable Explorer (Rule -> Page)</h2>
        <div class="controls">
          <select id="inapplicableRuleSelect"><option value="__all__">All rules</option><option value="">— Select a specific rule —</option></select>
          <input id="inapplicableRulePageSearch" placeholder="Filter pages for selected rule" />
        </div>
        <div class="controls">
          <select id="inapplicableRulePageSelect"><option value="">Select a page</option></select>
          <button id="inapplicableRulePageView" type="button">Load Inapplicable Details</button>
        </div>
        <p class="muted">These are rules that don't apply to the page (e.g., no video element = no caption rules).</p>
      </article>
      <article class="panel">
        <h2>Selected Inapplicable Details</h2>
        <div id="inapplicableRuleDetails" class="detail-box muted">Pick a rule, then a page, then load details.</div>
      </article>
    </section>

    <section id="view-pages" role="tabpanel" class="view">
      <article class="panel">
        <h2>Pages and Violations</h2>
        <div class="controls">
          <input id="pageSearch" placeholder="Filter by URL" />
          <select id="templateFilter"><option value="">All templates</option></select>
        </div>
        <div class="sort-controls">
          <label>Sort by:</label>
          <button class="sort-btn active" type="button" data-sort-target="pages" data-sort-key="url" data-sort-dir="asc">URL <span class="arrow">▲</span></button>
          <button class="sort-btn" type="button" data-sort-target="pages" data-sort-key="violations" data-sort-dir="desc">Violations</button>
          <button class="sort-btn" type="button" data-sort-target="pages" data-sort-key="passes" data-sort-dir="desc">Passes</button>
          <button class="sort-btn" type="button" data-sort-target="pages" data-sort-key="incomplete" data-sort-dir="desc">Incomplete</button>
          <button class="sort-btn" type="button" data-sort-target="pages" data-sort-key="inapplicable" data-sort-dir="desc">Inapplicable</button>
        </div>
        <div id="pagesVirtualScroll" class="virtual-scroll-container">
          <table>
            <thead><tr><th>URL</th><th>Template</th><th>Violations</th><th>Passes</th><th>Incomplete</th><th>Inapplicable</th><th>Details</th></tr></thead>
            <tbody id="pageRows"></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <h2>Selected Page Details</h2>
        <div id="pageDetails" class="detail-box muted">Select a page row to load full violation details.</div>
      </article>
    </section>

    <section id="view-logs" role="tabpanel" class="view">
      <article class="panel">
        <h2>Scan Logs</h2>
        <table>
          <thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead>
          <tbody id="logRows"></tbody>
        </table>
      </article>
      <article class="panel">
        <h2>Manual Audit Checklist</h2>
        <ul id="checklistRows" class="checklist"></ul>
      </article>
    </section>
  </div>

  <script>
    // API route vars — replaced by writeDashboard() for project-scoped routing
    var A_SCAN = '__A_SCAN__'
    var A_STOP = '__A_STOP__'
    var A_RESUME = '__A_RESUME__'
    var A_STATUS = '__A_STATUS__'
    var A_REPORT_DIR = '__A_REPORT_DIR__'
    var PROJECT_ID = '__PROJECT_ID__'
    var PROJECT_URL = '__PROJECT_URL__'

    // --- sort state ---
    const sortState = {
      overview: { key: 'url', dir: 'asc' },
      pages:    { key: 'url', dir: 'asc' }
    }

    function sortPages(pages, key, dir) {
      return pages.slice().sort((a, b) => {
        if (key === 'url') {
          const cmp = a.url.localeCompare(b.url)
          return dir === 'asc' ? cmp : -cmp
        }
        const av = a[key] || 0, bv = b[key] || 0
        return dir === 'desc' ? bv - av : av - bv
      })
    }

    // --- virtual scroll ---
    const ROW_HEIGHT = 34
    const BUFFER_ROWS = 20

    function createVirtualizer(containerId, tbodyId, renderRow, colCount) {
      const container = document.getElementById(containerId)
      const tbody = document.getElementById(tbodyId)
      let allData = []
      let lastStart = -1, lastEnd = -1

      function render() {
        if (allData.length === 0) {
          tbody.innerHTML = '<tr><td class="muted" colspan="' + colCount + '">No pages scanned yet</td></tr>'
          lastStart = -1; lastEnd = -1
          return
        }
        const scrollTop = container.scrollTop
        const viewportHeight = container.clientHeight
        let start = Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS
        let end = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS
        start = Math.max(0, start)
        end = Math.min(allData.length, end)
        if (start === lastStart && end === lastEnd) return
        lastStart = start; lastEnd = end
        const topH = start * ROW_HEIGHT
        const bottomH = (allData.length - end) * ROW_HEIGHT
        const rows = ['<tr aria-hidden="true"><td colspan="' + colCount + '" style="height:' + topH + 'px;padding:0;border:0"></td></tr>']
        for (let i = start; i < end; i++) rows.push(renderRow(allData[i], i))
        rows.push('<tr aria-hidden="true"><td colspan="' + colCount + '" style="height:' + bottomH + 'px;padding:0;border:0"></td></tr>')
        tbody.innerHTML = rows.join('')
      }

      container.addEventListener('scroll', render, { passive: true })

      return {
        setData(data) {
          allData = data
          lastStart = -1; lastEnd = -1
          render()
        },
        refresh: render
      }
    }

    // --- sort button wiring ---
    for (const btn of document.querySelectorAll('.sort-btn[data-sort-target]')) {
      btn.addEventListener('click', () => {
        const target = btn.dataset.sortTarget
        const key = btn.dataset.sortKey
        const state = sortState[target]
        if (state.key === key) {
          state.dir = state.dir === 'desc' ? 'asc' : 'desc'
        } else {
          state.key = key
          state.dir = btn.dataset.sortDir || 'desc'
        }
        for (const b of document.querySelectorAll('.sort-btn[data-sort-target="' + target + '"]')) {
          b.classList.remove('active')
          const arrow = b.querySelector('.arrow')
          if (arrow) arrow.remove()
        }
        btn.classList.add('active')
        btn.insertAdjacentHTML('beforeend', ' <span class="arrow">' + (state.dir === 'asc' ? '▲' : '▼') + '</span>')
        refresh()
      })
    }

    // --- explorer state per tab ---
    const explorerState = {
      rule:         { ruleFile: '__all__', ruleId: '', cache: null },
      pass:         { ruleFile: '__all__', ruleId: '', cache: null },
      incomplete:   { ruleFile: '__all__', ruleId: '', cache: null },
      inapplicable: { ruleFile: '__all__', ruleId: '', cache: null }
    }

    function activateTab(view) {
      for (const tab of document.querySelectorAll('.tab')) {
        const isActive = tab.dataset.view === view
        tab.classList.toggle('active', isActive)
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false')
      }
      for (const section of document.querySelectorAll('.view')) {
        section.classList.toggle('active', section.id === 'view-' + view)
      }
    }

    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => activateTab(tab.dataset.view))
    }

    // --- start scan button ---
    document.getElementById('startScanBtn').addEventListener('click', async () => {
      const urlInput = document.getElementById('scanUrl')
      const msg = document.getElementById('scanFormMsg')
      const url = urlInput.value.trim()
      msg.className = ''
      if (!url) { msg.className = 'error'; msg.textContent = 'Please enter a URL.'; urlInput.focus(); return }
      const btn = document.getElementById('startScanBtn')
      btn.disabled = true
      msg.textContent = 'Starting scan...'
      const parsePatterns = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean)

      try {
        const res = await fetch(A_SCAN, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url,
            wcagLevel: document.getElementById('scanWcag').value,
            maxPages: Number(document.getElementById('scanMaxPages').value) || 2000,
            sampleTemplates: Number(document.getElementById('scanSampleTemplate').value) || 0,
            depth: Number(document.getElementById('scanDepth').value) || 6,
            concurrency: Number(document.getElementById('scanConcurrency').value) || 10,
            include: parsePatterns(document.getElementById('scanInclude').value),
            exclude: parsePatterns(document.getElementById('scanExclude').value)
          })
        })
        const data = await res.json()
        if (res.ok) {
          msg.textContent = 'Scan started — dashboard will update automatically.'
          document.getElementById('scanFormWrap').open = false
          document.getElementById('viewReportBtn').style.display = 'none'
          if (!pollTimer) pollTimer = setInterval(refresh, 1500)
          refresh()
        } else {
          msg.className = 'error'
          msg.textContent = 'Error: ' + (data.error || res.statusText)
        }
      } catch (err) {
        msg.className = 'error'
        msg.textContent = 'Error: ' + err.message
      } finally {
        btn.disabled = false
      }
    })

    // --- stop scan button ---
    document.getElementById('stopScanBtn').addEventListener('click', async () => {
      const btn = document.getElementById('stopScanBtn')
      btn.disabled = true
      btn.textContent = 'Stopping...'
      try {
        await fetch(A_STOP, { method: 'POST' })
      } catch {}
      btn.disabled = false
      btn.textContent = 'Stop Scan'
    })

    // --- resume scan button ---
    document.getElementById('resumeScanBtn').addEventListener('click', async () => {
      const btn = document.getElementById('resumeScanBtn')
      btn.disabled = true
      btn.textContent = 'Resuming...'
      try {
        const res = await fetch(A_RESUME, { method: 'POST' })
        const data = await res.json()
        if (res.ok) {
          document.getElementById('scanFormWrap').open = false
          document.getElementById('viewReportBtn').style.display = 'none'
          if (!pollTimer) pollTimer = setInterval(refresh, 1500)
          refresh()
        } else {
          alert('Resume failed: ' + (data.error || res.statusText))
        }
      } catch (err) {
        alert('Resume failed: ' + err.message)
      }
      btn.disabled = false
      btn.textContent = 'Resume Scan'
    })

    // --- report directory ---
    fetch(A_REPORT_DIR).then(r => r.json()).then(data => {
      document.getElementById('scanReportDir').value = data.reportDir || ''
    }).catch(() => {})

    document.getElementById('applyReportDir').addEventListener('click', async () => {
      const input = document.getElementById('scanReportDir')
      const dir = input.value.trim()
      if (!dir) return
      const btn = document.getElementById('applyReportDir')
      btn.disabled = true
      try {
        const res = await fetch(A_REPORT_DIR, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dir })
        })
        const data = await res.json()
        if (res.ok) {
          input.value = data.reportDir
          btn.textContent = 'Applied!'
          setTimeout(() => { btn.textContent = 'Apply' }, 1500)
        } else {
          alert('Error: ' + (data.error || res.statusText))
        }
      } catch (err) {
        alert('Error: ' + err.message)
      }
      btn.disabled = false
    })

    // Pre-fill URL from project context (PROJECT_URL is injected by writeDashboard)
    if (PROJECT_URL && PROJECT_URL !== '__PROJECT_URL__') {
      var urlEl = document.getElementById('scanUrl')
      if (urlEl && !urlEl.value) urlEl.value = PROJECT_URL
    }

    // --- score ---
    // Lighthouse-style: weighted % of axe rules that passed across the scan.
    // A rule counts as "failed" if it produced any violation; "passed" if it ran and
    // never failed. Matches the formula in src/index.js so live and final agree.
    const LH_WEIGHT = { critical: 10, serious: 7, moderate: 3, minor: 1 }
    function lhWeight(impact) { return LH_WEIGHT[impact] || 3 }
    function computeLiveScore(data) {
      // Final score from the orchestrator wins once the scan completes.
      if (data && data.scoreSummary && typeof data.scoreSummary.score === 'number') {
        return data.scoreSummary.score
      }
      const failed = (data && data.ruleCatalog) || []
      const passed = (data && data.passesRuleCatalog) || []
      const failedIds = new Set(failed.map(function(r) { return r.id }))
      var failedW = 0
      for (var i = 0; i < failed.length; i++) failedW += lhWeight(failed[i].impact)
      var passedW = 0
      for (var j = 0; j < passed.length; j++) {
        if (!failedIds.has(passed[j].id)) passedW += lhWeight(passed[j].impact)
      }
      const total = failedW + passedW
      if (total === 0) return (data && data.scannedPages > 0) ? 100 : null
      return Math.round((passedW / total) * 100)
    }
    function scoreColor(s) { return s >= 90 ? '#22c55e' : s >= 50 ? '#fb923c' : '#ef4444' }

    // --- utilities ---
    function safeSlugClient(str) {
      return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'unknown'
    }
    function renderBars(el, values, linkPrefix) {
      const entries = Object.entries(values || {})
      if (entries.length === 0) { el.innerHTML = '<span class="muted">No data yet</span>'; return }
      const max = Math.max(...entries.map(([, v]) => v), 1)
      el.innerHTML = entries.map(([label, value]) => {
        const width = Math.round((value / max) * 100)
        const labelHtml = linkPrefix
          ? '<a href="' + linkPrefix + safeSlugClient(label) + '.html" style="color:inherit;text-decoration:underline;text-underline-offset:2px">' + escapeHtml(label) + '</a>'
          : '<span>' + escapeHtml(label) + '</span>'
        return '<div class="bar-row">' + labelHtml + '<div class="bar" role="meter" aria-valuenow="' + value + '" aria-valuemin="0" aria-valuemax="' + max + '" aria-label="' + label + '"><span style="width:' + width + '%"></span></div><strong>' + value + '</strong></div>'
      }).join('')
    }

    function setRows(el, rowsHtml, emptyText, colspan) {
      el.innerHTML = rowsHtml || '<tr><td class="muted" colspan="' + (colspan || 3) + '">' + emptyText + '</td></tr>'
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    }

    function settled(p) {
      return p.networkSettled === false ? ' <span class="muted" title="networkidle not reached">*</span>' : ''
    }

    function statusBadge(p) {
      return p.status === 'error'
        ? '<span class="badge badge-critical">error</span>'
        : (p.violations || 0) > 0
          ? '<span class="badge badge-serious">' + (p.violations || 0) + ' violations</span>'
          : '<span class="badge" style="background:rgba(34,197,94,0.2);color:#86efac">clean</span>'
    }

    // --- page details panel ---
    async function showPageDetails(detailPath) {
      const box = document.getElementById('pageDetails')
      box.textContent = 'Loading...'
      try {
        const r = await fetch('./' + detailPath + '?ts=' + Date.now(), { cache: 'no-store' })
        const page = await r.json()
        const renderItems = (items) => (items || []).map(item => {
          const nodes = (item.nodes || []).map(n => '<li><code>' + escapeHtml((n.target || []).join(' ')) + '</code></li>').join('')
          return '<article><h4>' + escapeHtml(item.id) + (item.impact ? ' (' + escapeHtml(item.impact) + ')' : '') + '</h4>' +
            '<p>' + escapeHtml(item.help) + '</p>' +
            (item.helpUrl ? '<p><a target="_blank" rel="noreferrer" href="' + escapeHtml(item.helpUrl) + '">WCAG docs</a></p>' : '') +
            '<ul>' + (nodes || '<li>No nodes</li>') + '</ul></article>'
        }).join('')
        const rulesRun = (page.rulesRun || []).map(r => '<code>' + escapeHtml(r) + '</code>').join(' ')
        box.innerHTML =
          '<h3>' + escapeHtml(page.url) + '</h3>' +
          '<p class="muted">Template: ' + escapeHtml(page.template) + ' | Status: ' + escapeHtml(page.status) + ' | ' + escapeHtml(page.durationMs) + ' ms</p>' +
          '<h4>Rules Run (' + (page.rulesRun || []).length + ')</h4><p class="muted">' + (rulesRun || 'None') + '</p>' +
          '<h4>Violations (' + (page.violations || []).length + ')</h4>' + (renderItems(page.violations) || '<p class="muted">None</p>') +
          '<h4>Passes (' + (page.passes || []).length + ')</h4>' + (renderItems(page.passes) || '<p class="muted">None</p>') +
          '<h4>Incomplete (' + (page.incomplete || []).length + ')</h4>' + (renderItems(page.incomplete) || '<p class="muted">None</p>') +
          '<h4>Inapplicable (' + (page.inapplicable || []).length + ')</h4>' +
          ((page.inapplicable || []).map(i => '<article><h4>' + escapeHtml(i.id) + '</h4><p>' + escapeHtml(i.help) + '</p></article>').join('') || '<p class="muted">None</p>')
      } catch { box.textContent = 'Could not load page details.' }
    }

    // --- generic rule explorer ---
    function allRulesTable(catalog) {
      if (!catalog || catalog.length === 0) return '<p class="muted">No data yet.</p>'
      return '<table><thead><tr><th>Rule</th><th>Description</th><th style="text-align:right">Count</th><th style="text-align:right">Pages</th></tr></thead><tbody>' +
        catalog.map(rule =>
          '<tr><td><code>' + escapeHtml(rule.id) + '</code></td><td>' + escapeHtml(rule.help) + '</td>' +
          '<td style="text-align:right">' + rule.count + '</td><td style="text-align:right">' + rule.pages + '</td></tr>'
        ).join('') + '</tbody></table>'
    }

    function updateRuleSelect(selectEl, catalog, state) {
      const prev = selectEl.value
      const opts = catalog.map(rule =>
        '<option value="' + escapeHtml(rule.file) + '" data-rule="' + escapeHtml(rule.id) + '">' +
        escapeHtml(rule.id) + ' (' + rule.count + ')</option>'
      ).join('')
      selectEl.innerHTML = '<option value="__all__">All rules</option><option value="">— Select a specific rule —</option>' + opts
      if (prev === '__all__' || (prev && catalog.some(r => r.file === prev))) selectEl.value = prev
      else selectEl.value = '__all__'
    }

    async function populateExplorerPages(ns) {
      const pageSelect = document.getElementById(ns + 'RulePageSelect')
      const searchInput = document.getElementById(ns + 'RulePageSearch')
      const state = explorerState[ns]
      if (!state.ruleFile || state.ruleFile === '__all__') {
        pageSelect.innerHTML = '<option value="">N/A — all rules shown</option>'
        return
      }
      if (!state.cache || state.cache.__file !== state.ruleFile) {
        const r = await fetch('./' + state.ruleFile + '?ts=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const data = await r.json()
        state.cache = { ...data, __file: state.ruleFile }
      }
      const query = (searchInput ? searchInput.value : '').toLowerCase()
      const pages = (state.cache.pages || [])
        .filter(e => !query || e.url.toLowerCase().includes(query))
        .slice(-1000).reverse()
      pageSelect.innerHTML = '<option value="">Select a page</option>' + pages.map(e =>
        '<option value="' + escapeHtml(e.detailPath) + '">' + escapeHtml(e.url) +
        (e.impact ? ' [' + escapeHtml(e.impact) + ']' : '') + ' (' + e.nodeCount + ')</option>'
      ).join('')
    }

    async function showExplorerDetails(ns, resultKey) {
      const detailPath = document.getElementById(ns + 'RulePageSelect').value
      const box = document.getElementById(ns + 'RuleDetails')
      const state = explorerState[ns]
      if (!detailPath || !state.ruleId) { box.textContent = 'Pick a rule and page first.'; return }
      box.textContent = 'Loading...'
      try {
        const r = await fetch('./' + detailPath + '?ts=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) throw new Error()
        const page = await r.json()
        const matches = (page[resultKey] || []).filter(i => i.id === state.ruleId)
        const blocks = matches.map(item => {
          const nodes = (item.nodes || []).map(n =>
            '<li><div><code>' + escapeHtml((n.target || []).join(' ')) + '</code></div>' +
            (n.failureSummary ? '<div class="muted">' + escapeHtml(n.failureSummary) + '</div>' : '') + '</li>'
          ).join('')
          return '<article><h4>' + escapeHtml(item.id) + (item.impact ? ' (' + escapeHtml(item.impact) + ')' : '') + '</h4>' +
            '<p>' + escapeHtml(item.help) + '</p>' +
            (item.helpUrl ? '<p><a target="_blank" rel="noreferrer" href="' + escapeHtml(item.helpUrl) + '">WCAG docs</a></p>' : '') +
            '<ul>' + (nodes || '<li>No nodes</li>') + '</ul></article>'
        }).join('')
        box.innerHTML = '<h3>' + escapeHtml(page.url) + '</h3>' + (blocks || '<p class="muted">Rule not found on this page.</p>')
      } catch { box.textContent = 'Could not load details.' }
    }

    function wireExplorer(cfg) {
      const { selectId, searchId, pageSelectId, viewBtnId, detailBoxId, stateKey, resultKey, catalog } = cfg
      const ruleSelect = document.getElementById(selectId)
      const detailBox = document.getElementById(detailBoxId)
      if (!ruleSelect || !detailBox) return
      const state = explorerState[stateKey]

      // Only re-render select options when catalog size changes to avoid disrupting user interaction
      const catalogKey = catalog.length + ':' + (catalog[0]?.id || '')
      if (state._catalogKey === catalogKey) return
      state._catalogKey = catalogKey

      updateRuleSelect(ruleSelect, catalog, state)

      ruleSelect.onchange = async (e) => {
        state.ruleFile = e.target.value
        state.ruleId = e.target.options[e.target.selectedIndex]?.dataset?.rule || ''
        state.cache = null
        if (state.ruleFile === '__all__') {
          const pageSelect = document.getElementById(pageSelectId)
          if (pageSelect) pageSelect.innerHTML = '<option value="">N/A — all rules shown</option>'
          detailBox.innerHTML = allRulesTable(catalog)
        } else {
          detailBox.innerHTML = '<span class="muted">Pick a page then load details.</span>'
          // temporarily bind state for populateExplorerPages
          state.__selectId = selectId; state.__searchId = searchId; state.__pageSelectId = pageSelectId
          await populateExplorerPagesById(state, searchId, pageSelectId)
        }
      }

      const searchEl = document.getElementById(searchId)
      if (searchEl) searchEl.oninput = () => populateExplorerPagesById(state, searchId, pageSelectId)

      const viewBtn = document.getElementById(viewBtnId)
      if (viewBtn) viewBtn.onclick = () => showExplorerDetailsById(state, pageSelectId, detailBoxId, resultKey)

      // Show all rules table by default
      if (!state.ruleFile || state.ruleFile === '__all__') {
        detailBox.innerHTML = allRulesTable(catalog)
      }
    }

    async function populateExplorerPagesById(state, searchId, pageSelectId) {
      const pageSelect = document.getElementById(pageSelectId)
      const searchInput = document.getElementById(searchId)
      if (!state.ruleFile || state.ruleFile === '__all__') {
        if (pageSelect) pageSelect.innerHTML = '<option value="">N/A — all rules shown</option>'
        return
      }
      if (!state.cache || state.cache.__file !== state.ruleFile) {
        const r = await fetch('./' + state.ruleFile + '?ts=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const data = await r.json()
        state.cache = { ...data, __file: state.ruleFile }
      }
      const query = (searchInput ? searchInput.value : '').toLowerCase()
      const pages = (state.cache.pages || [])
        .filter(e => !query || e.url.toLowerCase().includes(query))
        .slice(-1000).reverse()
      if (pageSelect) pageSelect.innerHTML = '<option value="">Select a page</option>' + pages.map(e =>
        '<option value="' + escapeHtml(e.detailPath) + '">' + escapeHtml(e.url) +
        (e.impact ? ' [' + escapeHtml(e.impact) + ']' : '') + ' (' + e.nodeCount + ')</option>'
      ).join('')
    }

    async function showExplorerDetailsById(state, pageSelectId, detailBoxId, resultKey) {
      const pageSelect = document.getElementById(pageSelectId)
      const box = document.getElementById(detailBoxId)
      if (!pageSelect || !box) return
      const detailPath = pageSelect.value
      if (!detailPath || !state.ruleId) { box.textContent = 'Pick a rule and page first.'; return }
      box.textContent = 'Loading...'
      try {
        const r = await fetch('./' + detailPath + '?ts=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) throw new Error()
        const page = await r.json()
        const matches = (page[resultKey] || []).filter(i => i.id === state.ruleId)
        const blocks = matches.map(item => {
          const nodes = (item.nodes || []).map(n =>
            '<li><div><code>' + escapeHtml((n.target || []).join(' ')) + '</code></div>' +
            (n.failureSummary ? '<div class="muted">' + escapeHtml(n.failureSummary) + '</div>' : '') + '</li>'
          ).join('')
          return '<article><h4>' + escapeHtml(item.id) + (item.impact ? ' (' + escapeHtml(item.impact) + ')' : '') + '</h4>' +
            '<p>' + escapeHtml(item.help) + '</p>' +
            (item.helpUrl ? '<p><a target="_blank" rel="noreferrer" href="' + escapeHtml(item.helpUrl) + '">WCAG docs</a></p>' : '') +
            '<ul>' + (nodes || '<li>No nodes</li>') + '</ul></article>'
        }).join('')
        box.innerHTML = '<h3>' + escapeHtml(page.url) + '</h3>' + (blocks || '<p class="muted">Rule not found on this page.</p>')
      } catch { box.textContent = 'Could not load details.' }
    }

    // --- main refresh ---
    async function refresh() {
      try {
        const [statusRes, liveRes] = await Promise.all([
          fetch(A_STATUS + '?ts=' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('./raw/live-state.json?ts=' + Date.now(), { cache: 'no-store' })
        ])

        if (statusRes && statusRes.ok) {
          const s = await statusRes.json()
          const startBtn = document.getElementById('startScanBtn')
          const stopBtn = document.getElementById('stopScanBtn')
          const resumeBtn = document.getElementById('resumeScanBtn')
          if (s.scanRunning) {
            startBtn.disabled = true
            startBtn.textContent = 'Scanning...'
            stopBtn.style.display = 'inline-block'
            resumeBtn.style.display = 'none'
          } else {
            startBtn.disabled = false
            startBtn.textContent = 'Start Scan'
            stopBtn.style.display = 'none'
            resumeBtn.style.display = s.canResume ? 'inline-block' : 'none'
          }
        }

        if (!liveRes.ok) throw new Error('No live data')
        const data = await liveRes.json()

        document.getElementById('scanStatus').textContent = data.statusMessage || 'Running'
        document.getElementById('wcagLevel').textContent = data.wcagLevel || 'AAA'
        const wv = data.wcagViolations
        const totalV = data.totalViolations || 0
        const complianceEl = document.getElementById('complianceLevel')
        if (wv && typeof wv.a === 'number') {
          var lbl, col
          if (wv.a > 0) { lbl = 'Fails WCAG A'; col = '#ef4444' }
          else if (wv.aa > 0) { lbl = 'Fails WCAG AA'; col = '#ef4444' }
          else if (wv.aaa > 0) { lbl = 'Fails WCAG AAA'; col = '#fb923c' }
          else if (totalV > 0) { lbl = 'Passes WCAG AAA*'; col = '#fb923c' }
          else { lbl = 'Passes WCAG AAA'; col = '#22c55e' }
          complianceEl.textContent = lbl
          complianceEl.style.color = col
          complianceEl.title = totalV > 0 && wv.a === 0 && wv.aa === 0 && wv.aaa === 0
            ? 'Best-practice (non-WCAG) issues remain. Manual review required for full conformance.'
            : 'Automated tests only. Manual review required for full conformance.'
        } else {
          complianceEl.textContent = '–'
          complianceEl.style.color = ''
        }
        document.getElementById('discoveredPages').textContent = data.discoveredPages || 0
        document.getElementById('scannedPages').textContent = data.scannedPages || 0
        document.getElementById('totalViolations').textContent = data.totalViolations || 0
        document.getElementById('uniqueViolations').textContent = (data.totalRulesTriggered || 0) + ' unique rules'
        document.getElementById('totalPasses').textContent = data.totalPasses || 0
        document.getElementById('uniquePasses').textContent = (data.uniquePassRules || 0) + ' unique rules'
        document.getElementById('totalIncomplete').textContent = data.totalIncomplete || 0
        document.getElementById('uniqueIncomplete').textContent = (data.uniqueIncompleteRules || 0) + ' unique rules'
        document.getElementById('totalInapplicable').textContent = data.totalInapplicable || 0
        document.getElementById('uniqueInapplicable').textContent = (data.uniqueInapplicableRules || 0) + ' unique rules'
        document.getElementById('rulesRunCount').textContent = (data.rulesRun || []).length

        var score = computeLiveScore(data)
        var scoreEl = document.getElementById('liveScore')
        var scoreSubEl = document.getElementById('scoreSubLabel')
        if (score !== null) {
          scoreEl.textContent = score + '/100'
          scoreEl.style.color = scoreColor(score)
          var ss = data.scoreSummary
          if (ss && ss.totalRuleCount) {
            scoreSubEl.textContent = ss.passedRuleCount + '/' + ss.totalRuleCount + ' rules passed'
          } else {
            var failedCount = ((data.ruleCatalog) || []).length
            var passedSet = {}
            ;((data.passesRuleCatalog) || []).forEach(function(r) { passedSet[r.id] = true })
            ;((data.ruleCatalog) || []).forEach(function(r) { delete passedSet[r.id] })
            var passedCount = Object.keys(passedSet).length
            var totalCount = passedCount + failedCount
            scoreSubEl.textContent = totalCount > 0 ? (passedCount + '/' + totalCount + ' rules passed') : '–'
          }
        } else {
          scoreEl.textContent = '–'
          scoreEl.style.color = ''
          scoreSubEl.textContent = '–'
        }

        var reportLinksEl = document.getElementById('reportLinks')
        if (data.status === 'completed') {
          reportLinksEl.style.display = 'flex'
          document.getElementById('viewReportBtn').style.display = 'inline-block'
        } else {
          reportLinksEl.style.display = 'none'
        }

        renderBars(document.getElementById('resultTypeBars'), {
          Violations: data.totalViolations || 0,
          Passes: data.totalPasses || 0,
          Incomplete: data.totalIncomplete || 0,
          Inapplicable: data.totalInapplicable || 0
        })
        renderBars(document.getElementById('severityBars'), data.severity || {})
        renderBars(document.getElementById('templateBars'), data.templateTotals || {}, './templates/')

        const rulesRun = data.rulesRun || []
        document.getElementById('rulesList').innerHTML = rulesRun.length
          ? '<div class="rules-list">' + rulesRun.map(r => '<code>' + escapeHtml(r) + '</code>').join(' ') + '</div>'
          : '<span class="muted">No rules yet</span>'

        setRows(document.getElementById('ruleRows'),
          (data.topRules || []).map(rule => '<tr><td>' + escapeHtml(rule.id) + '</td><td>' + rule.count + '</td></tr>').join(''),
          'No rules yet')

        const overviewPageSearch = document.getElementById('overviewPageSearch')
        const overviewQ = (overviewPageSearch && overviewPageSearch.value || '').toLowerCase()
        const overviewFiltered = (data.pageIndex || [])
          .filter(p => !overviewQ || p.url.toLowerCase().includes(overviewQ))
        const overviewSorted = sortPages(overviewFiltered, sortState.overview.key, sortState.overview.dir)
        overviewVirtualizer.setData(overviewSorted)

        // wire all four explorer tabs
        wireExplorer({ selectId:'ruleSelect', searchId:'rulePageSearch', pageSelectId:'rulePageSelect', viewBtnId:'rulePageView', detailBoxId:'ruleDetails', stateKey:'rule', resultKey:'violations', catalog: data.ruleCatalog || [] })
        wireExplorer({ selectId:'passRuleSelect', searchId:'passRulePageSearch', pageSelectId:'passRulePageSelect', viewBtnId:'passRulePageView', detailBoxId:'passRuleDetails', stateKey:'pass', resultKey:'passes', catalog: data.passesRuleCatalog || [] })
        wireExplorer({ selectId:'incompleteRuleSelect', searchId:'incompleteRulePageSearch', pageSelectId:'incompleteRulePageSelect', viewBtnId:'incompleteRulePageView', detailBoxId:'incompleteRuleDetails', stateKey:'incomplete', resultKey:'incomplete', catalog: data.incompleteRuleCatalog || [] })
        wireExplorer({ selectId:'inapplicableRuleSelect', searchId:'inapplicableRulePageSearch', pageSelectId:'inapplicableRulePageSelect', viewBtnId:'inapplicableRulePageView', detailBoxId:'inapplicableRuleDetails', stateKey:'inapplicable', resultKey:'inapplicable', catalog: data.inapplicableRuleCatalog || [] })

        const pageSearch = document.getElementById('pageSearch')
        const templateFilter = document.getElementById('templateFilter')
        const selectedTemplate = templateFilter.value
        const templates = [...new Set((data.pageIndex || []).map(p => p.template))].sort()
        templateFilter.innerHTML = '<option value="">All templates</option>' +
          templates.map(t => '<option value="' + t + '">' + t + '</option>').join('')
        templateFilter.value = selectedTemplate

        const filteredPages = (data.pageIndex || [])
          .filter(p => (!templateFilter.value || p.template === templateFilter.value) &&
            (!pageSearch.value || p.url.toLowerCase().includes(pageSearch.value.toLowerCase())))
        const pagesSorted = sortPages(filteredPages, sortState.pages.key, sortState.pages.dir)
        pagesVirtualizer.setData(pagesSorted)

        setRows(document.getElementById('logRows'),
          (data.logs || []).map(log =>
            '<tr><td>' + escapeHtml(log.at) + '</td><td>' + escapeHtml(log.level) + '</td><td>' + escapeHtml(log.message) + '</td></tr>'
          ).join(''), 'No logs yet', 3)

        document.getElementById('checklistRows').innerHTML =
          (data.manualChecklist || []).map(i => '<li>' + escapeHtml(i) + '</li>').join('') ||
          '<li class="muted">No manual checklist available.</li>'

        if (data.status === 'completed') {
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
          const dot = document.querySelector('.dot')
          if (dot) { dot.style.animation = 'none'; dot.style.background = '#22c55e' }
          document.getElementById('viewReportBtn').style.display = 'inline-block'
        } else if (data.status === 'stopped') {
          const dot = document.querySelector('.dot')
          if (dot) { dot.style.animation = 'none'; dot.style.background = '#fb923c' }
        }
      } catch {
        document.getElementById('scanStatus').textContent = 'Waiting for first scan update...'
      }
    }

    let pollTimer = null

    const overviewVirtualizer = createVirtualizer('overviewVirtualScroll', 'overviewPageRows', (p) => {
      return '<tr><td>' + escapeHtml(p.url) + settled(p) + '</td><td>' + escapeHtml(p.template || '') +
        '</td><td>' + statusBadge(p) + '</td><td>' + (p.violations || 0) + '</td><td>' + (p.passes || 0) +
        '</td><td>' + (p.incomplete || 0) + '</td></tr>'
    }, 6)

    const pagesVirtualizer = createVirtualizer('pagesVirtualScroll', 'pageRows', (page) => {
      const nw = page.networkSettled === false ? ' <span class="muted" title="networkidle not reached">*</span>' : ''
      return '<tr><td>' + escapeHtml(page.url) + nw + '</td><td>' + escapeHtml(page.template) +
        '</td><td>' + (page.violations || 0) + '</td><td>' + (page.passes || 0) +
        '</td><td>' + (page.incomplete || 0) + '</td><td>' + (page.inapplicable || 0) +
        '</td><td><button class="ghost" data-detail="' + escapeHtml(page.detailPath) + '">View</button></td></tr>'
    }, 7)

    document.getElementById('pagesVirtualScroll').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-detail]')
      if (btn) showPageDetails(btn.getAttribute('data-detail'))
    })

    refresh()
    document.getElementById('pageSearch').addEventListener('input', refresh)
    document.getElementById('templateFilter').addEventListener('change', refresh)
    document.getElementById('overviewPageSearch').addEventListener('input', refresh)
    pollTimer = setInterval(refresh, 1500)
  </script>
</body>
</html>`

export async function writeDashboard(reportDir, opts = {}) {
  const { projectId = null, projectUrl = null } = opts
  await fs.mkdir(reportDir, { recursive: true })

  const base = projectId ? `/api/projects/${projectId}` : "/api"
  // No back-link: the dashboard opens in its own window from the projects
  // home (target=_blank), so a "back to all projects" link would just open
  // a duplicate Projects window without closing this one.
  const backLink = ""
  const reportDirStyle = projectId ? `style="display:none"` : ""

  const html = DASHBOARD_HTML
    .replace("'__A_SCAN__'", `'${base}/scan'`)
    .replace("'__A_STOP__'", `'${base}/scan/stop'`)
    .replace("'__A_RESUME__'", `'${base}/scan/resume'`)
    .replace("'__A_STATUS__'", `'${base}/status'`)
    .replace("'__A_REPORT_DIR__'", `'${base}/report-dir'`)
    .replace("'__PROJECT_ID__'", projectId ? `'${projectId}'` : "''")
    .replace("'__PROJECT_URL__'", projectUrl ? `'${projectUrl.replace(/'/g, "\\'")}'` : "''")
    .replace("<!-- BACK_LINK -->", backLink)
    .replace("__REPORT_DIR_STYLE__", reportDirStyle)
    .replace("__FAVICON_LINK__", faviconLink())

  await fs.writeFile(path.join(reportDir, "index.html"), html, "utf8")
}
