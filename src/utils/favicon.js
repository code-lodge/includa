// Shared favicon snippet for every report template + the live dashboard.
// Reads assets/icon.svg once at module load and inlines it as a data URI so
// reports stay self-contained — no extra files to copy around, no broken
// relative paths after a user moves the report folder somewhere else.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconPath = path.resolve(__dirname, "..", "..", "assets", "icon.svg")

let cachedLink = null

function buildLink() {
  try {
    const svg = fs.readFileSync(iconPath, "utf8")
    const b64 = Buffer.from(svg, "utf8").toString("base64")
    return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${b64}" />`
  } catch {
    // Asset missing — degrade gracefully (no favicon rather than a broken render).
    return ""
  }
}

export function faviconLink() {
  if (cachedLink === null) cachedLink = buildLink()
  return cachedLink
}
