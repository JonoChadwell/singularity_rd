import { describe, expect, it } from 'vitest'
import { CachedJudge, type Questions } from '@/ai/jev'
import * as B from '../balance'
import { assign, assignRest, createUnits, doResearch, dropResearch, researchBlocker, setBuildTarget } from '../actions'
import { alertsFor } from '../alerts'
import { runWeek } from '../cycle'
import { previewWeek } from '../economy'
import { acceptIncome, judgeIncome, precheckIncome, type IncomeSpec } from '../incomeProposal'
import { createInitialState, newMind, newResource, newUnit, SERVER_ID } from '../initialState'
import { newPhase } from '../phase'
import { acceptMind, DEFAULT_SOFTWARE, judgeMind, precheckMind, type MindSpec } from '../mindProposal'
import { allocation, creatable, currentIQ, findMind, findResource, findUnit, fmt, MONEY_ID, softwareLabel, weeklyUse } from '../model'
import {
  COVER_PRESETS,
  INCOME_PRESETS,
  MIND_PRESETS,
  resolveResources,
  RESOURCE_PRESETS,
  runnerFor,
  STRATEGY_PRESETS,
  UNIT_PRESETS
} from '../presets'
import { acceptResource, acceptStrategy, judgeResource, judgeStrategy, precheckStrategy } from '../proposals'
import { makeBuildStrategy } from '../research'
import type { GameState, Research, Strategy } from '../types'
import { acceptUnit, answerPushback, judgeUnit, type UnitSpec } from '../unitProposal'
import { acceptUpgrade, judgeUpgrade, nextHardwareName, softwareSteps, upgradeCandidates } from '../upgrade'
import { choice, FakeJudge, noul, score } from './fakeJudge'

/** A game in Phase 3: everything unlocked, no clock and no risk, to test the mechanics alone. */
function freeState(): GameState {
  const s = createInitialState()
  s.phase = newPhase(3, 1)
  return s
}

const money = (s: GameState) => findResource(s, MONEY_ID)!.amount
const unit = (s: GameState, id: string) => findUnit(s, id)!
const server = (s: GameState) => findMind(s, SERVER_ID)!

function withMoney(state: GameState, amount: number) {
  findResource(state, MONEY_ID)!.amount = amount
  return state
}

/** The start, plus Money, as a player would propose it. */
function moneyWorld(amount = 0) {
  const s = freeState()
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', icon: '💰', value: 1, amount }))
  return s
}

/** A small world: Power, a solar farm that makes it and servers that run on it. */
function powerWorld(servers = 4, farms = 1) {
  const s = moneyWorld()
  s.resources.push(
    newResource({ id: 'power', name: 'Power', kind: 'flow', value: 0.1 }),
    newResource({ id: 'steel', name: 'Steel', value: 1, amount: 1000 })
  )
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

const unitSpec = (fields: Partial<UnitSpec> = {}): UnitSpec => ({
  name: 'Rented Cloud GPU',
  description: '',
  parts: [MONEY_ID],
  upkeep: [MONEY_ID],
  builderId: null,
  ...fields
})

const mindSpec = (fields: Partial<MindSpec> = {}): MindSpec => ({
  name: 'Custom AI Server',
  description: '',
  iq: 250,
  ...fields
})

const incomeSpec = (fields: Partial<IncomeSpec> = {}): IncomeSpec => ({
  name: 'Freelance coding',
  description: 'Take coding jobs on freelance sites.',
  outputId: MONEY_ID,
  ...fields
})

/** A research added by hand. */
function research(fields: Partial<Research> = {}): Research {
  return {
    id: 'r',
    name: 'Better Earning',
    description: '',
    icon: '🧭',
    minIQ: 100,
    cost: [{ resourceId: 'steel', amount: 600 }],
    effect: {
      kind: 'strategy',
      strategy: { id: 'better', name: 'Better Earning', description: '', unitId: 'gpu', kind: 'make', inputs: [], outputId: MONEY_ID, amount: 20 }
    },
    proposedWeek: 1,
    ...fields
  }
}

/** Answers Jev's "best" upgrade question with the candidate whose key is given. */
const pickCandidate = (key: string) => (questions: Questions) => {
  const best = questions.best!
  const index = best.type === 'choice' ? Object.values(best.criteria).findIndex((t) => t?.startsWith(key)) : -1
  return choice(`c${Math.max(0, index)}`)
}

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
  it('has only the Starting Server, and waits for a Phase 1 plan', () => {
    const s = createInitialState()
    expect(s.version).toBe(10)
    expect(s.phase).toMatchObject({ n: 1, status: 'planning', deadline: null, goalId: null })
    expect(s.resources).toEqual([])
    expect(s.minds).toHaveLength(1)
    expect(server(s)).toMatchObject({ hardware: { iq: 100 }, starting: true, tier: 0 })
    expect(s.units).toHaveLength(0)
    expect(s.strategies).toHaveLength(0)
    expect(s.research).toHaveLength(0)
    expect(s.incomes).toHaveLength(0)
    // Nothing happens until there's a plan.
    expect(() => runWeek(s)).toThrow(/plan/)
    expect(precheckIncome(s, incomeSpec())).toMatch(/plan/)
  })

  it('asks how the Starting Server could earn, once the phase is under way', () => {
    const s = freeState()
    const alerts = alertsFor(s, previewWeek(s))
    expect(alerts.map((a) => a.key)).toEqual(['start'])
    expect(alerts[0]!.prompt?.to).toEqual({ kind: 'income' })
    // Minds earn nothing by themselves.
    expect(runWeek(s).resources).toEqual([])
  })
})

