import { describe, expect, it } from 'vitest'
import { CachedJudge } from '@/ai/jev'
import * as B from '../balance'
import { assign, assignRest, buyResource, buyUnits, setBuildTarget, teachStrategy } from '../actions'
import { alertsFor } from '../alerts'
import {
  acceptBreakthrough,
  FACTORS,
  judgeBreakthrough,
  OUTPUT_FACTORS,
  precheckBreakthrough,
  type BreakthroughSpec
} from '../breakthroughProposal'
import { runWeek } from '../cycle'
import { previewWeek } from '../economy'
import { createInitialState, FINAL_ID, newResource, newUnit, SERVER_ID } from '../initialState'
import { affordable, allocation, findResource, findUnit, fmt, marketCost, MONEY_ID, softwareLabel, unitLimit } from '../model'
import {
  BREAKTHROUGH_PRESETS,
  presetBlocker,
  resolveResources,
  RESOURCE_PRESETS,
  runnerFor,
  STRATEGY_PRESETS,
  UNIT_PRESETS
} from '../presets'
import { acceptResource, acceptStrategy, judgeResource, judgeStrategy } from '../proposals'
import { effectiveIQ, makeBuildStrategy, researchSpeed } from '../research'
import type { GameState, Strategy, UnitType } from '../types'
import { acceptUnit, answerPushback, DEFAULT_SOFTWARE, judgeUnit, type UnitSpec } from '../unitProposal'
import { choice, FakeJudge, noul, score } from './fakeJudge'

const money = (s: GameState) => findResource(s, MONEY_ID)!.amount
const unit = (s: GameState, id: string) => findUnit(s, id)!

function withMoney(state: GameState, amount: number) {
  findResource(state, MONEY_ID)!.amount = amount
  return state
}

/** A small world: Power, a solar farm that makes it and servers that run on it. */
function powerWorld(servers = 4, farms = 1) {
  const s = createInitialState()
  s.resources.push(newResource({ id: 'power', name: 'Power', kind: 'flow', value: 0.1 }))
  const farm = newUnit({ id: 'farm', name: 'Solar Farm', count: farms, value: 1000 })
  const gpu = newUnit({
    id: 'gpu',
    name: 'GPU Server',
    count: servers,
    value: 1000,
    upkeep: [{ resourceId: 'power', amount: 50 }]
  })
  s.units.push(farm, gpu)
  const make = (id: string, unitId: string, outputId: string, amount: number): Strategy => ({
    id,
    name: id,
    description: id,
    unitId,
    kind: 'make',
    inputs: [],
    outputId,
    amount
  })
  s.strategies.push(make('generate', 'farm', 'power', 100), make('earn', 'gpu', MONEY_ID, 10))
  farm.rest = 'generate'
  gpu.rest = 'earn'
  return s
}

const mindSpec = (fields: Partial<UnitSpec> = {}): UnitSpec => ({
  name: 'Rented Cloud GPU',
  description: '',
  mind: true,
  parts: [MONEY_ID],
  upkeep: [MONEY_ID],
  builderId: null,
  targetIQ: 90,
  ...fields
})

describe('formatting', () => {
  it('shows numbers at their real size', () => {
    expect(fmt(950)).toBe('950')
    expect(fmt(9999)).toBe('9,999')
    expect(fmt(12_675)).toBe('12.7k')
    expect(fmt(640_000)).toBe('640k')
    expect(fmt(1_000_000)).toBe('1.0M')
    expect(fmt(2.5e9)).toBe('2.5B')
    expect(fmt(0.5)).toBe('0.5')
  })
})

describe('the start', () => {
  it('has only Money, the Starting Server and the final project', () => {
    const s = createInitialState()
    expect(s.resources.map((r) => r.name)).toEqual(['Money'])
    expect(money(s)).toBe(0)
    expect(s.units).toHaveLength(1)
    expect(unit(s, SERVER_ID)).toMatchObject({ hardware: { iq: 100 }, mind: true, count: 1, upkeep: [] })
    expect(unitLimit(unit(s, SERVER_ID))).toBe(1)
    expect(s.strategies).toHaveLength(0)
    expect(s.projects[0]).toMatchObject({ id: FINAL_ID, bar: 1000, field: 'physics' })
  })

  it('flags the idle Starting Server before the first press', () => {
    const s = createInitialState()
    const alerts = alertsFor(s, previewWeek(s))
    expect(alerts[0]?.text).toMatch(/Starting Server has nothing to do/)
    expect(alerts[0]?.prompt?.label).toBe('What could it do to earn money?')
  })

  it('offers an idle mind the strategies it already knows, and says when a project frees it', () => {
    const s = createInitialState()
    s.strategies.push({ id: 'data-entry', name: 'Data Entry', description: '', unitId: SERVER_ID, kind: 'make', inputs: [], outputId: MONEY_ID, amount: 500, scale: 1000 })
    s.projects.push({ id: 'p', name: 'Advanced Algorithms', description: '', icon: '💡', field: 'computing', bar: 10, size: 0.5, progress: 0, effect: { kind: 'strategy', strategy: { id: 'x', name: 'X', description: '', unitId: SERVER_ID, kind: 'make', inputs: [], outputId: MONEY_ID, amount: 1 } }, proposedWeek: 1 })
    unit(s, SERVER_ID).rest = 'p'
    const after = runWeek(s)
    expect(after.log.some((l) => l.text.includes('Starting Server is free again'))).toBe(true)
    const idle = alertsFor(after, previewWeek(after)).find((a) => a.key === `idle-${SERVER_ID}`)!
    expect(idle.tasks?.map((t) => t.label)).toEqual(['Data Entry', 'X'])
  })
})

