const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid"
])

export function normalizeUrl(input, baseUrl) {
  try {
    const url = baseUrl ? new URL(input, baseUrl) : new URL(input)
    url.hash = ""

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = ""
    }

    url.pathname = url.pathname.replace(/\/{2,}/g, "/")
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/$/, "")
    }

    const nextParams = new URLSearchParams()
    for (const [key, value] of [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) continue
      nextParams.append(key, value)
    }

    url.search = nextParams.toString() ? `?${nextParams.toString()}` : ""
    return url.href
  } catch {
    return null
  }
}

function stripWww(hostname) {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname
}

export function isSameDomain(a, b) {
  try {
    return stripWww(new URL(a).hostname) === stripWww(new URL(b).hostname)
  } catch {
    return false
  }
}

function isPatternMatch(url, pattern) {
  const haystack = url.toLowerCase()
  const needle = pattern.toLowerCase()
  if (needle.startsWith("re:")) {
    try {
      return new RegExp(needle.slice(3), "i").test(url)
    } catch {
      return false
    }
  }
  return haystack.includes(needle)
}

export function isIncluded(url, includePatterns) {
  if (!includePatterns || includePatterns.length === 0) return true
  return includePatterns.some((pattern) => isPatternMatch(url, pattern))
}

export function isExcluded(url, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return false
  return excludePatterns.some((pattern) => isPatternMatch(url, pattern))
}

// Endpoints that aren't HTML pages and so shouldn't be accessibility-scanned.
// Excluded from discovery by default (in addition to any user --exclude rules).
// Matched against the lower-cased URL pathname. This is only the fast path —
// the scanner also checks the response Content-Type, which catches non-HTML
// endpoints that have no telltale extension.
const NON_HTML_ENDPOINT_PATTERNS = [
  // Data / text documents (markdown like /agents.md, feeds, llms.txt, ...)
  /\.(?:json|jsonld|md|markdown|txt|xml|rss|atom|csv|tsv|ya?ml|pdf)$/,
  // Code, styles, sourcemaps
  /\.(?:js|mjs|cjs|css|map|wasm)$/,
  // Images, fonts, media
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|heic|woff2?|ttf|otf|eot|mp3|mp4|m4a|m4v|webm|ogg|ogv|wav|avi|mov|mkv)$/,
  // Archives, installers, office documents
  /\.(?:zip|gz|tgz|bz2|rar|7z|dmg|exe|msi|apk|deb|rpm|docx?|xlsx?|pptx?|odt|ods|odp)$/,
  /^\/\.well-known\//, // /.well-known/* (security.txt, etc.)
  /^\/api\/ucp\// // /api/ucp/* (non-HTML API)
]

export function isNonHtmlEndpoint(url) {
  let pathname
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return false
  }
  return NON_HTML_ENDPOINT_PATTERNS.some((re) => re.test(pathname))
}

export function getPathDepth(url, basePathname = "/") {
  const pathname = new URL(url).pathname
  const relative = pathname.startsWith(basePathname) ? pathname.slice(basePathname.length) : pathname
  return relative.split("/").filter(Boolean).length
}

export function safeSlug(input) {
  return input
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180) || "page"
}

/**
 * Detect template type from a URL pathname.
 * Shared by analysis and live-state to avoid drift.
 */
export function detectTemplate(url) {
  try {
    const pathname = new URL(url).pathname
    if (pathname === "/") return "home"
    if (pathname.startsWith("/products/")) return "product"
    if (pathname.startsWith("/collections/")) return "collection"
    if (pathname.startsWith("/blogs/")) return "blog"
    if (pathname.startsWith("/pages/")) return "page"
    return "page"
  } catch {
    return "page"
  }
}

/**
 * Map template name to report output folder.
 * Shared by page-report, rule-report, and template-report.
 */
export function templateFolder(template) {
  if (template === "home") return "home"
  if (template === "product") return "products"
  if (template === "collection") return "collections"
  if (template === "blog") return "blogs"
  return "pages"
}

/**
 * Escape a string for safe insertion into HTML.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Fetch with an AbortController timeout (default 15 s).
 * Uses the global fetch available in Node 18+.
 */
export async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
