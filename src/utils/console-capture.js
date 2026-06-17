import { format } from "node:util"
import { logBus } from "./log-bus.js"

// Wrap the global console so every message also lands in the log bus, without
// touching the hundreds of existing console.* call sites (scan logger, dashboard
// server, stray library output). Original behaviour is preserved — lines still
// print to the terminal — and ANSI colour codes (chalk) are stripped before
// storage so the in-app console and log file stay clean.

// Matches a CSI SGR colour sequence: ESC [ ... m  (e.g. chalk's red/green wraps).
// Built from the ESC char code to avoid brittle escaping of control characters.
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g")

// console method -> log level. console.error/warn carry their own severity;
// the scan logger routes errors/warnings through those methods (see logger.js)
// so levels survive capture.
const METHOD_LEVEL = [
  ["log", "info"],
  ["info", "info"],
  ["warn", "warn"],
  ["error", "error"],
  ["debug", "debug"]
]

let installed = false

export function installConsoleCapture() {
  if (installed) return
  installed = true
  for (const [method, level] of METHOD_LEVEL) {
    if (typeof console[method] !== "function") continue
    const original = console[method].bind(console)
    console[method] = (...args) => {
      original(...args)
      try {
        logBus.append(level, format(...args).replace(ANSI, ""), "console")
      } catch { /* never let logging break the app */ }
    }
  }
}
