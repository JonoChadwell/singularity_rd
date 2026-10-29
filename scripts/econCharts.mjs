// Turns a balance-bot run (logs/econ/latest.json, written by `ECON_REPORT=1 npx vitest run
// econreport`) into one self-contained page of charts: logs/econ/charts.html.
//
//   node scripts/econCharts.mjs [run.json] [out.html]
//
// Set PLAYER=logs/econ/player.json (written by `PLAYER_LOG=… npx vitest run playerecon`) to add a
// played game as the bot "you", on the approach its goal IQ matches.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const input = process.argv[2] ?? 'logs/econ/latest.json'
const output = process.argv[3] ?? 'logs/econ/charts.html'
const run = JSON.parse(readFileSync(input, 'utf8'))
if (process.env.PLAYER) {
  const rows = JSON.parse(readFileSync(process.env.PLAYER, 'utf8')).rows
  const goalIQ = rows[rows.length - 1].goalIQ
  const approach = run.runs.find((r) => r.goalIQ === goalIQ)?.approach ?? 1
  const won = rows[rows.length - 1].weeksLeft > 0 ? rows[rows.length - 1].week : null
  const contracts = JSON.parse(readFileSync(process.env.PLAYER, 'utf8')).contracts ?? []
  run.runs.unshift({ bot: 'you', approach, goalIQ, won, lost: won ? null : rows[rows.length - 1].week, mix: {}, contracts, depots: null, rows: rows.map((w) => ({ ...w, action: 'none', spend: {} })) })
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

// Only what the page draws, so the file stays small.
const slim = {
  at: run.at,
  source: basename(input),
  runs: run.runs.map((r) => ({
    bot: r.bot,
    approach: r.approach,
    goalIQ: r.goalIQ,
    won: r.won,
    lost: r.lost,
    mix: r.mix,
    // Contracts signed and the median weeks one took to fill; depot designs.
    contracts: r.contracts ? r.contracts.length : null,
    fill: r.contracts ? median(r.contracts.filter((c) => c.filled !== null).map((c) => c.filled - c.week)) : null,
    depots: r.depots ?? null,
    rows: r.rows.map((w) => ({
      week: w.week,
      income: Math.round(w.income),
      stock: Math.round(w.stock),
      fleet: Math.round(w.fleet),
      tiers: w.fleetByTier.map(Math.round),
      net: Math.round(w.net),
      iq: w.iq,
      hw: w.hardwareIQ,
      left: w.weeksLeft,
      goal: w.goalCost ? w.goalHeld / w.goalCost : 0,
      share: w.largestShare ?? null,
      depot: Math.round(w.depotWorth ?? 0),
      action: w.action,
      spend: w.spend,
      ...(w.values ? { values: w.values } : {})
    }))
  }))
}

const page = `<title>Economy Bench</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600&family=Barlow:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: a bench sheet. Filters in one row, the outcome table, then the charts two to a row. */
:root {
  --bg: #f4f5f2; --panel: #fdfdfb; --fg: #16191a; --muted: #5a6062; --faint: #8a908f; --grid: #e2e4df; --line: #d3d6d0;
  --accent: #a85a24;
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #6250d6; --s8: #e34948;
  --t0: #86b6ef; --t1: #5598e7; --t2: #2a78d6; --t3: #1c5cab; --t4: #104281;
  --ref: #a85a24;
  --display: "Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif;
  --body: "Barlow", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #111413; --panel: #181c1a; --fg: #eef0ec; --muted: #a9b0aa; --faint: #7b837d; --grid: #29302c; --line: #343c37;
  --accent: #d98b4f;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9; --s8: #e66767;
  --t0: #cde2fb; --t1: #86b6ef; --t2: #5598e7; --t3: #2a78d6; --t4: #1c5cab;
  --ref: #d98b4f; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #111413; --panel: #181c1a; --fg: #eef0ec; --muted: #a9b0aa; --faint: #7b837d; --grid: #29302c; --line: #343c37;
  --accent: #d98b4f;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9; --s8: #e66767;
  --t0: #cde2fb; --t1: #86b6ef; --t2: #5598e7; --t3: #2a78d6; --t4: #1c5cab;
  --ref: #d98b4f; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.45 var(--body); }
.wrap { max-width: 1240px; margin: 0 auto; padding-block: 28px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 22px; }
header { display: grid; gap: 4px; }
h1 { font: 600 30px/1.1 var(--display); letter-spacing: 0.01em; margin: 0; text-wrap: balance; }
h2 { font: 600 17px/1.2 var(--display); letter-spacing: 0.02em; margin: 0; }
.sub { color: var(--muted); margin: 0; max-width: 70ch; }
.mono { font-family: var(--mono); font-size: 12px; }
.filters { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel); }
.seg button { font: 500 13px var(--body); color: var(--muted); background: none; border: 0; padding: 7px 12px; cursor: pointer; border-right: 1px solid var(--line); }
.seg button:last-child { border-right: 0; }
.seg button[aria-pressed="true"] { color: var(--fg); background: var(--bg); box-shadow: inset 0 -2px 0 var(--accent); }
.seg button:focus-visible, .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 7px; font: 500 13px var(--body); color: var(--fg); background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 4px 11px 4px 9px; cursor: pointer; }
.chip[aria-pressed="false"] { color: var(--faint); }
.chip[aria-pressed="false"] svg { opacity: 0.3; }
.label-tag { color: var(--muted); font: 600 11px var(--display); letter-spacing: 0.08em; text-transform: uppercase; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px 12px; display: grid; gap: 8px; min-width: 0; }
.card p.note { color: var(--muted); font-size: 13px; margin: 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 820px) { .grid { grid-template-columns: minmax(0, 1fr); } }
.chart { position: relative; }
.chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.tip { position: absolute; pointer-events: none; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 12px; box-shadow: 0 6px 18px rgb(0 0 0 / 0.12); min-width: 150px; z-index: 5; }
.tip .head { color: var(--muted); font-weight: 500; margin-bottom: 4px; }
.tip .row { display: grid; grid-template-columns: 14px 1fr auto; gap: 6px; align-items: center; }
.tip .row b { font: 500 12px var(--mono); }
.tip .row span { color: var(--muted); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--grid); white-space: nowrap; }
th { color: var(--muted); font: 600 11px var(--display); letter-spacing: 0.06em; text-transform: uppercase; }
td.num { font: 400 12px var(--mono); font-variant-numeric: tabular-nums; text-align: right; padding-right: 14px; }
th.num { text-align: right; padding-right: 14px; }
.pill { display: inline-block; font: 600 11px var(--display); letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
.pill.won { color: var(--fg); border-color: var(--s3); }
.pill.lost { color: var(--fg); border-color: var(--s8); }
.key { display: inline-block; width: 14px; height: 2px; vertical-align: middle; margin-right: 6px; }
.best { font-weight: 600; color: var(--fg); }
.bars-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--muted); }
.bars-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
</style>

<div class="wrap">
  <header>
    <span class="label-tag">Singularity R&amp;D · Phase 2 balance</span>
    <h1>Economy Bench</h1>
    <p class="sub">Scripted bots play Phase 2 through the real engine, with Jev's answers held at their typical values. Worth is amount × value; weeks count from the Phase 2 plan. <span class="mono" id="source"></span></p>
  </header>

  <div class="filters">
    <div class="seg" role="group" aria-label="Approach" id="approach"></div>
    <div class="legend" id="legend" aria-label="Bots"></div>
  </div>

  <section class="card">
    <h2>How each bot did</h2>
    <div class="scroll"><table id="results"></table></div>
  </section>

  <div class="grid" id="charts"></div>

  <section class="card">
    <h2>What greedy weighed</h2>
    <p class="note">Each kind of action's best value over the coming weeks (up to 20), in weeks of income, at five points in the phase. The first figure is a fresh action (Jev rates it Reasonable); the second is the same action after three uses (Wasteful). The best fresh option at each point is in bold.</p>
    <div class="scroll"><table id="values"></table></div>
  </section>
</div>

<script>
const DATA = ${JSON.stringify(slim)};
const APPROACHES = [
  { i: 0, label: 'Mostly intelligence', iq: 600 },
  { i: 1, label: 'Balanced', iq: 525 },
  { i: 2, label: 'Mostly scale', iq: 450 }
];
const BOTS = [...new Set(DATA.runs.map((r) => r.bot))];
const DASHED = new Set(['procurer', 'idle']);
const color = (i) => 'var(--s' + ((i % 8) + 1) + ')';
const botColor = (bot) => color(BOTS.indexOf(bot));
// The dollar anchors the tuning aims at: weekly income by Phase 2 week.
const ANCHORS = [{ week: 1, y: 500, label: '$500' }, { week: 20, y: 5e5, label: '$500k' }, { week: 45, y: 1e8, label: '$100M' }, { week: 70, y: 3e9, label: '$2–5B' }];

const state = { approach: 1, hidden: new Set() };
try { const a = Number(localStorage.getItem('econ-approach')); if ([0, 1, 2].includes(a)) state.approach = a } catch {}

document.getElementById('source').textContent = 'From ' + DATA.source + ', ' + new Date(DATA.at).toLocaleString() + '.';

function fmt(n) {
  if (!Number.isFinite(n)) return '–';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  for (const [v, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']]) if (a >= v) return s + (a / v).toFixed(a / v >= 100 ? 0 : 1).replace(/\\.0$/, '') + u;
  return s + (a >= 10 ? Math.round(a) : a.toFixed(a >= 1 ? 1 : 2)).toString();
}
const el = (tag, attrs = {}, text) => {
  const ns = ['svg', 'path', 'line', 'text', 'rect', 'circle', 'g'].includes(tag) ? 'http://www.w3.org/2000/svg' : null;
  const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};
const runsFor = (a) => DATA.runs.filter((r) => r.approach === a);
const visible = (a) => runsFor(a).filter((r) => !state.hidden.has(r.bot));

// ---------- controls
function controls() {
  const seg = document.getElementById('approach');
  seg.replaceChildren(...APPROACHES.map((a) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(a.i === state.approach), id: 'approach-' + a.i }, a.label + ' · IQ ' + a.iq);
    b.onclick = () => { state.approach = a.i; try { localStorage.setItem('econ-approach', String(a.i)) } catch {} ; draw() };
    return b;
  }));
  const legend = document.getElementById('legend');
  legend.replaceChildren(...BOTS.map((bot) => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!state.hidden.has(bot)), id: 'bot-' + bot });
    const key = el('svg', { width: 16, height: 6, viewBox: '0 0 16 6' });
    key.append(el('line', { x1: 1, y1: 3, x2: 15, y2: 3, stroke: botColor(bot), 'stroke-width': 2, 'stroke-linecap': 'round', ...(DASHED.has(bot) ? { 'stroke-dasharray': '3 3' } : {}) }));
    b.append(key, document.createTextNode(bot));
    b.onclick = () => { state.hidden.has(bot) ? state.hidden.delete(bot) : state.hidden.add(bot); draw() };
    return b;
  }));
}

// ---------- outcome table
function results() {
  const t = document.getElementById('results');
  const head = el('tr');
  for (const [h, num] of [['Bot'], ['Outcome'], ['Income / wk', 1], ['Net worth', 1], ['Fleet', 1], ['IQ', 1], ['Clock, net', 1], ['Contracts', 1], ['Fill, wks', 1], ['Depots', 1], ['Actions']]) head.append(el('th', num ? { class: 'num' } : {}, h));
  const rows = runsFor(state.approach).map((r) => {
    const last = r.rows[r.rows.length - 1] ?? {};
    const tr = el('tr');
    const name = el('td'); const k = el('span', { class: 'key' }); k.style.background = botColor(r.bot); name.append(k, document.createTextNode(r.bot));
    const out = el('td'); out.append(el('span', { class: 'pill ' + (r.won ? 'won' : 'lost') }, r.won ? 'Won wk ' + r.won : r.lost ? 'Lost wk ' + r.lost : 'Ran out'));
    const lost = r.rows.length ? 80 - (r.rows[r.rows.length - 1].left + r.rows[r.rows.length - 1].week - 1) : 0;
    const mix = Object.entries(r.mix).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', ');
    tr.append(name, out, el('td', { class: 'num' }, fmt(last.income)), el('td', { class: 'num' }, fmt(last.net)), el('td', { class: 'num' }, fmt(last.fleet)), el('td', { class: 'num' }, String(Math.round(last.iq ?? 0))), el('td', { class: 'num' }, lost > 0 ? '−' + lost + ' wk' : lost < 0 ? '+' + -lost + ' wk' : '0'), el('td', { class: 'num' }, r.contracts ?? '–'), el('td', { class: 'num' }, r.fill ?? '–'), el('td', { class: 'num' }, last.depot ? fmt(last.depot) : '–'), el('td', {}, mix));
    return tr;
  });
  t.replaceChildren(el('thead'), el('tbody'));
  t.tHead.append(head); t.tBodies[0].append(...rows);
}

// ---------- line charts
function niceLinear(lo, hi) {
  const span = hi - lo || 1, step0 = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * step0).find((s) => span / s <= 5);
  const ticks = []; for (let v = Math.floor(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  return ticks;
}
function lineChart(card, { series, log, yFmt = fmt, refs = [], hline, step }) {
  const box = el('div', { class: 'chart' });
  card.append(box);
  const W = Math.max(300, box.clientWidth || card.clientWidth - 32), H = 230, m = { l: 48, r: 14, t: 10, b: 26 };
  const all = series.flatMap((s) => s.points.map((p) => p[1])).filter((y) => Number.isFinite(y) && (!log || y > 0));
  refs.forEach((r) => all.push(r.y)); if (hline) all.push(hline.y);
  const maxX = Math.max(80, ...series.flatMap((s) => s.points.map((p) => p[0])));
  if (!all.length) { box.append(el('p', { class: 'note' }, 'Nothing to show for this approach.')); return }
  let y0 = Math.min(...all), y1 = Math.max(...all);
  let yTicks, ys;
  if (log) {
    y0 = Math.pow(10, Math.floor(Math.log10(Math.max(1, y0)))); y1 = Math.pow(10, Math.ceil(Math.log10(Math.max(10, y1))));
    yTicks = []; const every = Math.ceil(Math.log10(y1 / y0) / 6);
    for (let v = y0; v <= y1 * 1.0001; v *= Math.pow(10, every)) yTicks.push(v);
    ys = (y) => m.t + (H - m.t - m.b) * (1 - (Math.log10(Math.max(y, y0)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)));
  } else {
    y0 = Math.min(0, y0); yTicks = niceLinear(y0, y1); y1 = yTicks[yTicks.length - 1]; y0 = yTicks[0];
    ys = (y) => m.t + (H - m.t - m.b) * (1 - (y - y0) / (y1 - y0 || 1));
  }
  const xs = (x) => m.l + (W - m.l - m.r) * ((x - 1) / (maxX - 1));
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
  for (const v of yTicks) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: ys(v), y2: ys(v), stroke: 'var(--grid)', 'stroke-width': 1 }));
    svg.append(el('text', { x: m.l - 6, y: ys(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--mono)' }, yFmt(v)));
  }
  for (const x of [1, 20, 40, 60, 80].filter((x) => x <= maxX)) {
    svg.append(el('text', { x: xs(x), y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--mono)' }, 'wk ' + x));
  }
  if (hline) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: ys(hline.y), y2: ys(hline.y), stroke: 'var(--ref)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    svg.append(el('text', { x: W - m.r, y: ys(hline.y) - 5, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, hline.label));
  }
  for (const r of refs) {
    const g = el('g');
    g.append(el('path', { d: 'M' + xs(r.week) + ' ' + (ys(r.y) - 5) + ' l5 5 l-5 5 l-5 -5 z', fill: 'none', stroke: 'var(--ref)', 'stroke-width': 1.5 }));
    g.append(el('text', { x: xs(r.week) + 8, y: ys(r.y) + 4, fill: 'var(--muted)', 'font-size': 11 }, r.label));
    svg.append(g);
  }
  for (const s of series) {
    const pts = s.points.filter((p) => Number.isFinite(p[1]) && (!log || p[1] > 0));
    if (!pts.length) continue;
    let d = '';
    pts.forEach((p, i) => {
      const x = xs(p[0]), y = ys(p[1]);
      if (i === 0) d += 'M' + x + ' ' + y;
      else d += step ? ' H' + x + ' V' + y : ' L' + x + ' ' + y;
    });
    svg.append(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(s.dash ? { 'stroke-dasharray': '4 4' } : {}) }));
    const last = pts[pts.length - 1];
    if (s.end) svg.append(el('circle', { cx: xs(last[0]), cy: ys(last[1]), r: 4, fill: s.end, stroke: 'var(--panel)', 'stroke-width': 2 }));
  }
  const cross = el('line', { y1: m.t, y2: H - m.b, stroke: 'var(--faint)', 'stroke-width': 1, visibility: 'hidden' });
  svg.append(cross);
  box.append(svg);
  const tip = el('div', { class: 'tip', hidden: '' }); box.append(tip);
  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect(), px = ((e.clientX - rect.left) / rect.width) * W;
    const week = Math.max(1, Math.min(maxX, Math.round(1 + ((px - m.l) / (W - m.l - m.r)) * (maxX - 1))));
    cross.setAttribute('x1', xs(week)); cross.setAttribute('x2', xs(week)); cross.setAttribute('visibility', 'visible');
    const vals = series.map((s) => ({ s, p: s.points.find((p) => p[0] === week) })).filter((v) => v.p).sort((a, b) => b.p[1] - a.p[1]);
    tip.replaceChildren(el('div', { class: 'head' }, 'Week ' + week));
    for (const v of vals) {
      const row = el('div', { class: 'row' });
      const key = el('span', { class: 'key' }); key.style.background = v.s.color; key.style.width = '12px';
      row.append(key, el('span', {}, v.s.name), el('b', {}, yFmt(v.p[1])));
      tip.append(row);
    }
    if (!vals.length) tip.append(el('div', {}, 'No bot still playing.'));
    tip.hidden = false;
    const bx = box.getBoundingClientRect(), tx = e.clientX - bx.left;
    tip.style.left = Math.min(bx.width - tip.offsetWidth - 4, Math.max(4, tx + (tx > bx.width / 2 ? -tip.offsetWidth - 14 : 14))) + 'px';
    tip.style.top = '8px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden') });
}

function card(title, note) {
  const c = el('section', { class: 'card' });
  c.append(el('h2', {}, title));
  if (note) c.append(el('p', { class: 'note' }, note));
  return c;
}
const perBot = (field, f = (w) => w[field]) => visible(state.approach).map((r) => ({ name: r.bot, color: botColor(r.bot), dash: DASHED.has(r.bot), points: r.rows.map((w) => [w.week, f(w)]), end: botColor(r.bot) }));

// ---------- stacked bars (counts or worth by category, per bot)
const ACTION_GROUPS = [['Procure', ['procure', 'units']], ['Contract', ['contract']], ['Strategy', ['strategy']], ['Design', ['design']], ['Upgrade', ['upgrade']], ['IQ', ['software', 'platform']], ['Storage', ['storage']], ['Cover', ['cover']]];
const SPEND_GROUPS = [['Procure inputs', ['procure']], ['Units', ['units']], ['Designs & strategies', ['design', 'strategy']], ['Upgrades', ['upgrade']], ['IQ', ['iq']], ['Storage', ['storage']], ['Cover', ['cover']], ['Goal', ['goal']]];
function bars(c, groups, valueOf, total) {
  const legend = el('div', { class: 'bars-legend' });
  groups.forEach(([label], i) => { const s = el('span'); const k = el('i'); k.style.background = color(i); s.append(k, document.createTextNode(label)); legend.append(s) });
  c.append(legend);
  const box = el('div', { class: 'chart' }); c.append(box);
  const runs = visible(state.approach);
  const W = Math.max(300, box.clientWidth || c.clientWidth - 32), rowH = 26, m = { l: 92, r: 64 }, H = runs.length * rowH + 6;
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%' });
  const tip = el('div', { class: 'tip', hidden: '' });
  runs.forEach((r, row) => {
    const vals = groups.map(([, keys]) => keys.reduce((n, k) => n + (valueOf(r, k) || 0), 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const y = row * rowH + 4;
    svg.append(el('text', { x: m.l - 8, y: y + 13, 'text-anchor': 'end', fill: 'var(--fg)', 'font-size': 12 }, r.bot));
    let x = m.l;
    vals.forEach((v, i) => {
      if (v <= 0) return;
      const w = Math.max(0, ((W - m.l - m.r) * v) / sum - 2);
      const rect = el('rect', { x, y, width: Math.max(1, w), height: 18, rx: 2, fill: color(i) });
      rect.addEventListener('pointermove', (e) => {
        tip.replaceChildren(el('div', { class: 'head' }, r.bot + ': ' + groups[i][0]), el('div', {}, (total ? fmt(v) : v) + ' (' + Math.round((100 * v) / sum) + '%)'));
        tip.hidden = false; const bx = box.getBoundingClientRect();
        tip.style.left = Math.min(bx.width - 170, e.clientX - bx.left + 12) + 'px'; tip.style.top = (y + 22) + 'px';
      });
      rect.addEventListener('pointerleave', () => (tip.hidden = true));
      svg.append(rect); x += w + 2;
    });
    svg.append(el('text', { x: W - 4, y: y + 13, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11, 'font-family': 'var(--mono)' }, total ? fmt(total(r)) : String(sum)));
  });
  box.append(svg, tip);
}

// ---------- greedy's values at checkpoints
function values() {
  const t = document.getElementById('values');
  const g = runsFor(state.approach).find((r) => r.bot === 'greedy');
  const points = (g?.rows ?? []).filter((w) => w.values);
  t.replaceChildren(el('thead'), el('tbody'));
  if (!points.length) { t.tBodies[0].append(el('tr', {}, '')).append(el('td', {}, 'Greedy has no checkpoints for this approach.')); return }
  const head = el('tr'); head.append(el('th', {}, 'Action'));
  for (const w of points) head.append(el('th', { class: 'num' }, 'Week ' + w.week));
  t.tHead.append(head);
  const kinds = [...new Set(points.flatMap((w) => w.values.fresh.map((v) => v.kind)))].sort();
  for (const kind of kinds) {
    const tr = el('tr'); tr.append(el('td', {}, kind));
    for (const w of points) {
      const f = w.values.fresh.find((v) => v.kind === kind), s = w.values.stale.find((v) => v.kind === kind);
      const best = Math.max(...w.values.fresh.map((v) => v.value));
      const td = el('td', { class: 'num' + (f && f.value === best ? ' best' : '') }, f ? fmt(f.value) + ' / ' + (s ? fmt(s.value) : '–') : '–');
      tr.append(td);
    }
    t.tBodies[0].append(tr);
  }
}

// ---------- the page
function draw() {
  controls(); results(); values();
  const grid = document.getElementById('charts');
  grid.replaceChildren();
  const add = (title, note, f) => { const c = card(title, note); grid.append(c); f(c) };
  const goalIQ = APPROACHES[state.approach].iq;
  add('Income per week', 'Worth made each week (log scale). Diamonds mark the dollar anchors.', (c) => lineChart(c, { series: perBot('income'), log: true, refs: ANCHORS }));
  add('Net worth', 'Stocks that fit in storage, plus units owned at their value.', (c) => lineChart(c, { series: perBot('net'), log: true }));
  add('Stock worth', 'Resources held, at value.', (c) => lineChart(c, { series: perBot('stock'), log: true }));
  add('Fleet worth', 'Units owned × value: industry.', (c) => lineChart(c, { series: perBot('fleet'), log: true }));
  for (const bot of ['you', 'greedy', 'climber']) {
    const r = runsFor(state.approach).find((x) => x.bot === bot);
    if (!r) continue;
    add('Fleet by tier: ' + bot, 'Worth of units owned, by tier. A climber should move up the ladder; tier 0 alone should stall.', (c) => {
      const legend = el('div', { class: 'bars-legend' })
      for (const t of [0, 1, 2, 3, 4]) { const s = el('span'); const k = el('i'); k.style.background = 'var(--t' + t + ')'; s.append(k, document.createTextNode('Tier ' + t)); legend.append(s) }
      c.append(legend)
      lineChart(c, { series: [0, 1, 2, 3, 4].map((t) => ({ name: 'Tier ' + t, color: 'var(--t' + t + ')', points: r.rows.map((w) => [w.week, w.tiers[t]]) })), log: true })
    });
  }
  add('Largest unit’s share', 'The biggest working unit type’s share of the working fleet. Contracts should spread growth across units.', (c) => lineChart(c, { series: perBot('share'), yFmt: (v) => Math.round(v * 100) + '%' }));
  add('Depot worth', 'Worth of the depots owned: what storage has cost (log scale).', (c) => lineChart(c, { series: perBot('depot'), log: true }));
  add('Best IQ', 'The goal needs IQ ' + goalIQ + '.', (c) => lineChart(c, { series: perBot('iq'), hline: { y: goalIQ, label: 'Goal IQ ' + goalIQ }, yFmt: (v) => String(Math.round(v)) }));
  add('Hardware IQ', 'The platform alone, without software: each step is a new platform.', (c) => lineChart(c, { series: perBot('hw'), step: true, yFmt: (v) => String(Math.round(v)) }));
  add('Clock', 'Weeks left. Expansions take weeks off; cover adds them back.', (c) => lineChart(c, { series: perBot('left'), yFmt: (v) => String(Math.round(v)) }));
  add('Goal progress', 'The goal resource held, as a share of what the goal uses up (shown up to 200%).', (c) => lineChart(c, { series: perBot('goal', (w) => Math.min(2, w.goal)), hline: { y: 1, label: 'Enough for the goal' }, yFmt: (v) => Math.round(v * 100) + '%' }));
  add('Spend by category', 'Where each bot\\'s worth went over the phase. The figure on the right is the total.', (c) =>
    bars(c, SPEND_GROUPS, (r, k) => (r.rows[r.rows.length - 1]?.spend ?? {})[k], (r) => Object.values(r.rows[r.rows.length - 1]?.spend ?? {}).reduce((a, b) => a + b, 0)));
  add('Action mix', 'The weeks each bot spent on each kind of action. Quiet weeks aren\\'t counted.', (c) => bars(c, ACTION_GROUPS, (r, k) => r.mix[k]));
}
draw();
let resizeTimer; window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 150) });
</script>
`

writeFileSync(output, page)
console.log(`Wrote ${output} (${Math.round(page.length / 1024)} KB) from ${input}`)
