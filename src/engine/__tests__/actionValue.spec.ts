import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { createUnits } from '../actions'
import { deliveryStream, fillStream, HORIZON, paybackWeeks, runningNet, valueAt, valueChange, worthOf } from '../actionValue'
import { acceptCreate, judgeCreate } from '../createProposal'
import { runWeek } from '../cycle'
import { createInitialState, newResource, newUnit } from '../initialState'
import { baseLabour, findResource, labourOf, MONEY_ID } from '../model'
import { newPhase } from '../phase'
import { applyUnitChanges } from '../research'
import type { GameState } from '../types'
import { choice, FakeJudge, score } from './fakeJudge'

// What actionValue predicts, checked against what a played week actually does.

/** Money, Steel, and Mills that turn Steel into Money, with room for more Mills. */
function mills(count = 10): GameState {
  const s = createInitialState()
  s.runId = 'value-test'
  s.phase = newPhase(3, 1)
  s.resources.push(
    newResource({ id: MONEY_ID, name: 'Money', value: 1, amount: 50_000, cap: 1e9 }),
    newResource({ id: 'steel', name: 'Steel', value: 2, amount: 20_000, cap: 1e9 })
  )
  s.units.push(newUnit({ id: 'mill', name: 'Mill', value: 200, count: count, upkeep: [{ resourceId: 'steel', amount: 5 }], rest: 'sell' }))
  s.strategies.push({ id: 'sell', name: 'Sell', description: '', unitId: 'mill', kind: 'make', inputs: [{ resourceId: 'steel', amount: 20 }], outputId: MONEY_ID, amount: 300 })
  s.sourcing.push({ id: 'deal', unitId: 'mill', name: 'Deal', description: '', parts: [{ resourceId: MONEY_ID, amount: 200 }], total: 100, used: count, risky: false })
  return s
}

/** What a played week did to net worth. */
const played = (s: GameState) => worthOf(runWeek(s)).net - worthOf(s).net

describe('action values', () => {
  it('values running as what a played week does to net worth', () => {
    const s = mills()
    // Each Mill makes 300 Money from 20 Steel and 5 Steel upkeep: 300 − 50 = 250 a week.
    expect(runningNet(s)).toBeCloseTo(10 * 250)
    expect(played(s)).toBeCloseTo(runningNet(s))
  })

  it('predicts what creating units adds each week, and counts them at their value', () => {
    const before = mills()
    const after = createUnits(before, 'deal', 5)
    const v = valueChange(before, after, 'units', 'Create 5 Mills')
    // Parts worth 200 each become units worth 200 each.
    expect(v.now).toBeCloseTo(0)
    expect(v.cost).toBeCloseTo(5 * 200)
    expect(v.weekly[0]).toBeCloseTo(5 * 250)
    expect(played(after) - played(before)).toBeCloseTo(v.weekly[0]!)
    // 1,000 of parts, 1,250 a week back.
    expect(paybackWeeks(v)).toBe(1)
  })

  it('predicts an output upgrade', () => {
    const before = mills()
    const after = structuredClone(before)
    applyUnitChanges(after, after.units[0]!, [{ kind: 'output', strategyId: 'sell', factor: B.OUTPUT_FACTOR }])
    const v = valueChange(before, after, 'upgrade', 'Better Sell')
    expect(v.weekly[0]).toBeCloseTo(10 * 300 * (B.OUTPUT_FACTOR - 1))
    expect(played(after) - played(before)).toBeCloseTo(v.weekly[0]!)
  })

  it('counts what overflows storage as lost, and storage as what it saves', () => {
    const before = mills()
    const money = findResource(before, MONEY_ID)!
    money.cap = 51_000
    // 3,000 a week made into 1,000 of room: 2,000 overflows. A depot holding a million ends it.
    const after = structuredClone(before)
    after.units.push(newUnit({ id: 'vault', name: 'Vault', value: 1000, count: 1, holds: { resourceId: MONEY_ID, amount: 1e6 } }))
    const v = valueChange(before, after, 'storage', 'Vault')
    expect(v.weekly[0]).toBeCloseTo(2_000)
    expect(played(after) - played(before)).toBeCloseTo(v.weekly[0]!)
  })

  it('lays out a Procurement’s payout week by week, and what it uses up at once', async () => {
    const s = mills(0)
    const judge = new FakeJudge({ timing: choice('weekly'), efficiency: score(2) })
    const v = await judgeCreate(s, judge, { target: { kind: 'resource', id: 'steel' }, name: 'Buy steel', description: '' })
    v.choice = v.options.findIndex((o) => o.timing === 'weekly')
    const option = v.options[v.choice]!
    const after = acceptCreate(s, v).state
    const value = valueChange(s, after, 'procure', 'Buy steel')
    expect('outputWorth' in option).toBe(true)
    const output = 'outputWorth' in option ? option.outputWorth : 0
    const input = 'inputWorth' in option ? option.inputWorth : 0
    expect(value.now).toBeCloseTo(-input)
    // Paid ⅕ of the total, a week, for 20 weeks: ×4 in all.
    expect(value.weekly[0]).toBeCloseTo(output / 20, 0)
    expect(value.weekly[19]).toBeCloseTo(output / 20, 0)
    expect(value.weekly[20]).toBeCloseTo(0)
    expect(valueAt(value, HORIZON)).toBeCloseTo(output - input, -1)
    // The first week's payout is what a played week adds.
    expect(played(after) - played(s)).toBeCloseTo(deliveryStream(after)[0]!, 0)
  })

  it('fills a contract’s open slots as spare income pays their parts', () => {
    const s = mills()
    // 90 open slots at 200 each, 1,000 a week to spend: 5 more units a week.
    const stream = fillStream(s, 'mill', 250, 1_000)
    expect(stream[0]).toBeCloseTo(5 * 250)
    expect(stream[1]).toBeCloseTo(10 * 250)
    expect(stream[HORIZON - 1]).toBeCloseTo(90 * 250)
  })

  it('sizes upkeep and inputs by the work before the tier’s yield, so a higher tier earns more from the same', () => {
    expect(labourOf(35000, 0)).toBeCloseTo(baseLabour(35000))
    expect(labourOf(35000, 2)).toBeCloseTo(baseLabour(35000) * B.TIER_YIELD[2]!)
    for (let t = 1; t < B.TIER_YIELD.length; t++) expect(B.TIER_YIELD[t]!).toBeGreaterThan(B.TIER_YIELD[t - 1]!)
  })

  it('counts a unit’s worth by its count, so ten small units are worth one ten times dearer', () => {
    const a = mills()
    const b = mills()
    b.units[0]!.value = 2000
    b.units[0]!.count = 1
    expect(worthOf(a).fleet).toBeCloseTo(worthOf(b).fleet)
  })
})
