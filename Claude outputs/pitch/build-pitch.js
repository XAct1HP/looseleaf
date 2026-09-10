/* Loose Leaf — the 10K pitch, 75 seconds.
 *
 * Same engine as the partner demo: every animation is CSS on the document
 * timeline with an absolute `--d`, so the picture is a pure function of t and
 * the renderer can seek any frame.
 *
 *   node build-pitch.js graphics   -> pitch-graphics.html   (53s, t0 = 0:11)
 *   node build-pitch.js guide      -> pitch-guide.html      (75s, with slates)
 *
 * The graphics cut is what drops between his two on-camera clips. The guide
 * cut is the whole 75s with the two record-this slates in place, so he can
 * rehearse against real timing before shooting anything.
 */
const fs = require('fs')

const MODE = process.argv[2] === 'guide' ? 'guide' : 'graphics'
const OFF = MODE === 'guide' ? 11 : 0          // graphics start at 0:11 in the guide cut
const DURATION = MODE === 'guide' ? 75 : 53

const C = {
  navy: '#111C38', navySoft: '#26314D',
  coral: '#FF6468', coralDeep: '#E9484D', coralSoft: '#FFE5E2', coralWash: '#FFF1EF',
  notebook: '#A9C8F5', notebookDeep: '#6E9BE0', notebookSoft: '#EAF3FF',
  margin: '#DF62AD', marginSoft: '#FCE9F4',
  paper: '#FFFDF8', cream: '#FFF6EB',
  graphite: '#566070', mist: '#8B93A3', rule: '#EDE7DC',
  moss: '#5C9A72', mossSoft: '#E6F2EA',
}

const t = (x) => (x + OFF).toFixed(2) + 's'   // absolute delay on the master timeline

/* ── beat boundaries, measured from the first frame of the graphics cut ──── */
const B = {
  problem: [0, 13.0],
  loop:    [12.7, 17.3],
  model:   [29.7, 12.0],
  traction:[41.4, 11.6],
}

const fonts = fs.readFileSync('/home/claude/demo/fonts.css', 'utf8')

/* ── the four graphics beats ─────────────────────────────────────────────── */

/* 1 · the problem — two panels, one per side of the market */
const problem = `
<section class="scene" style="--d:${t(B.problem[0])};--t:${B.problem[1]}s">
  <div class="wrap">
    <h2 class="mid u" style="--d:${t(0.4)};--t:.9s">Two things are broken on every campus.</h2>
    <div class="two">
      <!-- students -->
      <div class="panel pop" style="--d:${t(1.5)};--t:.7s">
        <p class="panel-l">How dating apps make money</p>
        <div class="stack">
          <div class="pcard lift" style="--d:${t(3.0)};--t:.8s">
            <span class="av a1"></span><span class="pl"></span>
            <span class="paid f" style="--d:${t(3.5)};--t:.45s">$9.99</span>
          </div>
          <div class="pcard dim" style="--d:${t(3.2)};--t:.8s"><span class="av a2"></span><span class="pl"></span></div>
          <div class="pcard dim" style="--d:${t(3.35)};--t:.8s"><span class="av a3"></span><span class="pl"></span></div>
          <div class="pcard dim" style="--d:${t(3.5)};--t:.8s"><span class="av a4"></span><span class="pl"></span></div>
        </div>
        <p class="panel-c u" style="--d:${t(4.6)}">Visibility goes to whoever paid.</p>
      </div>
      <!-- businesses -->
      <div class="panel pop" style="--d:${t(1.7)};--t:.7s">
        <p class="panel-l">How local advertising is sold</p>
        <div class="metric">
          <p class="m-n count12" style="--d:${t(6.0)};--t:2.1s"></p>
          <p class="m-l">impressions</p>
        </div>
        <div class="metric second">
          <p class="m-n q pop" style="--d:${t(8.6)};--t:.5s">?</p>
          <p class="m-l">customers who walked in</p>
        </div>
        <p class="panel-c u" style="--d:${t(9.4)}">The measurement stops at the click.</p>
      </div>
    </div>
  </div>
</section>`

