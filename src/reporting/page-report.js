import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import path from "node:path"
import { safeSlug, templateFolder, escapeHtml, detectTemplate } from "../utils/url-utils.js"

async function* streamJsonl(filePath) {
  try {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    for await (const line of rl) {
      if (line.trim()) yield JSON.parse(line)
    }
  } catch { /* file missing or empty */ }
}

const PLATFORM_LABEL = {
  wordpress:   "WordPress",
  shopify:     "Shopify",
  drupal:      "Drupal",
  ghost:       "Ghost",
  hubspot:     "HubSpot",
  magento2:    "Magento 2",
  squarespace: "Squarespace",
}

function renderCmsPanel(cms) {
  const platform = PLATFORM_LABEL[cms.platform] || cms.platform
  const builderSuffix = cms.pageBuilder === "pagefly" ? " + PageFly" : ""

  let bodyHtml
  if (cms.pageBuilder === "pagefly") {
    bodyHtml = `<p style="margin:0;font-size:0.82rem;color:#9fb4c3">
      This page is built with <strong style="color:#e9f2f8">PageFly</strong> on ${escapeHtml(platform)}.
      Open the page in PageFly's visual editor to fix accessibility issues.
    </p>`
  } else if (cms.noEdit) {
    bodyHtml = `<p style="margin:0;font-size:0.82rem;color:#9fb4c3">
      This platform uses a visual editor — templates are not directly editable as files.
      Make changes in the <strong style="color:#e9f2f8">${escapeHtml(platform)}</strong> design tools.
    </p>`
  } else if (!cms.templateFile) {
    bodyHtml = `<p style="margin:0;font-size:0.82rem;color:#9fb4c3">
      Template could not be identified (headless or custom theme).
    </p>`
  } else if (cms.hierarchy && cms.hierarchy.length > 1) {
    bodyHtml = `<p style="margin:0 0 0.4rem;font-size:0.82rem;color:#9fb4c3">
        <strong style="color:#e9f2f8">${escapeHtml(cms.label || "")}</strong>
        — template lookup order (most specific → fallback):
      </p>
      <ol style="margin:0;padding-left:1.4rem;font-size:0.82rem">
        ${cms.hierarchy.map((f, i) =>
          `<li style="${i === 0 ? "color:#2dd4bf;font-weight:600" : "color:#9fb4c3"}">${escapeHtml(f)}${i === 0 ? " ← active" : ""}</li>`
        ).join("")}
      </ol>`
  } else {
    bodyHtml = `<p style="margin:0;font-size:0.82rem;color:#9fb4c3">
      Edit <code style="color:#2dd4bf;font-size:0.8rem;background:rgba(8,23,36,0.9);border:1px solid rgba(120,158,182,0.25);border-radius:5px;padding:0.06rem 0.26rem">${escapeHtml(cms.templateFile)}</code>
      in your theme to fix issues on this page type.
    </p>`
  }

  return `
    <details style="margin-bottom:1rem;border:1px solid rgba(157,197,220,0.22);border-radius:10px;padding:0.7rem 1rem;background:rgba(12,29,42,0.7)">
      <summary style="cursor:pointer;font-size:0.83rem;color:#2dd4bf;font-weight:600;user-select:none">
        ${escapeHtml(platform)}${escapeHtml(builderSuffix)} template — ${escapeHtml(cms.label || cms.templateType || "unknown")}
      </summary>
      <div style="margin-top:0.6rem">${bodyHtml}</div>
    </details>`
}

function renderPageHtml(page) {
  const rows = page.violations.map((violation) => {
    const nodes = violation.nodes
      .map((node) => {
        const selector = escapeHtml((node.target || []).join(" "))
        const screenshot = node.screenshotPath
          ? `<img src="${escapeHtml("../../" + node.screenshotPath)}"
                  alt="Screenshot of failing element"
                  style="display:block;max-width:100%;max-height:200px;object-fit:contain;
                         border:1px solid rgba(157,197,220,0.22);border-radius:6px;margin-top:0.4rem;"
                  loading="lazy" />`
          : ""
        return `<li><code>${selector}</code>${screenshot}</li>`
      })
      .join("")

    return `
      <article class="issue impact-${escapeHtml(violation.impact)}">
        <header>
          <h3>${escapeHtml(violation.id)} (${escapeHtml(violation.impact)})</h3>
          <p>${escapeHtml(violation.help)}</p>
          <a href="${escapeHtml(violation.helpUrl)}" target="_blank" rel="noreferrer">WCAG documentation</a>
        </header>
        <p>${escapeHtml(violation.description)}</p>
        <ul>${nodes}</ul>
      </article>
    `
  }).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(page.url)} - a11y-scan</title>
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

    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 1.6rem 1.2rem 3rem;
    }

    h1 {
      font-family: "Space Grotesk", sans-serif;
      font-size: clamp(1.2rem, 2.5vw, 1.7rem);
      word-break: break-all;
      margin: 0 0 1.2rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.84rem;
      color: var(--accent-2);
      margin-bottom: 0.65rem;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.85rem;
      margin-bottom: 1.2rem;
    }

    .card {
      border: 1px solid var(--stroke);
      border-radius: var(--radius);
      background: linear-gradient(180deg, rgba(12, 30, 44, 0.85), rgba(9, 23, 35, 0.9));
      box-shadow: var(--shadow);
      padding: 0.95rem;
    }

    .card-label {
      color: var(--muted);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .card-value {
      margin-top: 0.3rem;
      font-size: 1.1rem;
      font-weight: 600;
      font-family: "Space Grotesk", sans-serif;
    }

    .issue {
      border: 1px solid var(--stroke);
      border-left: 5px solid var(--muted);
      border-radius: var(--radius);
      background: linear-gradient(180deg, var(--panel), var(--panel-strong));
      box-shadow: var(--shadow);
      padding: 1rem 1.2rem;
      margin-bottom: 1rem;
    }

    .issue header { margin-bottom: 0.5rem; }
    .issue h3 {
      margin: 0 0 0.2rem;
      font-family: "Space Grotesk", sans-serif;
      font-size: 1rem;
    }
    .issue p { margin: 0.3rem 0; font-size: 0.88rem; color: var(--muted); }
    .issue ul { padding-left: 1.2rem; margin: 0.5rem 0 0; }
    .issue li { margin-bottom: 0.3rem; font-size: 0.84rem; }

    .impact-critical { border-left-color: #ef4444; }
    .impact-serious  { border-left-color: #fb923c; }
    .impact-moderate { border-left-color: #facc15; }
    .impact-minor    { border-left-color: #60a5fa; }
    .impact-unknown  { border-left-color: #9ca3af; }

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

    .muted { color: var(--muted); }
    .empty { color: var(--muted); font-size: 0.9rem; padding: 0.5rem 0; }

    @media (max-width: 700px) {
      .meta { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <a class="back-link" href="../../report.html">\u2190 Back to Report</a>
    <h1>${escapeHtml(page.url)}</h1>
    <div class="meta">
      <div class="card"><div class="card-label">Template</div><div class="card-value">${escapeHtml(page.template)}</div></div>
      <div class="card"><div class="card-label">Status</div><div class="card-value">${escapeHtml(page.status)}</div></div>
      <div class="card"><div class="card-label">Violations</div><div class="card-value" style="color:#ef4444">${page.violations.length}</div></div>
      <div class="card"><div class="card-label">Scan Time</div><div class="card-value">${page.durationMs} ms</div></div>
    </div>
    ${page.cms ? renderCmsPanel(page.cms) : ""}
    ${rows || '<p class="empty">No violations found.</p>'}
  </main>
</body>
</html>`
}

export async function writePageReports(reportDir, jsonlPath) {
  for await (const page of streamJsonl(jsonlPath)) {
    const template = page.template || page.cms?.templateFile || detectTemplate(page.url)
    const folder = templateFolder(template)
    const outputDir = path.join(reportDir, "pages", folder)
    const filename = `${safeSlug(page.url)}.html`
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(path.join(outputDir, filename), renderPageHtml({ ...page, template }), "utf8")
  }
}
