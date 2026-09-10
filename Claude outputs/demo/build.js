/* Loose Leaf for Partners — motion-graphics demo.
 * Emits a single self-contained HTML file whose entire timeline is CSS
 * animations on the document timeline, so a renderer can seek to any frame
 * by setting currentTime on every animation. No JS drives the picture.
 */
const fs = require('fs')

const DURATION = 76.5

/* ── palette, straight out of tailwind.config.js ─────────────────────────── */
const C = {
  navy: '#111C38', navySoft: '#26314D', navyMuted: '#3C465F',
  coral: '#FF6468', coralDeep: '#E9484D', coralSoft: '#FFE5E2', coralWash: '#FFF1EF',
  notebook: '#A9C8F5', notebookDeep: '#6E9BE0', notebookSoft: '#EAF3FF',
  margin: '#DF62AD', marginSoft: '#FCE9F4',
  paper: '#FFFDF8', cream: '#FFF6EB',
  graphite: '#566070', mist: '#8B93A3', rule: '#EDE7DC',
  moss: '#5C9A72', mossSoft: '#E6F2EA',
}

/* ── a deterministic pseudo-QR ───────────────────────────────────────────── */
/* Not a real encoding — a motion graphic of one. A working QR here would
 * point at a pass that does not exist, which is a worse kind of fake. */
function qr(size = 25, seed = 20260910) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const g = Array.from({ length: size }, () => Array(size).fill(0))
  const finder = (ox, oy) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || x === 6 || y === 0 || y === 6
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
      g[oy + y][ox + x] = edge || core ? 1 : 0
    }
  }
  const reserved = (x, y) =>
    (x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) ||
    (x >= size - 9 && y >= size - 9 && x < size - 4 && y < size - 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    if (!reserved(x, y)) g[y][x] = rnd() > 0.52 ? 1 : 0
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7)
  for (let y = size - 9; y < size - 4; y++) for (let x = size - 9; x < size - 4; x++) {
    const e = x === size - 9 || x === size - 5 || y === size - 9 || y === size - 5
    const c = x === size - 7 && y === size - 7
    g[y][x] = e || c ? 1 : 0
  }
  for (let i = 8; i < size - 8; i++) { g[6][i] = i % 2 === 0 ? 1 : 0; g[i][6] = i % 2 === 0 ? 1 : 0 }
  return g
}

const GRID = qr()

/* px: module size. base: when the sweep starts. stag: per-diagonal delay. */
function qrSvg(px, base, stag, cls = 'qc') {
  const n = GRID.length
  let out = `<svg class="qr" width="${n * px}" height="${n * px}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">`
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!GRID[y][x]) continue
    const d = stag ? (base + (x + y) * stag).toFixed(3) : base.toFixed(3)
    out += `<rect class="${cls}" style="--d:${d}s" x="${x}" y="${y}" width="1.04" height="1.04"/>`
  }
  return out + '</svg>'
}

/* ── little building blocks ──────────────────────────────────────────────── */
const holes = (n = 3) =>
  `<span class="holes">${Array.from({ length: n }, () => '<i></i>').join('')}</span>`

const chars = (str, base, stag) =>
  [...str].map((ch, i) =>
    `<span class="ch f" style="--d:${(base + i * stag).toFixed(3)}s;--t:.4s">${ch === ' ' ? '&nbsp;' : ch}</span>`
  ).join('')

const tile = (label, value, hint, d, quiet) => `
  <div class="tile pop${quiet ? ' quiet' : ''}" style="--d:${d}s;--t:.55s">
    <p class="tile-l">${label}</p>
    <p class="tile-v">${value}</p>
    <p class="tile-h">${hint}</p>
  </div>`

/* ── the Date Spot card a student is shown ───────────────────────────────── */
const spotCard = (d) => `
<article class="spot pop" style="--d:${d}s;--t:.75s">
  <div class="spot-cover">
    <span class="glow g1"></span><span class="glow g2"></span><span class="glow g3"></span>
    <span class="fit f" style="--d:${(d + .7).toFixed(2)}s;--t:.5s">92% fit</span>
    <span class="perk pop" style="--d:${(d + .95).toFixed(2)}s;--t:.45s">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.3 5.2 5.7.5-4.3 3.8 1.3 5.5L12 15.1 7 18l1.3-5.5L4 8.7l5.7-.5z"/></svg>
    </span>
  </div>
  <div class="spot-body">
    <h3>The Lantern Room</h3>
    <p class="spot-meta">Food &amp; Drinks · $$ · 9 min walk</p>
    <p class="spot-note">Booths, long menu, nobody rushes you out.</p>
    <div class="tags">
      <span>dinner</span><span>drinks</span><span>first date</span>
    </div>
    <div class="spot-foot">
      <span class="spot-offer">15% off your date</span>
      <span class="spot-days">Sun–Thu</span>
    </div>
  </div>
</article>`

