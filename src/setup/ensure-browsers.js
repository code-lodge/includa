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

// Read Playwright's static browsers.json (build ids per browser) without
// importing Playwright. Null if unreadable.
function readBrowsersJson() {
  try {
    return JSON.parse(fs.readFileSync(path.join(playwrightCoreDir(), "browsers.json"), "utf8"))
  } catch {
    return null
  }
}

// The Chromium components a scan needs: full `chromium` (headed launches) and
// `chromium-headless-shell` (what headless launches use — the default in
// Playwright >=1.49). Derived from browsers.json so it tracks version changes,
// and scoped to the default-installed chromium family (not tip-of-tree).
function requiredChromiumComponents(data) {
  return (data?.browsers || [])
    .filter((b) => b.installByDefault && /^chromium(-headless-shell)?$/.test(b.name))
    .map((b) => ({ name: b.name, revision: b.revision }))
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

// Is one Chromium component fully extracted under `browsersDir`? The component
// folder is e.g. `chromium-1223` or `chromium_headless_shell-1223` (Playwright
// turns dashes into underscores), with the binary in a single platform subfolder.
// We don't hard-code the subfolder name (it varies by arch); we look for the
// expected executable inside it. The pre-1.60 extraction bug on Node >=24.16 left
// the binary but dropped companion files, so on Windows we also require icudtl.dat.
function componentComplete(browsersDir, name, revision) {
  const compDir = path.join(browsersDir, `${name.replace(/-/g, "_")}-${revision}`)
  if (!fs.existsSync(compDir)) return false

  const exeName = name.includes("headless")
    ? (process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell")
    : (process.platform === "win32" ? "chrome.exe" : "chrome")

  let subdirs
  try {
    subdirs = fs.readdirSync(compDir, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return false
  }

  for (const entry of subdirs) {
    const folder = path.join(compDir, entry.name)
    if (fs.existsSync(path.join(folder, exeName))) {
      if (process.platform === "win32") return fs.existsSync(path.join(folder, "icudtl.dat"))
      return true
    }
    // macOS full chromium lives inside the .app bundle.
    if (process.platform === "darwin" &&
        fs.existsSync(path.join(folder, "Chromium.app", "Contents", "MacOS", "Chromium"))) {
      return true
    }
  }
  return false
}

// True only if every required Chromium component is present and fully extracted.
function hasChromium(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return false
    const components = requiredChromiumComponents(readBrowsersJson())
    if (components.length === 0) return false
    return components.every((c) => componentComplete(dir, c.name, c.revision))
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
