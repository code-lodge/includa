#!/usr/bin/env node
// Build-time step: download the exact Chromium build this version of Playwright
// expects into electron/pw-browsers/, so electron-builder can ship it as a
// bundled resource (see the "extraResources" entry in package.json's build
// config). This makes the first scan work instantly and fully offline, with no
// runtime download. Run automatically by the `build*` npm scripts.
//
// CommonJS (.cjs) so it runs directly under Node regardless of the package's
// "type": "module" setting, and resolves Playwright from the project tree.

const path = require("node:path")
const { spawnSync } = require("node:child_process")

const browsersDir = path.join(__dirname, "..", "electron", "pw-browsers")
const cliPath = path.join(path.dirname(require.resolve("playwright-core/package.json")), "cli.js")

console.log(`[install-browser] Installing Chromium for bundling into:\n  ${browsersDir}`)

const result = spawnSync(process.execPath, [cliPath, "install", "chromium"], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir }
})

if (result.error) {
  console.error(`[install-browser] Failed to spawn installer: ${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`[install-browser] Playwright install exited with code ${result.status}`)
  process.exit(result.status || 1)
}

console.log("[install-browser] Chromium ready for bundling.")