describe('proposals', () => {
  it('adds a simple strategy at once and the Starting Server runs it', async () => {
    const judge = new FakeJudge({ advancement: score(0), efficiency: score(2) })
    const s0 = createInitialState()
    const v = await judgeStrategy(s0, judge, {
      name: 'Freelance coding',
      description: '',
      unitId: SERVER_ID,
      inputIds: [],
      outputId: MONEY_ID
    })
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('added')
    expect(unit(state, SERVER_ID).rest).toBe(state.strategies[0]!.id)
    // Labour 1,000 a week at efficiency 1.
    expect(previewWeek(state).flows[MONEY_ID]![0]!.amount).toBe(1000)
    const next = runWeek(state)
    expect(money(next)).toBe(1000)
    expect(next.week).toBe(2)
    expect(next.milestones.map((m) => m.key)).toContain('first-money')
  })

  it('makes advanced strategies into research projects', async () => {
    const s0 = createInitialState()
    const v = await judgeStrategy(s0, new FakeJudge({ advancement: score(3) }), {
      name: 'Quant trading',
      description: '',
      unitId: SERVER_ID,
      inputIds: [],
      outputId: MONEY_ID
    })
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('project')
    expect(state.projects.find((p) => p.name === 'Quant trading')?.bar).toBe(170)
    expect(state.strategies).toHaveLength(0)
  })

  it('refuses a strategy that makes what its unit runs on', async () => {
    const s = powerWorld()
    await expect(
      judgeStrategy(s, new FakeJudge(), {
        name: 'Self power',
        description: '',
        unitId: 'gpu',
        inputIds: [],
        outputId: 'power'
      })
    ).rejects.toThrow(/never needs what it makes/)
  })

  it('judges resources: stock or flow, duplicates, and the low bar', async () => {
    const s = createInitialState()
    const flow = await judgeResource(s, new FakeJudge({ kind: choice('flow') }), { name: 'Power', description: '' })
    const added = acceptResource(s, flow).state
    expect(findResource(added, 'power')).toMatchObject({ kind: 'flow', market: 0 })

    const dup = await judgeResource(s, new FakeJudge({ same_as: choice(MONEY_ID) }), { name: 'Cash', description: '' })
    expect(dup.duplicateOf).toBe('Money')
    const nope = await judgeResource(s, new FakeJudge({ is_thing: noul(0.1) }), { name: 'Blorp', description: '' })
    expect(nope.rejected).toMatch(/thing/)
    const yes = await judgeResource(s, new FakeJudge({ is_thing: noul(0.16) }), { name: 'Vibes', description: '' })
    expect(yes.rejected).toBeNull()
  })

  it('turns Jev being torn into a trade-off: as proposed, or better with a catch', async () => {
    const s = createInitialState()
    // Jev leans Reasonable over Mediocre, but only just.
    const torn = score(1.9, { '0': 0.04, '1': 0.33, '2': 0.36, '3': 0.27 }, 0.2)
    const v = await judgeStrategy(
      s,
      new FakeJudge({ advancement: score(0), efficiency: torn, catch: choice('makes-waste') }),
      { name: 'Write marketing copy', description: '', unitId: SERVER_ID, inputIds: [], outputId: MONEY_ID }
    )
    expect(v.torn).toHaveLength(1)
    const t = v.torn[0]!
    // The worse answer comes first and is the default: exactly what was proposed.
    expect(t.options.map((o) => o.label)).toEqual(['Mediocre', 'Reasonable'])
    expect(t.catch).toEqual({ kind: 'quirk', quirk: 'makes-waste' })
    const plain = acceptStrategy(s, v).state
    expect(plain.strategies[0]).toMatchObject({ amount: 750 })
    expect(plain.strategies[0]!.quirk).toBeUndefined()

    v.picks.efficiency = '2'
    const better = acceptStrategy(s, v).state
    const strategy = better.strategies[0]!
    expect(strategy).toMatchObject({ amount: 1000, quirk: 'makes-waste' })
    expect(findResource(better, strategy.waste!)?.name).toBe('Write marketing copy Waste')
    expect(previewWeek(better).flows[strategy.waste!]?.[0]?.amount).toBeGreaterThan(0)
  })

  it('never asks “easier or harder” when there is no catch to offer', async () => {
    const s = createInitialState()
    const torn = score(2.5, { '2': 0.4, '3': 0.38 }, 0.1)
    const v = await judgeResource(s, new FakeJudge({ supply: torn, value: torn }), { name: 'Lemons', description: '' })
    expect(v.torn).toEqual([])
    const stock = await judgeResource(
      s,
      new FakeJudge({ kind: choice('stock', { stock: 0.52, flow: 0.48 }, 0.1) }),
      { name: 'Lemons', description: '' }
    )
    // Stock or flow changes how it plays, so it's a real choice, with no catch.
    expect(stock.torn).toMatchObject([{ key: 'kind', catch: null }])
  })

  it('gives a unit’s better answer a drawback as its catch', async () => {
    const s = createInitialState()
    const v = await judgeUnit(
      s,
      new FakeJudge({
        supply: score(3.5, { '3': 0.4, '4': 0.38 }, 0.1),
        trait_wears_out: noul(0.45),
        trait_fragile: noul(0.2)
      }),
      { ...mindSpec(), name: 'Rented Cloud GPU' }
    )
    const t = v.torn.find((x) => x.key === 'supply')!
    expect(t.catch).toEqual({ kind: 'trait', trait: 'wears-out' })
    v.picks.supply = t.options[1]!.value
    const unitAfter = acceptUnit(s, v).state.units.find((u) => u.name === 'Rented Cloud GPU')!
    expect(unitAfter.traits).toContain('wears-out')
    expect(unitAfter.layers.market).toBe(1e5)
  })

  it('reads supply smoothly between Jev’s bands', async () => {
    const s = createInitialState()
    // Between "Tens of thousands" (3e4) and "About a hundred thousand" (1e5).
    const v = await judgeUnit(s, new FakeJudge({ supply: score(3.5, { '3': 0.6, '4': 0.4 }, 0.9) }), mindSpec())
    const market = acceptUnit(s, v).state.units.find((u) => u.name === 'Rented Cloud GPU')!.layers.market
    expect(market).toBe(B.nice(10 ** ((Math.log10(3e4) + 5) / 2)))
    expect(market).not.toBe(3e4)
  })

  it('sets a design’s bar by how radical Jev judges it', async () => {
    const s = createInitialState()
    const spec = mindSpec({ name: 'Custom AI Server', targetIQ: 300 })
    const bar = async (level: number) => {
      const r = acceptUnit(s, await judgeUnit(s, new FakeJudge({ leap: score(level) }), spec))
      return r.outcome.kind === 'project' ? r.outcome.project.bar : 0
    }
    expect(await bar(0)).toBe(120)
    expect(await bar(2)).toBe(150)
    expect(await bar(4)).toBe(195)
  })

  it('puts off-the-shelf minds on the market, and makes smarter ones be designed', async () => {
    const s = createInitialState()
    const cheap = await judgeUnit(s, new FakeJudge(), mindSpec())
    const { state, outcome } = acceptUnit(s, cheap)
    expect(outcome.kind).toBe('added')
    const gpu = state.units.find((u) => u.name === 'Rented Cloud GPU')!
    expect(gpu.layers.market).toBeGreaterThan(0)
    expect(gpu.tier).toBe(0)

    const smart = await judgeUnit(s, new FakeJudge(), mindSpec({ name: 'Custom AI Server', targetIQ: 250 }))
    expect(smart.availability).toBe('made_to_order')
    const designed = acceptUnit(s, smart)
    expect(designed.outcome.kind).toBe('project')
    // The leap rule: designing IQ 250 needs IQ 125.
    expect(designed.state.projects.find((p) => p.name === 'Design Custom AI Server')?.bar).toBe(125)
  })

  it('makes less plausible ideas cost more', async () => {
    const s = createInitialState()
    const spec = mindSpec({ name: 'Custom AI Server', targetIQ: 250 })
    const sure = acceptUnit(s, await judgeUnit(s, new FakeJudge({ feasible: noul(0.95) }), spec))
    const barely = acceptUnit(s, await judgeUnit(s, new FakeJudge({ feasible: noul(0.36) }), spec))
    const size = (r: typeof sure) => (r.outcome.kind === 'project' ? r.outcome.project.size : 0)
    expect(size(barely)).toBeGreaterThan(size(sure) * 2.5)
  })

  it('keeps up to three traits and lets the player decide those near the line', async () => {
    const s = createInitialState()
    const v = await judgeUnit(
      s,
      new FakeJudge({
        'trait_networked': noul(0.9),
        'trait_learns': noul(0.8),
        'trait_hardy': noul(0.7),
        'trait_wears_out': noul(0.65),
        'trait_compact': noul(0.55)
      }),
      { ...mindSpec(), mind: false, name: 'Paid Humans' }
    )
    const { state } = acceptUnit(s, v)
    expect(state.units.find((u) => u.name === 'Paid Humans')!.traits).toEqual(['networked', 'learns', 'hardy'])
    expect(v.traitOdds.find((t) => t.trait === 'compact')).toBeDefined()
  })

  it('pushes back with the missing kinds of part, and accepts the answer', async () => {
    let s = powerWorld()
    const judge = new FakeJudge({
      recipe: noul(0.2),
      // Jev ranks the kinds: an advanced component, then a special power source; the rest trail.
      missing: choice('k0', { k0: 0.4, k2: 0.3, k5: 0.1, k8: 0.05 }, 0.3),
      availability: choice('only_you')
    })
    const v = await judgeUnit(s, judge, {
      ...mindSpec(),
      name: 'Quantum Supercomputer',
      targetIQ: 1050,
      builderId: 'farm'
    })
    expect(v.missing).toEqual(['an advanced component', 'a special power source'])
    expect(() => acceptUnit(s, v)).toThrow(/pushback/)

    const round = await answerPushback(s, new FakeJudge(), 'one Quantum Supercomputer', v.spec.parts, v.missing, [
      { kind: 'an advanced component', newName: 'Quantum Processors' },
      { kind: 'a special power source', newName: 'Superconducting Power Cables' }
    ])
    expect(round.missing).toEqual([])
    expect(round.parts.map((id) => findResource(round.state, id)!.name)).toEqual([
      'Money',
      'Quantum Processors',
      'Superconducting Power Cables'
    ])
    s = round.state
    const { state, outcome } = acceptUnit(s, { ...v, missing: [], spec: { ...v.spec, parts: round.parts } })
    expect(outcome.kind).toBe('project')
    const effect = state.projects.find((p) => p.name === 'Design Quantum Supercomputer')!.effect
    expect(effect.kind === 'unit' && effect.unit.layers).toMatchObject({ market: 0 })
  })
})

