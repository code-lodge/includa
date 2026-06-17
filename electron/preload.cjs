// Preload bridge for the loading/splash screen. Exposes a minimal, one-way
// surface for setup progress + failure handling. No general privileged APIs are
// reachable from the renderer (the dashboard UI talks to the local HTTP server,
// not to the main process).
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("includaSetup", {
  // Live install/progress lines emitted during first-time Chromium setup.
  onLog: (handler) => {
    const listener = (_event, line) => {
      try { handler(String(line)) } catch { /* ignore */ }
    }
    ipcRenderer.on("setup:log", listener)
    return () => ipcRenderer.removeListener("setup:log", listener)
  },

  // Setup/server failure. Payload: { message, logs: [{seq, at, level, source, message}] }
  onFailed: (handler) => {
    const listener = (_event, payload) => {
      try { handler(payload || {}) } catch { /* ignore */ }
    }
    ipcRenderer.on("setup:failed", listener)
    return () => ipcRenderer.removeListener("setup:failed", listener)
  },

  // Re-run first-time setup after a failure, without restarting the app.
  retry: () => ipcRenderer.invoke("setup:retry"),

  // Quit the app from the splash failure screen.
  quit: () => ipcRenderer.send("app:quit")
})
