import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { createUnits } from '../actions'
import { runWeek } from '../cycle'
import { createInitialState, newResource, newUnit } from '../initialState'
import { previewWeek } from '../economy'
import { creatable, findResource, findUnit, MONEY_ID, weeklyUse } from '../model'
import { newPhase } from '../phase'
import type { GameState } from '../types'
import { chain2, flat, idle, phase1, phase2, play, smart, steady, type Result } from './bots'
import { score } from './fakeJudge'

// Scripted checks of the balance, with Jev's typical answers. The bots are in bots.ts; the
// targets are MASTER_PLAN_V2.md §D11. Set BOT_REPORT=1 and run botreport.spec.ts to see them all.

/** An opening: a first passive income, and rented servers doing freelance coding. */
function opening(): GameState {
  const s = createInitialState()
  s.phase = newPhase(3, 1)
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', value: 1 }))
  s.incomes.push({ name: 'Freelance coding', resourceId: MONEY_ID, amount: B.INCOME_DIFFICULTY[1]![2] })
  const value = B.UNIT_VALUE[1]![1]
  const labour = value / B.PAYBACK_WEEKS
  s.units.push(
    newUnit({
      id: 'gpu',
      name: 'Rented Cloud GPU',
      value,
      parts: [{ resourceId: MONEY_ID, amount: value }],
      upkeep: [{ resourceId: MONEY_ID, amount: B.nice(labour * 0.25) }]
    })
  )
  s.strategies.push({ id: 'code', name: 'Sell compute', description: '', unitId: 'gpu', kind: 'make', inputs: [], outputId: MONEY_ID, amount: B.nice(labour) })
  findUnit(s, 'gpu')!.rest = 'code'
  return s
}

describe('balance', () => {
  it('doubles the early economy every one to two weeks', () => {
    let s = opening()
    const income: number[] = []
    for (let week = 1; week <= 16; week++) {
      const n = creatable(s, findUnit(s, 'gpu')!, weeklyUse(previewWeek(s)))
      if (n > 0) s = createUnits(s, 'gpu', n)
      const before = findResource(s, MONEY_ID)!.amount
      s = runWeek(s)
      income.push(findResource(s, MONEY_ID)!.amount - before)
    }
    const doublingWeeks = 10 / Math.log2(income[15]! / income[5]!)
    expect(doublingWeeks).toBeGreaterThan(1)
    expect(doublingWeeks).toBeLessThan(2.2)
  })

  it('never asks for less than IQ 100, and makes harder research cost more', () => {
    for (const table of [B.DIFFICULTY, B.INCOME_DIFFICULTY, B.UPGRADE_DIFFICULTY]) {
      for (const [label, iq] of table) expect(iq, label).toBeGreaterThanOrEqual(B.MIN_IQ)
      for (let i = 1; i < table.length; i++) expect(table[i]![2]).toBeGreaterThan(table[i - 1]![2])
    }
    // A passive income pays for itself within a few weeks.
    expect(B.INCOME_COST_WEEKS).toBeLessThanOrEqual(4)
  })

  it('allows two to four tiers: the software ceiling and the leap rule cap each leap', () => {
    // A tier at its software ceiling can design at most this multiple of its base IQ.
    const leap = (share: number) => B.IQ_CEILING / share
    expect(leap(B.DESIGN_BAR)).toBeCloseTo(3)
    expect(Math.ceil(Math.log(10) / Math.log(2))).toBe(4)
    expect(Math.ceil(Math.log(10) / Math.log(leap(B.LEAP_MIN)))).toBe(2)
  })

  it('makes goals that need less brilliance need more resources', () => {
    for (let i = 1; i < B.GOAL_APPROACH.length; i++) {
      const [, iq1, cost1, iq2, cost2] = B.GOAL_APPROACH[i]!
      const [, prevIq1, prevCost1, prevIq2, prevCost2] = B.GOAL_APPROACH[i - 1]!
      expect(iq1).toBeLessThan(prevIq1)
      expect(iq2).toBeLessThan(prevIq2)
      expect(cost1).toBeGreaterThan(prevCost1)
      expect(cost2).toBeGreaterThan(prevCost2)
    }
    // Phase 2 goals need IQ 300 to 600: past the Starting Server's 150, so at least one new tier.
    expect(B.GOAL_APPROACH.map((a) => a[3])).toEqual(expect.arrayContaining([300, 600]))
  })
})

