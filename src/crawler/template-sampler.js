/**
 * Group URLs by their path pattern (template type) and return at most
 * `perTemplate` URLs from each group.
 *
 * Locale-aware:  /de/products/foo and /en/products/foo and /products/foo
 * are treated as the same page.  Only one locale variant is kept per
 * canonical path (the default / no-prefix version is preferred).
 *
 * Shopify-aware:
 *   - /pages/* URLs are always kept (each page can have a unique template)
 *   - /blogs/{name} listing pages are always kept (unique template each)
 *   - /blogs/{name}/{slug} articles are capped at perTemplate per blog
 *   - /products/*, /collections/* are capped at perTemplate
 *   - The homepage (/) is always kept
 *
 * This is instant (no browser needed).
 */

// Matches locale prefixes: /en/, /de/, /fr-ca/, /pt-br/, /zh-hans/, etc.
const LOCALE_PREFIX = /^\/[a-z]{2}(-[a-z]{2,4})?\//i

// Also match bare locale-only paths: /en, /de, /fr-ca (with no trailing content)
const LOCALE_ONLY = /^\/[a-z]{2}(-[a-z]{2,4})?$/i

/**
 * Strip locale prefix from a pathname.
 *   /de/products/foo → /products/foo
 *   /en             → /
 *   /fr-ca/pages/x  → /pages/x
 *   /products/foo   → /products/foo  (unchanged)
 */
function stripLocale(pathname) {
  if (LOCALE_ONLY.test(pathname)) return "/"
  return pathname.replace(LOCALE_PREFIX, "/")
}

/**
 * Get the canonical path for a URL (locale-stripped, normalized).
 */
function canonicalPath(url) {
  try {
    let pathname = new URL(url).pathname
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1)
    }
    return stripLocale(pathname)
  } catch {
    return url
  }
}

/**
 * Derive a grouping key from a canonical path (already locale-stripped).
 */
function pathPattern(canonical, isShopify) {
  if (canonical === "/" || canonical === "") return "/"

  const segments = canonical.split("/").filter(Boolean)

  if (segments.length === 1) {
    return "/" + segments[0]
  }

  const firstSegment = "/" + segments[0]

  // Shopify /pages: each page is a unique template
  if (isShopify && firstSegment === "/pages") {
    return canonical
  }

  // Shopify /blogs: 2 segments = listing (unique), 3+ = article (capped)
  if (isShopify && firstSegment === "/blogs") {
    if (segments.length <= 2) {
      return canonical
    }
    return "/" + segments.slice(0, 2).join("/") + "/*"
  }

  // Generic: wildcard the last segment
  const prefix = "/" + segments.slice(0, -1).join("/")
  return prefix + "/*"
}

/**
 * Detect whether a set of URLs looks like a Shopify site.
 */
function isLikelyShopify(urls) {
  return urls.some((url) => {
    try {
      const p = canonicalPath(url)
      return p.startsWith("/products/") || p.startsWith("/collections/")
    } catch {
      return false
    }
  })
}

/**
 * Deduplicate locale variants.  For each canonical path, keep only one URL
 * (prefer the version without a locale prefix, fall back to the first seen).
 */
function deduplicateLocales(urls) {
  const byCanonical = new Map()

  for (const url of urls) {
    const cp = canonicalPath(url)
    if (!byCanonical.has(cp)) {
      byCanonical.set(cp, url)
    } else {
      // Prefer the URL without a locale prefix
      try {
        const existing = byCanonical.get(cp)
        const existingPath = new URL(existing).pathname
        const currentPath = new URL(url).pathname
        // The one whose raw pathname equals the canonical path has no locale prefix
        if (stripLocale(currentPath) === currentPath && stripLocale(existingPath) !== existingPath) {
          byCanonical.set(cp, url)
        }
      } catch {}
    }
  }

  return [...byCanonical.values()]
}

/**
 * Group URLs by path pattern and return at most `perTemplate` per group.
 * On Shopify sites, /pages/* and /blogs/{name} listing URLs are always kept.
 * Locale variants are deduplicated first.
 *
 * @param {string[]} urls - full list of discovered URLs
 * @param {number} perTemplate - max URLs to keep per pattern group (0 = disabled)
 * @param {object} _options - unused, kept for API compatibility
 * @param {object} logger
 * @returns {Promise<string[]>} sampled URLs
 */
export async function sampleByStructure(urls, perTemplate, _options, logger) {
  if (perTemplate <= 0 || urls.length <= perTemplate) return urls

  const shopify = isLikelyShopify(urls)

  // Step 1: deduplicate locale variants
  const deduped = deduplicateLocales(urls)
  if (deduped.length < urls.length) {
    logger.info(`Locale dedup: ${urls.length} URLs → ${deduped.length} unique paths`)
  }

  if (shopify) {
    logger.info("Detected Shopify site — keeping all /pages/* and blog listings, sampling products/collections/articles")
  }

  // Step 2: group by path pattern
  const groups = new Map()
  for (const url of deduped) {
    const cp = canonicalPath(url)
    const pattern = pathPattern(cp, shopify)
    if (!groups.has(pattern)) groups.set(pattern, [])
    groups.get(pattern).push(url)
  }

  // Log the groups
  const groupSummary = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pattern, groupUrls]) => `${pattern} (${groupUrls.length})`)
    .join(", ")
  logger.info(`URL pattern groups: ${groupSummary}`)

  // Step 3: pick URLs per group
  const sampled = []
  for (const [pattern, groupUrls] of groups) {
    // Sort within each group for deterministic selection when slicing
    const sorted = [...groupUrls].sort()
    if (shopify && !pattern.endsWith("/*")) {
      // Unique template — keep all (pages, blog listings, homepage, etc.)
      sampled.push(...sorted)
    } else {
      sampled.push(...sorted.slice(0, perTemplate))
    }
  }

  logger.info(`Template sampling: ${groups.size} groups, ${sampled.length} URLs selected (${perTemplate} per sampled group)`)

  return sampled
}
