import fs from "node:fs/promises"
import { randomBytes } from "node:crypto"
import path from "node:path"

export class ProjectStore {
  constructor(dataDir) {
    this.dataDir = dataDir
    this.filePath = path.join(dataDir, "projects.json")
  }

  async _read() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  async _write(projects) {
    await fs.mkdir(this.dataDir, { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(projects, null, 2), "utf8")
  }

  async list() {
    return this._read()
  }

  async get(id) {
    const projects = await this._read()
    return projects.find((p) => p.id === id) ?? null
  }

  async create({ name, url, options = {} }) {
    const projects = await this._read()
    const project = {
      id: randomBytes(6).toString("hex"),
      name,
      url,
      options,
      createdAt: new Date().toISOString(),
      lastScanAt: null,
      lastScanDir: null,
      lastScanStatus: "never",
      lastViolations: null,
      lastPages: null
    }
    projects.push(project)
    await this._write(projects)
    return project
  }

  async update(id, patch) {
    const projects = await this._read()
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) return null
    projects[idx] = { ...projects[idx], ...patch }
    await this._write(projects)
    return projects[idx]
  }

  async delete(id) {
    const projects = await this._read()
    const filtered = projects.filter((p) => p.id !== id)
    if (filtered.length === projects.length) return false
    await this._write(filtered)
    return true
  }

  scanDir(projectId) {
    return path.join(this.dataDir, "projects", projectId, "scans", new Date().toISOString().replace(/[:.]/g, "-"))
  }
}
