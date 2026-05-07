import fs from "node:fs/promises"
import path from "node:path"
import { runAxe } from "./axe-runner.js"
import { BrowserPool } from "./browser-pool.js"
import { safeSlug } from "../utils/url-utils.js"
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

async function scanSinglePage(page, url, options) {
  const start = Date.now()
  await disableCache(page)
  await page.goto(url, { waitUntil: "load", timeout: options.timeout })

  let networkSettled = true
  await page.waitForLoadState("networkidle", { timeout: Math.min(options.timeout, 7000) })
    .catch(() => { networkSettled = false })

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
    status: "ok",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    networkSettled,
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

    const results = await pool.run(urls, async ({ context, url, index }) => {
      if (signal?.aborted) return null
      logger.progress("Scanning page", index + 1, urls.length)
      const page = await context.newPage()
      try {
        const result = await scanSinglePage(page, url, options)
        await page.close()
        if (options.onPageResult) await options.onPageResult(result)
        return result
      } catch (error) {
        await page.close().catch(() => {})
        const failed = {
          url,
          title: "",
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
        return failed
      }
    }, signal)

    return results.filter(Boolean)
  } finally {
    await pool.close().catch(() => {})
  }
}
