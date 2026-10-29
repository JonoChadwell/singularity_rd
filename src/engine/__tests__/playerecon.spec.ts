import { it } from 'vitest'
import { grossIncome, runningNet, worthOf } from '../actionValue'
import { previewWeek } from '../economy'
import { bestIQ, findResource } from '../model'
import type { GameState } from '../types'

// Turns a played game's run log into the balance bots' weekly series, so a real game can be set
// beside them. Run with PLAYER_LOG=logs/runs/<id>/game.jsonl; writes logs/econ/player.json.
// After a rewind the log repeats weeks; the last snapshot of each week wins.

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

interface LogLine {
  event: string
  week: number
  kind?: string
  action?: string
  state?: GameState
}

it.skipIf(!env.PLAYER_LOG)('turns a run log into weekly economy rows', async () => {
  const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
    readFileSync: (path: string, enc: string) => string
    writeFileSync: (path: string, data: string) => void
  }
  const lines = readFileSync(env.PLAYER_LOG!, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as LogLine)
  // What the player did each week, from the last pass through it.
  const acts = new Map<number, string[]>()
  const snaps = new Map<number, GameState>()
  let last = 0
  for (const l of lines) {
    if (l.event === 'week' && l.state) {
      if (l.week <= last) for (const w of [...acts.keys()]) if (w >= l.week) acts.delete(w)
      last = l.week
      snaps.set(l.state.week, l.state)
    }
    const what = l.event === 'accept' ? l.kind : l.event === 'action' ? l.action : undefined
    if (what) acts.set(l.week, [...(acts.get(l.week) ?? []), what])
  }
  const rows = []
  for (const [week, s] of [...snaps].sort((a, b) => a[0] - b[0])) {
    if (s.phase.n !== 2) continue
    const report = previewWeek(s)
    const w = worthOf(s)
    const goal = s.research.find((r) => r.effect.kind === 'goal')
    const goalId = goal?.cost[0]?.resourceId
    rows.push({
      week: week - s.phase.start + 1,
      income: grossIncome(s, report),
      running: runningNet(s, report),
      stock: w.stock,
      fleet: w.fleet,
      fleetByTier: w.byTier,
      net: w.net,
      iq: bestIQ(s),
      hardwareIQ: s.minds[0]!.hardware.iq,
      weeksLeft: (s.phase.deadline ?? 0) - s.week + 1,
      goalIQ: goal?.minIQ ?? 0,
      goalHeld: goalId ? (findResource(s, goalId)?.amount ?? 0) : 0,
      goalCost: goal?.cost[0]?.amount ?? 0,
      covers: s.covers,
      units: s.units.map((u) => ({ name: u.name, tier: u.tier, count: u.count, value: u.value })),
      acts: acts.get(week - 1) ?? []
    })
  }
  writeFileSync('logs/econ/player.json', JSON.stringify({ log: env.PLAYER_LOG, rows }))
  console.log(`Wrote ${rows.length} rows to logs/econ/player.json`)
})