describe('humanity’s market', () => {
  it('sells units that work this week, at prices that climb', async () => {
    const s0 = withMoney(createInitialState(), 1e12)
    const s = acceptUnit(s0, await judgeUnit(s0, new FakeJudge(), mindSpec())).state
    const gpu = s.units.find((u) => u.name === 'Rented Cloud GPU')!
    const size = gpu.layers.market
    const tenth = Math.floor(size / 10)
    const first = marketCost(gpu, tenth)
    const last = marketCost({ ...gpu, bought: size - tenth }, tenth)
    expect(last / first).toBeGreaterThan(3)

    const bought = buyUnits(s, gpu.id, 2)
    expect(unit(bought, gpu.id).count).toBe(2)
    expect(money(bought)).toBeCloseTo(1e12 - marketCost(gpu, 2))
    expect(() => buyUnits(withMoney(structuredClone(s), 0), gpu.id, 1)).toThrow(/Money/)
    // "Max" keeps a week of the new units' Money upkeep back, plus any reserve asked for.
    const upkeep = gpu.upkeep[0]!.amount
    expect(affordable(gpu, marketCost(gpu, 5) + 5 * upkeep)).toBe(5)
    expect(affordable(gpu, marketCost(gpu, 5) + 5 * upkeep, upkeep * 2)).toBe(4)
  })

  it('sells batches of a stock up to its weekly supply', () => {
    const s = withMoney(createInitialState(), 1000)
    s.resources.push(newResource({ id: 'lemons', name: 'Lemons', value: 1, market: 300 }))
    const next = buyResource(s, 'lemons', 300)
    expect(findResource(next, 'lemons')!.amount).toBe(300)
    expect(() => buyResource(next, 'lemons', 1)).toThrow(/only 0/)
    expect(findResource(runWeek(next), 'lemons')!.boughtThisWeek).toBe(0)
  })
})

