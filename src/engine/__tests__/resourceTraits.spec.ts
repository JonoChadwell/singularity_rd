import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { simulateWeek } from '../economy'
import { createInitialState, newResource } from '../initialState'
import { findResource, payCost, TRAIT_GROWTH, TRAIT_LOSS } from '../model'
import { acceptResource, autoTraits, judgeResource } from '../proposals'
import {
  ALL_RESOURCE_TRAITS,
  costFactor,
  effectiveTier,
  makeFactor,
  speculativeFactor,
  useFactor,
  weeklyLossOf,
  type ResourceTraitId
} from '../resourceTraits'
import type { GameState } from '../types'
import { choice, FakeJudge } from './fakeJudge'

const ROOMY = 1e9

function world(traits: ResourceTraitId[], amount = 1000, cap = ROOMY): GameState {
  const s = createInitialState()
  s.phase.status = 'playing'
  s.resources.push(newResource({ id: 'stuff', name: 'Stuff', amount, cap, traits }))
  return s
}

describe('resource traits', () => {
  it('each mixes an upside with a downside', () => {
    for (const t of ALL_RESOURCE_TRAITS) {
      expect(t.upside.length).toBeGreaterThan(5)
      expect(t.downside.length).toBeGreaterThan(5)
    }
  })

  it('make costs in them cheaper or dearer, research and parts alike unless said otherwise', () => {
    const s = createInitialState()
    const r = (traits: ResourceTraitId[]) => ({ id: 'x', traits })
    expect(costFactor(s, r(['energetic']), true)).toBe(0.5)
    expect(costFactor(s, r(['energetic']), false)).toBe(0.5)
    expect(costFactor(s, r(['catalytic']), true)).toBe(2)
    expect(costFactor(s, r(['staple']), true)).toBe(0.75)
    expect(costFactor(s, r(['staple']), false)).toBe(1)
    expect(costFactor(s, r(['compounding']), true)).toBe(1.5)
  })

  it('Speculative: a factor in range, the same all week, and new each week', () => {
    const s = createInitialState()
    const seen = new Set<number>()
    for (let week = 1; week <= 20; week++) {
      const f = speculativeFactor({ runId: s.runId, week }, 'x')
      expect(f).toBeGreaterThanOrEqual(B.SPECULATIVE_RANGE[0])
      expect(f).toBeLessThanOrEqual(B.SPECULATIVE_RANGE[1])
      expect(speculativeFactor({ runId: s.runId, week }, 'x')).toBe(f)
      seen.add(f)
    }
    expect(seen.size).toBeGreaterThan(10)
  })

  it('change what is used and made', () => {
    expect(useFactor({ traits: ['catalytic'] })).toBe(0.5)
    expect(useFactor({ traits: ['self-replicating'] })).toBe(1.25)
    expect(makeFactor({ traits: ['perishable'] }, 1)).toBe(1.5)
    expect(makeFactor({ traits: ['seasonal'] }, 1)).toBe(2)
    expect(makeFactor({ traits: ['seasonal'] }, 2)).toBe(0.5)
  })

  it('move the tier only for their own purpose, within 0 to 4', () => {
    const crude = { tier: 0, traits: ['crude'] as ResourceTraitId[] }
    expect(effectiveTier(crude, 'make')).toBe(0)
    expect(effectiveTier({ tier: 2, traits: ['crude'] }, 'make')).toBe(1)
    expect(effectiveTier({ tier: 2, traits: ['crude'] }, 'reach')).toBe(2)
    expect(effectiveTier({ tier: 1, traits: ['prestigious'] }, 'platform')).toBe(2)
  })

  it('lose a share of what is left at the end of the week', () => {
    const s = world(['energetic'])
    const report = simulateWeek(s)
    expect(findResource(s, 'stuff')!.amount).toBeCloseTo(500)
    expect(report.flows.stuff?.find((f) => f.label === TRAIT_LOSS)?.amount).toBeCloseTo(-500)
    expect(weeklyLossOf({ traits: ['perishable', 'liquid'] })).toBeCloseTo(1 - 0.9 * 0.95)
  })

  it('grow on their own, but only into free room', () => {
    const s = world(['compounding'])
    const report = simulateWeek(s)
    expect(findResource(s, 'stuff')!.amount).toBeCloseTo(1030)
    expect(report.flows.stuff?.find((f) => f.label === TRAIT_GROWTH)?.amount).toBeCloseTo(30)
    const full = world(['self-replicating'], 1000, 1050)
    simulateWeek(full)
    expect(findResource(full, 'stuff')!.amount).toBeCloseTo(1050)
    const renew = world(['renewable'], 0, 1000)
    simulateWeek(renew)
    expect(findResource(renew, 'stuff')!.amount).toBeCloseTo(20)
  })

  it('Recyclable: half of what is spent comes back next week', () => {
    const s = world(['recyclable'])
    payCost(s, [{ resourceId: 'stuff', amount: 400 }], 'Test')
    expect(findResource(s, 'stuff')!.amount).toBe(600)
    simulateWeek(s)
    expect(findResource(s, 'stuff')!.amount).toBeCloseTo(800)
    expect(s.deliveries).toEqual([])
  })
})

describe('choosing a resource’s traits', () => {
  const ranking = (probabilities: Record<string, number>) =>
    choice(Object.keys(probabilities)[0]!, probabilities)

  it('takes Jev’s best, and a second from another family only when Jev liked it nearly as much', () => {
    expect(autoTraits(ranking({ perishable: 0.5, exotic: 0.4 }))).toEqual(['perishable', 'exotic'])
    expect(autoTraits(ranking({ perishable: 0.8, exotic: 0.2 }))).toEqual(['perishable'])
    // Volatile is Perishable's own family, so the second is the next one that isn't.
    expect(autoTraits(ranking({ perishable: 0.4, volatile: 0.35, exotic: 0.3 }))).toEqual([
      'perishable',
      'exotic'
    ])
    expect(autoTraits(choice('mundane'))).toEqual(['mundane'])
  })

  it('offers three choices by hand, and keeps the one picked', async () => {
    const s = createInitialState()
    s.phase.status = 'playing'
    const judge = new FakeJudge({ trait: ranking({ liquid: 0.6, staple: 0.2, hazardous: 0.1 }) })
    const v = await judgeResource(s, judge, { name: 'Lemons', description: 'Sour.' })
    expect(v.options).toEqual([['liquid'], ['staple'], ['hazardous']])
    v.choice = 2
    const lemons = acceptResource(s, v).state.resources.find((r) => r.name === 'Lemons')!
    expect(lemons.traits).toEqual(['hazardous'])
    v.choice = 0
    const liquid = acceptResource(s, v).state.resources.find((r) => r.name === 'Lemons')!
    expect(liquid.cap).toBeGreaterThan(lemons.cap)
  })
})
