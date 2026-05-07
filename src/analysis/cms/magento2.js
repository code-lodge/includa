/**
 * Magento 2 CMS detector.
 *
 * Magento 2 sets a body class of the form `{route}-{controller}-{action}`,
 * e.g. `catalog-product-view`, `catalog-category-view`, `checkout-cart-index`.
 *
 * These map to PHTML template files within the relevant module's `templates/`
 * directory, e.g. `Magento_Catalog::product/view.phtml`.
 *
 * Ref: https://developer.adobe.com/commerce/frontend-core/guide/layouts/
 */

// Maps body class pattern → { templateType, templateFile, label }
// Route-controller-action triplets, most common first.
const ROUTES = [
  { match: "catalog-product-view",     type: "product-view",     file: "Magento_Catalog::product/view.phtml",           label: "Product Page" },
  { match: "catalog-category-view",    type: "category-view",    file: "Magento_Catalog::category/view.phtml",          label: "Category Page" },
  { match: "cms-index-index",          type: "cms-home",         file: "Magento_Cms::page.phtml",                       label: "CMS Home" },
  { match: "cms-page-view",            type: "cms-page",         file: "Magento_Cms::page.phtml",                       label: "CMS Page" },
  { match: "checkout-cart-index",      type: "cart",             file: "Magento_Checkout::cart.phtml",                  label: "Cart" },
  { match: "checkout-index-index",     type: "checkout",         file: "Magento_Checkout::onepage/success.phtml",       label: "Checkout" },
  { match: "catalogsearch-result-index", type: "search-results", file: "Magento_CatalogSearch::result.phtml",          label: "Search Results" },
  { match: "customer-account-index",   type: "account",          file: "Magento_Customer::account/index.phtml",         label: "Account Dashboard" },
  { match: "customer-account-login",   type: "login",            file: "Magento_Customer::form/login.phtml",            label: "Login" },
  { match: "customer-account-create",  type: "register",         file: "Magento_Customer::form/register.phtml",         label: "Register" },
]

export default {
  platform: "magento2",

  detect({ hasMagento, hasMagentoCdn, metaGenerator }) {
    if (hasMagento) return true
    if (hasMagentoCdn) return true
    if (metaGenerator?.toLowerCase().includes("magento")) return true
    return false
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)

    for (const route of ROUTES) {
      if (classes.includes(route.match)) {
        return {
          templateType: route.type,
          templateFile: route.file,
          hierarchy: [route.file],
          label: route.label,
        }
      }
    }

    // Generic fallback: detect any `{route}-{controller}-{action}` triplet
    const triplet = classes.find(c => /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*){2}$/.test(c))
    if (triplet) {
      const [route, controller, action] = triplet.split("-")
      return {
        templateType: triplet,
        templateFile: `Magento_${capitalize(route)}::${controller}/${action}.phtml`,
        hierarchy: [`Magento_${capitalize(route)}::${controller}/${action}.phtml`],
        label: `${capitalize(route)}: ${controller}/${action}`,
      }
    }

    return null
  },
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