/* ── the pass ────────────────────────────────────────────────────────────── */
const passCard = ({ d, qrBase, codeBase, redeemed }) => `
<article class="pass ${redeemed ? 'pass-ok' : ''} pop" style="--d:${d}s;--t:.9s">
  <span class="lines"></span>
  ${holes(3)}
  <header class="pass-head">
    <p class="pass-kicker">${redeemed ? 'Redeemed ✓' : 'Your Loose Leaf Date Pass'}</p>
    <h3>The Lantern Room</h3>
    <p class="pass-offer">15% off your date</p>
    <p class="pass-fine">Valid Sunday–Thursday</p>
    <p class="pass-fine">${redeemed ? 'Used September 10' : 'Expires September 24'}</p>
  </header>
  <div class="tear"><span class="notch"></span><span class="dash"></span><span class="notch"></span></div>
  ${redeemed ? `
  <div class="pass-done">
    <p class="done-h">That went through.</p>
    <p class="done-b">Scanned just now. Enjoy the date.</p>
  </div>` : `
  <div class="pass-code">
    <div class="plate">${qrSvg(7.4, qrBase, 0.013)}</div>
    <p class="code">${chars('LL-7QK4-2F9M', codeBase, 0.045)}</p>
    <p class="pass-show">Show this when you arrive</p>
    <p class="pass-terms">Dine-in only. One pass per couple. Not valid with other offers.</p>
  </div>`}
</article>`

/* ══ the page ════════════════════════════════════════════════════════════ */
const fonts = fs.readFileSync('/home/claude/demo/fonts.css', 'utf8')