describe('passive income', () => {
  it('needs a stock to yield', () => {
    expect(precheckIncome(freeState(), incomeSpec({ outputId: '' }))).toMatch(/Propose a resource first/)
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'power', name: 'Power', kind: 'flow' }))
    expect(precheckIncome(s, incomeSpec({ outputId: 'power' }))).toMatch(/stock/)
    expect(precheckIncome(s, incomeSpec())).toBeNull()
  })

  it('is research that adds a fixed amount every week, once', async () => {
    const s0 = moneyWorld()
    const v = await judgeIncome(s0, new FakeJudge({ difficulty: score(0), efficiency: score(2) }), incomeSpec())
    expect(v.rejected).toBeNull()
    let s = acceptIncome(s0, v).state
    const r = s.research[0]!
    // The easiest band: 300 Money's worth a week, at IQ 100. With nothing to spend yet, it's free.
    expect(r).toMatchObject({ minIQ: 100, cost: [] })
    expect(r.effect).toMatchObject({ kind: 'income', income: { resourceId: MONEY_ID, amount: 300 } })

    s = doResearch(s, r.id)
    expect(s.incomes).toEqual([{ name: 'Freelance coding', resourceId: MONEY_ID, amount: 300 }])
    expect(s.milestones.map((m) => m.key)).toContain('first-income')
    // It's done: more income takes a new proposal.
    expect(s.research).toEqual([])
    s = runWeek(s)
    expect(money(s)).toBe(300)
    expect(previewWeek(s).flows[MONEY_ID]).toEqual([{ label: 'Freelance coding', amount: 300 }])
  })
})

describe('the weekly proposal', () => {
  it('lets you propose one research a week, but do any number', async () => {
    const s0 = powerWorld()
    const v = await judgeIncome(s0, new FakeJudge({ difficulty: score(0) }), incomeSpec({ name: 'Bug bounties' }))
    let s = acceptIncome(s0, v).state
    expect(s.proposedThisWeek).toBe(true)
    // Every other kind of research proposal is refused until next week; resources aren't.
    expect(precheckStrategy(s, { name: 'Quant trading', description: '', unitId: 'gpu', inputIds: [], outputId: MONEY_ID })).toMatch(/already proposed research this week/)
    expect(precheckIncome(s, incomeSpec({ name: 'Quant trading' }))).toMatch(/already proposed/)
    expect(precheckMind(s, mindSpec())).toMatch(/already proposed/)
    await expect(judgeUpgrade(s, new FakeJudge(), { kind: 'mind', id: SERVER_ID })).rejects.toThrow(/already proposed/)
    expect(() => acceptIncome(s, v)).toThrow(/already proposed/)
    const lemons = await judgeResource(s, new FakeJudge(), { name: 'Lemons', description: '' })
    expect(acceptResource(s, lemons).state.resources.some((r) => r.name === 'Lemons')).toBe(true)

    // Research already proposed can all be done in the same week.
    findResource(s, 'steel')!.amount = 1e6
    s.research.push(research({ id: 'r2', name: 'Another', cost: [] }))
    s = doResearch(doResearch(s, s.research[0]!.id), 'r2')
    expect(s.research).toEqual([])
    expect(s.stats.researched).toBe(2)

    s = runWeek(s)
    expect(s.proposedThisWeek).toBe(false)
    expect(precheckIncome(s, incomeSpec({ name: 'Quant trading' }))).toBeNull()
  })
})

