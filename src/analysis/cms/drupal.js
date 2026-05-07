/**
 * Drupal CMS detector.
 *
 * Drupal 8/9/10 uses Twig templates (.html.twig).
 * Template resolution is driven by the body classes emitted by Drupal's
 * theme system and the page path structure.
 *
 * Hierarchy doc: https://www.drupal.org/docs/theming-drupal/twig-in-drupal/twig-template-naming-conventions
 */

// Body-class prefix → { templateType, base template file }
function resolveFromClasses(classes) {
  if (classes.includes("path-frontpage")) {
    return {
      templateType: "front",
      hierarchy: ["page--front.html.twig", "page.html.twig"],
      label: "Front Page",
    }
  }

  // Taxonomy term page
  if (classes.includes("path-taxonomy-term")) {
    const vocabClass = classes.find(c => c.startsWith("vocabulary-"))
    const vocab = vocabClass?.replace("vocabulary-", "")
    return {
      templateType: "taxonomy-term",
      hierarchy: [
        vocab && `taxonomy-term--${vocab}.html.twig`,
        "taxonomy-term.html.twig",
      ].filter(Boolean),
      label: vocab ? `Taxonomy: ${vocab}` : "Taxonomy Term",
    }
  }

  // User pages
  if (classes.includes("path-user")) {
    return {
      templateType: "user",
      hierarchy: ["user.html.twig"],
      label: "User Page",
    }
  }

  // Search results
  if (classes.includes("path-search")) {
    return {
      templateType: "search",
      hierarchy: ["search-results.html.twig", "page.html.twig"],
      label: "Search Results",
    }
  }

  // Node pages — detect content type from body class
  // Drupal adds "node--type-{type}" on node pages
  const nodeTypeClass = classes.find(c => c.startsWith("node--type-"))
  if (nodeTypeClass) {
    const type = nodeTypeClass.replace("node--type-", "")
    return {
      templateType: `node--${type}`,
      hierarchy: [
        `node--${type}--full.html.twig`,
        `node--${type}.html.twig`,
        "node--full.html.twig",
        "node.html.twig",
      ],
      label: `Node: ${type}`,
    }
  }

  // Generic node page (type unknown)
  if (classes.includes("path-node")) {
    return {
      templateType: "node",
      hierarchy: ["node--full.html.twig", "node.html.twig"],
      label: "Node Page",
    }
  }

  // Views pages: class is "view-{machine-name}"
  const viewClass = classes.find(c => c.startsWith("view-") && !c.startsWith("view-dom-id-"))
  if (viewClass) {
    const viewName = viewClass.replace("view-", "")
    return {
      templateType: `view--${viewName}`,
      hierarchy: [`views-view--${viewName}.html.twig`, "views-view.html.twig"],
      label: `View: ${viewName}`,
    }
  }

  // Fallback: generic page
  return {
    templateType: "page",
    hierarchy: ["page.html.twig"],
    label: "Page",
  }
}

// Body class prefixes that are uniquely Drupal — no other CMS uses these
const DRUPAL_BODY_MARKERS = ["path-frontpage", "path-node", "path-taxonomy-term", "path-user", "path-search"]

export default {
  platform: "drupal",

  detect({ metaGenerator, hasDrupal, bodyClass }) {
    if (metaGenerator?.toLowerCase().includes("drupal")) return true
    if (hasDrupal) return true
    if (bodyClass) {
      const classes = bodyClass.split(/\s+/)
      if (DRUPAL_BODY_MARKERS.some(m => classes.includes(m))) return true
      if (classes.some(c => c.startsWith("node--type-") || c.startsWith("view-dom-id-"))) return true
    }
    return false
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)

    const { templateType, hierarchy, label } = resolveFromClasses(classes)
    return {
      templateType,
      templateFile: hierarchy[0],
      hierarchy,
      label,
    }
  },
}
