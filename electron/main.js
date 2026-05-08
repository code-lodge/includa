import { app, BrowserWindow, dialog, shell, Menu } from "electron"
import path from "node:path"
import net from "node:net"
import { fileURLToPath } from "node:url"

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

async function bootstrap() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "a11y-scan",
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

  // First-run: install Playwright Chromium if missing.
  const { ensureBrowsersAsync } = await import("../src/setup/ensure-browsers.js")
  try {
    await ensureBrowsersAsync((line) => {
      mainWindow.webContents.send("setup:log", line)
    })
  } catch (err) {
    dialog.showErrorBox(
      "Setup failed",
      `Could not install the Chromium browser engine.\n\n${err.message}\n\nYou can install it manually with:\n  npx playwright install chromium`
    )
    app.quit()
    return
  }

  // Start the dashboard server on a free port, with data under userData.
  const dataDir = path.join(app.getPath("userData"), "projects")
  const port = await findAvailablePort(4175)

  const { serveDashboard } = await import("../src/reporting/dashboard-server.js")
  try {
    await serveDashboard({ dataDir, port })
  } catch (err) {
    dialog.showErrorBox("Dashboard failed to start", err.message)
    app.quit()
    return
  }

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`)
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" })
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
