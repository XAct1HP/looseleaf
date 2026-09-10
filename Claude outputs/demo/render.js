/* Seeks the CSS timeline frame by frame and writes JPEGs.
 *   node render.js <outDir> <fps> [t1,t2,...]   -> named samples
 *   node render.js <outDir> <fps>               -> the whole run
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = process.argv[2] || '/home/claude/demo/frames'
const FPS = Number(process.argv[3] || 30)
const SAMPLES = process.argv[4] ? process.argv[4].split(',').map(Number) : null
const DURATION = Number(fs.readFileSync('/home/claude/demo/duration.txt', 'utf8'))

;(async () => {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'],
  })
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  })
  await page.goto('file:///home/claude/demo/demo.html')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)

  // Freeze every animation; from here the picture is a pure function of t.
  await page.evaluate(() => {
    window.__anims = document.getAnimations()
    window.__anims.forEach((a) => a.pause())
    // Opacity/transform animations are composited off the main thread, so a
    // seek is not on screen until two frames have gone through. Screenshot
    // without waiting and every frame shows the *previous* seek.
    window.__seek = (ms) => {
      window.__anims.forEach((a) => {
        try { a.currentTime = ms } catch {}
      })
      return new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(() => res(true)))
      )
    }
  })
  const n = await page.evaluate(() => window.__anims.length)
  console.log('animations:', n)

  const times = SAMPLES || Array.from({ length: Math.round(DURATION * FPS) }, (_, i) => i / FPS)

  let i = 0
  for (const t of times) {
    await page.evaluate((ms) => window.__seek(ms), t * 1000)
    const name = SAMPLES
      ? `t${t.toFixed(2).replace('.', '_')}.png`
      : `f${String(i).padStart(5, '0')}.jpg`
    await page.screenshot({
      path: path.join(OUT, name),
      type: SAMPLES ? 'png' : 'jpeg',
      quality: SAMPLES ? undefined : 92,
    })
    i++
    if (!SAMPLES && i % 150 === 0) console.log(`  ${i}/${times.length}`)
  }

  await browser.close()
  console.log('wrote', times.length, 'frames to', OUT)
})()
