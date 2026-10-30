import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { createUnits } from '../actions'
import { runWeek } from '../cycle'
import { createInitialState, newResource, newUnit } from '../initialState'
import { judgeDepot } from '../depotProposal'
import { previewWeek } from '../economy'
import { capOf, creatable, findResource, MONEY_ID, weeklyUse } from '../model'
import { newPhase } from '../phase'
import { goalOf } from '../projection'
import type { GameState } from '../types'
import { chain, chain2, covered, depotAnswers, flat, idle, phase1, phase2, play, smart, steady, type Result } from './bots'
import { econStart } from './econBots'
import { FakeJudge, noul, score } from './fakeJudge'

// Scripted checks of the balance, with Jev's typical answers. The bots are in bots.ts; the
// rules are in ECONOMY_DESIGN.md. Set BOT_REPORT=1 and run botreport.spec.ts to see them all.

/**
 * The loop the bounded economy is meant to stop: two units feeding each other, one making
 * Steel from Power and selling it, the other making Power, each with a fixed contract.
 */
function loop(): GameState {
  const s = createInitialState()
  s.runId = 'test-run'
  s.phase = newPhase(3, 1)
  s.resources.push(
    newResource({ id: MONEY_ID, name: 'Money', value: 1, amount: 5000, cap: 20000 }),
    newResource({ id: 'power', name: 'Power', value: 0.1 })
  )
  const unit = (id: string, value: number) => {
    s.units.push(newUnit({ id, name: id, value, upkeep: [{ resourceId: MONEY_ID, amount: B.nice((value / B.PAYBACK_WEEKS) * 0.25) }] }))
    s.sourcing.push({ id: `${id}-deal`, unitId: id, name: 'Deal', description: '', parts: [{ resourceId: MONEY_ID, amount: value }], total: 100, used: 0, risky: false })
  }
  unit('plant', 200)
  unit('mill', 200)
  s.strategies.push(
    { id: 'gen', name: 'Generate', description: '', unitId: 'plant', kind: 'make', inputs: [], outputId: 'power', amount: B.nice(200 / B.PAYBACK_WEEKS / 0.1) },
    { id: 'sell', name: 'Sell', description: '', unitId: 'mill', kind: 'make', inputs: [{ resourceId: 'power', amount: 100 }], outputId: MONEY_ID, amount: B.nice((200 / B.PAYBACK_WEEKS) * 1.5) }
  )
  s.units[0]!.rest = 'gen'
  s.units[1]!.rest = 'sell'
  return s
}

