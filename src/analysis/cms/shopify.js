/**
 * Shopify CMS detector.
 *
 * Shopify themes add a `template-{type}` class to <body> on every page.
 * Alternate templates appear as `template-{type}-{name}` (e.g. template-product-special).
 * Customer sub-pages use `template-customers-{subtype}`.
 *
 * The file to edit is always in the theme's `templates/` directory.
 */

const LABELS = {
  "index":            "Home",
  "product":          "Product",
  "collection":       "Collection",
  "page":             "Page",
  "blog":             "Blog",
  "article":          "Article",
  "cart":             "Cart",
  "search":           "Search",
  "404":              "404 Page",
  "password":         "Password Page",
  "gift_card":        "Gift Card",
  "list-collections": "All Collections",
}

// Types that look like they have an alternate segment but are actually compound names
const COMPOUND_TYPES = new Set(["list-collections", "gift-card"])

function resolveTemplate(cls) {
  // Strip trailing dashes — some themes emit `template-index-` instead of `template-index`
  const rest = cls.replace("template-", "").replace(/-$/, "")

  // Customer sub-pages: template-customers-{subtype}
  if (rest.startsWith("customers-")) {
    const subtype = rest.replace("customers-", "")
    return {
      templateType: `customers/${subtype}`,
      templateFile: `templates/customers/${subtype}.liquid`,
      label: `Customer: ${subtype.replace(/_/g, " ")}`,
    }
  }

  // Compound names that aren't alternate templates
  if (COMPOUND_TYPES.has(rest)) {
    const normalized = rest === "gift-card" ? "gift_card" : rest
    return {
      templateType: rest,
      templateFile: `templates/${normalized}.liquid`,
      label: LABELS[normalized] ?? rest,
    }
  }

  // Alternate template: template-{base}-{name}  e.g. template-product-special
  // Some themes append a trailing dash (template-index-) — treat that as standard, not alternate
  const dashIdx = rest.indexOf("-")
  if (dashIdx !== -1) {
    const base = rest.slice(0, dashIdx)
    const alternate = rest.slice(dashIdx + 1)
    const knownBase = base in LABELS || ["index","product","collection","page","blog","article","cart","search","404","password"].includes(base)
    if (knownBase && alternate) {
      return {
        templateType: base,
        templateFile: `templates/${base}.${alternate}.liquid`,
        label: `${LABELS[base] ?? base} (${alternate})`,
      }
    }
  }

  // Standard template: template-{type}
  const normalized = rest === "gift-card" ? "gift_card" : rest
  return {
    templateType: rest,
    templateFile: `templates/${normalized}.liquid`,
    label: LABELS[normalized] ?? rest,
  }
}

export default {
  platform: "shopify",

  detect({ hasShopifyObject, hasShopifyCdn, hasShopifyMeta, metaGenerator }) {
    if (hasShopifyObject) return true
    if (hasShopifyMeta)   return true
    if (hasShopifyCdn)    return true
    if (metaGenerator?.toLowerCase().includes("shopify")) return true
    return false
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)
    const tplClass = classes.find(c => c.startsWith("template-"))
    if (!tplClass) return null

    const { templateType, templateFile, label } = resolveTemplate(tplClass)
    return {
      templateType,
      templateFile,
      hierarchy: [templateFile],
      label,
    }
  },
}