/* 2 · the loop — four stages, a connector drawing between them */
const stage = (i, d, label, inner) => `
  <div class="step">
    <div class="step-art pop" style="--d:${t(d)};--t:.65s">${inner}</div>
    <p class="step-n f" style="--d:${t(d + 0.25)};--t:.4s">0${i}</p>
    <p class="step-l u" style="--d:${t(d + 0.3)};--t:.5s">${label}</p>
  </div>`

const loop = `
<section class="scene" style="--d:${t(B.loop[0])};--t:${B.loop[1]}s">
  <div class="wrap">
    <h2 class="mid u" style="--d:${t(13.1)};--t:.9s">Loose Leaf is free — and it ends at a table.</h2>
    <div class="flow">
      <span class="conn gw" style="--d:${t(15.6)};--t:.55s"></span>
      <span class="conn c2 gw" style="--d:${t(18.6)};--t:.55s"></span>
      <span class="conn c3 gw" style="--d:${t(21.6)};--t:.55s"></span>
      ${stage(1, 14.2, 'Two students match', `
        <div class="mini-match">
          <span class="mv m1"></span><span class="mv m2"></span>
          <svg class="spark f" style="--d:${t(15.0)};--t:.45s" width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.4L20 12l-6.1 3.6L12 22l-1.9-6.4L4 12l6.1-3.6z"/></svg>
        </div>`)}
      ${stage(2, 17.2, 'Loose Leaf suggests a spot', `
        <div class="mini-spot">
          <span class="ms-cover"></span>
          <span class="ms-t"></span><span class="ms-s"></span>
          <span class="ms-offer f" style="--d:${t(18.0)};--t:.4s">15% off</span>
        </div>`)}
      ${stage(3, 20.2, 'They get a Date Pass', `
        <div class="mini-pass">
          <span class="mp-line"></span>
          <span class="mp-qr"></span>
          <span class="mp-code">LL-7QK4</span>
        </div>`)}
      ${stage(4, 23.2, 'The business scans it', `
        <div class="mini-phone">
          <span class="mp-screen">
            <span class="tickwrap pop" style="--d:${t(24.4)};--t:.5s">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="tick" style="--d:${t(24.7)};--t:.45s" d="M4.5 12.5l5 5 10-11"/></svg>
            </span>
          </span>
        </div>`)}
    </div>
    <p class="foot u" style="--d:${t(26.2)}">Every feature is free for every student. There is nothing to buy, and nothing to unlock.</p>
  </div>
</section>`

/* 3 · the model — the fee, then the line money cannot cross */
const model = `
<section class="scene" style="--d:${t(B.model[0])};--t:${B.model[1]}s">
  <div class="wrap">
    <h2 class="mid u" style="--d:${t(30.1)};--t:.9s">One thing costs money.</h2>
    <div class="fee pop" style="--d:${t(31.0)};--t:.8s">
      <span class="fee-n">$1.50</span>
      <span class="fee-l">when a Date Pass is scanned at the counter —<br>not for a view, not for a click, for a person at a table</span>
    </div>
    <div class="two lower">
      <div class="panel soft pop" style="--d:${t(33.6)};--t:.7s">
        <span class="ic move"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 8h16M4 16h16"/><circle cx="15" cy="8" r="3" fill="currentColor" stroke="none"/><circle cx="9" cy="16" r="3" fill="currentColor" stroke="none"/></svg></span>
        <h3>What paying can move</h3>
        <p>Where a business ranks <em>among the places that already fit</em> what the two of them asked for. Ask for coffee and coffee comes back, whoever is paying.</p>
      </div>
      <div class="panel soft locked pop" style="--d:${t(33.9)};--t:.7s">
        <span class="ic lock"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 018 0v3"/></svg></span>
        <h3>What paying can never move</h3>
        <p>People. Discovery never reads a billing table. That is a rule inside the database, not a promise inside a policy.</p>
      </div>
    </div>
  </div>
</section>`

