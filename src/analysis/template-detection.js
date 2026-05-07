import { detectTemplate } from "../utils/url-utils.js"

export function annotateTemplates(results) {
  return results.map((page) => {
    const cmsTemplate = page.cms?.templateFile
    return {
      ...page,
      template: cmsTemplate || detectTemplate(page.url)
    }
  })
}

export function buildTemplateSummary(results) {
  const templates = {}

  for (const page of results) {
    if (!templates[page.template]) {
      templates[page.template] = {
        pages: 0,
        totalViolations: 0,
        impacts: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
      }
    }

    templates[page.template].pages += 1
    for (const violation of page.violations) {
      const count = Math.max(1, violation.nodes.length)
      templates[page.template].totalViolations += count
      const impact = violation.impact || "unknown"
      if (Object.hasOwn(templates[page.template].impacts, impact)) {
        templates[page.template].impacts[impact] += count
      }
    }
  }

  return { templates }
}
