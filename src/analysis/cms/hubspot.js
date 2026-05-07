/**
 * HubSpot CMS detector.
 *
 * HubSpot CMS Hub pages expose window.hbspt and load scripts from hs-scripts.com.
 * Body classes include: blog-post, blog-listing, landing-page, site-page, error-page.
 *
 * Templates are HubL (.html) files managed in the Design Manager. There is no
 * local file hierarchy — the template path comes from the HubSpot portal.
 */

const CLASS_MAP = {
  "blog-post":    { type: "blog-post",    label: "Blog Post",     file: "templates/blog-post.html" },
  "blog-listing": { type: "blog-listing", label: "Blog Listing",  file: "templates/blog-listing.html" },
  // HubSpot blog listing pages often only have "blog" on the body (not "blog-listing")
  "blog":         { type: "blog-listing", label: "Blog Listing",  file: "templates/blog-listing.html" },
  "landing-page": { type: "landing-page", label: "Landing Page",  file: "templates/landing-page.html" },
  "site-page":    { type: "site-page",    label: "Site Page",     file: "templates/site-page.html" },
  "error-page":   { type: "error-page",   label: "Error Page",    file: "templates/error-page.html" },
}

export default {
  platform: "hubspot",

  detect({ hasHubspot, hasHubspotCdn, metaGenerator }) {
    if (hasHubspot) return true
    if (hasHubspotCdn) return true
    if (metaGenerator?.toLowerCase().includes("hubspot")) return true
    return false
  },

  detectTemplate({ bodyClass }) {
    if (!bodyClass) return null
    const classes = bodyClass.trim().split(/\s+/).filter(Boolean)

    const entry = Object.entries(CLASS_MAP).find(([cls]) => classes.includes(cls))
    if (!entry) return null

    const [, { type, label, file }] = entry
    return {
      templateType: type,
      templateFile: file,
      hierarchy: [file],
      label,
    }
  },
}