const html = `<!doctype html>
<meta charset="utf-8">
<title>Loose Leaf for Partners</title>
<style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:${C.paper}}
body{font-family:"DM Sans",system-ui,sans-serif;color:${C.navy};-webkit-font-smoothing:antialiased}
.stage{position:relative;width:1920px;height:1080px;overflow:hidden;background:${C.paper}}

/* ── motion primitives ─────────────────────────────────────────────────── */
.u,.f,.pop,.sl,.sr,.gw,.qc,.ch,.count,.dash,.sweep,.tick,.bracket,.bar{
  animation-duration:var(--t,.7s);animation-delay:var(--d,0s);
  animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.3,1)}
.u{animation-name:kU}.f{animation-name:kF}.pop{animation-name:kPop}
.sl{animation-name:kSL}.sr{animation-name:kSR}.gw{animation-name:kGW}
@keyframes kU{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes kF{from{opacity:0}to{opacity:1}}
@keyframes kPop{from{opacity:0;transform:translateY(18px) scale(.965)}to{opacity:1;transform:none}}
@keyframes kSL{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
@keyframes kSR{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes kGW{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.scene{position:absolute;inset:0;opacity:0;
  animation-name:kScene;animation-duration:var(--t);animation-delay:var(--d);
  animation-fill-mode:both;animation-timing-function:linear}
@keyframes kScene{0%{opacity:0}5%{opacity:1}95%{opacity:1}100%{opacity:0}}

/* ── notebook motifs, lifted from index.css ────────────────────────────── */
.lines{position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(to bottom,transparent 0,transparent 41px,rgba(169,200,245,.28) 41px,rgba(169,200,245,.28) 42px);
  background-size:100% 42px}
.pass .lines{opacity:.055;background-image:linear-gradient(to bottom,transparent 0,transparent 37px,rgba(255,253,248,.8) 37px,rgba(255,253,248,.8) 38px);background-size:100% 38px}
.holes{position:absolute;left:26px;top:64px;bottom:64px;display:flex;flex-direction:column;justify-content:space-between;z-index:2}
.holes i{display:block;width:17px;height:17px;border-radius:50%;background:rgba(255,253,248,.3)}
.sheet .holes i{background:${C.paper};box-shadow:inset 0 0 0 1px rgba(17,28,56,.09)}

.wash{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}
.drift{animation:kDrift 22s ease-in-out infinite}
@keyframes kDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(-34px,26px)}}

/* ── type ──────────────────────────────────────────────────────────────── */
h1,h2,h3,.disp{font-family:Fraunces,Georgia,serif;font-weight:600;letter-spacing:-.024em}
.hand{font-family:Caveat,cursive;font-weight:600}
.kicker{display:inline-flex;align-items:center;gap:11px;border:1px solid ${C.rule};background:${C.cream};
  border-radius:999px;padding:9px 20px;font-size:19px;font-weight:500;color:${C.graphite}}
.kicker b{width:9px;height:9px;border-radius:50%;background:${C.coral};display:block}
.eyebrow{font-size:17px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:${C.mist}}
.lede{font-size:26px;line-height:1.62;color:${C.graphite};max-width:44ch}
.small{font-size:20px;line-height:1.6;color:${C.mist}}

.uline{position:absolute;left:0;bottom:-14px;width:100%;height:16px;color:${C.coral};transform-origin:left center}

/* ══ S1 ─ cold open ════════════════════════════════════════════════════ */
.s1{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 200px}
.s1 h1{font-size:96px;line-height:1.06;max-width:19ch;margin-top:44px}
.star{position:absolute;color:${C.margin};animation:kTwinkle 1.9s ease-in-out infinite}
@keyframes kTwinkle{0%,100%{opacity:0;transform:scale(.4)}50%{opacity:1;transform:scale(1)}}

/* ══ S2 ─ the question ═════════════════════════════════════════════════ */
.split{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:100px;padding:0 130px}
.sheet{position:relative;border:1px solid ${C.rule};background:rgba(255,246,235,.72);border-radius:28px;
  padding:44px 44px 44px 74px;box-shadow:0 2px 4px rgba(17,28,56,.05),0 18px 40px -18px rgba(17,28,56,.22)}
.bub{max-width:78%;padding:20px 26px;border-radius:24px;font-size:25px;line-height:1.45}
.bub.them{background:#fff;border:1px solid ${C.rule};border-bottom-left-radius:8px;color:${C.navy}}
.bub.me{background:${C.coral};color:#fff;border-bottom-right-radius:8px;margin-left:auto}
.chat{display:flex;flex-direction:column;gap:18px}
.s2 h2,.s3 h2,.s4 h2,.s5 h2,.s6 h2,.s7 h2{font-size:66px;line-height:1.1;max-width:17ch}
.pts{margin-top:40px;display:flex;flex-direction:column;gap:22px}
.pt{display:flex;gap:16px;font-size:23px;line-height:1.5;color:${C.graphite};max-width:46ch}
.pt b{flex:none;width:9px;height:9px;border-radius:50%;background:${C.coral};margin-top:12px}

/* ══ S3 ─ the suggestion ═══════════════════════════════════════════════ */
.spot{width:520px;border-radius:22px;background:#fff;border:1px solid rgba(17,28,56,.05);overflow:hidden;
  box-shadow:0 2px 4px rgba(17,28,56,.05),0 18px 40px -18px rgba(17,28,56,.22)}
.spot-cover{position:relative;height:232px;background:linear-gradient(150deg,#2A2036,#3E2B33 42%,#5C3A34)}
.glow{position:absolute;border-radius:50%;filter:blur(28px)}
.g1{width:150px;height:150px;left:56px;top:44px;background:rgba(255,196,120,.5)}
.g2{width:110px;height:110px;left:238px;top:96px;background:rgba(255,140,110,.42)}
.g3{width:90px;height:90px;left:392px;top:36px;background:rgba(255,222,170,.36)}
.fit{position:absolute;left:18px;top:18px;background:rgba(17,28,56,.62);backdrop-filter:blur(6px);
  color:#fff;font-size:17px;font-weight:600;padding:7px 14px;border-radius:999px}
.perk{position:absolute;right:18px;bottom:18px;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;
  background:${C.coralSoft};color:${C.coralDeep};box-shadow:0 4px 14px rgba(17,28,56,.2)}
.spot-body{padding:24px 26px 22px}
.spot-body h3{font-size:31px;line-height:1.15}
.spot-meta{margin-top:7px;font-size:19px;color:${C.mist}}
.spot-note{margin-top:14px;font-family:Caveat,cursive;font-weight:500;font-size:26px;color:${C.graphite};min-height:62px;line-height:1.2}
.tags{display:flex;gap:9px;margin-top:6px}
.tags span{font-size:16px;color:${C.graphite};background:${C.cream};border:1px solid ${C.rule};padding:5px 12px;border-radius:999px}
.spot-foot{margin-top:20px;padding-top:16px;border-top:1px solid ${C.rule};display:flex;justify-content:space-between;align-items:baseline}
.spot-offer{font-size:20px;font-weight:500;color:${C.coralDeep}}
.spot-days{font-size:18px;color:${C.mist}}

/* ══ S4/S5 ─ the pass ══════════════════════════════════════════════════ */
.pass{position:relative;width:520px;border-radius:28px;overflow:hidden;background:${C.navy};color:${C.paper};
  border:1px solid rgba(17,28,56,.1);box-shadow:0 2px 4px rgba(17,28,56,.05),0 24px 56px -20px rgba(17,28,56,.42)}
.pass-ok{border-color:rgba(92,154,114,.6)}
.pass-head{position:relative;padding:40px 44px 0 72px;z-index:2}
.pass-kicker{font-size:16px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,253,248,.55)}
.pass-ok .pass-kicker{color:${C.moss}}
.pass-head h3{margin-top:16px;font-size:40px;line-height:1.1}
.pass-offer{margin-top:9px;font-size:25px;color:rgba(255,253,248,.8)}
.pass-fine{margin-top:6px;font-size:19px;color:rgba(255,253,248,.55)}
.tear{position:relative;margin-top:32px;display:flex;align-items:center;z-index:2}
.notch{width:34px;height:34px;border-radius:50%;background:${C.paper};flex:none}
.notch:first-child{margin-left:-17px}.notch:last-child{margin-right:-17px}
.dash{flex:1;height:1px;border-top:2px dashed rgba(255,253,248,.25);transform-origin:left center;
  animation-name:kGW}
.pass-code{position:relative;padding:30px 56px 44px;text-align:center;z-index:2}
.plate{width:fit-content;margin:0 auto;background:${C.paper};border-radius:18px;padding:18px}
.qr rect{fill:${C.navy}}
.qc{animation-name:kPop;animation-duration:.28s}
.code{margin-top:24px;font-size:27px;font-weight:600;letter-spacing:.15em;color:rgba(255,253,248,.92)}
.ch{display:inline-block}
.pass-show{margin-top:16px;font-size:20px;color:rgba(255,253,248,.6)}
.pass-terms{margin:26px auto 0;max-width:34ch;font-size:16px;line-height:1.55;color:rgba(255,253,248,.45)}
.pass-done{position:relative;padding:52px 44px 60px;text-align:center;z-index:2}
.done-h{font-family:Fraunces,serif;font-weight:600;font-size:34px}
.done-b{margin:12px auto 0;max-width:32ch;font-size:21px;line-height:1.5;color:rgba(255,253,248,.75)}
.dl{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:30px 44px;max-width:640px}
.dl dt{font-size:22px;font-weight:500;color:${C.navy}}
.dl dd{margin-top:7px;font-size:19px;line-height:1.55;color:${C.graphite}}

/* ══ S5 ─ the scanner ══════════════════════════════════════════════════ */
.phone{position:relative;width:392px;height:800px;border-radius:54px;background:${C.navy};padding:14px;
  box-shadow:0 30px 70px -22px rgba(17,28,56,.5)}
.screen{position:relative;width:100%;height:100%;border-radius:42px;overflow:hidden;background:#0B1226;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px}
.view{position:relative;width:288px;height:288px;border-radius:26px;overflow:hidden;background:#0E1730;display:grid;place-items:center}
.view .plate{padding:14px;border-radius:12px}
.bracket{position:absolute;width:52px;height:52px;border:5px solid ${C.paper};opacity:.85}
.bk1{top:14px;left:14px;border-right:0;border-bottom:0;border-radius:16px 0 0 0}
.bk2{top:14px;right:14px;border-left:0;border-bottom:0;border-radius:0 16px 0 0}
.bk3{bottom:14px;left:14px;border-right:0;border-top:0;border-radius:0 0 0 16px}
.bk4{bottom:14px;right:14px;border-left:0;border-top:0;border-radius:0 0 16px 0}
.bracket{animation-name:kGreen}
@keyframes kGreen{0%,100%{border-color:${C.moss}}}
.sweep{position:absolute;left:0;width:100%;height:3px;background:linear-gradient(90deg,transparent,${C.coral},transparent);
  box-shadow:0 0 22px ${C.coral};animation-name:kSweep;animation-timing-function:cubic-bezier(.45,0,.55,1)}
@keyframes kSweep{0%{top:6%;opacity:0}8%{opacity:1}50%{top:92%}92%{opacity:1}100%{top:6%;opacity:0}}
.scr-label{font-size:21px;color:rgba(255,253,248,.6)}
.scr-ok{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
  background:#0B1226}
.check{width:112px;height:112px;border-radius:50%;background:${C.mossSoft};color:#3F7454;display:grid;place-items:center}
.tick{stroke-dasharray:44;stroke-dashoffset:44;animation-name:kTick}
@keyframes kTick{to{stroke-dashoffset:0}}
.scr-ok p{font-family:Fraunces,serif;font-weight:600;font-size:30px;color:${C.paper}}
.scr-ok small{font-size:19px;color:rgba(255,253,248,.6)}

/* ══ S6 ─ the dashboard ════════════════════════════════════════════════ */
.dash-wrap{width:760px}
.hero-tile{position:relative;overflow:hidden;border:1px solid ${C.rule};background:rgba(255,246,235,.72);border-radius:22px;padding:34px 38px}
.hero-tile .lines{opacity:.6}
.hero-l{position:relative;font-size:20px;font-weight:500;color:${C.mist}}
.hero-n{position:relative;margin-top:12px;font-size:112px;font-weight:600;line-height:.9;font-variant-numeric:tabular-nums}
.hero-b{position:relative;margin-top:18px;font-size:20px;line-height:1.55;color:${C.graphite};max-width:44ch}
/* inherits:true, or the ::after that renders the counter gets the initial
 * value instead of the animated one and the headline stays on zero. */
@property --n{syntax:"<integer>";inherits:true;initial-value:0}
.count{animation-name:kCount34;animation-timing-function:cubic-bezier(.15,.75,.25,1)}
.count::after{counter-reset:cc var(--n);content:counter(cc)}
@keyframes kCount34{from{--n:0}to{--n:34}}
.tiles{margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tile{border:1px solid ${C.rule};background:#fff;border-radius:18px;padding:20px 22px}
.tile.quiet{background:${C.cream}}
.tile-l{font-size:17px;font-weight:500;color:${C.graphite}}
.tile-v{margin-top:8px;font-size:38px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.tile-h{margin-top:8px;font-size:15px;color:${C.mist}}

/* ══ S7 ─ price ════════════════════════════════════════════════════════ */
.price{display:grid;grid-template-columns:1.12fr 1fr;gap:26px;width:1180px}
.pcard{position:relative;border:1px solid ${C.rule};background:#fff;border-radius:22px;padding:38px 40px}
.pcard.paid{border-color:rgba(17,28,56,.2);box-shadow:0 1px 2px rgba(17,28,56,.04),0 8px 24px -12px rgba(17,28,56,.14)}
.tag{position:absolute;top:-15px;left:36px;background:${C.navy};color:${C.paper};border-radius:999px;
  padding:7px 16px;font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.amt{display:flex;align-items:baseline;gap:12px;margin-top:10px}
.amt b{font-size:74px;font-weight:600;letter-spacing:-.02em;line-height:1}
.amt span{font-size:23px;color:${C.mist}}
.plist{margin-top:26px;display:flex;flex-direction:column;gap:13px}
.plist li{list-style:none;display:flex;gap:14px;font-size:20px;line-height:1.4;color:${C.graphite}}
.plist i{flex:none;width:24px;height:24px;border-radius:50%;background:${C.mossSoft};color:#3F7454;
  display:grid;place-items:center;margin-top:1px}
.math{margin-top:28px;border:1px solid rgba(169,200,245,.5);background:${C.notebookSoft};border-radius:18px;padding:22px 24px}
.math p{font-size:19px;font-weight:500}
.math .row{display:flex;justify-content:space-between;gap:24px;font-size:21px;color:${C.graphite};margin-top:12px}
.math .row b{font-weight:600;color:${C.navy};font-variant-numeric:tabular-nums}

/* ══ S8 ─ close ════════════════════════════════════════════════════════ */
.close{position:absolute;inset:70px 110px;border-radius:28px;background:${C.navy};color:${C.paper};
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden}
.close .lines{opacity:.06;background-image:linear-gradient(to bottom,transparent 0,transparent 41px,rgba(255,253,248,.9) 41px,rgba(255,253,248,.9) 42px)}
.close h2{font-size:78px;line-height:1.08;max-width:20ch}
.close .lede{color:rgba(255,253,248,.75);max-width:52ch;text-align:center}
.btn{margin-top:44px;background:${C.coral};color:#fff;border-radius:999px;padding:22px 52px;font-size:25px;font-weight:600}
.url{margin-top:34px;font-size:23px;color:rgba(255,253,248,.65);letter-spacing:.01em}
.close .kicker{background:rgba(255,253,248,.08);border-color:rgba(255,253,248,.18);color:rgba(255,253,248,.8)}
</style>

<div class="stage">
  <span class="wash drift" style="width:620px;height:620px;right:-180px;top:-200px;background:rgba(255,229,226,.5)"></span>
  <span class="wash drift" style="width:520px;height:520px;left:-160px;bottom:-190px;background:rgba(234,243,255,.72);animation-delay:-11s"></span>

  <!-- ══ 1 · cold open ══════════════════════════════════════════════ -->
  <section class="scene s1" style="--d:0s;--t:6s">
    <svg class="star" style="left:520px;top:300px" width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.4L20 12l-6.1 3.6L12 22l-1.9-6.4L4 12l6.1-3.6z"/></svg>
    <svg class="star" style="right:500px;bottom:290px;animation-delay:-.9s" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.4L20 12l-6.1 3.6L12 22l-1.9-6.4L4 12l6.1-3.6z"/></svg>
    <p class="kicker u" style="--d:.35s"><b></b>Loose Leaf for Partners</p>
    <h1 class="u" style="--d:.95s;--t:.95s">Somebody is deciding where to take a date
      <span style="position:relative;display:inline-block">tonight.
        <svg class="uline gw" style="--d:2.25s;--t:.7s" viewBox="0 0 300 16" fill="none" preserveAspectRatio="none"><path d="M3 11c60-7 128-9 294-6" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>
      </span>
    </h1>
    <p class="lede u" style="--d:3.05s;text-align:center;max-width:40ch;margin-top:52px">Here is how your business becomes the answer.</p>
  </section>

  <!-- ══ 2 · the question ═══════════════════════════════════════════ -->
  <section class="scene s2" style="--d:5.7s;--t:8.3s">
    <div class="split">
      <div class="sheet sr" style="--d:6.05s;--t:.85s">
        ${holes(3)}
        <p class="hand" style="font-size:29px;color:${C.graphite};margin-bottom:22px">Thursday, 6:41pm</p>
        <div class="chat">
          <div class="bub them u" style="--d:6.75s;--t:.5s">ok so where are we actually going 😅</div>
          <div class="bub me u" style="--d:7.75s;--t:.5s">no idea. you pick</div>
          <div class="bub them u" style="--d:8.75s;--t:.5s">absolutely not</div>
        </div>
      </div>
      <div>
        <h2 class="u" style="--d:9.7s;--t:.85s">That question is worth money to you.</h2>
        <p class="lede u" style="--d:10.5s;margin-top:34px">It gets asked on your campus every night of the week — and almost nobody selling anything is in the room when it happens.</p>
      </div>
    </div>
  </section>

  <!-- ══ 3 · the suggestion ═════════════════════════════════════════ -->
  <section class="scene s3" style="--d:13.7s;--t:11s">
    <div class="split">
      <div style="justify-self:end;position:relative">
        <p class="hand u" style="--d:14.05s;font-size:30px;color:${C.graphite};margin-bottom:18px">what your future customers see 👀</p>
        ${spotCard(14.35)}
      </div>
      <div>
        <h2 class="u" style="--d:16.2s;--t:.85s">You show up inside the decision.</h2>
        <div class="pts">
          <p class="pt u" style="--d:17.4s"><b></b>Suggested to two people who have already decided to go out and are working out where.</p>
          <p class="pt u" style="--d:18.6s"><b></b>Relevance first. Ask Loose Leaf for coffee and coffee comes back, whoever is paying.</p>
          <p class="pt u" style="--d:19.8s"><b></b>Being right for the ask moves a place a lot. Being a partner moves it a little.</p>
          <p class="pt u" style="--d:21s"><b></b>It arrives once, quietly, and can be waved away. No banners, no popups.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ══ 4 · the pass ═══════════════════════════════════════════════ -->
  <section class="scene s4" style="--d:24.4s;--t:12.2s">
    <div class="split">
      <div>
        <p class="eyebrow u" style="--d:24.75s">The Date Pass</p>
        <h2 class="u" style="--d:25.15s;--t:.85s;margin-top:20px">A number that means somebody showed up.</h2>
        <p class="lede u" style="--d:26.1s;margin-top:30px">They pick you, unlock a pass, and walk in. Your staff scan it at the table — and that becomes one verified date, not a modelled attribution.</p>
        <dl class="dl">
          <div class="u" style="--d:27.6s"><dt>Single-use by default</dt><dd>A pass cannot be redeemed twice unless you say it can.</dd></div>
          <div class="u" style="--d:28.4s"><dt>Works without a scanner</dt><dd>Codes are short and readable, so a phone camera is optional.</dd></div>
          <div class="u" style="--d:29.2s"><dt>Checked server-side</dt><dd>Validity is decided by Loose Leaf, not by the customer's screen.</dd></div>
          <div class="u" style="--d:30s"><dt>Capped, by you</dt><dd>Monthly ceiling, daily cap, and how often one person can come back.</dd></div>
        </dl>
      </div>
      <div style="justify-self:center">
        ${passCard({ d: 25.4, qrBase: 26.9, codeBase: 28.1, redeemed: false })}
      </div>
    </div>
  </section>

  <!-- ══ 5 · the scan ═══════════════════════════════════════════════ -->
  <section class="scene s5" style="--d:36.3s;--t:10.5s">
    <div class="split" style="grid-template-columns:1fr 1fr">
      <div style="justify-self:end">
        <h2 class="u" style="--d:36.65s;--t:.85s">Two seconds, on the phone already behind your counter.</h2>
        <div class="pts">
          <p class="pt u" style="--d:38s"><b></b>Open the scanner, point it at their screen. No hardware, no new device.</p>
          <p class="pt u" style="--d:39s"><b></b>Or type the twelve characters — a camera is optional.</p>
          <p class="pt u" style="--d:40s"><b></b>Green means valid. Loose Leaf decided that, not the customer's phone.</p>
          <p class="pt u" style="--d:41s"><b></b>Staff you invite get the scanner and nothing else — no dashboard, no numbers.</p>
        </div>
      </div>
      <div style="justify-self:center">
        <div class="phone pop" style="--d:36.7s;--t:.9s">
          <div class="screen">
            <div class="view">
              <div class="plate">${qrSvg(6.4, 37.3, 0)}</div>
              <span class="bracket bk1" style="--d:41.9s;--t:.5s"></span>
              <span class="bracket bk2" style="--d:41.95s;--t:.5s"></span>
              <span class="bracket bk3" style="--d:42s;--t:.5s"></span>
              <span class="bracket bk4" style="--d:42.05s;--t:.5s"></span>
              <span class="sweep" style="--d:37.9s;--t:2s"></span>
              <span class="sweep" style="--d:39.9s;--t:2s"></span>
            </div>
            <p class="scr-label">Point at their Date Pass</p>
            <div class="scr-ok f" style="--d:42.35s;--t:.4s">
              <span class="check">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="tick" style="--d:42.6s;--t:.5s" d="M4.5 12.5l5 5 10-11"/></svg>
              </span>
              <p>Valid — 15% off</p>
              <small>The Lantern Room · LL-7QK4-2F9M</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ══ 6 · the number ═════════════════════════════════════════════ -->
  <section class="scene s6" style="--d:46.5s;--t:11.2s">
    <div class="split">
      <div>
        <h2 class="u" style="--d:46.85s;--t:.85s">Then it is just a number you can trust.</h2>
        <p class="lede u" style="--d:47.7s;margin-top:30px">Not an impression. Not a click. Not a footfall estimate. Every one of these is a pass one of your own staff scanned at a table.</p>
        <div class="pts">
          <p class="pt u" style="--d:49.4s"><b></b>The running total updates as it happens, from the same list your invoice is built from.</p>
          <p class="pt u" style="--d:50.4s"><b></b>You see the visit. You never see who they are or what they talked about.</p>
        </div>
        <p class="hand f" style="--d:51.6s;font-size:28px;color:${C.mist};margin-top:44px">example figures — this is a mockup</p>
      </div>
      <div class="dash-wrap" style="justify-self:center">
        <div class="hero-tile pop" style="--d:47.2s;--t:.8s">
          <span class="lines"></span>
          <p class="hero-l">Dates this month</p>
          <p class="hero-n count" style="--d:47.9s;--t:1.9s"></p>
          <p class="hero-b">Verified — each one is a Date Pass your staff scanned at the table.</p>
        </div>
        <div class="tiles">
          ${tile('Date Spot views', '812', 'Students who opened your page', 50.0)}
          ${tile('Recommendations', '1,204', 'Times Loose Leaf suggested you', 50.15)}
          ${tile('Offers unlocked', '61', 'Passes taken out', 50.3)}
          ${tile('Verified dates', '34', 'Passes actually redeemed', 50.45)}
          ${tile('Today', '3', 'Redeemed since midnight', 50.6, true)}
          ${tile('This week', '11', 'Redeemed since Monday', 50.75, true)}
        </div>
      </div>
    </div>
  </section>

  <!-- ══ 7 · price ══════════════════════════════════════════════════ -->
  <section class="scene s7" style="--d:57.4s;--t:11.3s">
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px">
      <div style="text-align:center">
        <h2 class="u" style="--d:57.75s;--t:.85s;font-size:72px;max-width:none">Free until somebody walks in.</h2>
        <p class="lede u" style="--d:58.5s;margin:22px auto 0;text-align:center;max-width:62ch">No plans, no monthly fee, no contract. Everything is switched on for every partner, and one specific event costs money.</p>
      </div>
      <div class="price">
        <div class="pcard pop" style="--d:59.4s;--t:.7s">
          <p class="eyebrow">Everything, for</p>
          <p class="amt"><b>$0</b><span>/month</span></p>
          <ul class="plist">
            ${[
              'Your Date Spot profile, photos and hours',
              'Appear in Date Spots discovery',
              'Eligible for personalised recommendations',
              'Recommendations inside conversations',
              'Create Loose Leaf offers and Date Passes',
              'The QR scanner for your counter',
              'Analytics and verified-date reporting',
              'As many people on the team as you like',
            ].map((t, i) => `<li class="f" style="--d:${(60.1 + i * 0.13).toFixed(2)}s;--t:.4s"><i><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5 11-11"/></svg></i>${t}</li>`).join('')}
          </ul>
        </div>
        <div class="pcard paid pop" style="--d:59.7s;--t:.7s">
          <span class="tag">The only charge</span>
          <p class="amt" style="margin-top:18px"><b>$1.50</b><span>per Date Pass redeemed</span></p>
          <p style="margin-top:18px;font-size:20px;line-height:1.55;color:${C.graphite};max-width:40ch">Charged only when a couple hands over a pass and one of your staff scans it. No monthly fee, no minimum, no contract.</p>
          <div class="math">
            <p>What that looks like</p>
            <div class="row f" style="--d:61.6s;--t:.45s"><span>10 redemptions in a month</span><b>$15.00</b></div>
            <div class="row f" style="--d:62.1s;--t:.45s"><span>40 redemptions in a month</span><b>$60.00</b></div>
            <div class="row f" style="--d:62.6s;--t:.45s"><span>A month with none</span><b>$0.00</b></div>
          </div>
          <p class="small u" style="--d:63.4s;margin-top:24px;max-width:42ch">Billed once a month through Stripe, in arrears. You add a card when you turn on your first offer — not when you sign up.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ══ 8 · close ══════════════════════════════════════════════════ -->
  <section class="scene s8" style="--d:68.4s;--t:8.1s">
    <div class="close">
      <span class="lines"></span>
      <div style="position:relative;display:flex;flex-direction:column;align-items:center">
        <p class="kicker u" style="--d:68.75s"><b></b>Now taking partners in Ann Arbor</p>
        <h2 class="u" style="--d:69.2s;--t:.9s;margin-top:36px">Somebody is deciding where to take a date tonight.</h2>
        <p class="lede u" style="--d:70.2s;margin-top:30px">Fifteen minutes to set up, and a human at Loose Leaf reads every application before it goes live.</p>
        <div class="btn pop" style="--d:71s;--t:.6s">Become a Partner</div>
        <p class="url f" style="--d:71.9s;--t:.7s">hellolooseleaf.com/partners</p>
      </div>
    </div>
  </section>
</div>
`

fs.writeFileSync('/home/claude/demo/demo.html', html)
fs.writeFileSync('/home/claude/demo/duration.txt', String(DURATION))
console.log('demo.html', html.length, 'bytes ·', DURATION, 's')
