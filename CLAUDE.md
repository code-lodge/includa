# CLAUDE.md — Includa

## Project

Open-source WCAG 2.0/2.1/2.2 accessibility scanner for large websites. Uses Playwright for crawling and axe-core for violation detection. Outputs HTML dashboards, static reports, JSON, and CSV.

- **Language:** JavaScript (ESM, Node >= 18)
- **Package manager:** pnpm. `nodeLinker: hoisted` (in `pnpm-workspace.yaml`) keeps `node_modules` flat, which electron-builder and our `require.resolve("playwright-core/…")` rely on.
- **No build step for the source** — run it directly with `node` / `electron`
- **No test framework** — validate with `node -c <file>` for syntax, manual scans for behavior

## Quick reference

```bash
# Install dependencies
pnpm install

# Rebuild native modules (better-sqlite3) for Electron's ABI — REQUIRED after a
# fresh install before launching the desktop app. The CLI (node bin/includa.js)
# instead needs them built for Node, so one checkout's binary can't serve both.
pnpm run rebuild

# Launch the desktop app (Electron)
pnpm start

# Run a scan from the CLI
node bin/includa.js <url> [options]

# Serve the dashboard from the CLI (multi-project UI)
node bin/includa.js --dashboard --port 3000

# Build packaged installers (Windows: NSIS + MSI + portable)
pnpm run build:win

# Syntax-check a file
node -c src/reporting/static-report.js
```

## Repository rules

- **Work in the main repo only.** Do not create worktrees. Commit directly to `main` or to short-lived feature branches.
- **Incremental commits.** One commit per logical change (feature, fix, refactor). Never bundle unrelated changes.
- **Commit messages** should be imperative, concise, and describe the *why* — e.g. "Align static report score with live dashboard formula" not "Update static-report.js".
- **No generated files in git.** Report output directories (`test-scan-*`, `report-*`) are gitignored.

## Architecture

```
bin/
  cli.js              — CLI argument parsing (commander)
  includa.js        — Entry point, wires CLI to scan or dashboard

src/
  index.js            — runScan() orchestrator: discover → scan → analyze → report
  crawler/            — URL discovery (sitemap, robots.txt, link crawling, template sampling)
  scanner/
    page-scanner.js   — Concurrent page scanning with Playwright browser pool
    axe-runner.js     — axe-core injection + result collection per page
    browser-pool.js   — Playwright browser instance management
  analysis/
    deduplication.js  — buildUniqueViolations() — fingerprint-based dedup across pages
    cms/              — CMS-specific template detection (WordPress, Shopify, Drupal, etc.)
    template-detection.js — URL-pattern and CMS-aware template grouping
    rule-grouping.js  — Group violations by axe rule ID
    wcag-grouping.js  — Group violations by WCAG criterion
  reporting/
    generate-reports.js    — Report orchestrator — calls all report writers
    html-dashboard.js      — Live dashboard (index.html) with real-time scan progress
    static-report.js       — Post-scan report.html with score, charts, tables
    unique-issues-report.js — unique-issues.html with deduped violations + AI prompts
    page-report.js         — Per-page detail reports
    rule-report.js         — Per-rule detail reports
    template-report.js     — Per-template detail reports
    json-export.js         — JSON/CSV export
    live-state.js          — Real-time scan state tracking (writes live-state.json)
    dashboard-server.js    — HTTP server for dashboard + scan API + log stream (SSE)
  store/
    db.js              — SQLite-backed page result store (better-sqlite3)
  utils/
    logger.js          — Console logger with timestamps (also feeds the log bus)
    log-bus.js         — Central log store: ring buffer + rotating file + event stream
    console-capture.js — Wraps console.* so all output flows into the log bus
    url-utils.js       — URL normalization, slugging, HTML escaping
```

## Key data flows

1. **Scan pipeline:** `discoverUrls()` → `scanPages()` → `store.insertPage()` → analysis functions → `generateReports()`
2. **Unique violations:** `buildUniqueViolations()` in `deduplication.js` fingerprints violations by normalizing selectors (stripping dynamic IDs, nth-child indices) so the same DOM pattern on different pages counts once.
3. **Score formula:** `Math.max(0, Math.round((1 - weightedSum / 200) * 100))` where weights are `{critical: 4, serious: 3, moderate: 2, minor: 1, unknown: 0.5}`. This is used identically in the live dashboard (`html-dashboard.js`) and static report (`static-report.js`).
4. **Store:** SQLite via better-sqlite3. `store.iteratePages()` is a generator that yields page results. It's re-iterable (creates a fresh SQL statement each call).

## Conventions

- All source files use ESM (`import`/`export`).
- HTML reports are generated as template literal strings in JS — no templating engine.
- Report styling uses CSS custom properties (dark theme, `--bg`, `--panel`, `--accent`, etc.).
- `escapeHtml()` from `utils/url-utils.js` must be used for all user-controlled content in HTML output.
- Impact levels: `critical`, `serious`, `moderate`, `minor`, `unknown` — this ordering is used everywhere.
- CMS detection modules in `src/analysis/cms/` export `{ detect, classify }` functions.
- Logging funnels through `logBus` (`utils/log-bus.js`). The Electron app and `node bin/includa.js --dashboard` surface it as the in-app **Console** (live via SSE at `/api/logs/stream`, copy/export at `/api/logs.txt`) plus a rotating file at `<userData>/logs/includa.log`. Setup failures render on the splash with a Retry button rather than a dead-end dialog.

## Common pitfalls

- The store's `iteratePages()` generator can only be consumed once per call. If you need multiple passes, call it again — it creates a new SQL statement each time.
- Report HTML is one big template literal. Embedded `<script>` blocks use `var` and ES5-compatible JS to avoid issues with older browsers viewing reports.
- The `\\n` pattern in template literals inside report JS is intentional — it produces a literal `\n` in the HTML output that the browser interprets as a newline.
- `payload.uniqueViolations` has shape `{ uniqueViolations: [...items], totalUnique: number }` — note the nested property name.