/* 4 · traction — what is true today, and nothing more */
const traction = `
<section class="scene" style="--d:${t(B.traction[0])};--t:${B.traction[1]}s">
  <div class="wrap">
    <h2 class="mid u" style="--d:${t(41.8)};--t:.9s">Built. Live. Onboarding.</h2>
    <div class="three">
      <div class="blk pop" style="--d:${t(43.0)};--t:.7s">
        <p class="blk-n">Live</p>
        <p class="blk-t">in Ann Arbor</p>
        <p class="blk-b">Students are signing up and matching on it today.</p>
      </div>
      <div class="blk pop" style="--d:${t(43.25)};--t:.7s">
        <p class="blk-n">307</p>
        <p class="blk-t">tests on the rules</p>
        <p class="blk-b">The promises above are asserted in the database, and they run on every change.</p>
      </div>
      <div class="blk pop" style="--d:${t(43.5)};--t:.7s">
        <p class="blk-n">Businesses</p>
        <p class="blk-t">going through onboarding</p>
        <p class="blk-b">Local venues in Ann Arbor are working through partner setup right now.</p>
      </div>
    </div>
    <p class="mark u" style="--d:${t(46.4)}">Loose&nbsp;Leaf <span>·</span> hellolooseleaf.com</p>
  </div>
</section>`

/* ── the two record-this slates, guide cut only ──────────────────────────── */
const slate = (n, start, dur, title, script, note) => `
<section class="scene slate" style="--d:${start}s;--t:${dur}s">
  <div class="wrap slate-wrap">
    <p class="slate-k f" style="--d:${(start + 0.3).toFixed(2)}s;--t:.4s">
      <span class="rec"></span>Record this · ${n} · ${fmt(start)}–${fmt(start + dur)} · ${dur}s
    </p>
    <p class="slate-t u" style="--d:${(start + 0.5).toFixed(2)}s">${title}</p>
    <blockquote class="slate-s u" style="--d:${(start + 0.75).toFixed(2)}s">${script}</blockquote>
    <p class="slate-n u" style="--d:${(start + 1.0).toFixed(2)}s">${note}</p>
  </div>
</section>`