describe('the week', () => {
  it('shares a short flow equally, and loses unused flow', () => {
    const s = powerWorld(4)
    const report = previewWeek(s)
    expect(report.shares.power).toBeCloseTo(0.5)
    expect(report.runs.earn).toMatchObject({ units: 4, fraction: 0.5, limitedBy: 'power' })
    expect(runWeek(s).resources.find((r) => r.id === MONEY_ID)!.amount).toBeCloseTo(20)
    expect(report.units.gpu!.unpaid).toBeCloseTo(2)
    expect(alertsFor(s, report).some((a) => a.key === 'unpaid-gpu')).toBe(true)

    const plenty = powerWorld(1)
    const after = runWeek(plenty)
    expect(after.lastWeek!.wasted.power).toBeCloseTo(50)
    expect(findResource(after, 'power')!.stored).toBe(0)
  })

  it('holds a flow over with units that Store it', () => {
    const s = powerWorld(1)
    s.units.push(
      newUnit({ id: 'battery', name: 'Grid Battery', count: 1, value: B.PAYBACK_WEEKS, traits: ['stores'], stores: 'power' })
    )
    const after = runWeek(s)
    // Capacity: one battery's labour (1) over Power's value (0.1) = 10.
    expect(findResource(after, 'power')!.stored).toBeCloseTo(10)
    expect(previewWeek(after).flows.power!.find((f) => f.label === 'Stored last week')?.amount).toBeCloseTo(10)
  })

  it('makes stocks usable only from next week', () => {
    const s = powerWorld(1)
    s.resources.push(newResource({ id: 'chips', name: 'AI Chips' }))
    s.strategies.push({ id: 'fab', name: 'fab', description: '', unitId: 'farm', kind: 'make', inputs: [], outputId: 'chips', amount: 5 })
    s.strategies.push({
      id: 'use',
      name: 'use',
      description: '',
      unitId: 'gpu',
      kind: 'make',
      inputs: [{ resourceId: 'chips', amount: 1 }],
      outputId: MONEY_ID,
      amount: 1
    })
    unit(s, 'farm').rest = null
    unit(s, 'farm').assign = { generate: 1 }
    const farm2 = newUnit({ id: 'farm2', name: 'Chip Farm', count: 1, value: 1000 })
    s.units.push(farm2)
    s.strategies.find((x) => x.id === 'fab')!.unitId = 'farm2'
    farm2.rest = 'fab'
    unit(s, 'gpu').rest = 'use'
    const week1 = runWeek(s)
    expect(findResource(week1, 'chips')!.amount).toBe(5)
    expect(money(week1)).toBe(0)
    const week2 = runWeek(week1)
    expect(money(week2)).toBe(1)
  })

  it('builds up to the target, then shows the builders as done', () => {
    const s = powerWorld(1)
    s.resources.push(newResource({ id: 'silicon', name: 'Silicon', amount: 1e6 }))
    const gpu = unit(s, 'gpu')
    gpu.layers = { market: 10, own: 1000, earth: 0 }
    gpu.parts = [{ resourceId: 'silicon', amount: 10 }]
    // Fab labour 500 a week; a GPU worth 1,000 needs 250 of labour: 2 a week.
    const fab = newUnit({ id: 'fab', name: 'Chip Fab', count: 1, value: 500 * B.PAYBACK_WEEKS })
    s.units.push(fab)
    const build = makeBuildStrategy(s, gpu, fab)
    s.strategies.push(build)
    fab.rest = build.id
    let state = setBuildTarget(s, build.id, 4)
    state = runWeek(state)
    expect(unit(state, 'gpu').count).toBe(3)
    expect(findResource(state, 'silicon')!.amount).toBe(1e6 - 20)
    state = runWeek(state)
    expect(unit(state, 'gpu').count).toBe(4)
    expect(previewWeek(state).units.fab!.done).toBe(1)
  })

  it('splits a type across tasks by count, with the rest on one task', () => {
    const s = powerWorld(10)
    s.strategies.push({ id: 'other', name: 'other', description: '', unitId: 'gpu', kind: 'make', inputs: [], outputId: MONEY_ID, amount: 1 })
    let state = assign(s, 'gpu', 'other', 3)
    expect(allocation(state, unit(state, 'gpu')).byTask).toEqual({ other: 3, earn: 7 })
    state = assignRest(state, 'gpu', null)
    expect(allocation(state, unit(state, 'gpu')).free).toBe(7)
  })

  it('is deterministic', () => {
    const s = powerWorld(7, 2)
    expect(runWeek(s).resources).toEqual(runWeek(s).resources)
    expect(previewWeek(s)).toEqual(previewWeek(s))
  })
})

