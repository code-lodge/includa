/**
 * WordPress CMS detector.
 *
 * Template detection works entirely from the body class emitted by
 * WordPress's body_class() filter — no plugin or API required.
 */

// Full WP template hierarchy for each template type, most-specific first.
const HIERARCHY = {
  "front-page": ()  => ["front-page.php", "home.php", "index.php"],
  "home":       ()  => ["home.php", "index.php"],
  "404":        ()  => ["404.php", "index.php"],
  "search":     ()  => ["search.php", "index.php"],
  "date":       ()  => ["date.php", "archive.php", "index.php"],
  "attachment": (s) => [`${s.mimetype}-${s.subtype}.php`, `${s.mimetype}.php`, "attachment.php", "single.php", "singular.php", "index.php"],
  "single":     (s) => [
    s.postType && s.postType !== "post" && `single-${s.postType}.php`,
    "single-post.php",
    "single.php",
    "singular.php",
    "index.php",
  ].filter(Boolean),
  "page":       (s) => [
    s.customTemplate && `${s.customTemplate}.php`,
    s.slug           && `page-${s.slug}.php`,
    s.id             && `page-${s.id}.php`,
    "page.php",
    "singular.php",
    "index.php",
  ].filter(Boolean),
  "category":   (s) => [
    s.slug && `category-${s.slug}.php`,
    s.id   && `category-${s.id}.php`,
    "category.php",
    "archive.php",
    "index.php",
  ].filter(Boolean),
  "tag":        (s) => [
    s.slug && `tag-${s.slug}.php`,
    s.id   && `tag-${s.id}.php`,
    "tag.php",
    "archive.php",
    "index.php",
  ].filter(Boolean),
  "author":     (s) => [
    s.nicename && `author-${s.nicename}.php`,
    s.id       && `author-${s.id}.php`,
    "author.php",
    "archive.php",
    "index.php",
  ].filter(Boolean),
  "taxonomy":   (s) => [
    s.taxonomy && s.term && `taxonomy-${s.taxonomy}-${s.term}.php`,
    s.taxonomy           && `taxonomy-${s.taxonomy}.php`,
    "taxonomy.php",
    "archive.php",
    "index.php",
  ].filter(Boolean),
  "archive":    (s) => [
    s.postType && `archive-${s.postType}.php`,
    "archive.php",
    "index.php",
  ].filter(Boolean),
}

function nonNumeric(str) {
  return !/^\d+$/.test(str)
}

function parseSlots(classes) {
  const s = {}

  const tplClass = classes.find(c => c.startsWith("page-template-") && c !== "page-template-default")
  if (tplClass) s.customTemplate = tplClass.replace("page-template-", "")

  const pageId = classes.find(c => c.startsWith("page-id-"))
  if (pageId) s.id = pageId.replace("page-id-", "")

  const postId = classes.find(c => c.startsWith("postid-"))
  if (postId) s.id = postId.replace("postid-", "")

  const singleType = classes.find(c => c.startsWith("single-") && !c.startsWith("single-format-"))
  if (singleType) s.postType = singleType.replace("single-", "")

  const PAGE_NON_SLUG = new Set(["page-template", "page-parent", "page-child", "page-even", "page-odd"])
  const pageSlug = classes.find(c =>
    c.startsWith("page-") &&
    !c.startsWith("page-id-") &&
    !c.startsWith("page-template-") &&
    !PAGE_NON_SLUG.has(c) &&
    nonNumeric(c.replace("page-", ""))
  )
  if (pageSlug && !classes.includes("archive")) s.slug = pageSlug.replace("page-", "")

  const catSlug = classes.find(c => c.startsWith("category-") && nonNumeric(c.replace("category-", "")))
  if (catSlug) s.slug = catSlug.replace("category-", "")

  const tagSlug = classes.find(c => c.startsWith("tag-") && nonNumeric(c.replace("tag-", "")))
  if (tagSlug) s.slug = tagSlug.replace("tag-", "")

  const authorName = classes.find(c => c.startsWith("author-") && nonNumeric(c.replace("author-", "")))
  if (authorName) s.nicename = authorName.replace("author-", "")

  const taxClass = classes.find(c => c.startsWith("tax-"))
  if (taxClass) {
    s.taxonomy = taxClass.replace("tax-", "")
    const termClass = classes.find(c => c.startsWith("term-") && nonNumeric(c.replace("term-", "")))
    if (termClass) s.term = termClass.replace("term-", "")
  }

  const cptArchive = classes.find(c => c.startsWith("post-type-archive-"))
  if (cptArchive) s.postType = cptArchive.replace("post-type-archive-", "")

  const mimeClass = classes.find(c => c.startsWith("mime-type-"))
  if (mimeClass) {
    const parts = mimeClass.replace("mime-type-", "").split("-")
    s.mimetype = parts[0] || ""
    s.subtype  = parts[1] || ""
  }

  return s
}

