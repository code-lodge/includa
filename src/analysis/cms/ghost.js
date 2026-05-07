/**
 * Ghost CMS detector.
 *
 * Ghost adds body classes like `home-template`, `post-template`, `tag-template`,
 * `author-template`, `error-template`, and `page-template` that map directly
 * to Handlebars (.hbs) template files in the theme's root directory.
 *
 * Hierarchy doc: https://ghost.org/docs/themes/structure/
 */

const TEMPLATE_MAP = {
  "home-template":    { type: "home",    files: ["home.hbs", "index.hbs"],   label: "Home" },
  "post-template":    { type: "post",    files: ["post.hbs", "index.hbs"],   label: "Post" },
  "page-template":    { type: "page",    files: ["page.hbs", "post.hbs", "index.hbs"], label: "Page" },
  "tag-template":     { type: "tag",     files: ["tag.hbs", "index.hbs"],    label: "Tag Archive" },
  "author-template":  { type: "author",  files: ["author.hbs", "index.hbs"], label: "Author Archive" },
  "error-template":   { type: "error",   files: ["error.hbs", "index.hbs"],  label: "Error Page" },
  "private-template": { type: "private", files: ["private.hbs", "index.hbs"], label: "Private Site" },
}

export default {
  platform: "ghost",

  detect({ metaGenerator, hasGhost }) {
    if (metaGenerator?.toLowerCase().includes("ghost")) return true
    if (hasGhost) return true
    return false
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)

    // Ghost also adds custom page slugs as `page-{slug}` alongside `page-template`
    const entry = Object.entries(TEMPLATE_MAP).find(([cls]) => classes.includes(cls))
    if (!entry) return null

    const [, { type, files, label }] = entry

    // Detect custom page slug template: page-{slug}.hbs
    let hierarchy = files
    if (type === "page") {
      const slugClass = classes.find(c => c.startsWith("page-") && c !== "page-template")
      if (slugClass) {
        const slug = slugClass.replace("page-", "")
        hierarchy = [`page-${slug}.hbs`, ...files]
      }
    }

    // Detect custom tag/author slug template: tag-{slug}.hbs / author-{slug}.hbs
    if (type === "tag") {
      const slugClass = classes.find(c => c.startsWith("tag-") && c !== "tag-template")
      if (slugClass) {
        const slug = slugClass.replace("tag-", "")
        hierarchy = [`tag-${slug}.hbs`, ...files]
      }
    }
    if (type === "author") {
      const slugClass = classes.find(c => c.startsWith("author-") && c !== "author-template")
      if (slugClass) {
        const slug = slugClass.replace("author-", "")
        hierarchy = [`author-${slug}.hbs`, ...files]
      }
    }

    return {
      templateType: type,
      templateFile: hierarchy[0],
      hierarchy,
      label,
    }
  },
}
