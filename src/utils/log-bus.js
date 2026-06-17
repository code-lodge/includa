import fs from "node:fs"
import path from "node:path"
import { EventEmitter } from "node:events"

// Central, process-wide log store. Everything that wants to surface a message —
// the scan logger, the dashboard server, the Electron host, captured console
// output — funnels through here. It keeps a bounded in-memory ring buffer (for
// the in-app console), mirrors to a rotating file on disk (so crashes that
// happen before any UI is up are still recoverable), and emits an "entry" event
// per line so live subscribers (SSE stream, splash IPC) can follow along.

const MAX_ENTRIES = 2000
const MAX_FILE_BYTES = 5 * 1024 * 1024
const KNOWN_LEVELS = new Set(["debug", "info", "success", "warn", "error"])

// Severity rank for "minimum level" filtering. success sits with info.
export const LEVEL_RANK = { debug: 0, info: 1, success: 1, warn: 2, error: 3 }

function normalizeLevel(level) {
  return KNOWN_LEVELS.has(level) ? level : "info"
}

class LogBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(0) // many SSE/IPC subscribers may attach
    this.entries = []
    this.seq = 0
    this.stream = null
    this.filePath = null
  }

  // Point the bus at a writable directory and start mirroring to disk. Safe to
  // call once; later calls are ignored. Any entries buffered before the file was
  // ready are flushed so nothing logged during early startup is lost.
  configureFile(dir) {
    if (this.stream) return this.filePath
    try {
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, "includa.log")
      try {
        if (fs.statSync(file).size > MAX_FILE_BYTES) {
          fs.renameSync(file, path.join(dir, "includa.prev.log"))
        }
      } catch { /* no existing file to rotate */ }
      this.stream = fs.createWriteStream(file, { flags: "a" })
      this.filePath = file
      for (const entry of this.entries) this.writeLine(entry)
      this.append("info", `Logging to ${file}`, "system")
    } catch { /* best effort — the in-memory buffer still works without a file */ }
    return this.filePath
  }

  writeLine(entry) {
    if (!this.stream) return
    try {
      this.stream.write(`${entry.at} [${entry.level.toUpperCase().padEnd(7)}] ${entry.source}: ${entry.message}\n`)
    } catch { /* ignore write errors; never let logging crash the app */ }
  }

  append(level, message, source = "app") {
    const entry = {
      seq: ++this.seq,
      at: new Date().toISOString(),
      level: normalizeLevel(level),
      source: String(source || "app"),
      message: typeof message === "string" ? message : String(message)
    }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.shift()
    this.writeLine(entry)
    this.emit("entry", entry)
    return entry
  }

  // Most recent entries, oldest first, capped at `limit`.
  recent(limit = MAX_ENTRIES) {
    if (!Number.isFinite(limit) || limit >= this.entries.length) return this.entries.slice()
    return this.entries.slice(-limit)
  }
}

export const logBus = new LogBus()
export { MAX_ENTRIES }
