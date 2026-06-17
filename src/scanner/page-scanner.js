import fs from "node:fs/promises"
import path from "node:path"
import { runAxe } from "./axe-runner.js"
import { BrowserPool } from "./browser-pool.js"
import { safeSlug, detectTemplate } from "../utils/url-utils.js"
import { detectCms, cmsSignalScript } from "../analysis/cms/index.js"

async function runKeyboardCheck(page) {
  const focusableCount = await page.$$eval(
    "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    (elements) => elements.length
  )

  let changedFocus = 0
  for (let i = 0; i < Math.min(10, focusableCount); i += 1) {
    await page.keyboard.press("Tab")
    const hasFocus = await page.evaluate(() => document.activeElement && document.activeElement !== document.body)
    if (hasFocus) changedFocus += 1
  }

  return { focusableCount, tabStopsReached: changedFocus }
}

async function runAriaCheck(page) {
  // Validates ARIA attribute *names* against the spec pattern.
  // Does not validate whether an attribute is appropriate for its role –
  // axe-core handles that via its own rules.
  const invalidAriaAttributes = await page.evaluate(() => {
    const VALID = /^aria-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/
    let invalid = 0
    for (const el of document.querySelectorAll("*")) {
      for (const name of el.getAttributeNames()) {
        if (name.startsWith("aria-") && !VALID.test(name)) invalid += 1
      }
    }
    return invalid
  })

  return { invalidAriaAttributes }
}

async function runFocusOrderCheck(page) {
  const labels = await page.$$eval(
    "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    (elements) => elements.slice(0, 20).map((el) => ({
      tag: el.tagName.toLowerCase(),
      tabindex: el.getAttribute("tabindex") || "0",
      text: (el.textContent || "").trim().slice(0, 40)
    }))
  )

  return { firstFocusableElements: labels }
}

const MAX_SCREENSHOT_WIDTH = 900
const MAX_SCREENSHOT_HEIGHT = 600
const SCREENSHOT_PADDING = 12

async function captureElementScreenshots(page, violations, screenshotsBaseDir, urlSlug) {
  for (const violation of violations) {
    // Capture only the first node per violation to keep disk usage bounded
    const node = violation.nodes[0]
    if (!node || !node.target || node.target.length === 0) continue

    // Skip cross-frame targets (multiple selectors = iframe/shadow context)
    if (node.target.length > 1) continue

    const selector = node.target[0]

    try {
      const locator = page.locator(selector).first()
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 })
      const box = await locator.boundingBox({ timeout: 2000 })
      if (!box || box.width === 0 || box.height === 0) continue

      const clip = {
        x: Math.max(0, box.x - SCREENSHOT_PADDING),
        y: Math.max(0, box.y - SCREENSHOT_PADDING),
        width: Math.min(box.width + SCREENSHOT_PADDING * 2, MAX_SCREENSHOT_WIDTH),
        height: Math.min(box.height + SCREENSHOT_PADDING * 2, MAX_SCREENSHOT_HEIGHT)
      }

      await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (el) {
          el.style.setProperty("outline", "3px solid #ef4444", "important")
          el.style.setProperty("outline-offset", "2px", "important")
        }
      }, selector)

      const ruleDir = path.join(screenshotsBaseDir, violation.id)
      await fs.mkdir(ruleDir, { recursive: true })
      const filename = `${urlSlug}.png`
      await page.screenshot({ path: path.join(ruleDir, filename), clip })

      await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (el) {
          el.style.removeProperty("outline")
          el.style.removeProperty("outline-offset")
        }
      }, selector)

      node.screenshotPath = `raw/screenshots/${violation.id}/${filename}`
    } catch {
      // Silently skip — element may be hidden, removed, or selector invalid
    }
  }
}

async function disableCache(page) {
  const client = await page.context().newCDPSession(page)
  await client.send("Network.setCacheDisabled", { cacheDisabled: true })
  await client.detach()
}

const STABILIZATION_DELAY_MS = 500

// HTTP statuses that signal the origin is throttling us: 429 Too Many Requests,
// 430 (Shopify's request-throttle code), 503 Service Unavailable.
const THROTTLE_STATUSES = new Set([429, 430, 503])
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 15000
const RETRY_AFTER_CAP_MS = 30000

// How long to wait before the next attempt. Honour a Retry-After header when the
// origin sends one (capped), otherwise exponential backoff with a little jitter
// so concurrent workers don't all retry in lockstep.
function backoffDelay(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader)
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS)
  }
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.floor(Math.random() * 500)
}

// A meta-refresh is the tell-tale of a rate-limit / "please wait" interstitial
// (e.g. Shopify) — and it's the very thing that trips a false-positive critical
// meta-refresh violation. Returns the refresh delay in seconds, or null if none.
async function detectMetaRefreshSeconds(page) {
  return page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="refresh" i]')
    if (!m) return null
    const secs = parseInt(m.getAttribute("content") || "", 10)
    return Number.isFinite(secs) ? secs : 0
  }).catch(() => null)
}