function resolveTemplateType(classes) {
  if (classes.includes("error404"))                                    return "404"
  if (classes.includes("search"))                                      return "search"
  if (classes.includes("front-page"))                                  return "front-page"
  // "home" = blog index. WP adds both "home" and "page" when a static page
  // is set as the posts page — is_home() wins, so home.php is used not page.php.
  if (classes.includes("home"))                                        return "home"
  if (classes.includes("attachment"))                                  return "attachment"
  if (classes.includes("single"))                                      return "single"
  if (classes.includes("page"))                                        return "page"
  if (classes.includes("category"))                                    return "category"
  if (classes.includes("tag"))                                         return "tag"
  if (classes.includes("author"))                                      return "author"
  if (classes.includes("date"))                                        return "date"
  if (classes.find(c => c.startsWith("tax-")))                        return "taxonomy"
  if (classes.find(c => c.startsWith("post-type-archive-")))          return "archive"
  if (classes.includes("archive"))                                     return "archive"
  return null
}

function buildLabel(type, slots) {
  switch (type) {
    case "front-page": return "Front Page"
    case "home":       return "Blog Index"
    case "404":        return "404 Page"
    case "search":     return "Search Results"
    case "date":       return "Date Archive"
    case "attachment": return slots.mimetype ? `Attachment (${slots.mimetype})` : "Attachment"
    case "single":     return slots.postType && slots.postType !== "post"
                         ? `Single: ${slots.postType}` : "Single Post"
    case "page":       return slots.customTemplate
                         ? `Page Template: ${slots.customTemplate}`
                         : slots.slug ? `Page: ${slots.slug}` : "Page"
    case "category":   return slots.slug ? `Category: ${slots.slug}` : "Category Archive"
    case "tag":        return slots.slug ? `Tag: ${slots.slug}` : "Tag Archive"
    case "author":     return slots.nicename ? `Author: ${slots.nicename}` : "Author Archive"
    case "taxonomy":   return slots.taxonomy
                         ? (slots.term ? `Taxonomy: ${slots.taxonomy}/${slots.term}` : `Taxonomy: ${slots.taxonomy}`)
                         : "Taxonomy Archive"
    case "archive":    return slots.postType ? `Archive: ${slots.postType}` : "Archive"
    default:           return type
  }
}

const WP_BODY_MARKERS = ["wp-singular", "wp-embed-responsive", "error404", "single-post", "page-template-default"]

export default {
  platform: "wordpress",

  detect({ metaGenerator, bodyClass, hasWpContent, hasWpJson, hasWpEditUri, hasWpEmoji }) {
    if (metaGenerator?.toLowerCase().includes("wordpress")) return true
    if (hasWpContent) return true
    if (hasWpJson)    return true
    if (hasWpEditUri) return true
    if (hasWpEmoji)   return true
    const classes = bodyClass ? bodyClass.split(/\s+/) : []
    return WP_BODY_MARKERS.some(c => classes.includes(c))
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)
    const templateType = resolveTemplateType(classes)
    if (!templateType) return null

    const slots = parseSlots(classes)
    const builder = HIERARCHY[templateType]
    const hierarchy = builder ? builder(slots) : ["index.php"]

    return {
      templateType,
      templateFile: hierarchy[0],
      hierarchy,
      label: buildLabel(templateType, slots),
    }
  },
}
