/* node render-any.js <scene.html> <durationSeconds> <outDir> <fps> [t1,t2,...] */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const SCENE = process.argv[2]
const DURATION = Number(process.argv[3])
const OUT = process.argv[4]
const FPS = Number(process.argv[5] || 30)
const SAMPLES = process.argv[6] ? process.argv[6].split(',').map(Number) : null

;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
  })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await page.goto('file://' + path.resolve(SCENE))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)

  await page.evaluate(() => {
    window.__anims = document.getAnimations()
    window.__anims.forEach((a) => a.pause())
    // Two rAFs: compositor-driven properties are not on screen at seek time,
    // and screenshotting without the wait yields the previous frame.
    window.__seek = (ms) => {
      window.__anims.forEach((a) => { try { a.currentTime = ms } catch {} })
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))
    }
  })
  console.log('animations:', await page.evaluate(() => window.__anims.length))

  const times = SAMPLES || Array.from({ length: Math.round(DURATION * FPS) }, (_, i) => i / FPS)
  let i = 0
  for (const t of times) {
    await page.evaluate((ms) => window.__seek(ms), t * 1000)
    const name = SAMPLES ? `t${t.toFixed(2).replace('.', '_')}.png` : `f${String(i).padStart(5, '0')}.jpg`
    await page.screenshot({ path: path.join(OUT, name), type: SAMPLES ? 'png' : 'jpeg', quality: SAMPLES ? undefined : 92 })
    i++
    if (!SAMPLES && i % 200 === 0) console.log(`  ${i}/${times.length}`)
  }
  await browser.close()
  console.log('wrote', times.length, 'frames to', OUT)
})()