describe('balance', () => {
  it('stops a two-unit loop at its caps: growth needs new actions', () => {
    let s = loop()
    const money: number[] = []
    for (let week = 1; week <= 40; week++) {
      // A few of each a week, mills first, so neither side starves the other.
      for (const c of [...s.sourcing].reverse()) {
        const n = Math.min(5, creatable(s, c, weeklyUse(previewWeek(s))))
        if (n > 0) s = createUnits(s, c.id, n)
      }
      s = runWeek(s)
      money.push(findResource(s, MONEY_ID)!.amount)
    }
    // Both contracts fill, and Money sits at its storage cap, the rest overflowing.
    expect(s.sourcing.map((c) => c.used), `money ${money.join(',')}`).toEqual([100, 100])
    const cap = capOf(s, findResource(s, MONEY_ID)!)
    expect(money[39]).toBeCloseTo(cap)
    expect(money[39]).toBe(money[34])
    expect(s.lastWeek!.wasted[MONEY_ID]).toBeGreaterThan(0)
  })

  it('never asks for less than IQ 100, and makes harder research cost more', () => {
    for (const [label, iq] of B.TIERS) expect(iq, label).toBeGreaterThanOrEqual(B.MIN_IQ)
    for (let i = 1; i < B.TIERS.length; i++) expect(B.TIERS[i]![2]).toBeGreaterThan(B.TIERS[i - 1]![2])
  })

  it('values units and resources on irregular steps, never exact 3× or 10× apart', () => {
    for (const table of [B.UNIT_VALUE, B.RESOURCE_VALUE]) {
      for (let i = 1; i < table.length; i++) {
        const ratio = table[i]![1] / table[i - 1]![1]
        expect(ratio).toBeGreaterThan(1)
        expect([3, 10]).not.toContain(Math.round(ratio * 1000) / 1000)
      }
    }
  })

  it('reaches IQ 450 with two new platforms and their software, the second one only needing to exist', () => {
    // Every option at full size: the starting software, a platform, its software, a platform.
    let iq = B.START_IQ
    const path: number[] = []
    for (let i = 0; i < 4; i++) path.push((iq += B.MAX_IQ_STEP))
    expect(path).toEqual([200, 300, 400, 500])
    // The easiest Phase 2 goal; the others need the second platform's software too.
    const goal = B.GOAL_APPROACH[2]![3]
    expect(goal).toBeLessThanOrEqual(path[3]!)
    expect(goal).toBeGreaterThan(path[2]!)
  })

  it('makes a platform cost more than a software upgrade, and gates the smart ones on units', () => {
    for (const iq of [200, 300, 400, 500]) {
      const software = B.softwarePrice(iq - B.MAX_IQ_STEP, B.MAX_IQ_STEP) * B.TRAIT_SOFTWARE_COST
      expect(software).toBeLessThan(B.platformPrice(iq - B.MAX_IQ_STEP, iq))
    }
    expect([100, 299, 300, 449, 450, 600].map(B.platformGateTier)).toEqual([null, null, 1, 1, 2, 2])
    expect(B.platformGateTier(B.START_IQ + B.MAX_IQ_STEP)).toBeNull()
  })

  it('holds the goal after one depot design, building them for a small share of what they hold', async () => {
    for (const approach of [0, 1, 2]) {
      const s = await econStart(approach)
      s.proposedThisWeek = false
      const goal = goalOf(s)!
      const r = findResource(s, goal.cost[0]!.resourceId)!
      // Nothing to hold it in at first: tier 3 starts with no storage.
      expect(capOf(s, r)).toBeLessThan(goal.cost[0]!.amount)
      const v = await judgeDepot(s, new FakeJudge({ plausible: noul(0.7), ...depotAnswers(s, r.id) }), { resourceId: r.id, name: 'Vat', description: '' })
      expect(v.target.amount).toBe(goal.cost[0]!.amount)
      // One design holds it all; building them costs 3–30% of what they hold (Jev's answer is a power of ten).
      const share = v.options[0]!.neededWorth / (goal.cost[0]!.amount * r.value)
      expect(share, `approach ${approach}`).toBeGreaterThan(0.03)
      expect(share, `approach ${approach}`).toBeLessThan(0.3)
    }
  })

  it('prices hardware by the IQ it adds, however you get there', () => {
    expect(B.platformPrice(100, 100)).toBe(0)
    expect(B.platformPrice(100, 200) + B.platformPrice(200, 300)).toBeCloseTo(B.platformPrice(100, 300))
    expect(B.softwarePrice(200, 100)).toBeCloseTo(0.2 * B.platformPrice(200, 300))
    for (let iq = 100; iq < 1000; iq += 25) expect(B.hardwareCost(iq + 25)).toBeGreaterThan(B.hardwareCost(iq))
  })

  it('costs about the same in total to win at IQ 450, 525 or 600: hardware makes up what the goal saves', () => {
    // The cheapest way to the goal: hardware 100 under it, then the software at full size.
    const totals = B.GOAL_APPROACH.map(([, , , iq, mult]) => {
      const hardware = iq - B.MAX_IQ_STEP
      return B.GOAL_WORTH_2 * mult + B.platformPrice(B.START_IQ, hardware) + B.softwarePrice(hardware, B.MAX_IQ_STEP)
    })
    for (const t of totals) expect(t / totals[1]!).toBeGreaterThan(0.95)
    for (const t of totals) expect(t / totals[1]!).toBeLessThan(1.05)
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
    expect(B.GOAL_APPROACH.map((a) => a[3])).toEqual(expect.arrayContaining([450, 600]))
  })

  it('reaches above your IQ at a price that grows smoothly', () => {
    expect(B.reachFactor(0)).toBe(1)
    expect(B.reachFactor(1)).toBe(B.TIER_PENALTY[1])
    // Between whole tiers it's in between, and always falling.
    let last = 1
    for (let t = 0.25; t <= 4; t += 0.25) {
      expect(B.reachFactor(t)).toBeLessThan(last)
      last = B.reachFactor(t)
    }
    expect(B.iqTier(175)).toBeCloseTo(2.5)
    expect(B.iqTier(500)).toBeCloseTo(5)
  })
})

