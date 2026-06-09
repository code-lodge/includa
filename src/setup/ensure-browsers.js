import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { spawn, spawnSync } from "node:child_process"

const require = createRequire(import.meta.url)

// IMPORTANT: this module must NOT `import "playwright"`. Playwright reads
// PLAYWRIGHT_BROWSERS_PATH exactly once — when its browser registry is first
// loaded — and caches it for the life of the process. So the browser location
// has to be decided and written to process.env BEFORE anything imports
// Playwright (the crawler and scanner do, transitively). We therefore detect an
// installed Chromium by probing the filesystem directly, never via
// chromium.executablePath().

// Resolve Playwright's own install CLI from the bundled package, never via
// `npx`. End-user machines have no Node/npm on PATH, and a bare `npx playwright`
// would pull the *latest* Playwright (a different Chromium revision) instead of
// the exact one this build expects. We invoke `<runtime> <playwright-core/cli.js>
// install chromium` instead, which always installs the matching revision.
//
// `cli.js` is the package's `bin` entry but is not exposed through the package
// `exports` map, so resolve it from the package directory. In a packaged Electron
// app the file lives in `app.asar.unpacked` (it is in `asarUnpack`); the install
// runs under ELECTRON_RUN_AS_NODE, i.e. plain Node without asar support, so the
// path must point at the unpacked copy.
function playwrightCoreDir() {
  return path.dirname(require.resolve("playwright-core/package.json"))
}

function playwrightCliPath() {
  return path.join(playwrightCoreDir(), "cli.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1")
}

// The exact Chromium build id this Playwright expects (e.g. "1223"). Read from
// the static browsers.json so we don't have to import Playwright. Null if unknown.
function expectedChromiumRevision() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(playwrightCoreDir(), "browsers.json"), "utf8"))
    const entry = (data.browsers || []).find((b) => b.name === "chromium")
    return entry?.revision || null
  } catch {
    return null
  }
}

// Playwright's default (global) browser cache, mirroring its own path logic.
function defaultBrowsersDir() {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    return path.join(localAppData, "ms-playwright")
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright")
  }
  return path.join(os.homedir(), ".cache", "ms-playwright")
}

// Absolute path to the Chromium executable inside a `chromium-<rev>` folder, or
// null. Handles the per-platform layout Playwright unpacks into.
function chromiumExecutableUnder(revDir) {
  const layouts = process.platform === "win32"
    ? [["chrome-win64", "chrome.exe"], ["chrome-win", "chrome.exe"]]
    : process.platform === "darwin"
      ? [["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"]]
      : [["chrome-linux", "chrome"]]
  for (const rel of layouts) {
    const candidate = path.join(revDir, ...rel)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

// A Chromium install is only usable if extraction finished. The pre-1.60
// Playwright extraction bug on Node >=24.16 left the main binary in place but
// dropped companion files, so on Windows we also require icudtl.dat (one of the
// files that went missing) before trusting the install.
function installComplete(revDir) {
  const exe = chromiumExecutableUnder(revDir)
  if (!exe) return false
  if (process.platform === "win32") {
    return fs.existsSync(path.join(path.dirname(exe), "icudtl.dat"))
  }
  return true
}

function hasChromium(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return false
    const rev = expectedChromiumRevision()
    if (rev) return installComplete(path.join(dir, `chromium-${rev}`))
    // Revision unknown — accept any complete chromium-<n> install in the dir.
    return fs.readdirSync(dir)
      .filter((name) => /^chromium-\d+$/.test(name))
      .some((name) => installComplete(path.join(dir, name)))
  } catch {
    return false
  }
}

// Spawn the matching-version Playwright installer. Works in both runtimes:
//   • CLI (plain Node):   process.execPath is `node`; ELECTRON_RUN_AS_NODE is ignored.
//   • Packaged Electron:  process.execPath is the app exe; ELECTRON_RUN_AS_NODE=1
//                         makes it behave as Node so it can run the CLI.
// No `shell: true`, so there is no dependency on PATH.
function spawnInstall({ browsersDir, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    if (browsersDir) env.PLAYWRIGHT_BROWSERS_PATH = browsersDir
    const child = spawn(process.execPath, [playwrightCliPath(), "install", "chromium"], { env })
    child.stdout?.on("data", (chunk) => { try { onProgress?.(chunk.toString()) } catch { /* ignore */ } })
    child.stderr?.on("data", (chunk) => { try { onProgress?.(chunk.toString()) } catch { /* ignore */ } })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Playwright install exited with code ${code}`))
    })
  })
}

// Synchronous version used by the CLI — keeps a tidy single-process flow and
// installs into Playwright's default (or already-configured) cache.
export function ensureBrowsers() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowsersDir()
  if (hasChromium(dir)) return

  console.log("First-time setup: Playwright Chromium browser not found. Installing now...")
  console.log("(This only happens once)\n")

  const result = spawnSync(process.execPath, [playwrightCliPath(), "install", "chromium"], {
    stdio: "inherit"
  })

  if (result.error || result.status !== 0) {
    console.error("\nFailed to install Chromium automatically. Run this manually and try again:")
    console.error("  npx playwright install chromium")
    process.exit(1)
  }

  console.log("\nChromium installed. Continuing...\n")
}

/**
 * Resolve a usable Chromium for the embedded (Electron) host and point Playwright
 * at it by setting PLAYWRIGHT_BROWSERS_PATH. MUST be called before the scan code
 * (and therefore Playwright) is imported, so the value is read fresh.
 *
 * Hybrid strategy, in priority order:
 *   1. Bundled browser shipped inside the installer (read-only, preferred).
 *   2. Playwright's default/global cache (covers dev machines that already have it).
 *   3. A previously-downloaded copy in the writable user-data dir.
 *   4. Download the matching revision into the writable user-data dir.
 *
 * `onProgress` receives installer output for the splash screen (step 4 only).
 * Returns `{ source, dir }` describing what was used.
 */
export async function ensureChromiumForElectron({ bundledDir, downloadDir, onProgress } = {}) {
  // 1. Bundled with the app — the common, fully-offline path.
  if (bundledDir && hasChromium(bundledDir)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledDir
    return { source: "bundled", dir: bundledDir }
  }

  // 2. Default global cache — e.g. a dev machine where `npm install` fetched it.
  const globalDir = defaultBrowsersDir()
  if (hasChromium(globalDir)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = globalDir
    return { source: "global", dir: globalDir }
  }

  if (!downloadDir) {
    throw new Error("No bundled Chromium found and no writable download location was provided.")
  }

  // 3. Already downloaded into the writable user-data dir on a prior run.
  if (hasChromium(downloadDir)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = downloadDir
    return { source: "downloaded", dir: downloadDir }
  }

  // 4. Download now (matching revision, no npx) into the writable dir.
  process.env.PLAYWRIGHT_BROWSERS_PATH = downloadDir
  await spawnInstall({ browsersDir: downloadDir, onProgress })
  if (!hasChromium(downloadDir)) {
    throw new Error("Chromium installation completed but the browser is still missing or incomplete.")
  }
  return { source: "downloaded", dir: downloadDir }
}
