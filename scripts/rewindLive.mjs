// Rewinds the live game to its last end-of-week snapshot (the state just before whatever you did
// since, e.g. saving research for later). Prints a browser-console command and copies it to the
// clipboard on Windows. Usage: node scripts/rewindLive.mjs [weeksBack=0]
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'

const root = 'logs/runs'
const files = readdirSync(root)
  .map((d) => `${root}/${d}/game.jsonl`)
  .filter((f) => { try { return statSync(f).size > 0 } catch { return false } })
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
const weeks = readFileSync(files[0], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.event === 'week')
const back = Number(process.argv[2] ?? 0)
if (!weeks[weeks.length - 1 - back]) throw new Error('No week snapshot to rewind to.')
// Snapshots leave out the log and Jev's cache, so rebuild the log from the weeks' events.
const snap = {
  ...weeks[weeks.length - 1 - back].state,
  log: weeks.slice(0, weeks.length - back).flatMap((w) => w.events ?? []),
  jevCache: {}
}
// Escape everything non-ASCII (icons are emoji): `clip` and many consoles mangle them into U+FFFD.
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
const cmd = `localStorage.setItem('singularity-rd/save/v${snap.version}', ${ascii(JSON.stringify(JSON.stringify(snap)))}); location.reload()`
try { execSync('clip', { input: cmd }) } catch {}
console.log(cmd)
console.error(`\nRun ${files[0].split('/')[2]}: rewound to the start of week ${snap.week}. Copied to clipboard if on Windows.`)
