import { it } from 'vitest'
import { fmt } from '../model'
import { playEcon, ROSTER, type RunRecord } from './econBots'

// Plays the balance roster through Phase 2 on every approach and writes each week of every run to
// logs/econ/<time>.json, for scripts/econCharts.mjs to chart. Run with ECON_REPORT=1; set
// ECON_BOTS=greedy,climber to run only some. The assertions on these runs are in balance.spec.ts.

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

function line(r: RunRecord) {
  const last = r.rows[r.rows.length - 1]
  const end = r.won ? `won wk ${r.won}` : r.lost ? `LOST wk ${r.lost}` : 'timeout'
  const mix = Object.entries(r.mix)
    .filter(([k]) => k !== 'none')
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')
  console.log(
    `${r.bot.padEnd(12)} a${r.approach} (IQ ${r.goalIQ}) ${end.padEnd(10)} income ${fmt(last?.income ?? 0)}/wk net ${fmt(last?.net ?? 0)} IQ ${Math.round(last?.iq ?? 0)}\n    ${mix}`
  )
}

it.skipIf(!env.ECON_REPORT)(
  'plays the balance roster and writes the series',
  async () => {
    const only = env.ECON_BOTS?.split(',')
    const runs: RunRecord[] = []
    for (const bot of ROSTER.filter((b) => !only || only.includes(b.name))) {
      for (const approach of [0, 1, 2]) {
        const r = await playEcon(bot, approach)
        runs.push(r)
        line(r)
      }
    }
    // Node's fs, typed by hand: the tests' tsconfig has no Node types.
    const { mkdirSync, writeFileSync } = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
      mkdirSync: (path: string, options: { recursive: boolean }) => void
      writeFileSync: (path: string, data: string) => void
    }
    mkdirSync('logs/econ', { recursive: true })
    const file = `logs/econ/${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), runs }))
    writeFileSync('logs/econ/latest.json', JSON.stringify({ at: new Date().toISOString(), runs }))
    console.log(`Wrote ${file}`)
  },
  600_000
)
