import { app, BrowserWindow, dialog, shell, Menu, ipcMain } from "electron"
import path from "node:path"
import net from "node:net"
import { fileURLToPath } from "node:url"
import { logBus } from "../src/utils/log-bus.js"
import { installConsoleCapture } from "../src/utils/console-capture.js"

// Capture console output into the shared log bus as early as possible, so even
// the earliest startup messages reach the in-app console and the on-disk log.
installConsoleCapture()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow = null

async function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => tester.close(() => resolve(true)))
      .listen(port, "127.0.0.1")
  })
}

async function findAvailablePort(start = 4175, range = 25) {
  for (let p = start; p < start + range; p++) {
    if (await isPortFree(p)) return p
  }
  throw new Error(`No available port in range ${start}-${start + range - 1}`)
}

function notifySetupFailed(message) {
  logBus.append("error", message, "setup")
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("setup:failed", { message, logs: logBus.recent(120) })
  }
}

// Prepare the Chromium engine, start the dashboard server, and load the app UI.
// Kept separate from window creation so it can be retried from the splash screen
// when first-time setup fails (e.g. a transient network hiccup during download).
async function prepareAndLaunch() {
  // We ship a matching Chromium inside the installer (extraResources ->
  // resources/pw-browsers); if that copy is missing we fall back to downloading
  // the matching revision into the writable user-data dir. ensureChromiumForElectron
  // sets PLAYWRIGHT_BROWSERS_PATH so the in-process scan finds the browser.
  const bundledDir = app.isPackaged
    ? path.join(process.resourcesPath, "pw-browsers")
    : path.join(__dirname, "pw-browsers")
  const downloadDir = path.join(app.getPath("userData"), "pw-browsers")

  const { ensureChromiumForElectron } = await import("../src/setup/ensure-browsers.js")
  try {
    const result = await ensureChromiumForElectron({
      bundledDir,
      downloadDir,
      onProgress: (line) => {
        const text = String(line).trim()
        if (text) logBus.append("info", text, "setup")
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("setup:log", line)
      }
    })
    logBus.append("success", `Chromium ready (${result.source})`, "setup")
  } catch (err) {
    notifySetupFailed(
      `Could not prepare the Chromium browser engine that scanning needs.\n\n${err.message}`
    )
    return // keep the app on the splash so the user can read the log and retry
  }

  // Start the dashboard server on a free port, with data under userData.
  const dataDir = path.join(app.getPath("userData"), "projects")
  let port
  try {
    port = await findAvailablePort(4175)
    const { serveDashboard } = await import("../src/reporting/dashboard-server.js")
    await serveDashboard({ dataDir, port })
  } catch (err) {
    notifySetupFailed(`The dashboard server failed to start.\n\n${err.message}`)
    return
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`)
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" })
  }
}

async function bootstrap() {
  // Window-runtime icon: required for Linux + dev-mode Windows/macOS (where the
  // exe-embedded .ico / .app-bundle .icns aren't applicable). PNG works on all
  // three platforms; the packaged .ico/.icns continue to win on Windows/macOS
  // for the launcher / dock icon.
  const iconPath = path.join(__dirname, "build", "icon.png")

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Includa",
    icon: iconPath,
    backgroundColor: "#0f1117",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  })

  mainWindow.once("ready-to-show", () => mainWindow.show())
  await mainWindow.loadFile(path.join(__dirname, "loading.html"))
  await prepareAndLaunch()
}

// Hide the default menu in production; keep dev tools accessible in dev.
function configureMenu() {
  if (isDev) return
  Menu.setApplicationMenu(null)
}

// Open all external links in the user's default browser.
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" }
    }
    shell.openExternal(url)
    return { action: "deny" }
  })
})

app.whenReady().then(() => {
  // Windows taskbar grouping: without this, the running app isn't recognised
  // as the same identity as the pinned/installed shortcut, so the correct icon
  // doesn't always stick. Must match build.appId in package.json.
  if (process.platform === "win32") {
    app.setAppUserModelId("com.code-lodge.includa")
  }

  // Mirror logs to a file under the user-data dir so failures that happen before
  // (or instead of) the UI loading are still recoverable for bug reports.
  logBus.configureFile(path.join(app.getPath("userData"), "logs"))

  // Splash "Retry" button: re-run first-time setup without restarting the app.
  ipcMain.handle("setup:retry", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadFile(path.join(__dirname, "loading.html"))
    }
    await prepareAndLaunch()
  })

  // Splash "Quit" button.
  ipcMain.on("app:quit", () => app.quit())

  configureMenu()
  return bootstrap()
}).catch((err) => {
  dialog.showErrorBox("Startup failed", err.stack || err.message)
  app.quit()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
