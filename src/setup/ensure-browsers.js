import fs from "node:fs"
import { spawnSync } from "node:child_process"
import { chromium } from "playwright"

function isBrowserInstalled() {
  try {
    return fs.existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

export function ensureBrowsers() {
  if (isBrowserInstalled()) return

  console.log("First-time setup: Playwright Chromium browser not found. Installing now...")
  console.log("(This only happens once)\n")

  const result = spawnSync("npx", ["playwright", "install", "chromium"], {
    stdio: "inherit",
    shell: true
  })

  if (result.error || result.status !== 0) {
    console.error("\nFailed to install Chromium automatically. Run this manually and try again:")
    console.error("  npx playwright install chromium")
    process.exit(1)
  }

  console.log("\nChromium installed. Continuing...\n")
}
