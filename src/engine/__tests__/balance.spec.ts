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
    for (const table of [B.TIERS, B.INCOME_DIFFICULTY]) {
      for (const [label, iq] of table) expect(iq, label).toBeGreaterThanOrEqual(B.MIN_IQ)
      for (let i = 1; i < table.length; i++) expect(table[i]![2]).toBeGreaterThan(table[i - 1]![2])
    }
    // A passive income pays for itself within a few weeks.
    expect(B.INCOME_COST_WEEKS).toBeLessThanOrEqual(4)
  })

  it('reaches IQ 450 with two new platforms and their software, the second one only needing to exist', () => {
    // Every option at full size: the starting software, a platform, its software, a platform.
    let iq = B.START_IQ
    const path: number[] = []
    for (let i = 0; i < 4; i++) path.push((iq += B.MAX_IQ_STEP))
    expect(path).toEqual([200, 300, 400, 500])
    // Without the second platform's own software, the second platform still clears 450;
    // without the second platform, the first one's software (400) doesn't.
    const goal = B.GOAL_APPROACH[2]![3]
    expect(goal).toBeLessThanOrEqual(path[3]!)
    expect(goal).toBeGreaterThan(path[2]!)
  })

  it('makes a platform cost far more than a software upgrade, and gates the smart ones on units', () => {
    for (const iq of [200, 300, 400, 500]) {
      const software = B.MIND_UPGRADE_SHARE * B.TRAIT_SOFTWARE_COST * (B.softwareCost(iq) - B.softwareCost(iq - B.MAX_IQ_STEP))
      expect(software).toBeLessThan(B.mindDesignCost(iq) / 10)
    }
    expect([100, 299, 300, 449, 450, 600].map(B.platformGateTier)).toEqual([null, null, 1, 1, 2, 2])
    expect(B.platformGateTier(B.START_IQ + B.MAX_IQ_STEP)).toBeNull()
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

  it('win in weeks 5 to 7 with an income a week and upgrades as needed: Phase 1 is a tutorial', async () => {
    for (const a of APPROACHES) {
      const r = await play(await phase1(a), flat, 12)
      expect(r.won).toBeGreaterThanOrEqual(5)
      expect(r.won).toBeLessThanOrEqual(7)
    }
  })

  it('win by week 10 with a growing chain: novels, then royalties that grow with them', async () => {
    for (const a of APPROACHES) expect((await play(await phase1(a), chain2, 12)).won).not.toBeNull()
  })

  it('get little for free: rushing the server’s one upgrade for the richest incomes wins at most a week sooner', async () => {
    // A full-size upgrade is IQ 200, which unlocks Jev's richest income band, but it is dear.
    const rushed = await play(await phase1(2), smart, 12)
    const steady = await play(await phase1(2), flat, 12)
    expect(rushed.won ?? 11).toBeGreaterThanOrEqual(steady.won! - 1)
  })
})

// Skipped for now: a tier-4 unit is made from three kinds of part (PARTS_BY_TIER), and the bot
// doesn't yet make Feedstock and Lab Time for its Nanofab. To be picked up with the economy retune.
describe.skip('Phase 2 bots', () => {
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
      // A fleet worth tens of billions gets noticed, a week more at each power of ten, for mills and for fabs.
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
    // Everything at "humanity would panic" loses, and cover can't buy that much back.
    const panic = { reinvest: true, answers: { alarm: score(4) } }
    for (const a of APPROACHES) {
      expect((await play(await phase2(a), steady(panic), 120)).lost).not.toBeNull()
      const covered = await play(await phase2(a), steady({ ...panic, coverBelow: 25 }), 120)
      expect(covered.weeksGained).toBeGreaterThan(0)
      expect(covered.lost).not.toBeNull()
    }
  })

  it('make cover cost growth when it isn’t needed, but buy time', async () => {
    // Weeks left on the clock when the goal was researched.
    const spare = (r: Result) => 8 + B.PHASE_WEEKS[2] - r.weeksLost + r.weeksGained - (r.won ?? Infinity)
    const calm = await play(await phase2(2), steady({ reinvest: true }), 120)
    // Every week is under 200 weeks left, so the bot buys cover whenever it can, needed or not.
    const covered = await play(await phase2(2), steady({ reinvest: true, coverBelow: 200 }), 120)
    expect(covered.weeksGained).toBeGreaterThan(0)
    // Slower, since the money goes on cover…
    expect(used(covered)).toBeGreaterThan(used(calm))
    // …but with more time left to spare, because the cover bought more than it cost.
    expect(spare(covered)).toBeGreaterThan(spare(calm))
  })
})