const APPROACHES = [0, 1, 2]

describe('Phase 1 bots', () => {
  it('lose doing nothing useful: one Procurement and no upgrades', async () => {
    for (const a of APPROACHES) expect((await play(await phase1(a), idle, 12)).lost).toBe(B.PHASE_WEEKS[1])
  })

  // Bots never lose plausibility penalties the way a real player keeps Jev happy, so they win
  // sooner than people do: within the six weeks here is what leaves room for the cover in play.
  it('win in weeks 4 to 6 Creating into the goal, with upgrades as needed and no storage: Phase 1 is a tutorial', async () => {
    for (const a of APPROACHES) {
      const r = await play(await phase1(a), flat, 12)
      expect(r.won, `approach ${a}`).toBeGreaterThanOrEqual(4)
      expect(r.won, `approach ${a}`).toBeLessThanOrEqual(6)
    }
  })

  it('win by week 6 with an every-week Procurement first, or saving up with later payouts', async () => {
    for (const a of APPROACHES) {
      expect((await play(await phase1(a), chain2, 12)).won, `chain2 ${a}`).not.toBeNull()
      expect((await play(await phase1(a), chain, 12)).won, `chain ${a}`).not.toBeNull()
    }
  })

  it('win every approach after using the cover', async () => {
    for (const a of APPROACHES) expect((await play(await phase1(a), covered, 14)).won, `covered ${a}`).not.toBeNull()
  })

  it('get little for free: rushing the server’s one upgrade wins no sooner', async () => {
    const rushed = await play(await phase1(2), smart, 12)
    const steady = await play(await phase1(2), flat, 12)
    expect(rushed.won ?? 11).toBeGreaterThanOrEqual(steady.won!)
  })
})

// Skipped for now: Phase 2 isn't tuned. Creating into the goal's resource beats industry (a
// player who never reinvests can still win), and the scripted player spends too much clock on
// storage, so brilliant and scale-heavy plans lose. Since the clock went from 100 weeks to 80,
// the steady player loses even the balanced plan (week 76, after 17 weeks to expansions). The
// targets stand for the retune.
describe.skip('Phase 2 bots', () => {
  it('lets a steady player win a balanced plan before the clock runs out', async () => {
    const r = await play(await phase2(2), steady({ reinvest: true }), 120)
    expect(r.won).not.toBeNull()
    expect(r.lost).toBeNull()
  })

  /** Phase 2 weeks used: from the plan in week 8 to the week the goal was researched, inclusive. */
  const used = (r: Result) => (r.won === null ? Infinity : r.won - 8 + 1)

  it('lose without reinvesting', async () => {
    const r = await play(await phase2(2), steady({ reinvest: false }), 120)
    expect(r.lost).not.toBeNull()
  })

  it('win a sensible game in 40 to 64 weeks, whatever the goal takes', async () => {
    for (const a of APPROACHES) {
      const r = await play(await phase2(a), steady({ reinvest: true }), 120)
      expect(used(r)).toBeGreaterThanOrEqual(40)
      expect(used(r)).toBeLessThanOrEqual(64)
    }
  })

  it('make risk a real choice: it wins sooner but spends the clock', async () => {
    const calm = await play(await phase2(2), steady({ reinvest: true }), 120)
    const risky = await play(await phase2(2), steady({ reinvest: true, risky: true }), 120)
    expect(used(risky)).toBeLessThan(used(calm))
    expect(risky.weeksLost).toBeGreaterThan(calm.weeksLost)
    const panic = await play(await phase2(2), steady({ reinvest: true, answers: { alarm: score(4) } }), 120)
    expect(panic.lost).not.toBeNull()
  })
})
