# Developer Notes

## Scan pipeline

1. CLI parses arguments in `bin/cli.js`
2. `runScan()` (`src/index.js`) orchestrates discovery, scanning, analysis, and reporting
3. URL discovery order:
   - robots/sitemap detection
   - sitemap index recursion
   - BFS Playwright link crawl when no sitemap yields URLs (same host only; `#/route` hash routes count as pages)
4. Scanner uses a browser pool (`src/scanner/browser-pool.js`) and per-page axe checks (`src/scanner/axe-runner.js`)
5. Analysis modules group by severity, WCAG tags, rules, and templates
6. Reporting writes raw + summarized machine files and human HTML dashboards

## Live-state streaming

When `--dashboard` is used, the scan pipeline writes incremental progress to `raw/live-state.json` in the report directory. This is managed by `src/reporting/live-state.js`:

- `createLiveState(reportDir)` returns an object with methods: `setStatus()`, `addPage()`, `setLogs()`, `complete()`
- Writes are throttled to at most once every 800ms to avoid disk thrashing on large scans
- The `complete()` method sets `status: "completed"` and forces a final flush
- The state object includes: page index, severity counts, template totals, rule catalog, scan logs, and manual checklist items

The live-state JSON schema (simplified):

```json
{
  "status": "scanning" | "completed",
  "statusMessage": "Scanning page 42 of 500...",
  "wcagLevel": "AAA",
  "discoveredPages": 500,
  "scannedPages": 42,
  "totalViolations": 128,
  "totalRulesTriggered": 15,
  "severity": { "critical": 3, "serious": 12, ... },
  "templateTotals": { "product": 45, ... },
  "topRules": [{ "id": "color-contrast", "count": 30 }],
  "ruleCatalog": [{ "id": "color-contrast", "file": "raw/rules.json", "count": 30 }],
  "pageIndex": [{ "url": "...", "template": "product", "violations": 5, "detailPath": "pages/..." }],
  "logs": [{ "at": "12:30:01", "level": "info", "message": "..." }],
  "manualChecklist": ["Check reading order with screen reader", ...]
}
```

## Dashboard server

`src/reporting/dashboard-server.js` is a minimal Node.js HTTP static file server:

- Serves the report directory on the specified port (default 4173)
- Used when `--dashboard` is passed: the server starts before the scan begins
- Supports JSON, HTML, CSS, JS, and CSV content types
- The dashboard HTML (`index.html`) polls `raw/live-state.json` every 1.5 seconds
- Polling stops automatically when `data.status === "completed"`

## Shopify strategy

- Shopify-like routes are inferred from URL paths
- Optional sampling mode (`--sample-products`) includes:
  - homepage
  - up to N product pages
  - up to 5 collection pages
  - all `/pages/*`
  - all `/blogs/*`

## Extending advanced checks

Advanced checks are in `src/scanner/page-scanner.js` and designed to be optional:

- keyboard traversal (`--check-keyboard`)
- ARIA attribute check (`--check-aria`)
- focus order snapshot (`--check-focus-order`)
- contrast screenshots (`--contrast-screenshots`)

Add new checks by:

1. Implementing an async helper in `page-scanner.js`
2. Placing the result under `checks` in each page payload
3. Rendering the new fields in page and dashboard reports if needed

## Shared utilities

`src/utils/url-utils.js` contains shared functions used across modules:

- `normalizeUrl(url)` - canonical URL normalization (strip trailing slash, fragment, sort params)
- `detectTemplate(url)` - infer template type from URL path (product, collection, page, blog, home)
- `templateFolder(template)` - map template name to report subdirectory
- `escapeHtml(str)` - HTML entity escaping including single quotes
- `fetchWithTimeout(url, options, timeoutMs)` - native fetch with AbortController timeout (15s default)
- `safeSlug(str)` - filesystem-safe slug generation

## Performance guidance

- Use sitemap discovery first for large websites
- Increase `--concurrency` gradually (8-20 typical)
- Keep `--timeout` conservative on large runs to avoid queue stalls
- For massive catalogs, combine `--sample-products` with `--max-pages`

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | CLI / runtime error |
| `2` | CI threshold exceeded (`--fail-on-critical` / `--fail-on-serious`) |
