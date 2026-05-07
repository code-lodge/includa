import Database from "better-sqlite3"
import path from "node:path"
import { mkdirSync } from "node:fs"
import { detectTemplate } from "../utils/url-utils.js"

export function createStore(reportDir) {
  const dbDir = path.join(reportDir, "raw")
  mkdirSync(dbDir, { recursive: true })

  const db = new Database(path.join(dbDir, "results.db"))

  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = NORMAL")

  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      template TEXT NOT NULL DEFAULT 'page',
      data_json TEXT NOT NULL
    )
  `)

  const insertStmt = db.prepare(
    "INSERT OR REPLACE INTO pages (url, template, data_json) VALUES (?, ?, ?)"
  )
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM pages")
  const urlsStmt = db.prepare("SELECT url FROM pages")

  return {
    insertPage(pageResult) {
      const template = detectTemplate(pageResult.url)
      insertStmt.run(pageResult.url, template, JSON.stringify({ ...pageResult, template }))
    },

    *iteratePages() {
      const stmt = db.prepare("SELECT data_json FROM pages")
      for (const row of stmt.iterate()) {
        yield JSON.parse(row.data_json)
      }
    },

    getCompletedUrls() {
      return urlsStmt.all().map((r) => r.url)
    },

    getPageCount() {
      return countStmt.get().count
    },

    clear() {
      db.exec("DELETE FROM pages")
    },

    close() {
      db.close()
    }
  }
}
