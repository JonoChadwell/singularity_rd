import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { createUnits } from '../actions'
import { runWeek } from '../cycle'
import { createInitialState, newResource, newUnit } from '../initialState'
import { previewWeek } from '../economy'
import { creatable, findResource, findUnit, MONEY_ID, weeklyUse } from '../model'
import { newPhase } from '../phase'
import type { GameState } from '../types'

// Scripted checks of the balance, with Jev's middle answers.

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
    // A passive income pays for itself in a month.
    expect(B.INCOME_COST_WEEKS).toBeLessThanOrEqual(6)
  })

  it('allows two to four tiers: the software ceiling and the leap rule cap each leap', () => {
    // A tier at its software ceiling can design at most this multiple of its base IQ.
    const leap = (share: number) => B.IQ_CEILING / share
    expect(leap(B.DESIGN_BAR)).toBeCloseTo(3)
    // From the Starting Server's 100 to IQ 1,000: rushing (×2 a tier) takes four tiers;
    // maxing every tier with modest designs takes two.
    expect(Math.ceil(Math.log(10) / Math.log(2))).toBe(4)
    expect(Math.ceil(Math.log(10) / Math.log(leap(B.LEAP_MIN)))).toBe(2)
  })
})
