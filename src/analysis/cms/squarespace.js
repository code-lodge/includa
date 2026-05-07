/**
 * Squarespace detector.
 *
 * Squarespace is a visual builder — templates are not directly editable as files
 * on standard plans. `noEdit: true` signals the UI to show guidance text instead
 * of a template path.
 *
 * Body classes include collection type markers:
 *   collection-type-blog, collection-type-products, collection-type-album,
 *   collection-type-events, item-type-blog, item-type-products
 */

const CLASS_MAP = {
  "collection-type-blog":     { type: "blog",     label: "Blog Collection" },
  "collection-type-products": { type: "products", label: "Products Collection" },
  "collection-type-album":    { type: "album",    label: "Album Collection" },
  "collection-type-events":   { type: "events",   label: "Events Collection" },
  "collection-type-portfolio":{ type: "portfolio",label: "Portfolio Collection" },
  "item-type-blog":           { type: "blog-post",    label: "Blog Post" },
  "item-type-products":       { type: "product",      label: "Product Page" },
}

export default {
  platform: "squarespace",
  noEdit: true,

  detect({ hasSquarespaceCdn, metaGenerator }) {
    if (hasSquarespaceCdn) return true
    if (metaGenerator?.toLowerCase().includes("squarespace")) return true
    return false
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)

    // item-type-* takes priority over collection-type-* (item page within a collection)
    const itemClass = classes.find(c => c.startsWith("item-type-"))
    const entry = itemClass
      ? [itemClass, CLASS_MAP[itemClass]]
      : Object.entries(CLASS_MAP).find(([cls]) => classes.includes(cls))
    if (!entry || !entry[1]) return null

    const [, { type, label }] = entry
    const file = `squarespace/${type}`
    return {
      templateType: type,
      templateFile: file,
      hierarchy: [file],
      label,
    }
  },
}
