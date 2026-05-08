// Minimal streaming ZIP writer (no external deps).
// Supports stored + deflate; UTF-8 filenames; not zip64. Sufficient for a11y-scan exports.

import zlib from "node:zlib"
import { promisify } from "node:util"
import fs from "node:fs/promises"

const deflateRaw = promisify(zlib.deflateRaw)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff]
  return (c ^ 0xffffffff) >>> 0
}

function dosTimeDate(date) {
  const yr = date.getFullYear()
  const safeYear = yr < 1980 ? 1980 : yr
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f)
  const day = (((safeYear - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
  return { time, day }
}

const ALREADY_COMPRESSED = /\.(png|jpe?g|gif|webp|avif|woff2?|zip|gz|mp[34]|mov)$/i

export class ZipWriter {
  constructor(writeStream) {
    this.stream = writeStream
    this.offset = 0
    this.entries = []
  }

  _write(buf) {
    return new Promise((resolve, reject) => {
      const ok = this.stream.write(buf, (err) => {
        if (err) reject(err)
        else if (ok) resolve()
      })
      if (!ok) this.stream.once("drain", resolve)
    })
  }

  async addBuffer(name, buf, mtime = new Date()) {
    const filename = Buffer.from(name, "utf8")
    const uncompressed = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    const crc = crc32(uncompressed)
    let data = uncompressed
    let method = 0
    if (!ALREADY_COMPRESSED.test(name) && uncompressed.length > 32) {
      const compressed = await deflateRaw(uncompressed, { level: 6 })
      if (compressed.length < uncompressed.length) {
        data = compressed
        method = 8
      }
    }
    const { time, day } = dosTimeDate(mtime)

    const localHeader = Buffer.alloc(30 + filename.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)            // utf-8 filename flag
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(day, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(uncompressed.length, 22)
    localHeader.writeUInt16LE(filename.length, 26)
    localHeader.writeUInt16LE(0, 28)
    filename.copy(localHeader, 30)

    this.entries.push({
      name: filename,
      offset: this.offset,
      crc,
      method,
      compressedSize: data.length,
      uncompressedSize: uncompressed.length,
      time,
      day
    })

    await this._write(localHeader)
    this.offset += localHeader.length
    await this._write(data)
    this.offset += data.length
  }

  async addFile(name, filePath) {
    const buf = await fs.readFile(filePath)
    let mtime
    try { mtime = (await fs.stat(filePath)).mtime } catch { mtime = new Date() }
    await this.addBuffer(name, buf, mtime)
  }

  async finish() {
    const cdStart = this.offset
    for (const e of this.entries) {
      const cd = Buffer.alloc(46 + e.name.length)
      cd.writeUInt32LE(0x02014b50, 0)
      cd.writeUInt16LE(0x031e, 4)                   // version made by
      cd.writeUInt16LE(20, 6)
      cd.writeUInt16LE(0x0800, 8)
      cd.writeUInt16LE(e.method, 10)
      cd.writeUInt16LE(e.time, 12)
      cd.writeUInt16LE(e.day, 14)
      cd.writeUInt32LE(e.crc, 16)
      cd.writeUInt32LE(e.compressedSize, 20)
      cd.writeUInt32LE(e.uncompressedSize, 24)
      cd.writeUInt16LE(e.name.length, 28)
      cd.writeUInt16LE(0, 30)
      cd.writeUInt16LE(0, 32)
      cd.writeUInt16LE(0, 34)
      cd.writeUInt16LE(0, 36)
      cd.writeUInt32LE(0, 38)
      cd.writeUInt32LE(e.offset, 42)
      e.name.copy(cd, 46)
      await this._write(cd)
      this.offset += cd.length
    }

    const cdSize = this.offset - cdStart
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(this.entries.length, 8)
    eocd.writeUInt16LE(this.entries.length, 10)
    eocd.writeUInt32LE(cdSize, 12)
    eocd.writeUInt32LE(cdStart, 16)
    eocd.writeUInt16LE(0, 20)
    await this._write(eocd)
    this.offset += eocd.length

    await new Promise((resolve, reject) => this.stream.end((err) => err ? reject(err) : resolve()))
  }
}
