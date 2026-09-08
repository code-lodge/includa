import { chromium } from "playwright"
import { fetchRobots, isAllowedByRobots } from "./robots.js"
import { discoverUrlsFromSitemaps } from "./sitemap.js"
import { sampleByStructure } from "./template-sampler.js"
import {
  getPathDepth,
  isExcluded,
  isHashRoute,
  isIncluded,
  isNonHtmlEndpoint,
  isSameDomain,
  normalizeUrl
} from "../utils/url-utils.js"

// Hash-routed single-page apps re-render on `hashchange` without firing a load
// event, so after navigating to "#/route" give the router a moment to paint
// before harvesting the route's links.
const HASH_ROUTE_SETTLE_MS = 500

function shouldKeep(url, options, robotsRules, baseUrl) {
  if (!isSameDomain(url, baseUrl)) return false
  if (!isAllowedByRobots(url, robotsRules)) return false
  if (!isIncluded(url, options.include)) return false
  if (isExcluded(url, options.exclude)) return false
  if (isNonHtmlEndpoint(url)) return false

  const basePath = new URL(baseUrl).pathname
  if (getPathDepth(url, basePath) > options.depth) return false

  return true
}

// Collect every link target on the current document. Reads the resolved
// `href` property (not the attribute) so relative links honour <base href> and
// the post-redirect document URL — e.g. a site served from a sub-path.
async function collectLinks(page) {
  return page.$$eval("a[href], area[href]", (anchors) =>
    anchors.map((anchor) => anchor.href).filter((href) => typeof href === "string" && href.length > 0)
  )
}

/**
 * Fallback for sites without a sitemap: breadth-first link crawl with
 * Playwright, following every link that stays on the same host (subdomains
 * count as different sites) and within `options.depth` clicks of the start
 * page. Uses multiple pages for concurrency.
 */
async function crawlByLinks(baseUrl, options, robotsRules, logger) {
  const concurrency = Math.min(options.concurrency || 4, 8)
  const browser = await chromium.launch({ headless: options.headless })

  const visited = new Set()
  const output = []
  const queue = [{ url: normalizeUrl(baseUrl), depth: 0 }]
  let skippedOffSite = 0
  let skippedBroken = 0

  function nextFromQueue() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item?.url || visited.has(item.url)) continue
      visited.add(item.url)
      if (!shouldKeep(item.url, options, robotsRules, baseUrl)) continue
      return item
    }
    return null
  }

  function enqueueLinks(links, fromUrl, depth) {
    let added = 0
    for (const href of links) {
      const normalized = normalizeUrl(href, fromUrl)
      if (!normalized || visited.has(normalized)) continue
      if (!isSameDomain(normalized, baseUrl)) {
        skippedOffSite += 1
        continue
      }
      if (!shouldKeep(normalized, options, robotsRules, baseUrl)) continue
      queue.push({ url: normalized, depth })
      added += 1
    }
    return added
  }

  async function crawlWorker() {
    const page = await browser.newPage()
    try {
      while (output.length < options.maxPages) {
        const next = nextFromQueue()
        if (!next) break

        try {
          const response = await page.goto(next.url, { waitUntil: "domcontentloaded", timeout: options.timeout })
          // A link to a missing page yields the host's error page (e.g. GitHub's
          // "Site not found"); scanning it would only add noise to the report.
          // `response` is null for same-document hash navigations — those are fine.
          // The start page itself is always kept so an error page still gets audited.
          const status = response ? response.status() : 200
          if (status >= 400 && next.depth > 0) {
            skippedBroken += 1
            logger.warn(`Skipping ${next.url} — HTTP ${status}`)
            continue
          }

          output.push(next.url)
          logger.progress("Crawling page", output.length, options.maxPages)

          await page.waitForLoadState("networkidle", { timeout: Math.min(options.timeout, 6000) }).catch(() => {})
          if (isHashRoute(next.url)) {
            await page.waitForTimeout(HASH_ROUTE_SETTLE_MS)
          }

          if (next.depth < options.depth) {
            const links = await collectLinks(page)
            // Resolve against the document actually loaded (after redirects),
            // not the URL we asked for — the two differ for e.g. "/dir" → "/dir/".
            enqueueLinks(links, page.url() || next.url, next.depth + 1)
          }
        } catch {
          skippedBroken += 1
          logger.warn(`Could not crawl ${next.url} — skipped`)
        }
      }
    } finally {
      await page.close().catch(() => {})
    }
  }

  try {
    const workers = Array.from({ length: concurrency }, () => crawlWorker())
    await Promise.all(workers)
  } finally {
    await browser.close().catch(() => {})
  }

  logger.info(`Link crawl found ${output.length} pages on ${new URL(baseUrl).hostname} (ignored ${skippedOffSite} off-site links, ${skippedBroken} broken or unreachable)`)

  // Sort for deterministic ordering regardless of which worker finished first
  return output.sort()
}

async function resolveBaseUrl(url, logger) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" })
    const resolved = normalizeUrl(response.url)
    if (resolved && resolved !== url) {
      logger.info(`Resolved ${url} → ${resolved}`)
    }
    return resolved || url
  } catch {
    return url
  }
}

export async function discoverUrls(baseUrl, options, logger) {
  let normalizedBase = normalizeUrl(baseUrl)
  if (!normalizedBase) throw new Error("Invalid target URL")

  normalizedBase = await resolveBaseUrl(normalizedBase, logger)
  const robotsRules = await fetchRobots(normalizedBase)
  logger.info("Discovering URLs via sitemap.xml")
  let urls = await discoverUrlsFromSitemaps(normalizedBase, options.sitemap, robotsRules, logger)
  logger.info(`Sitemap discovery found ${urls.length} raw URLs`)

  const beforeFilter = urls.length
  urls = urls.filter((url) => shouldKeep(url, options, robotsRules, normalizedBase))
  if (beforeFilter > 0 && urls.length < beforeFilter) {
    logger.info(`Filtered to ${urls.length}/${beforeFilter} URLs (depth=${options.depth}, include/exclude/robots rules)`)
  }

  if (urls.length === 0) {
    logger.warn(`No sitemap URLs found — following links from ${normalizedBase} (same host only, up to ${options.depth} clicks deep)`)
    urls = await crawlByLinks(normalizedBase, options, robotsRules, logger)
  }

  const sampled = await sampleByStructure(urls, options.sampleTemplates, options, logger)

  const trimmed = sampled.slice(0, options.maxPages)
  return [...new Set(trimmed)]
}