function fmt(s) {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

const slates = MODE !== 'guide' ? '' : (
  slate(
    'OPEN', 0, 11,
    'You, to camera.',
    '“I’m Javi. I’m a student at Michigan, and I built Loose&nbsp;Leaf — a dating app for college that is completely free, and that pays for itself by sending couples to local businesses.”',
    'Chest-up, window light in front of you, one clean take. Land the last word by 0:10 so the cut breathes.'
  ) +
  slate(
    'CLOSE', 64, 11,
    'You again, same framing.',
    '“Ten thousand dollars opens the next campus — a year of infrastructure, and the first hundred businesses onboarded. Somebody on your campus is deciding where to take a date tonight. I’d like Loose&nbsp;Leaf to be the answer.”',
    'Swap the middle sentence for whatever the money actually does. Slow down on the last line and hold two beats before you stop recording.'
  )
)

/* ══ the page ════════════════════════════════════════════════════════════ */
const html = `<!doctype html>
<meta charset="utf-8">
<title>Loose Leaf — pitch</title>
<style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:${C.paper}}
body{font-family:"DM Sans",system-ui,sans-serif;color:${C.navy};-webkit-font-smoothing:antialiased}
.canvas{position:relative;width:1920px;height:1080px;overflow:hidden;background:${C.paper}}

.u,.f,.pop,.gw,.count12,.tick{animation-duration:var(--t,.7s);animation-delay:var(--d,0s);
  animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.3,1)}
.u{animation-name:kU}.f{animation-name:kF}.pop{animation-name:kPop}.gw{animation-name:kGW}
@keyframes kU{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes kF{from{opacity:0}to{opacity:1}}
@keyframes kPop{from{opacity:0;transform:translateY(18px) scale(.965)}to{opacity:1;transform:none}}
@keyframes kGW{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.scene{position:absolute;inset:0;opacity:0;animation-name:kScene;animation-duration:var(--t);
  animation-delay:var(--d);animation-fill-mode:both;animation-timing-function:linear}
@keyframes kScene{0%{opacity:0}5%{opacity:1}95%{opacity:1}100%{opacity:0}}

.wash{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}
.drift{animation:kDrift 22s ease-in-out infinite}
@keyframes kDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(-34px,26px)}}

h2,h3,.disp{font-family:Fraunces,Georgia,serif;font-weight:600;letter-spacing:-.024em}
.hand{font-family:Caveat,cursive;font-weight:600}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:0 130px}
.mid{font-size:70px;line-height:1.08;text-align:center;max-width:26ch;text-wrap:balance}
.foot{margin-top:44px;font-size:24px;line-height:1.6;color:${C.graphite};text-align:center;max-width:62ch}

/* ── 1 · the problem ───────────────────────────────────────────────────── */
.two{margin-top:56px;display:grid;grid-template-columns:1fr 1fr;gap:34px;width:1420px}
.two.lower{margin-top:44px;width:1340px}
.panel{position:relative;border:1px solid ${C.rule};background:#fff;border-radius:22px;padding:34px 36px 30px;
  box-shadow:0 1px 2px rgba(17,28,56,.04),0 8px 24px -12px rgba(17,28,56,.14);min-height:392px;
  display:flex;flex-direction:column}
.panel-l{font-size:17px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:${C.mist}}
.panel-c{margin-top:auto;padding-top:22px;font-size:23px;font-weight:500;color:${C.navy}}

.stack{margin-top:26px;display:flex;flex-direction:column;gap:11px}
.pcard{position:relative;display:flex;align-items:center;gap:16px;border:1px solid ${C.rule};
  background:${C.cream};border-radius:16px;padding:14px 18px;
  animation-duration:var(--t);animation-delay:var(--d);animation-fill-mode:both;
  animation-timing-function:cubic-bezier(.2,.8,.3,1)}
.pcard.lift{animation-name:kLift;background:#fff;border-color:rgba(255,100,104,.45);
  box-shadow:0 10px 26px -12px rgba(233,72,77,.45)}
@keyframes kLift{from{transform:none}to{transform:translateY(-9px) scale(1.035)}}
.pcard.dim{animation-name:kDim}
@keyframes kDim{from{opacity:1}to{opacity:.32}}
.av{width:38px;height:38px;border-radius:50%;flex:none}
.a1{background:linear-gradient(140deg,#FFC9A8,#FF9B8A)}
.a2{background:linear-gradient(140deg,#A9C8F5,#6E9BE0)}
.a3{background:linear-gradient(140deg,#FCE9F4,#DF62AD)}
.a4{background:linear-gradient(140deg,#DCEBDF,#5C9A72)}
.pl{flex:1;height:10px;border-radius:99px;background:rgba(17,28,56,.11)}
.paid{position:absolute;right:16px;top:50%;transform:translateY(-50%);background:${C.coral};color:#fff;
  font-size:16px;font-weight:600;padding:6px 13px;border-radius:999px}

.metric{margin-top:30px}
.metric.second{margin-top:26px;padding-top:24px;border-top:1px solid ${C.rule}}
.m-n{font-size:76px;font-weight:600;line-height:.95;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.m-n.q{color:${C.coralDeep}}
.m-l{margin-top:8px;font-size:21px;color:${C.graphite}}
@property --n{syntax:"<integer>";inherits:true;initial-value:0}
.count12{animation-name:kC12;animation-timing-function:cubic-bezier(.15,.75,.25,1)}
.count12::after{counter-reset:cc var(--n);content:counter(cc)}
@keyframes kC12{from{--n:0}to{--n:12400}}

/* ── 2 · the loop ──────────────────────────────────────────────────────── */
.flow{position:relative;margin-top:56px;display:grid;grid-template-columns:repeat(4,1fr);
  gap:38px;width:1480px}
.conn{position:absolute;top:88px;left:calc(25% - 22px);width:44px;height:2px;
  background:${C.notebookDeep};opacity:.5;transform-origin:left center}
.conn.c2{left:calc(50% - 22px)}
.conn.c3{left:calc(75% - 22px)}
.step{display:flex;flex-direction:column;align-items:center;text-align:center}
.step-art{width:100%;height:176px;border:1px solid ${C.rule};background:#fff;border-radius:20px;
  display:grid;place-items:center;position:relative;overflow:hidden;
  box-shadow:0 1px 2px rgba(17,28,56,.04),0 10px 26px -14px rgba(17,28,56,.2)}
.step-n{margin-top:20px;font-size:15px;font-weight:600;letter-spacing:.14em;color:${C.mist};font-variant-numeric:tabular-nums}
.step-l{margin-top:8px;font-size:25px;font-weight:500;line-height:1.3;max-width:15ch}

.mini-match{position:relative;display:flex;align-items:center}
.mv{width:66px;height:82px;border-radius:14px;display:block}
.m1{background:linear-gradient(140deg,#FFC9A8,#FF9B8A);transform:rotate(-7deg)}
.m2{background:linear-gradient(140deg,#A9C8F5,#6E9BE0);transform:rotate(7deg);margin-left:-14px}
.spark{position:absolute;left:50%;top:-6px;margin-left:-17px;color:${C.coral}}

.mini-spot{position:relative;width:150px;border:1px solid ${C.rule};border-radius:12px;background:#fff}
.ms-cover{display:block;height:56px;background:linear-gradient(150deg,#2A2036,#5C3A34)}
.ms-t{display:block;height:9px;width:78px;border-radius:99px;background:rgba(17,28,56,.16);margin:12px 0 0 12px}
.ms-s{display:block;height:7px;width:52px;border-radius:99px;background:rgba(17,28,56,.09);margin:8px 0 12px 12px}
.ms-offer{position:absolute;right:-14px;bottom:-13px;background:${C.coralSoft};color:${C.coralDeep};
  font-size:15px;font-weight:600;padding:5px 11px;border-radius:999px}

.mini-pass{width:132px;height:132px;border-radius:14px;background:${C.navy};display:flex;
  flex-direction:column;align-items:center;justify-content:center;gap:9px;position:relative}
.mp-line{position:absolute;left:0;right:0;top:34px;border-top:2px dashed rgba(255,253,248,.25)}
.mp-qr{width:54px;height:54px;border-radius:7px;background:${C.paper};margin-top:16px;
  background-image:linear-gradient(90deg,${C.navy} 25%,transparent 0 50%,${C.navy} 0 62%,transparent 0),
    linear-gradient(0deg,${C.navy} 22%,transparent 0 44%,${C.navy} 0 58%,transparent 0);
  background-size:14px 14px;background-color:${C.paper};background-blend-mode:normal}
.mp-code{font-size:14px;font-weight:600;letter-spacing:.14em;color:rgba(255,253,248,.8)}

.mini-phone{width:96px;height:150px;border-radius:18px;background:${C.navy};padding:7px}
.mp-screen{display:grid;place-items:center;width:100%;height:100%;border-radius:13px;background:#0B1226}
.tickwrap{width:62px;height:62px;border-radius:50%;background:${C.mossSoft};color:#3F7454;display:grid;place-items:center}
.tick{stroke-dasharray:44;stroke-dashoffset:44;animation-name:kTick}
@keyframes kTick{to{stroke-dashoffset:0}}

/* ── 3 · the model ─────────────────────────────────────────────────────── */
.fee{margin-top:44px;display:flex;align-items:center;gap:30px;border:1px solid rgba(17,28,56,.2);
  background:#fff;border-radius:22px;padding:28px 44px;
  box-shadow:0 1px 2px rgba(17,28,56,.04),0 10px 30px -14px rgba(17,28,56,.24)}
.fee-n{font-size:82px;font-weight:600;letter-spacing:-.03em;line-height:1}
.fee-l{font-size:22px;line-height:1.5;color:${C.graphite};max-width:34ch}
.panel.soft{min-height:0;background:${C.cream};border-color:${C.rule};padding:30px 34px 32px}
.panel.locked{background:${C.notebookSoft};border-color:rgba(169,200,245,.6)}
.ic{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;
  background:${C.coralSoft};color:${C.coralDeep}}
.ic.lock{background:#fff;color:#2F5C99}
.panel.soft h3{margin-top:20px;font-size:29px;line-height:1.2}
.panel.soft p{margin-top:12px;font-size:21px;line-height:1.55;color:${C.graphite}}
.panel.soft em{font-style:normal;font-weight:600;color:${C.navy}}

/* ── 4 · traction ──────────────────────────────────────────────────────── */
.three{margin-top:52px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px;width:1400px}
.blk{border:1px solid ${C.rule};background:#fff;border-radius:22px;padding:34px 34px 32px;
  box-shadow:0 1px 2px rgba(17,28,56,.04),0 8px 24px -12px rgba(17,28,56,.14)}
.blk-n{font-family:Fraunces,serif;font-weight:600;font-size:56px;line-height:1;letter-spacing:-.02em}
.blk-t{margin-top:10px;font-size:23px;font-weight:500;color:${C.navy}}
.blk-b{margin-top:16px;font-size:19px;line-height:1.55;color:${C.graphite}}
.mark{margin-top:50px;font-family:Fraunces,serif;font-weight:600;font-size:32px;color:${C.navy}}
.mark span{color:${C.mist};margin:0 12px}

/* ── slates (guide cut only) ───────────────────────────────────────────── */
.slate{background:${C.navy}}
.slate-wrap{color:${C.paper};align-items:flex-start;padding:0 180px}
.slate-k{display:inline-flex;align-items:center;gap:13px;font-size:19px;font-weight:600;
  letter-spacing:.13em;text-transform:uppercase;color:rgba(255,253,248,.6);
  border:1px solid rgba(255,253,248,.22);border-radius:999px;padding:11px 22px}
.rec{width:12px;height:12px;border-radius:50%;background:${C.coral};display:block;
  box-shadow:0 0 0 5px rgba(255,100,104,.22)}
.slate-t{margin-top:34px;font-family:Fraunces,serif;font-weight:600;font-size:58px;letter-spacing:-.02em}
.slate-s{margin-top:30px;border-left:4px solid ${C.coral};padding-left:30px;font-size:33px;
  line-height:1.5;max-width:40ch;color:${C.paper}}
.slate-n{margin-top:34px;font-size:21px;line-height:1.6;color:rgba(255,253,248,.6);max-width:62ch}
</style>

<div class="canvas">
  <span class="wash drift" style="width:620px;height:620px;right:-180px;top:-200px;background:rgba(255,229,226,.5)"></span>
  <span class="wash drift" style="width:520px;height:520px;left:-160px;bottom:-190px;background:rgba(234,243,255,.72);animation-delay:-11s"></span>
  ${problem}
  ${loop}
  ${model}
  ${traction}
  ${slates}
</div>
`

const name = MODE === 'guide' ? 'pitch-guide' : 'pitch-graphics'
fs.writeFileSync(`/home/claude/demo/${name}.html`, html)
fs.writeFileSync(`/home/claude/demo/${name}.duration`, String(DURATION))
console.log(name + '.html', html.length, 'bytes ·', DURATION, 's')
