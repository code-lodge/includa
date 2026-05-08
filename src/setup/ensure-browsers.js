import fs from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { chromium } from "playwright"

function isBrowserInstalled() {
  try {
    return fs.existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

// Synchronous version used by the CLI — keeps a tidy single-process flow.
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

// Async version for embedded hosts (Electron) — never blocks the event loop
// and pipes installer output to a progress callback so the splash screen can
// surface what's happening.
export function ensureBrowsersAsync(onProgress) {
  return new Promise((resolve, reject) => {
    if (isBrowserInstalled()) return resolve(false)
    const child = spawn("npx", ["playwright", "install", "chromium"], { shell: true })
    child.stdout.on("data", (chunk) => { try { onProgress?.(chunk.toString()) } catch {} })
    child.stderr.on("data", (chunk) => { try { onProgress?.(chunk.toString()) } catch {} })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolve(true)
      else reject(new Error(`Playwright install exited with code ${code}`))
    })
  })
}