const APPROACHES = [0, 2, 4]

describe('Phase 1 bots', () => {
  it('lose doing nothing useful: one income and no upgrades', async () => {
    for (const a of APPROACHES) expect((await play(await phase1(a), idle, 12)).lost).toBe(10)
  })

  it('win in weeks 7 to 9 with an income a week and upgrades as needed', async () => {
    for (const a of APPROACHES) {
      const r = await play(await phase1(a), flat, 12)
      expect(r.won).toBeGreaterThanOrEqual(7)
      expect(r.won).toBeLessThanOrEqual(9)
    }
  })

  it('win by week 10 with a growing chain: novels, then royalties that grow with them', async () => {
    for (const a of APPROACHES) expect((await play(await phase1(a), chain2, 12)).won).not.toBeNull()
  })

  it('get nothing for free: rushing to IQ 140 for the richest incomes doesn’t pay in ten weeks', async () => {
    const rushed = await play(await phase1(2), smart, 12)
    const steady = await play(await phase1(2), flat, 12)
    expect(rushed.won ?? 11).toBeGreaterThanOrEqual(steady.won!)
  })
})

describe('Phase 2 bots', () => {
  /** Phase 2 weeks used: from the plan in week 8 to the week the goal was researched, inclusive. */
  const used = (r: Result) => (r.won === null ? Infinity : r.won - 8 + 1)

  it('lose without reinvesting', async () => {
    const r = await play(await phase2(2), steady({ reinvest: false }), 120)
    expect(r.lost).toBe(107)
  })

  it('win a sensible game in 50 to 80 weeks, whatever the goal takes', async () => {
    const weeks: number[] = []
    for (const a of APPROACHES) {
      const r = await play(await phase2(a), steady({ reinvest: true }), 120)
      weeks.push(used(r))
      // Owning millions of mills gets noticed, a week more at each power of ten.
      expect(r.weeksLost).toBeGreaterThanOrEqual(10)
      expect(r.weeksLost).toBeLessThanOrEqual(25)
    }
    for (const w of weeks) {
      expect(w).toBeGreaterThanOrEqual(50)
      expect(w).toBeLessThanOrEqual(80)
    }
    // Brilliant and scale-heavy goals are about as hard.
    expect(Math.max(...weeks) - Math.min(...weeks)).toBeLessThanOrEqual(10)
  })

  it('win a strong game in 25 to 45 weeks, with better strategies and cheaper upkeep', async () => {
    for (const a of APPROACHES) {
      const r = await play(await phase2(a), steady({ reinvest: true, answers: { efficiency: score(3) }, firstUnit: { upkeep_0: score(0) } }), 120)
      expect(used(r)).toBeGreaterThanOrEqual(25)
      expect(used(r)).toBeLessThanOrEqual(45)
    }
  })

  it('make risk a real choice: it wins sooner but spends the clock, and too much loses', async () => {
    const calm = await play(await phase2(2), steady({ reinvest: true }), 120)
    const reckless = { reinvest: true, answers: { alarm: score(3) } }
    const risky = await play(await phase2(2), steady(reckless), 120)
    expect(used(risky)).toBeLessThan(used(calm) - 10)
    expect(risky.weeksLost).toBeGreaterThan(30)
    // The same gamble on a brilliant goal, with two minds to design, runs out of time…
    expect((await play(await phase2(0), steady(reckless), 120)).lost).not.toBeNull()
    // …unless cover buys the weeks back.
    const covered = await play(await phase2(0), steady({ ...reckless, coverBelow: 20 }), 120)
    expect(covered.won).not.toBeNull()
    expect(covered.weeksGained).toBeGreaterThan(0)
    const panic = { reinvest: true, answers: { alarm: score(4) } }
    expect((await play(await phase2(2), steady(panic), 120)).lost).not.toBeNull()
  })

  it('make cover cost growth when it isn’t needed', async () => {
    const calm = await play(await phase2(2), steady({ reinvest: true }), 120)
    const covered = await play(await phase2(2), steady({ reinvest: true, coverBelow: 30 }), 120)
    expect(covered.weeksGained).toBeGreaterThan(0)
    expect(used(covered)).toBeGreaterThan(used(calm))
  })
})