describe('traits', () => {
  it('Wears out loses 5% a week; Intermittent rests on alternate weeks', () => {
    const s = powerWorld(100, 10)
    unit(s, 'gpu').traits = ['wears-out']
    expect(unit(runWeek(s), 'gpu').count).toBe(95)
    unit(s, 'farm').traits = ['intermittent']
    s.week = 2
    expect(previewWeek(s).units.farm!.resting).toBe(true)
    s.week = 3
    expect(previewWeek(s).units.farm!.resting).toBe(false)
  })

  it('Slow to build arrives weeks after buying', () => {
    const s = withMoney(powerWorld(0), 1e9)
    const gpu = unit(s, 'gpu')
    gpu.layers.market = 100
    gpu.traits = ['slow-to-build']
    let state = buyUnits(s, 'gpu', 5)
    expect(unit(state, 'gpu').count).toBe(0)
    for (let i = 0; i < B.SLOW_WEEKS; i++) state = runWeek(state)
    expect(unit(state, 'gpu').count).toBe(5)
  })

  it('Picky stops when short; Hardy runs at half without upkeep', () => {
    const picky = powerWorld(4)
    unit(picky, 'gpu').traits = ['picky']
    expect(previewWeek(picky).runs.earn?.fraction ?? 0).toBe(0)
    const hardy = powerWorld(4)
    unit(hardy, 'gpu').traits = ['hardy']
    // Power covers half the upkeep; Hardy keeps all four at max(0.5, share) output.
    expect(previewWeek(hardy).runs.earn!.fraction).toBeCloseTo(0.5)
    const starving = powerWorld(4, 0)
    unit(starving, 'gpu').traits = ['hardy']
    expect(previewWeek(starving).runs.earn!.fraction).toBeCloseTo(0.5)
  })

  it('Needs crew runs only as many as have crew', () => {
    const s = powerWorld(4, 10)
    const humans = newUnit({ id: 'humans', name: 'Paid Humans', count: 2, value: 1000 })
    s.units.push(humans)
    unit(s, 'gpu').crew = { unitId: 'humans', per: 1 }
    s.strategies.push({ id: 'crew', name: 'Crew GPU', description: '', unitId: 'humans', kind: 'crew', inputs: [], outputId: 'gpu', amount: 1 })
    humans.rest = 'crew'
    expect(previewWeek(s).runs.earn!.fraction).toBeCloseTo(0.5)
  })
})