// Navigate to `url`, retrying with backoff while the response looks rate-limited
// — a throttling status or a meta-refresh interstitial. Retrying lets a transient
// rate limit clear so we scan the real page instead of the "please wait" shim.
// Note: a plain "never reached network-idle" is deliberately NOT retried on its
// own — many JS-heavy pages legitimately never idle, and retrying every one would
// cripple a full-site scan. Bounded by options.maxRetries (default 3).
async function navigateWithRetry(page, url, options) {
  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 3
  let attempt = 0

  while (true) {
    let networkSettled = true
    let response = null
    try {
      response = await page.goto(url, { waitUntil: "load", timeout: options.timeout })
    } catch (err) {
      // A failed navigation is itself a common throttling symptom — retry it too.
      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt)
        console.warn(`[retry] ${url}: navigation failed (${String(err.message).split("\n")[0]}); retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await page.waitForTimeout(delay)
        attempt += 1
        continue
      }
      throw err
    }

    await page.waitForLoadState("networkidle", { timeout: Math.min(options.timeout, 7000) })
      .catch(() => { networkSettled = false })

    const status = typeof response?.status === "function" ? response.status() : 0
    const metaRefresh = await detectMetaRefreshSeconds(page)
    const throttled = THROTTLE_STATUSES.has(status)
    const rateLimited = throttled || metaRefresh !== null

    if (rateLimited && attempt < maxRetries) {
      const reason = throttled ? `HTTP ${status}` : `meta-refresh ${metaRefresh}s`
      const retryAfter = typeof response?.headers === "function" ? response.headers()["retry-after"] : undefined
      const delay = backoffDelay(attempt, retryAfter)
      console.warn(`[retry] ${url}: looks rate-limited (${reason}); backing off ${delay}ms then retrying (attempt ${attempt + 1}/${maxRetries})`)
      await page.waitForTimeout(delay)
      attempt += 1
      continue
    }

    return { networkSettled, attempts: attempt + 1, rateLimited }
  }
}

async function scanSinglePage(page, url, options) {
  const start = Date.now()
  await disableCache(page)

  const { networkSettled, attempts, rateLimited } = await navigateWithRetry(page, url, options)

  // Allow async rendering (JS frameworks, lazy hydration) to stabilise
  await page.waitForTimeout(STABILIZATION_DELAY_MS)

  const [title, axeResults, cmsSignals] = await Promise.all([
    page.title(),
    runAxe(page, options.locale, options.wcagLevel),
    page.evaluate(cmsSignalScript())
  ])

  const { violations, passes, incomplete, inapplicable, rulesRun } = axeResults

  const cms = detectCms(cmsSignals)
  const checks = {}
  if (options.checkKeyboard) checks.keyboard = await runKeyboardCheck(page)
  if (options.checkAria) checks.aria = await runAriaCheck(page)
  if (options.checkFocusOrder) checks.focusOrder = await runFocusOrderCheck(page)

  if (options.contrastScreenshots && violations.some((v) => v.id === "color-contrast")) {
    const screenshotsDir = path.join(options.reportDir, "raw", "screenshots")
    await fs.mkdir(screenshotsDir, { recursive: true })
    await page.screenshot({ path: path.join(screenshotsDir, `${safeSlug(url)}.png`), fullPage: true })
  }

  if (options.elementScreenshots && violations.length > 0) {
    const screenshotsBaseDir = path.join(options.reportDir, "raw", "screenshots")
    await captureElementScreenshots(page, violations, screenshotsBaseDir, safeSlug(url))
  }

  return {
    url,
    title,
    template: cms?.templateFile || detectTemplate(url),
    status: "ok",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    networkSettled,
    attempts,
    rateLimited,
    violations,
    passes,
    incomplete,
    inapplicable,
    rulesRun,
    checks,
    cms
  }
}

export async function scanPages(urls, options, logger, signal) {
  logger.info(`Scanning ${urls.length} pages with concurrency ${options.concurrency}`)

  const pool = new BrowserPool({
    concurrency: options.concurrency,
    headless: options.headless
  })

  try {
    await pool.init()

    await pool.run(urls, async ({ context, url, index }) => {
      if (signal?.aborted) return
      logger.progress("Scanning page", index + 1, urls.length)
      const page = await context.newPage()
      try {
        const result = await scanSinglePage(page, url, options)
        await page.close()
        if (options.onPageResult) await options.onPageResult(result)
      } catch (error) {
        await page.close().catch(() => {})
        const failed = {
          url,
          title: "",
          template: detectTemplate(url),
          status: "error",
          scannedAt: new Date().toISOString(),
          durationMs: 0,
          violations: [],
          passes: [],
          incomplete: [],
          inapplicable: [],
          rulesRun: [],
          checks: {},
          error: error.message
        }
        if (options.onPageResult) await options.onPageResult(failed)
      }
    }, signal)
  } finally {
    await pool.close().catch(() => {})
  }
}
