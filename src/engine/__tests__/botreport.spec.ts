import { it } from 'vitest'
import { chain, chain2, flat, idle, phase1, phase2, play, smart, smartest, steady, type Result } from './bots'
import { score } from './fakeJudge'
import { fmt } from '../model'

// Prints how every scripted bot fares, for tuning. Run with BOT_REPORT=1. The assertions are in
// balance.spec.ts.

function line(name: string, r: Result) {
  const s = r.state
  const goal = s.history.length ? 'won' : r.lost ? 'LOST' : 'timeout'
  const res = s.resources.map((x) => `${x.name} ${fmt(x.amount)}`).join(', ')
  const units = s.units.map((u) => `${u.name} ×${fmt(u.count)}`).join(', ')
  console.log(
    `${name.padEnd(22)} ${goal.padEnd(7)} won ${r.won ?? '-'} lost ${r.lost ?? '-'} IQ ${smartest(s)} clock −${r.weeksLost}/+${r.weeksGained}\n    ${res}\n    ${units}`
  )
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

it.skipIf(!env.BOT_REPORT)(
  'reports every bot',
  async () => {
    for (const approach of [0, 2, 4]) {
      line(`p1 idle a${approach}`, await play(await phase1(approach), idle, 12))
      line(`p1 flat a${approach}`, await play(await phase1(approach), flat, 12))
      line(`p1 chain a${approach}`, await play(await phase1(approach), chain, 12))
      line(`p1 chain2 a${approach}`, await play(await phase1(approach), chain2, 12))
      line(`p1 smart a${approach}`, await play(await phase1(approach), smart, 12))
    }
    for (const approach of [0, 2, 4]) {
      line(`p2 steady a${approach}`, await play(await phase2(approach), steady({ reinvest: true }), 120))
      line(`p2 hoarder a${approach}`, await play(await phase2(approach), steady({ reinvest: false }), 120))
      line(`p2 reckless a${approach}`, await play(await phase2(approach), steady({ reinvest: true, answers: { alarm: score(3) } }), 120))
      line(`p2 covered a${approach}`, await play(await phase2(approach), steady({ reinvest: true, coverBelow: 30 }), 120))
      const reckless = { reinvest: true, answers: { alarm: score(3) } }
      line(`p2 reckless+cover a${approach}`, await play(await phase2(approach), steady({ ...reckless, coverBelow: 20 }), 120))
      const clever = { reinvest: true, answers: { efficiency: score(3) }, firstUnit: { upkeep_0: score(0) } }
      line(`p2 clever a${approach}`, await play(await phase2(approach), steady(clever), 120))
      const panic = { reinvest: true, answers: { alarm: score(4) } }
      line(`p2 panic a${approach}`, await play(await phase2(approach), steady(panic), 120))
      line(`p2 panic+cover a${approach}`, await play(await phase2(approach), steady({ ...panic, coverBelow: 25 }), 120))
    }
  },
  120_000
)
