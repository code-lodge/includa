// Minimal preload — exposes a one-way subscriber for setup progress messages
// from the main process to the loading splash. No other privileged APIs are
// reachable from the renderer.
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("a11yScanSetup", {
  onLog: (handler) => {
    const listener = (_event, line) => {
      try { handler(String(line)) } catch { /* ignore */ }
    }
    ipcRenderer.on("setup:log", listener)
    return () => ipcRenderer.removeListener("setup:log", listener)
  }
})
