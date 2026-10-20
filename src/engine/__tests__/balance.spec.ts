import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { buyUnits } from '../actions'
import { runWeek } from '../cycle'
import { createInitialState, FINAL_ID, newUnit, SERVER_ID } from '../initialState'
import { previewWeek } from '../economy'
import { affordable, findResource, findUnit, MONEY_ID, moneyUse } from '../model'
import { expectedPool, projectSize, researchSpeed, effectiveIQ } from '../research'
import type { GameState } from '../types'

// Scripted checks of MASTER_PLAN.md §14's balance targets, with Jev's middle answers.

/** The opening of sample run A: freelance coding, then rented copies of yourself. */
function opening(): GameState {
  const s = createInitialState()
  const iq = 90
  s.units.push(
    newUnit({
      id: 'gpu',
      name: 'Rented Cloud GPU',
      mind: true,
      hardware: { name: 'Hardware', iq },
      value: B.mindValue(iq),
      upkeep: [{ resourceId: MONEY_ID, amount: B.nice(B.mindLabour(iq) * 0.25) }],
      layers: { market: 1e5, own: 0, earth: 0 }
    })
  )
  s.strategies.push(
    { id: 'code', name: 'Freelance coding', description: '', unitId: SERVER_ID, kind: 'make', inputs: [], outputId: MONEY_ID, amount: 1000, scale: 1000 },
    { id: 'code-gpu', name: 'Freelance coding', description: '', unitId: 'gpu', kind: 'make', inputs: [], outputId: MONEY_ID, amount: 810, scale: 810 }
  )
  findUnit(s, SERVER_ID)!.rest = 'code'
  findUnit(s, 'gpu')!.rest = 'code-gpu'
  return s
}

describe('balance', () => {
  it('doubles the early economy every one to two weeks', () => {
    let s = opening()
    const income: number[] = []
    for (let week = 1; week <= 16; week++) {
      const gpu = findUnit(s, 'gpu')!
      const n = affordable(gpu, findResource(s, MONEY_ID)!.amount, moneyUse(previewWeek(s)))
      if (n > 0) s = buyUnits(s, 'gpu', n)
      const before = findResource(s, MONEY_ID)!.amount
      s = runWeek(s)
      income.push(findResource(s, MONEY_ID)!.amount - before)
    }
    const doublingWeeks = 10 / Math.log2(income[15]! / income[5]!)
    expect(doublingWeeks).toBeGreaterThan(1)
    expect(doublingWeeks).toBeLessThan(2.2)
  })

  it('sizes lab projects at 2 to 6 weeks and tier designs at 8 to 15 for the Starting Server', () => {
    const server = createInitialState().units[0]!
    // An IQ breakthrough of +30%: bar 65, gain 3.
    const lab = projectSize(65, Math.max(B.BREAKTHROUGH_MIN_WEEKS, 3 * B.BREAKTHROUGH_WEEKS_PER_GAIN))
    const labWeeks = lab / researchSpeed(server, 1, effectiveIQ(server, 1, null), 65)
    expect(labWeeks).toBeGreaterThanOrEqual(2)
    expect(labWeeks).toBeLessThanOrEqual(6)
    // Designing Tier 1 at IQ 250 (bar 125) with the server improved to 130.
    const improved = { ...server, software: { ...server.software, bonus: 0.3 } }
    const design = projectSize(125, B.TIER_DESIGN_WEEKS)
    const designWeeks = design / researchSpeed(improved, 1, effectiveIQ(improved, 1, null), 125)
    expect(designWeeks).toBeGreaterThanOrEqual(8)
    expect(designWeeks).toBeLessThanOrEqual(15)
  })

  it('needs a large Tier 3 pool to finish the final project in 10 to 20 weeks', () => {
    const s = createInitialState()
    const final = s.projects.find((p) => p.id === FINAL_ID)!
    const tier3 = newUnit({ id: 'q', name: 'Quantum Supercomputer', mind: true, hardware: { name: 'Hardware', iq: 1050 } })
    const weeks = (n: number) => final.size / researchSpeed(tier3, n, effectiveIQ(tier3, n, final.field), final.bar)
    expect(weeks(expectedPool(1000))).toBeGreaterThanOrEqual(10)
    expect(weeks(expectedPool(1000))).toBeLessThanOrEqual(20)
    // A small pool of a smart enough mind still can't brute-force it quickly.
    expect(weeks(1e4)).toBeGreaterThan(100)
    // And no pool of IQ-300 machines helps at all.
    const tier1 = newUnit({ id: 't1', name: 'Custom AI Server', mind: true, hardware: { name: 'Hardware', iq: 300 } })
    expect(researchSpeed(tier1, 1e9, effectiveIQ(tier1, 1e9, null), final.bar)).toBe(0)
  })

  it('allows two to four tiers: the ceiling and pooling cap each leap', () => {
    // A tier at its software ceiling, pooled at huge scale, can design at most this multiple.
    const leap = (n: number) => (B.IQ_CEILING * (1 + B.POOL_IQ * Math.log10(n))) / B.DESIGN_BAR
    expect(leap(1)).toBeCloseTo(3)
    expect(leap(1e8)).toBeLessThan(4.3)
    // From the Starting Server's 100 to the final bar of 1,000: rushing (×2 a tier) takes
    // four tiers; maxing every tier (×4) takes two.
    expect(Math.ceil(Math.log(10) / Math.log(2))).toBe(4)
    expect(Math.ceil(Math.log(10) / Math.log(leap(1e8)))).toBe(2)
  })
})
