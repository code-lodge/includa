import { parseStringPromise } from "xml2js"
import { gunzipSync } from "node:zlib"
import { setTimeout as sleep } from "node:timers/promises"
import { normalizeUrl, fetchWithTimeout } from "../utils/url-utils.js"
import { THROTTLE_STATUSES, DEFAULT_MAX_RETRIES, backoffDelay } from "../utils/retry.js"

const SITEMAP_TIMEOUT_MS = 15000

// Fetch a sitemap, backing off and retrying while the origin throttles us or
// the request fails outright. Scanning several sites on one host at once (e.g.
// a shop's language domains) easily trips its rate limit, and giving up on the
// first 429 silently dropped every URL in that child sitemap from the scan.
async function fetchSitemap(url, logger) {
  for (let attempt = 0; ; attempt += 1) {
    const canRetry = attempt < DEFAULT_MAX_RETRIES

    let response
    try {
      response = await fetchWithTimeout(url, SITEMAP_TIMEOUT_MS)
    } catch (error) {
      if (!canRetry) throw error
      const delay = backoffDelay(attempt)
      logger.warn(`Sitemap ${url} — ${error.message}; retrying in ${delay}ms (attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES})`)
      await sleep(delay)
      continue
    }

    if (!THROTTLE_STATUSES.has(response.status) || !canRetry) return response

    const delay = backoffDelay(attempt, response.headers.get("retry-after"))
    await response.body?.cancel().catch(() => {})
    logger.warn(`Sitemap ${url} — HTTP ${response.status}; retrying in ${delay}ms (attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES})`)
    await sleep(delay)
  }
}

async function readXml(url, logger) {
  const response = await fetchSitemap(url, logger)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  let text
  if (url.endsWith(".gz") || response.headers.get("content-type")?.includes("gzip")) {
    try {
      text = gunzipSync(buffer).toString("utf-8")
    } catch {
      text = buffer.toString("utf-8")
    }
  } else {
    text = buffer.toString("utf-8")
  }

  return parseStringPromise(text)
}

function getSitemapCandidates(baseUrl, explicitSitemap, robotsRules) {
  if (explicitSitemap) {
    return [normalizeUrl(explicitSitemap, baseUrl)].filter(Boolean)
  }

  const origin = new URL(baseUrl).origin
  const candidates = [
    ...robotsRules.sitemaps,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`
  ]

  return [...new Set(candidates.map((item) => normalizeUrl(item, origin)).filter(Boolean))]
}

export async function discoverUrlsFromSitemaps(baseUrl, explicitSitemap, robotsRules, logger) {
  const sitemapQueue = getSitemapCandidates(baseUrl, explicitSitemap, robotsRules)
  const visitedSitemaps = new Set()
  const urls = new Set()

  while (sitemapQueue.length > 0 && visitedSitemaps.size < 200) {
    const sitemapUrl = sitemapQueue.shift()
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue
    visitedSitemaps.add(sitemapUrl)

    try {
      const xml = await readXml(sitemapUrl, logger)

      if (xml.sitemapindex?.sitemap) {
        const nested = xml.sitemapindex.sitemap
        logger.info(`Sitemap index ${sitemapUrl} contains ${nested.length} child sitemaps`)
        for (const entry of nested) {
          const loc = normalizeUrl(String(entry.loc?.[0] || "").trim(), sitemapUrl)
          if (loc) sitemapQueue.push(loc)
        }
      }

      if (xml.urlset?.url) {
        const before = urls.size
        for (const entry of xml.urlset.url) {
          const normalized = normalizeUrl(String(entry.loc?.[0] || "").trim(), baseUrl)
          if (normalized) urls.add(normalized)
        }
        logger.info(`Sitemap ${sitemapUrl} added ${urls.size - before} URLs (total: ${urls.size})`)
      }
    } catch (error) {
      logger.warn(`Skipping sitemap ${sitemapUrl} — ${error.message}`)
    }
  }

  return [...urls]
}
