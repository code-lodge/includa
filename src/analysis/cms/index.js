/**
 * CMS detection registry.
 *
 * Each CMS is a detector object that implements:
 *
 *   platform: string
 *     Stable identifier used in reports and grouping (e.g. "wordpress").
 *
 *   detect(signals): boolean
 *     Return true when this CMS is active on the page.
 *     Signals are the raw DOM values extracted by cmsSignalScript().
 *
 *   detectTemplate(signals): { templateType, templateFile, hierarchy, label } | null
 *     Return which template file is active, or null when the CMS is
 *     detected but the specific template cannot be determined.
 *     - templateFile: path relative to the theme root (the file to edit)
 *     - hierarchy:    ordered fallback chain, most-specific first
 *     - label:        human-readable page-type description
 *
 *   noEdit?: boolean
 *     When true the CMS uses a visual builder — templateFile is a conceptual
 *     grouping key, not a directly editable file path.
 *
 * Adding a new CMS: create a detector file in this directory and add it
 * to the DETECTORS array below — no other file needs to change.
 */

import wordpress  from "./wordpress.js"
import shopify    from "./shopify.js"
import drupal     from "./drupal.js"
import ghost      from "./ghost.js"
import hubspot    from "./hubspot.js"
import magento2   from "./magento2.js"
import squarespace from "./squarespace.js"

const DETECTORS = [
  wordpress,
  shopify,
  drupal,
  ghost,
  hubspot,
  magento2,
  squarespace,
]

/**
 * Identify the active CMS and its current template from pre-extracted signals.
 *
 * @param {object} signals  Output of cmsSignalScript() evaluated in the browser
 * @returns {{ platform, templateType, templateFile, hierarchy, label, noEdit? } | null}
 */
export function detectCms(signals) {
  for (const detector of DETECTORS) {
    if (!detector.detect(signals)) continue

    const tpl = detector.detectTemplate(signals)
    const result = {
      platform: detector.platform,
      templateType:  tpl?.templateType  ?? null,
      templateFile:  tpl?.templateFile  ?? null,
      hierarchy:     tpl?.hierarchy     ?? [],
      label:         tpl?.label         ?? detector.platform,
    }
    if (detector.noEdit || tpl?.noEdit) result.noEdit = true
    if (tpl?.isBlockTheme) result.isBlockTheme = true
    if (tpl?.templateParts) result.templateParts = tpl.templateParts
    if (tpl?.pageBuilder) result.pageBuilder = tpl.pageBuilder
    return result
  }
  return null
}

/**
 * JavaScript expression (IIFE) that extracts all DOM signals needed by any
 * registered detector.  Pass the return value directly to Playwright's
 * page.evaluate() — it runs in the browser context and returns a plain object.
 */
export function cmsSignalScript() {
  return `(() => ({
    bodyClass:          document.body?.className ?? "",
    metaGenerator:      document.querySelector('meta[name="generator"]')?.content ?? "",
    hasWpContent:       !!document.querySelector('[href*="/wp-content/"], [src*="/wp-content/"]'),
    hasWpJson:          !!document.querySelector('link[rel="https://api.w.org/"]'),
    hasWpEditUri:       !!document.querySelector('link[rel="EditURI"][href*="xmlrpc.php"]'),
    hasWpEmoji:         typeof window._wpemojiSettings !== "undefined" || typeof window.wp !== "undefined",
    hasShopifyObject:   typeof window.Shopify !== "undefined",
    hasShopifyCdn:      !!document.querySelector('[href*="cdn.shopify.com"], [src*="cdn.shopify.com"]'),
    hasShopifyMeta:     !!document.querySelector('meta[name="shopify-checkout-api-token"]'),
    hasDrupal:          typeof window.drupalSettings !== "undefined" || typeof window.Drupal !== "undefined",
    hasGhost:           !!document.querySelector('meta[name="generator"][content*="Ghost"]') || typeof window.ghost !== "undefined",
    hasHubspot:         typeof window.hbspt !== "undefined",
    hasHubspotCdn:      !!document.querySelector('[src*="hs-scripts.com"], [src*="js.hsforms.net"]'),
    hasMagento:         !!document.querySelector('script[type="text/x-magento-init"]'),
    hasMagentoCdn:      !!document.querySelector('[src*="/static/version"], [href*="/static/version"]'),
    hasSquarespaceCdn:  !!document.querySelector('[src*="static1.squarespace.com"], [href*="sqspcdn.com"]'),
    hasWpSiteBlocks:    !!document.querySelector('.wp-site-blocks'),
    hasGlobalStyles:    !!document.getElementById('global-styles-inline-css'),
    hasBlockTemplateParts: !!document.querySelector('.wp-block-template-part'),
    hasPageFly:           !!document.querySelector('[data-pf-type], .pf-c-ct, [class*="__pf"]'),
    hasPageFlyScript:     !!document.querySelector('script[src*="pagefly"], link[href*="pagefly"]'),
    pageFlyType:          document.querySelector('[data-pf-type]')?.getAttribute('data-pf-type') ?? "",
  }))()`
}