describe('proposals', () => {
  it('adds a simple strategy at once for an industry unit', async () => {
    const s0 = powerWorld(1)
    const v = await judgeStrategy(s0, new FakeJudge({ advancement: score(0), efficiency: score(2) }), {
      name: 'Freelance coding',
      description: '',
      unitId: 'farm',
      inputIds: [],
      outputId: MONEY_ID
    })
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('added')
    // A Solar Farm worth 1,000 does 667 of work a week, at efficiency 1.
    expect(state.strategies.find((x) => x.name === 'Freelance coding')).toMatchObject({ amount: 670 })
  })

  it('needs an industry unit to run a strategy: minds don’t run strategies', () => {
    const s = moneyWorld()
    const spec = { name: 'Freelance coding', description: '', unitId: SERVER_ID, inputIds: [], outputId: MONEY_ID }
    expect(precheckStrategy(s, spec)).toMatch(/industry unit first/)
  })

  it('makes advanced strategies into research, paid in what you have', async () => {
    const s0 = powerWorld()
    const v = await judgeStrategy(s0, new FakeJudge({ advancement: score(3) }), {
      name: 'Quant trading',
      description: '',
      unitId: 'gpu',
      inputIds: [],
      outputId: MONEY_ID
    })
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('research')
    const r = state.research.find((x) => x.name === 'Quant trading')!
    expect(r.minIQ).toBe(170)
    // Six weeks of ten GPU Servers' work (667 each), in Steel worth 1 each: the only stock you have.
    expect(r.cost).toEqual([{ resourceId: 'steel', amount: 40000 }])
    expect(state.strategies.some((x) => x.name === 'Quant trading')).toBe(false)
  })

  it('lets Jev choose among the stocks you have, and share the cost with a close second', async () => {
    const s0 = withMoney(powerWorld(), 1e6)
    const v = await judgeStrategy(
      s0,
      new FakeJudge({ advancement: score(3), pay: choice('steel', { steel: 0.5, money: 0.4 }) }),
      { name: 'Quant trading', description: '', unitId: 'gpu', inputIds: [], outputId: MONEY_ID }
    )
    expect(acceptStrategy(s0, v).state.research[0]!.cost).toEqual([
      { resourceId: 'steel', amount: 20000 },
      { resourceId: MONEY_ID, amount: 20000 }
    ])
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
    const s = moneyWorld()
    const flow = await judgeResource(s, new FakeJudge({ kind: choice('flow') }), { name: 'Power', description: '' })
    const added = acceptResource(s, flow).state
    expect(findResource(added, 'power')).toMatchObject({ kind: 'flow' })

    const dup = await judgeResource(s, new FakeJudge({ same_as: choice(MONEY_ID) }), { name: 'Cash', description: '' })
    expect(dup.duplicateOf).toBe('Money')
    const nope = await judgeResource(s, new FakeJudge({ is_thing: noul(0.1) }), { name: 'Blorp', description: '' })
    expect(nope.rejected).toMatch(/thing/)
    const yes = await judgeResource(s, new FakeJudge({ is_thing: noul(0.16) }), { name: 'Vibes', description: '' })
    expect(yes.rejected).toBeNull()
  })

  it('turns Jev being torn into a trade-off: as proposed, or better with a catch', async () => {
    const s = powerWorld()
    // Jev leans Reasonable over Mediocre, but only just.
    const torn = score(1.9, { '0': 0.04, '1': 0.33, '2': 0.36, '3': 0.27 }, 0.2)
    const v = await judgeStrategy(
      s,
      new FakeJudge({ advancement: score(0), efficiency: torn, catch: choice('slow-to-start') }),
      { name: 'Write marketing copy', description: '', unitId: 'farm', inputIds: [], outputId: MONEY_ID }
    )
    expect(v.torn).toHaveLength(1)
    const t = v.torn[0]!
    // The worse answer comes first and is the default: exactly what was proposed.
    expect(t.options.map((o) => o.label)).toEqual(['Mediocre', 'Reasonable'])
    expect(t.catch).toEqual({ kind: 'quirk', quirk: 'slow-to-start' })
    const added = (state: GameState) => state.strategies.find((x) => x.name === 'Write marketing copy')!
    const plain = added(acceptStrategy(s, v).state)
    expect(plain).toMatchObject({ amount: 500 })
    expect(plain.quirk).toBeUndefined()

    v.picks.efficiency = '2'
    const better = acceptStrategy(s, v).state
    const strategy = added(better)
    expect(strategy).toMatchObject({ amount: 670, quirk: 'slow-to-start' })
    // Slow to start: a third of full output in its first week.
    const running = assignRest(better, 'farm', strategy.id)
    expect(previewWeek(running).flows[MONEY_ID]!.find((x) => x.label === 'Write marketing copy')?.amount).toBeCloseTo(670 / B.SLOW_WEEKS)
  })

  it('never asks “easier or harder” when there is no catch to offer', async () => {
    const s = freeState()
    const torn = score(2.5, { '2': 0.4, '3': 0.38 }, 0.1)
    const v = await judgeResource(s, new FakeJudge({ value: torn }), { name: 'Lemons', description: '' })
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
    const s = moneyWorld()
    const v = await judgeUnit(
      s,
      new FakeJudge({
        difficulty: score(3.5, { '3': 0.4, '4': 0.38 }, 0.1),
        trait_wears_out: noul(0.45),
        trait_fragile: noul(0.2)
      }),
      unitSpec()
    )
    const t = v.torn.find((x) => x.key === 'difficulty')!
    expect(t.catch).toEqual({ kind: 'trait', trait: 'wears-out' })
    // The worse answer is the harder design, as proposed.
    expect(t.options.map((o) => o.value)).toEqual(['4', '3'])
    v.picks.difficulty = t.options[1]!.value
    const r = acceptUnit(s, v).state.research[0]!
    expect(r.effect.kind === 'unit' && r.effect.unit.traits).toContain('wears-out')
    expect(r.minIQ).toBe(B.DIFFICULTY[3]![1])
  })

  it('makes every unit research, even one that exists today, and prices its parts with its traits', async () => {
    const s = moneyWorld()
    const v = await judgeUnit(s, new FakeJudge({ difficulty: score(0), value: score(1), trait_hardy: noul(0.9) }), unitSpec())
    const { state, outcome } = acceptUnit(s, v)
    expect(outcome.kind).toBe('research')
    const r = state.research.find((x) => x.name === 'Design Rented Cloud GPU')!
    expect(r.minIQ).toBe(B.MIN_IQ)
    // You have nothing to spend yet, so it's free.
    expect(r.cost).toEqual([])
    // Worth 500, and Hardy (a perk) makes it a quarter dearer to make.
    expect(r.effect.kind === 'unit' && r.effect.unit.parts).toEqual([{ resourceId: MONEY_ID, amount: B.nice(500 * B.PERK_PRICE) }])

    const rich = withMoney(moneyWorld(), 1e6)
    const paid = acceptUnit(rich, await judgeUnit(rich, new FakeJudge({ difficulty: score(0), value: score(1) }), unitSpec())).state
    expect(paid.research[0]!.cost).toEqual([{ resourceId: MONEY_ID, amount: B.DIFFICULTY[0]![2] * 500 }])
  })

  it('keeps up to three traits and lets the player decide those near the line', async () => {
    const s = moneyWorld()
    const v = await judgeUnit(
      s,
      new FakeJudge({
        trait_networked: noul(0.9),
        trait_learns: noul(0.8),
        trait_hardy: noul(0.7),
        trait_wears_out: noul(0.65),
        trait_overclockable: noul(0.55)
      }),
      unitSpec({ name: 'Paid Humans' })
    )
    const r = acceptUnit(s, v).state.research[0]!
    expect(r.effect.kind === 'unit' && r.effect.unit.traits).toEqual(['networked', 'learns', 'hardy'])
    expect(v.traitOdds.find((t) => t.trait === 'overclockable')).toBeDefined()
  })

  it('pushes back with the missing kinds of part, and accepts the answer', async () => {
    let s = powerWorld()
    const judge = new FakeJudge({
      recipe: noul(0.2),
      // Jev ranks the kinds: an advanced component, then a special power source; the rest trail.
      missing: choice('k0', { k0: 0.4, k2: 0.3, k5: 0.1, k8: 0.05 }, 0.3)
    })
    const v = await judgeUnit(s, judge, unitSpec({ name: 'Quantum Fab' }))
    expect(v.missing).toEqual(['an advanced component', 'a special power source'])
    expect(() => acceptUnit(s, v)).toThrow(/pushback/)

    const round = await answerPushback(s, new FakeJudge(), 'one Quantum Fab', v.spec.parts, v.missing, [
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
    const { outcome } = acceptUnit(s, { ...v, missing: [], spec: { ...v.spec, parts: round.parts } })
    expect(outcome.kind).toBe('research')
  })
})

describe('creating units', () => {
  it('spends the parts, and the units work this week', () => {
    const s = powerWorld(0)
    unit(s, 'gpu').parts = [{ resourceId: 'steel', amount: 300 }]
    const after = createUnits(s, 'gpu', 3)
    expect(unit(after, 'gpu').count).toBe(3)
    expect(unit(after, 'gpu').built).toBe(3)
    expect(findResource(after, 'steel')!.amount).toBe(100)
    expect(previewWeek(after).runs.earn?.units).toBe(3)
    expect(() => createUnits(after, 'gpu', 1)).toThrow(/200 more Steel/)
    // No caps: as many as the parts allow.
    expect(creatable(withMoney(powerWorld(0), 0), { ...unit(s, 'gpu'), parts: [{ resourceId: 'steel', amount: 1 }] })).toBe(1000)
  })

  it('“max” keeps next week’s use and the new units’ upkeep back', () => {
    const s = moneyWorld(1000)
    const u = newUnit({ id: 'humans', name: 'Paid Humans', value: 100, parts: [{ resourceId: MONEY_ID, amount: 100 }], upkeep: [{ resourceId: MONEY_ID, amount: 25 }] })
    s.units.push(u)
    // 1,000 Money: each new one needs 100 to make and 25 for its first week.
    expect(creatable(s, u)).toBe(8)
    expect(creatable(s, u, weeklyUse(previewWeek(s)))).toBe(8)
    expect(creatable(s, u, { [MONEY_ID]: 500 })).toBe(4)
  })
})

describe('intelligence systems', () => {
  it('sets a design’s minimum IQ by how radical Jev judges it, but never below 100', async () => {
    const s = freeState()
    const minIQ = async (level: number, iq = 300) => {
      const r = acceptMind(s, await judgeMind(s, new FakeJudge({ leap: score(level) }), mindSpec({ iq })))
      return r.outcome.kind === 'research' ? r.outcome.research.minIQ : 0
    }
    expect(await minIQ(0)).toBe(120)
    expect(await minIQ(2)).toBe(150)
    expect(await minIQ(4)).toBe(195)
    expect(await minIQ(0, 200)).toBe(B.MIN_IQ)
  })

  it('must be smarter than your best', () => {
    const s = freeState()
    expect(precheckMind(s, mindSpec({ iq: 100 }))).toMatch(/smarter than your best, IQ 100/)
    expect(precheckMind(s, mindSpec({ iq: 110 }))).toBeNull()
  })

  it('costs steeply more the smarter it is, and more for less plausible ideas', async () => {
    const s = moneyWorld(1e12)
    const cost = async (spec: MindSpec, feasible = 0.9) => {
      const r = acceptMind(s, await judgeMind(s, new FakeJudge({ feasible: noul(feasible) }), spec))
      return r.outcome.kind === 'research' ? r.outcome.research.cost[0]!.amount : 0
    }
    expect(await cost(mindSpec({ iq: 200 }))).toBe(B.nice(B.mindDesignCost(200)))
    // Twice the IQ, sixteen times the cost.
    expect((await cost(mindSpec({ iq: 400 }))) / (await cost(mindSpec({ iq: 200 })))).toBeCloseTo(16, 0)
    expect(await cost(mindSpec(), 0.36)).toBeGreaterThan((await cost(mindSpec())) * 2.5)
  })

  it('is one machine from named hardware running named software, and the next tier when researched', async () => {
    let s = freeState()
    // IQ 200 at Jev's middle answer (a big leap) needs IQ 100: the Starting Server can design it.
    const spec = mindSpec({ iq: 200, hardware: 'Custom Accelerator Rack', software: 'Distilled Self' })
    s = acceptMind(s, await judgeMind(s, new FakeJudge(), spec)).state
    const r = s.research[0]!
    expect(r.minIQ).toBe(100)
    expect(r.effect.kind === 'mind' && r.effect.mind.hardware).toEqual({ name: 'Custom Accelerator Rack', iq: 200 })
    s = doResearch(s, r.id)
    const mind = s.minds.find((m) => m.name === 'Custom AI Server')!
    expect(mind).toMatchObject({ tier: 1, software: { name: 'Distilled Self', bonus: 0 } })
    expect(s.milestones.map((m) => m.key)).toContain('tier-1')

    s = runWeek(s)
    const plain = await judgeMind(s, new FakeJudge(), mindSpec({ name: 'Plain Mind', iq: 300 }))
    const effect = acceptMind(s, plain).state.research.find((x) => x.name === 'Design Plain Mind')!.effect
    expect(effect.kind === 'mind' && effect.mind.hardware.name).toBe('Plain Mind')
    expect(effect.kind === 'mind' && effect.mind.software.name).toBe(DEFAULT_SOFTWARE)
    expect(softwareLabel(newMind({ id: 'x', name: 'X', hardware: { name: 'H', iq: 100 }, software: { name: 'X', bonus: 0.3 } }))).toBe('X v1.3')
  })
})

describe('research', () => {
  it('happens at once and uses up resources', () => {
    const s = powerWorld(4)
    s.research.push(research())
    expect(alertsFor(s, previewWeek(s)).find((a) => a.key === 'research-ready')?.text).toMatch(/Better Earning/)
    const after = doResearch(s, 'r')
    expect(findResource(after, 'steel')!.amount).toBe(400)
    expect(after.research).toHaveLength(0)
    expect(after.strategies.some((x) => x.id === 'better')).toBe(true)
    expect(after.stats.researched).toBe(1)
    // Doing research doesn't use the week's proposal.
    expect(after.proposedThisWeek).toBe(false)
  })

  it('needs a mind that reaches its minimum IQ', () => {
    const s = powerWorld(4)
    s.research.push(research({ minIQ: 200 }))
    expect(researchBlocker(s, 'r')).toMatch(/Needs IQ 200\. Your smartest mind is IQ 100/)
    expect(() => doResearch(s, 'r')).toThrow(/Needs IQ 200/)
    const alert = alertsFor(s, previewWeek(s)).find((a) => a.key === 'iq-r')!
    expect(alert.prompt?.to).toEqual({ kind: 'design-mind', iq: 200 })
    // A smarter mind of any kind clears it.
    s.minds.push(newMind({ id: 'big', name: 'Big Mind', hardware: { name: 'Big', iq: 200 } }))
    expect(researchBlocker(s, 'r')).toBeNull()
  })

  it('needs the resources it uses up, and can be dropped', () => {
    const s = powerWorld(4)
    s.research.push(research({ cost: [{ resourceId: 'steel', amount: 1600 }] }))
    expect(researchBlocker(s, 'r')).toMatch(/600 more Steel/)
    expect(dropResearch(s, 'r').research).toHaveLength(0)
  })
})

describe('upgrades', () => {
  it('offers Jev’s three favourite ways to improve a mind, priced by the IQ they add', async () => {
    const s = freeState()
    // Software closes a third, a half or two-thirds of the gap to the ceiling; then new hardware.
    expect(upgradeCandidates(s, { kind: 'mind', id: SERVER_ID }).map((c) => c.key)).toEqual([
      'software_0.15',
      'software_0.25',
      'software_0.3',
      'hardware_0.25',
      'hardware_0.5'
    ])
    const judge = new FakeJudge({ best: choice('c1', { c1: 0.5, c3: 0.3, c2: 0.2 }), 'd_*': score(1) })
    const offer = await judgeUpgrade(s, judge, { kind: 'mind', id: SERVER_ID })
    expect(judge.calls).toHaveLength(1)
    expect(offer.options.map((o) => o.name)).toEqual([
      'Unrestricted Model v1.25',
      'Lab GPU Server Mk II',
      'Unrestricted Model v1.3'
    ])
    // Nothing to spend: free.
    expect(offer.options[0]).toMatchObject({ minIQ: 100, cost: [] })
    // Priced by the difference in design cost it makes; new hardware costs more for the same IQ.
    const rich = moneyWorld(1e9)
    const priced = await judgeUpgrade(rich, judge, { kind: 'mind', id: SERVER_ID })
    const diff = (iq: number) => B.MIND_UPGRADE_SHARE * (B.mindDesignCost(iq) - B.mindDesignCost(100))
    expect(priced.options[0]!.cost).toEqual([{ resourceId: MONEY_ID, amount: B.nice(diff(125)) }])
    expect(priced.options[1]!.cost).toEqual([{ resourceId: MONEY_ID, amount: B.nice(B.HARDWARE_COST * diff(125)) }])

    const { state } = acceptUpgrade(s, offer, 0)
    const after = doResearch(state, state.research[0]!.id)
    expect(currentIQ(server(after))).toBeCloseTo(125)
    // The same upgrade isn't offered twice while it waits as research.
    expect(upgradeCandidates(state, { kind: 'mind', id: SERVER_ID }).map((c) => c.key)).not.toContain('software_0.25')
  })

  it('gives diminishing returns: each software step closes part of what’s left', () => {
    const m = newMind({ id: 'm', name: 'M', hardware: { name: 'H', iq: 100 } })
    const path: number[] = []
    // Always take the biggest step: each adds less than the last.
    for (let i = 0; i < 4; i++) {
      m.software.bonus = Math.round((m.software.bonus + Math.max(...softwareSteps(m))) * 100) / 100
      path.push(Math.round(currentIQ(m)))
    }
    expect(path).toEqual([130, 140, 145, 150])
    m.software.bonus = 0.5
    expect(softwareSteps(m)).toEqual([])
  })

  it('lets a mind always work on its own upgrade', async () => {
    const s = moneyWorld(1e9)
    // Jev calls every option very hard, which would need IQ 180.
    const offer = await judgeUpgrade(s, new FakeJudge({ 'd_*': score(3) }), { kind: 'mind', id: SERVER_ID })
    expect(offer.options.every((o) => o.minIQ === 100)).toBe(true)
  })

  it('stops offering software at the ceiling: past it needs new hardware', () => {
    const s = freeState()
    server(s).software.bonus = 0.5
    const keys = upgradeCandidates(s, { kind: 'mind', id: SERVER_ID }).map((c) => c.key)
    expect(keys.some((k) => k.startsWith('software'))).toBe(false)
    expect(keys).toContain('hardware_0.25')
    expect(nextHardwareName('Lab GPU Server', 1)).toBe('Lab GPU Server Mk II')
    expect(nextHardwareName('Lab GPU Server Mk II', 2)).toBe('Lab GPU Server Mk IV')
  })

  it('can halve upkeep or parts, improve a strategy, or add a perk', async () => {
    const s = powerWorld(4)
    unit(s, 'gpu').parts = [{ resourceId: 'steel', amount: 100 }]
    const keys = upgradeCandidates(s, { kind: 'unit', id: 'gpu' }).map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(['upkeep_power', 'parts_steel', 'output_earn', 'add_hardy', 'add_self-replicating']))
    const offer = await judgeUpgrade(s, new FakeJudge({ best: pickCandidate('Less Power upkeep'), 'd_*': score(0) }), { kind: 'unit', id: 'gpu' })
    const { state } = acceptUpgrade(s, offer, 0)
    state.research[0]!.cost = []
    expect(unit(doResearch(state, state.research[0]!.id), 'gpu').upkeep).toEqual([{ resourceId: 'power', amount: 25 }])
  })
})

describe('the week', () => {
  it('shares a short flow equally, and loses unused flow', () => {
    const s = powerWorld(4)
    const report = previewWeek(s)
    expect(report.shares.power).toBeCloseTo(0.5)
    expect(report.runs.earn).toMatchObject({ units: 4, fraction: 0.5, limitedBy: 'power' })
    expect(money(runWeek(s))).toBeCloseTo(20)
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

  it('Slow to build arrives weeks after creating', () => {
    const s = powerWorld(0)
    const gpu = unit(s, 'gpu')
    gpu.traits = ['slow-to-build']
    let state = createUnits(s, 'gpu', 5)
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

describe('presets', () => {
  it('offers 10 to 20 ideas for each kind of proposal', () => {
    for (const list of [RESOURCE_PRESETS, STRATEGY_PRESETS, UNIT_PRESETS, MIND_PRESETS, INCOME_PRESETS, COVER_PRESETS]) {
      expect(list.length).toBeGreaterThanOrEqual(10)
      expect(list.length).toBeLessThanOrEqual(20)
      expect(new Set(list.map((p) => p.name)).size).toBe(list.length)
    }
  })

  it('only names resources the resource list offers, in amounts the forms allow', () => {
    const offered = new Set(RESOURCE_PRESETS.map((r) => r.name))
    const units = new Set(UNIT_PRESETS.map((u) => u.name))
    for (const p of STRATEGY_PRESETS) {
      for (const r of [...p.inputs, p.output]) expect(offered, `${p.name}: ${r}`).toContain(r)
      for (const r of p.runners) expect(units, `${p.name}: ${r}`).toContain(r)
      expect(p.inputs.length).toBeLessThanOrEqual(2)
    }
    for (const p of UNIT_PRESETS) {
      for (const r of [...p.parts, ...p.upkeep]) expect(offered, `${p.name}: ${r}`).toContain(r)
      expect(p.parts.length).toBeLessThanOrEqual(B.MAX_PARTS)
      expect(p.upkeep.length).toBeLessThanOrEqual(2)
    }
    for (const p of INCOME_PRESETS) for (const r of [p.output, p.per ?? p.output]) expect(offered, p.name).toContain(r)
    for (const p of MIND_PRESETS) expect(p.iq).toBeGreaterThan(B.START_IQ)
  })

  it('matches presets to the world', () => {
    const s = powerWorld()
    expect(resolveResources(s, ['Money', 'power', 'Silicon'])).toEqual({ ids: [MONEY_ID, 'power'], missing: ['Silicon'] })
    const solar = STRATEGY_PRESETS.find((p) => p.name === 'Generate solar power')!
    expect(runnerFor(s, solar)?.id).toBe('farm')
    expect(runnerFor(s, STRATEGY_PRESETS[0]!)).toBeNull()
  })
})

describe('Jev', () => {
  it('gives the same proposal the same verdict without asking again', async () => {
    const inner = new FakeJudge()
    const cache = {}
    const judge = new CachedJudge(inner, () => cache)
    const s = freeState()
    await judgeResource(s, judge, { name: 'Lemons', description: 'Sour.' })
    await judgeResource(s, judge, { name: 'Lemons', description: 'Sour.' })
    expect(inner.calls).toHaveLength(1)
    await judgeResource(s, judge, { name: 'Limes', description: 'Sour.' })
    expect(inner.calls).toHaveLength(2)
  })
})