describe('intelligence and research', () => {
  const mind = (iq: number, traits: UnitType['traits'] = []) =>
    newUnit({ id: 'm', name: 'Mind', mind: true, hardware: { name: 'Hardware', iq }, traits })

  it('pools about 5% IQ per tenfold machines (the worked example)', () => {
    expect(effectiveIQ(mind(150), 1, null)).toBe(150)
    expect(effectiveIQ(mind(300), 1000, null)).toBeCloseTo(345)
    expect(effectiveIQ(mind(300), 1e5, null)).toBeCloseTo(375)
    expect(effectiveIQ(mind(375), 1e5, null)).toBeCloseTo(468.75)
    expect(effectiveIQ(mind(300, ['lone-thinker']), 1e5, null)).toBe(300)
    expect(effectiveIQ(mind(300, ['deep-thinker']), 1e5, null)).toBeCloseTo(450)
  })

  it('gives nothing below the bar, and diminishing returns above it', () => {
    const m = mind(300)
    expect(researchSpeed(m, 1e9, 399, 400)).toBe(0)
    expect(researchSpeed(m, 10, 400, 400) / researchSpeed(m, 1, 400, 400)).toBeCloseTo(Math.sqrt(10))
    expect(researchSpeed(m, 1, 800, 400) / researchSpeed(m, 1, 400, 400)).toBeCloseTo(2)
    const parallel = mind(300, ['massively-parallel'])
    expect(researchSpeed(parallel, 10, 400, 400)).toBeGreaterThan(8)
  })

  it('stops machines below the bar from helping, however many', () => {
    const s = createInitialState()
    s.units.push(newUnit({ id: 'copies', name: 'Copies', mind: true, hardware: { name: 'Hardware', iq: 90 }, count: 1e9 }))
    unit(s, 'copies').rest = FINAL_ID
    const report = previewWeek(s)
    expect(report.progress[FINAL_ID]).toBe(0)
    expect(report.groups[FINAL_ID]![0]!.clears).toBe(false)
    expect(alertsFor(s, report).some((a) => a.prompt?.to.kind === 'design-mind')).toBe(true)
  })

  it('finishes the final project and scores the week', () => {
    const s = createInitialState()
    s.week = 87
    s.units.push(newUnit({ id: 'q', name: 'Quantum Supercomputer', mind: true, hardware: { name: 'Hardware', iq: 1050 }, count: 1 }))
    unit(s, 'q').rest = FINAL_ID
    s.projects[0]!.progress = s.projects[0]!.size - 0.5
    const after = runWeek(s)
    expect(after.status).toBe('won')
    expect(after.week).toBe(87)
    expect(after.milestones.map((m) => m.key)).toContain('singularity')
  })

  it('runs IQ breakthroughs up to the software ceiling', async () => {
    const s = createInitialState()
    const spec: BreakthroughSpec = {
      name: 'Sparse memory',
      description: 'Remember less, think more.',
      target: { kind: 'unit', id: SERVER_ID },
      changes: [{ kind: 'software', share: 0.3 }],
      params: []
    }
    const v = await judgeBreakthrough(s, new FakeJudge({ difficulty: score(0) }), spec)
    const { state } = acceptBreakthrough(s, v)
    const project = state.projects.find((p) => p.name === 'Sparse memory')!
    // The leap rule: reaching IQ 130 needs IQ 65.
    expect(project.bar).toBe(65)
    unit(state, SERVER_ID).rest = project.id
    project.progress = project.size - 0.1
    const after = runWeek(state)
    expect(unit(after, SERVER_ID).software.bonus).toBeCloseTo(0.3)
    // The machine is idle once its project finishes.
    expect(unit(after, SERVER_ID).rest).toBeNull()
    expect(precheckBreakthrough(after, { ...spec, name: 'More', changes: [{ kind: 'software', share: 0.3 }] })).toMatch(
      /ceiling/
    )
  })

  it('opens an own-industry layer with a builder', async () => {
    const s = powerWorld(1)
    unit(s, 'gpu').layers.market = 100
    const spec: BreakthroughSpec = {
      name: 'Make our own servers',
      description: '',
      target: { kind: 'unit', id: 'gpu' },
      changes: [{ kind: 'layer', layer: 'own', builderId: 'farm', parts: [MONEY_ID] }],
      params: []
    }
    const v = await judgeBreakthrough(s, new FakeJudge({ difficulty: score(0) }), spec)
    const { state } = acceptBreakthrough(s, v)
    const project = state.projects.find((p) => p.name === spec.name)!
    state.projects = state.projects.filter((p) => p !== project)
    state.projects.push({ ...project, progress: project.size })
    unit(state, SERVER_ID).rest = project.id
    const after = runWeek(state)
    expect(unit(after, 'gpu').layers.own).toBe(100 * B.OWN_LAYER)
    expect(unitLimit(unit(after, 'gpu'))).toBe(100 + 100 * B.OWN_LAYER)
    expect(after.strategies.some((x) => x.kind === 'build' && x.outputId === 'gpu' && x.unitId === 'farm')).toBe(true)
  })

  it('makes new hardware a much bigger change than new software', async () => {
    const s = createInitialState()
    s.units.push(
      newUnit({
        id: 'gpu',
        name: 'GPU Rack',
        mind: true,
        count: 1,
        hardware: { name: 'GPU Board', iq: 100 },
        software: { name: 'Copy of You', bonus: 0.1 },
        value: B.mindValue(100),
        upkeep: [{ resourceId: MONEY_ID, amount: 250 }],
        parts: [{ resourceId: MONEY_ID, amount: 1500 }]
      })
    )
    const judge = new FakeJudge({ difficulty: score(0) })
    const base = { description: '', target: { kind: 'unit' as const, id: 'gpu' }, params: [] }
    const software = acceptBreakthrough(
      s,
      await judgeBreakthrough(s, judge, { ...base, name: 'Better weights', changes: [{ kind: 'software', share: 0.2 }] })
    ).state.projects.find((p) => p.name === 'Better weights')!
    const hwSpec: BreakthroughSpec = {
      ...base,
      name: 'Die shrink',
      changes: [{ kind: 'hardware', name: 'GPU Board Mk II', share: 0.25, parts: [MONEY_ID] }]
    }
    const { state } = acceptBreakthrough(s, await judgeBreakthrough(s, judge, hwSpec))
    const hardware = state.projects.find((p) => p.name === 'Die shrink')!
    expect(hardware.size).toBeGreaterThan(software.size * 1.8)

    state.projects = state.projects.map((p) => (p.id === hardware.id ? { ...p, progress: p.size } : p))
    unit(state, SERVER_ID).rest = hardware.id
    const after = unit(runWeek(state), 'gpu')
    // The software comes along to the new hardware; the bigger machine costs more to run.
    expect(after.hardware).toEqual({ name: 'GPU Board Mk II', iq: 125 })
    expect(after.software).toEqual({ name: 'Copy of You', bonus: 0.1 })
    expect(after.upkeep[0]!.amount).toBe(B.nice(250 * 1.5625))

    // Jev checks the new hardware's parts, and pushes back when they're too thin.
    const thin = await judgeBreakthrough(s, new FakeJudge({ recipe: noul(0.2) }), hwSpec)
    expect(thin.missing.length).toBeGreaterThan(0)
    expect(() => acceptBreakthrough(s, thin)).toThrow(/pushback/)
    const same: BreakthroughSpec = { ...hwSpec, changes: [{ kind: 'hardware', name: 'GPU Board', share: 0.25, parts: [MONEY_ID] }] }
    expect(precheckBreakthrough(s, same)).toMatch(/Name the new hardware/)
  })

  it('lets minds teach each other strategies', () => {
    const s = createInitialState()
    s.strategies.push({ id: 'code', name: 'Code', description: '', unitId: SERVER_ID, kind: 'make', inputs: [], outputId: MONEY_ID, amount: 1000, scale: 1000 })
    s.units.push(newUnit({ id: 'copy', name: 'Copy', mind: true, hardware: { name: 'Hardware', iq: 90 }, count: 3 }))
    const after = teachStrategy(s, 'code', 'copy')
    const taught = after.strategies.find((x) => x.unitId === 'copy')!
    expect(taught.amount).toBe(810)
    expect(unit(after, 'copy').rest).toBe(taught.id)
  })
})

