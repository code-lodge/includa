const IMPACT_WEIGHT = { critical: 4, serious: 3, moderate: 2, minor: 1, unknown: 0.5 }

function normalizeSelector(target) {
  const raw = Array.isArray(target) ? target.join(" >> ") : String(target ?? "")
  return raw
    .replace(/#([a-zA-Z_-]*)\d+[a-zA-Z0-9_-]*/g, "#[id]")
    .replace(/\[id="[^"]*\d+[^"]*"\]/g, "[id]")
    .replace(/:nth-child\(\d+\)/g, ":nth-child(n)")
    .replace(/:nth-of-type\(\d+\)/g, ":nth-of-type(n)")
}

function fingerprintNode(ruleId, nodeTarget) {
  return `${ruleId}::${normalizeSelector(nodeTarget)}`
}

export function buildUniqueViolations(resultsWithTemplates) {
  const map = new Map()

  for (const page of resultsWithTemplates) {
    for (const violation of page.violations) {
      for (const node of violation.nodes) {
        const fp = fingerprintNode(violation.id, node.target)

        if (!map.has(fp)) {
          map.set(fp, {
            fingerprint: fp,
            ruleId: violation.id,
            impact: violation.impact,
            help: violation.help,
            helpUrl: violation.helpUrl,
            description: violation.description,
            templates: new Set(),
            affectedPages: new Set(),
            occurrences: 0,
            exampleNode: node,
            exampleTemplate: page.template,
            examplePageUrl: page.url,
            cms: page.cms || null,
          })
        }

        const entry = map.get(fp)
        entry.occurrences += 1
        entry.templates.add(page.template)
        entry.affectedPages.add(page.url)

        // Prefer an example node that has a screenshot
        if (node.screenshotPath && !entry.exampleNode.screenshotPath) {
          entry.exampleNode = node
          entry.exampleTemplate = page.template
          entry.examplePageUrl = page.url
        }
      }
    }
  }

  const items = Array.from(map.values()).map((entry) => ({
    fingerprint: entry.fingerprint,
    ruleId: entry.ruleId,
    impact: entry.impact,
    help: entry.help,
    helpUrl: entry.helpUrl,
    description: entry.description,
    templates: Array.from(entry.templates),
    affectedPages: Array.from(entry.affectedPages),
    pageCount: entry.affectedPages.size,
    occurrences: entry.occurrences,
    priorityScore: (IMPACT_WEIGHT[entry.impact] ?? 0.5) * entry.occurrences,
    exampleNode: entry.exampleNode,
    exampleTemplate: entry.exampleTemplate,
    examplePageUrl: entry.examplePageUrl,
    cms: entry.cms,
  }))

  items.sort((a, b) => b.priorityScore - a.priorityScore || b.occurrences - a.occurrences)

  return { uniqueViolations: items, totalUnique: items.length }
}
