// One-shot generator for all the brand assets:
//   assets/icon-{16,32,64,128,256,512,1024}.png
//   assets/banner.png  (1280x400 — for the README)
//   assets/og-image.png (1200x630 — for social sharing)
//   electron/build/icon.png  (512x512 Linux)
//   electron/build/icon.ico  (Windows multi-image)
//   electron/build/icon.icns (macOS)
//   site/favicon.svg
//   site/favicon.png
//   site/apple-touch-icon.png
//
// Strategy: each SVG is rendered inside a Playwright page so the browser does
// the rasterisation. That gives us perfect anti-aliasing without depending on
// node-canvas or sharp (both of which have native-module pain).

import { chromium } from "playwright"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import png2icons from "png2icons"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")

const ICON_SVG = await fs.readFile(path.join(projectRoot, "assets/icon.svg"), "utf-8")
const BANNER_SVG = await fs.readFile(path.join(projectRoot, "assets/banner.svg"), "utf-8")

async function svgToPng(browser, svgString, viewportW, viewportH, intrinsicW, intrinsicH) {
  // Wrap the SVG in a minimal HTML host so the browser renders at the
  // requested viewport size with no body chrome around it.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: ${viewportW}px; height: ${viewportH}px; }
</style>
</head><body>${svgString.replace(/<svg /, `<svg width="${viewportW}" height="${viewportH}" preserveAspectRatio="xMidYMid meet" `)}</body></html>`

  const ctx = await browser.newContext({
    viewport: { width: viewportW, height: viewportH },
    deviceScaleFactor: 1
  })
  const page = await ctx.newPage()
  await page.setContent(html)
  // Let the SVG settle (gradients + decoration)
  await page.waitForTimeout(100)
  const buf = await page.screenshot({ omitBackground: true, type: "png" })
  await ctx.close()
  return buf
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

async function main() {
  await ensureDir(path.join(projectRoot, "assets"))
  await ensureDir(path.join(projectRoot, "electron/build"))
  await ensureDir(path.join(projectRoot, "site"))

  const browser = await chromium.launch()
  try {
    console.log("Rendering icon at multiple sizes…")
    const iconSizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    const iconPngs = {}
    for (const size of iconSizes) {
      const buf = await svgToPng(browser, ICON_SVG, size, size, 1024, 1024)
      iconPngs[size] = buf
      await fs.writeFile(path.join(projectRoot, "assets", `icon-${size}.png`), buf)
      console.log(`  → assets/icon-${size}.png`)
    }

    console.log("Rendering banner (1280x400)…")
    const bannerBuf = await svgToPng(browser, BANNER_SVG, 1280, 400, 1280, 400)
    await fs.writeFile(path.join(projectRoot, "assets/banner.png"), bannerBuf)
    console.log("  → assets/banner.png")

    console.log("Rendering OG image (1200x630)…")
    // For OG, render the banner taller / centred. We re-use the banner SVG
    // by stretching the viewport — the SVG's preserveAspectRatio makes it
    // letterbox cleanly with the radial glows filling the extra space.
    const ogBuf = await svgToPng(browser, BANNER_SVG, 1200, 630, 1280, 400)
    await fs.writeFile(path.join(projectRoot, "site/og-image.png"), ogBuf)
    console.log("  → site/og-image.png")

    // Electron icons
    console.log("Writing Electron build icons…")
    await fs.writeFile(path.join(projectRoot, "electron/build/icon.png"), iconPngs[512])
    console.log("  → electron/build/icon.png (512x512, Linux)")

    const sourcePngForIcons = iconPngs[1024]
    const ico = png2icons.createICO(sourcePngForIcons, png2icons.BICUBIC, 0, false, true)
    if (!ico) throw new Error("png2icons.createICO returned null")
    await fs.writeFile(path.join(projectRoot, "electron/build/icon.ico"), ico)
    console.log("  → electron/build/icon.ico (Windows)")

    const icns = png2icons.createICNS(sourcePngForIcons, png2icons.BICUBIC, 0)
    if (!icns) throw new Error("png2icons.createICNS returned null")
    await fs.writeFile(path.join(projectRoot, "electron/build/icon.icns"), icns)
    console.log("  → electron/build/icon.icns (macOS)")

    // Site favicons
    console.log("Writing site favicons…")
    await fs.writeFile(path.join(projectRoot, "site/favicon.svg"), ICON_SVG)
    await fs.writeFile(path.join(projectRoot, "site/favicon.png"), iconPngs[32])
    await fs.writeFile(path.join(projectRoot, "site/apple-touch-icon.png"), iconPngs[256])
    const faviconIco = png2icons.createICO(iconPngs[256], png2icons.BICUBIC, 0, false, true)
    if (faviconIco) await fs.writeFile(path.join(projectRoot, "site/favicon.ico"), faviconIco)
    console.log("  → site/favicon.svg")
    console.log("  → site/favicon.png (32x32)")
    console.log("  → site/favicon.ico")
    console.log("  → site/apple-touch-icon.png (256x256)")

    console.log("\nDone. Assets generated.")
  } finally {
    await browser.close()
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