describe('hardware and software', () => {
  it('builds a mind from named hardware running named software', async () => {
    const s = createInitialState()
    const spec = mindSpec({ hardware: 'Cloud GPU Instance', software: 'Open-weights Model' })
    const gpu = acceptUnit(s, await judgeUnit(s, new FakeJudge(), spec)).state.units.find((u) => u.name === spec.name)!
    expect(gpu.hardware).toEqual({ name: 'Cloud GPU Instance', iq: 90 })
    expect(gpu.software).toEqual({ name: 'Open-weights Model', bonus: 0 })

    const plainSpec = mindSpec({ name: 'Plain Copy' })
    const plain = acceptUnit(s, await judgeUnit(s, new FakeJudge(), plainSpec)).state.units.find((u) => u.name === 'Plain Copy')!
    expect(plain.hardware.name).toBe('Plain Copy')
    expect(plain.software.name).toBe(DEFAULT_SOFTWARE)
    expect(softwareLabel({ ...plain, software: { name: 'X', bonus: 0.3 } })).toBe('X v1.3')
  })
})

describe('presets', () => {
  it('offers 10 to 20 ideas for each kind of proposal', () => {
    for (const list of [RESOURCE_PRESETS, STRATEGY_PRESETS, UNIT_PRESETS, BREAKTHROUGH_PRESETS]) {
      expect(list.length).toBeGreaterThanOrEqual(10)
      expect(list.length).toBeLessThanOrEqual(20)
      expect(new Set(list.map((p) => p.name)).size).toBe(list.length)
    }
  })

  it('only names resources the resource list offers, in amounts the forms allow', () => {
    const offered = new Set(['Money', ...RESOURCE_PRESETS.map((r) => r.name)])
    for (const p of STRATEGY_PRESETS) {
      for (const r of [...p.inputs, p.output]) expect(offered, `${p.name}: ${r}`).toContain(r)
      expect(p.inputs.length).toBeLessThanOrEqual(2)
    }
    for (const p of UNIT_PRESETS) {
      for (const r of [...p.parts, ...p.upkeep]) expect(offered, `${p.name}: ${r}`).toContain(r)
      expect(p.parts.length).toBeLessThanOrEqual(B.MAX_PARTS)
      expect(p.upkeep.length).toBeLessThanOrEqual(2)
      if (p.mind) expect(p.iq && p.hardware && p.software).toBeTruthy()
    }
    for (const p of BREAKTHROUGH_PRESETS) {
      if (p.software) expect(B.IQ_STEPS).toContain(p.software)
      if (p.hardware) expect(B.HARDWARE_STEPS).toContain(p.hardware.share)
      for (const f of [p.upkeep?.factor, p.parts, p.inputs]) if (f !== undefined) expect(FACTORS).toContain(f)
      if (p.output) expect(OUTPUT_FACTORS).toContain(p.output)
    }
  })

  it('matches presets to the world', () => {
    const s = powerWorld()
    expect(resolveResources(s, ['Money', 'power', 'Silicon'])).toEqual({ ids: [MONEY_ID, 'power'], missing: ['Silicon'] })
    const preset = (name: string) => BREAKTHROUGH_PRESETS.find((p) => p.name === name)!
    const server = unit(s, SERVER_ID)
    expect(presetBlocker(s, preset('Sparse memory'), server)).toBeNull()
    expect(presetBlocker(s, preset('Make our own'), server)).toMatch(/only ever one/)
    expect(presetBlocker(s, preset('Process optimization'), server)).toMatch(/strategy/)
    expect(presetBlocker(s, preset('Liquid cooling'), unit(s, 'gpu'))).toBeNull()
    expect(presetBlocker(s, preset('Liquid cooling'), unit(s, 'farm'))).toMatch(/doesn’t run on/)
    const solar = STRATEGY_PRESETS.find((p) => p.name === 'Generate solar power')!
    expect(runnerFor(s, solar, server)?.id).toBe('farm')
  })
})

describe('Jev', () => {
  it('gives the same proposal the same verdict without asking again', async () => {
    const inner = new FakeJudge()
    const cache = {}
    const judge = new CachedJudge(inner, () => cache)
    const s = createInitialState()
    await judgeResource(s, judge, { name: 'Lemons', description: 'Sour.' })
    await judgeResource(s, judge, { name: 'Lemons', description: 'Sour.' })
    expect(inner.calls).toHaveLength(1)
    await judgeResource(s, judge, { name: 'Limes', description: 'Sour.' })
    expect(inner.calls).toHaveLength(2)
  })
})
