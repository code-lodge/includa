// Shared backoff for requests the origin throttles. Used by the page scanner
// (Playwright navigations) and sitemap discovery (plain fetches) so both back
// off the same way when a host rate-limits us.

// HTTP statuses that signal the origin is throttling us: 429 Too Many Requests,
// 430 (Shopify's request-throttle code), 503 Service Unavailable.
export const THROTTLE_STATUSES = new Set([429, 430, 503])
export const DEFAULT_MAX_RETRIES = 5

const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 20000
const RETRY_AFTER_CAP_MS = 60000

// How long to wait before the next attempt. Honour a Retry-After header when the
// origin sends one (capped), otherwise exponential backoff with a little jitter
// so concurrent workers don't all retry in lockstep.
export function backoffDelay(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader)
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS)
  }
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.floor(Math.random() * 500)
}
