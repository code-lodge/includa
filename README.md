# Includa

Open-source accessibility scanner for large websites. Crawls your site with Playwright, detects WCAG 2.0/2.1/2.2 violations with axe-core, deduplicates issues across pages, and generates actionable HTML dashboards, static reports, JSON, and CSV.

**Requires Node.js >= 18.0.0**

## Features

- **URL discovery** via sitemap.xml, sitemap indexes, robots.txt, and BFS link crawling with depth controls
- **WCAG 2.0/2.1/2.2** scanning at levels A, AA, and AAA using `@axe-core/playwright`
- **CMS-aware template detection** for WordPress, Shopify, Drupal, Magento 2, Squarespace, HubSpot, and Ghost
- **Template sampling** to scan N representative pages per page structure instead of every page
- **Unique issue deduplication** across all pages — fingerprints violations by rule + normalized selector so repeated patterns count once
- **Accessibility score** based on unique violation impact weights (critical=4, serious=3, moderate=2, minor=1)
- **Element screenshots** with red-outline highlighting for each failing element
- **AI Fix Prompts** — auto-generated, copy-pasteable prompts with full violation context for AI-assisted remediation
- **Live dashboard** with real-time scan progress, stop/resume controls, and interactive results explorer
- **Stop and resume** — interrupt a scan and pick up where you left off
- **Keyboard, ARIA, and focus order checks** enabled by default
- **CI gates** with `--fail-on-critical` and `--fail-on-serious`
- **Concurrent browser pooling** for high-volume scans

## Install

```bash
npm install
```

Playwright browser install (first run / CI):

```bash
npx playwright install chromium
```

## Usage

```bash
# Basic scan
node bin/includa.js https://example.com

# Full scan with options
node bin/includa.js https://site.com \
  --concurrency 10 \
  --max-pages 2000 \
  --exclude cart checkout account \
  --report-dir ./a11y-report

# Start the live dashboard (scan + serve)
node bin/includa.js https://example.com --dashboard

# Serve an existing report without scanning
node bin/includa.js --dashboard --report-dir ./a11y-report --port 4173
```

With `--dashboard`, the web UI starts first and streams scan progress in real time. You can stop, resume, and start new scans from the dashboard UI.

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--max-pages <number>` | Maximum pages to scan | `2000` |
| `--concurrency <number>` | Parallel page scans | `10` |
| `--exclude <patterns...>` | Exclude URL patterns | |
| `--include <patterns...>` | Include URL patterns | |
| `--locale <locale>` | axe locale | `en` |
| `--wcag-level <A\|AA\|AAA>` | WCAG conformance level | `AAA` |
| `--sitemap <url>` | Explicit sitemap URL | |
| `--depth <number>` | BFS crawl depth | `6` |
| `--report-dir <dir>` | Output directory | `./a11y-report` |
| `--format <formats>` | Comma-separated: html,json,csv | `html,json,csv` |
| `--sample-templates <number>` | Sample N pages per unique page structure (0 = off) | `0` |
| `--timeout <ms>` | Page timeout in milliseconds | `30000` |
| `--headless` / `--no-headless` | Run browser headless or with UI | `true` |
| `--fail-on-critical` | Exit code 2 when critical issues exist | `false` |
| `--fail-on-serious` | Exit code 2 when serious issues exist | `false` |
| `--check-keyboard` | Keyboard traversal checks | `true` |
| `--check-aria` | ARIA attribute checks | `true` |
| `--check-focus-order` | Focus order checks | `true` |
| `--contrast-screenshots` | Capture contrast-specific screenshots | `false` |
| `--element-screenshots` | Capture element-level screenshots for violations | `true` |
| `--dashboard` | Serve the interactive dashboard | `false` |
| `--port <number>` | Dashboard server port | `4173` |

### URL Pattern Filtering

`--exclude` and `--include` accept space-separated or comma-separated patterns. Each is matched as a substring against the full URL. Use the `re:` prefix for regex:

```bash
# Exclude by substring
includa https://site.com --exclude cart checkout

# Exclude by regex
includa https://site.com --exclude "re:^https://site\\.com/(cart|account)"

# Include only product pages
includa https://site.com --include "re:/products/"
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Scan completed (no CI threshold exceeded) |
| `1` | CLI error (missing URL, invalid arguments, runtime crash) |
| `2` | CI threshold exceeded (`--fail-on-critical` or `--fail-on-serious`) |

## Report Output

```
a11y-report/
  index.html              # Live dashboard with real-time progress
  report.html             # Static post-scan report with score
  unique-issues.html      # Deduplicated issues + AI fix prompts
  rules/
    color-contrast.html   # Per-rule detail pages
    ...
  templates/
    product.html          # Per-template detail pages
    ...
  pages/
    product/              # Per-page reports grouped by template
    collection/
    ...
  raw/
    results.json          # Full scan results
    results.csv           # CSV export
    rules.json            # Rule summary
    templates.json        # Template summary
    scan-logs.json        # Scan logs
    live-state.json       # Real-time state for dashboard
    resume-state.json     # Stop/resume checkpoint (deleted on completion)
    screenshots/          # Element screenshots
      color-contrast/
      image-alt/
      ...
```

## Reports

### Live Dashboard (`index.html`)

Real-time scan progress with page-by-page results streaming. Includes an interactive violations explorer (Rule > Page > Nodes), severity breakdown, template grouping, and a manual audit checklist for non-automatable criteria.

### Static Report (`report.html`)

Post-scan summary with accessibility score, severity breakdown charts, violations by template, rules-to-fix table, and per-page violation counts. Links to the unique issues page and individual page/rule/template reports.

### Unique Issues (`unique-issues.html`)

Every distinct accessibility violation deduplicated across all scanned pages. Filterable by impact level and template, searchable, with expandable details showing example selectors, HTML snippets, failure reasons, and element screenshots.

Includes an **AI Fix Prompts** section — select a template from the dropdown to generate a structured prompt with all the violations affecting that template. Copy and paste into any AI assistant for remediation guidance.

## Architecture

```
bin/
  cli.js                — CLI parsing (commander)
  includa.js          — Entry point

src/
  index.js              — runScan() orchestrator
  crawler/              — URL discovery (sitemap, robots.txt, BFS crawling, template sampling)
  scanner/              — Browser pool + axe-core page scanning + element screenshots
  analysis/
    cms/                — CMS detection (WordPress, Shopify, Drupal, Magento, Squarespace, HubSpot, Ghost)
    deduplication.js    — Unique violation fingerprinting
    template-detection.js — URL-pattern + CMS-aware template grouping
    rule-grouping.js    — Violations grouped by axe rule
    wcag-grouping.js    — Violations grouped by WCAG criterion
  reporting/            — HTML/JSON/CSV report generation, live state tracking, dashboard server
  store/                — SQLite result store (better-sqlite3)
  setup/                — Playwright browser installation helper
  utils/                — URL normalization, HTML escaping, logging
```

## License

[GPL-3.0](LICENSE)
