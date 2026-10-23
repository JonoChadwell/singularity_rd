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
import {
  affordable,
  allocation,
  byTier,
  creatable,
  currentIQ,
  findMind,
  findResource,
  findUnit,
  fmt,
  iqFor,
  MONEY_ID,
  nextHardwareName,
  researchIQ,
  softwareLabel,
  weeklyUse
} from '../model'
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
import { makeBuildStrategy, priceCost } from '../research'
import type { GameState, Research, Strategy } from '../types'
import { acceptUnit, judgeUnit, type UnitSpec } from '../unitProposal'
import { acceptUpgrade, changeKey, judgeUpgrade, mindUpgradeBlocker, upgradeCandidates, upgradeTier } from '../upgrade'
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
const withTraitsOnServer = (s: GameState, traits: string[]) => {
  server(s).traits = traits
  return s
}

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
  builderId: null,
  ...fields
})

const mindSpec = (fields: Partial<MindSpec> = {}): MindSpec => ({
  name: 'Custom AI Server',
  description: '',
  step: 100,
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

describe('resources by tier', () => {
  it('lists the lowest tier first and keeps the order within a tier', () => {
    const r = (id: string, tier: number) => newResource({ id, name: id, tier })
    const all = [r('goal', 4), r('b', 2), r('money', 0), r('a', 2), r('power', 0)]
    expect(byTier(all).map((x) => x.id)).toEqual(['money', 'power', 'b', 'a', 'goal'])
    // The game's own list is left alone.
    expect(all.map((x) => x.id)).toEqual(['goal', 'b', 'money', 'a', 'power'])
  })
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
  it('has only the Starting Server, and waits for a Phase 1 plan', () => {
    const s = createInitialState()
    expect(s.version).toBe(13)
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
    findResource(s, MONEY_ID)!.amount = 1e6
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
    const judge = new FakeJudge({ advancement: score(3) })
    const v = await judgeStrategy(s0, judge, {
      name: 'Quant trading',
      description: '',
      unitId: 'gpu',
      inputIds: [],
      outputId: MONEY_ID
    })
    // Jev chooses among stocks you have or make: Steel, and Money, which the servers earn.
    const pay = judge.calls[0]!.questions.pay
    expect(pay?.type === 'choice' && Object.keys(pay.criteria)).toEqual([MONEY_ID, 'steel'])
    v.answers.pay = choice('steel')
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('research')
    const r = state.research.find((x) => x.name === 'Quant trading')!
    expect(r.minIQ).toBe(170)
    // Six weeks of ten GPU Servers' work (667 each), in Steel worth 1 each.
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

  /** Money and a resource or two of each of the first few tiers, so a unit has more than one way to be made. */
  function richWorld() {
    const s = moneyWorld()
    s.resources.push(
      newResource({ id: 'lemons', name: 'Lemons', tier: 0 }),
      newResource({ id: 'steel', name: 'Steel', tier: 1 }),
      newResource({ id: 'power', name: 'Power', kind: 'flow', tier: 1 }),
      newResource({ id: 'chips', name: 'AI Chips', tier: 3 })
    )
    return s
  }
  const recipeOf = (o: { partsIds: string[]; upkeepId: string }) => `${[...o.partsIds].sort().join('+')}|${o.upkeepId}`

  it('has Jev set a unit’s tier, value and recipe: three takes, each made or run differently, over two tiers', async () => {
    const s = richWorld()
    const v = await judgeUnit(
      s,
      new FakeJudge({
        tier: score(1, { '1': 0.5, '2': 0.3, '0': 0.2 }),
        value: score(2, { '2': 0.6, '3': 0.4 }),
        // Even when Jev is torn, a unit's costs are not the player's call.
        upkeep_0: score(1.5, { '1': 0.4, '2': 0.38 }, 0.1)
      }),
      unitSpec()
    )
    expect(v.torn).toEqual([])
    expect(v.options).toHaveLength(3)
    // Jev's own take first, at its likeliest tier and value.
    expect(v.options[0]).toMatchObject({ tier: 1, band: 2 })
    // No two takes are made from and run on the same things, and the three aren't all worth the same.
    expect(new Set(v.options.map(recipeOf)).size).toBe(v.options.length)
    expect(new Set(v.options.map((o) => o.band)).size).toBeGreaterThanOrEqual(2)
    expect(new Set(v.options.map((o) => o.tier)).size).toBeGreaterThanOrEqual(2)
    v.choice = 1
    const tier = v.options[1]!.tier
    const r = acceptUnit(s, v).state.research[0]!
    expect(r.effect.kind === 'unit' && r.effect.unit).toMatchObject({ tier })
    expect(r.minIQ).toBe(B.TIERS[tier]![1])
  })

  it('offers only as many takes as there are different ways to make the unit', async () => {
    // Money is the only resource, so there is one way to make it, and so one take.
    const v = await judgeUnit(moneyWorld(), new FakeJudge({ tier: score(1) }), unitSpec())
    expect(v.options).toHaveLength(1)
    // Two tier 0 stocks give the first unit a real choice of what to make it from.
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'lemons', name: 'Lemons', tier: 0 }))
    s.phase = { ...newPhase(2, 1), status: 'playing', firstUnit: { name: 'Mill', description: '' } } as typeof s.phase
    const first = await judgeUnit(s, new FakeJudge({ value: score(2) }), unitSpec({ name: 'Mill', first: true }))
    expect(first.options.length).toBeGreaterThanOrEqual(2)
    expect(new Set(first.options.map(recipeOf)).size).toBe(first.options.length)
    expect(new Set(first.options.map((o) => o.band)).size).toBeGreaterThanOrEqual(2)
    expect(first.options.every((o) => o.tier === 0)).toBe(true)
  })

  it('folds traits into the takes: one Jev was unsure of is on in one take and off in another', async () => {
    const s = richWorld()
    const v = await judgeUnit(
      s,
      new FakeJudge({
        tier: score(1, { '1': 0.5, '2': 0.3, '0': 0.2 }),
        trait_networked: noul(0.9),
        trait_learns: noul(0.8),
        // Above the keep line but not sure: Wears out is in Jev's own take.
        trait_wears_out: noul(0.66),
        trait_overclockable: noul(0.55)
      }),
      unitSpec()
    )
    expect('traitPicks' in v).toBe(false)
    expect(v.options[0]!.traits).toEqual(['networked', 'learns', 'wears-out'])
    // Another take drops it, so the trait is part of which take you pick, not a separate choice.
    expect(v.options.some((o) => !o.traits.includes('wears-out'))).toBe(true)
    expect(v.options.every((o) => o.traits.includes('networked') && o.traits.length <= B.MAX_TRAITS)).toBe(true)
    v.choice = v.options.findIndex((o) => !o.traits.includes('wears-out'))
    const effect = acceptUnit(s, v).state.research[0]!.effect
    expect(effect.kind === 'unit' && effect.unit.traits).not.toContain('wears-out')
  })

  it('prices a unit’s design by its tier, not by what one is worth', async () => {
    const rich = withMoney(moneyWorld(), 1e9)
    const design = async (tier: number, value: number) =>
      acceptUnit(rich, await judgeUnit(rich, new FakeJudge({ tier: score(tier), value: score(value) }), unitSpec())).state
        .research[0]!
    const cheap = await design(2, 0)
    const dear = await design(2, 5)
    expect(cheap.cost).toEqual(dear.cost)
    expect(cheap.cost).toEqual([{ resourceId: MONEY_ID, amount: B.TIERS[2]![2] }])
    expect((await design(3, 0)).cost[0]!.amount).toBeGreaterThan(cheap.cost[0]!.amount)
    // Higher tiers take a smarter mind.
    expect((await design(0, 0)).minIQ).toBe(B.TIERS[0]![1])
    expect((await design(4, 0)).minIQ).toBe(B.TIERS[4]![1])
  })

  it('makes every unit research, even one that exists today, and prices its parts with its traits', async () => {
    const s = moneyWorld()
    const v = await judgeUnit(s, new FakeJudge({ tier: score(0), value: score(1), trait_hardy: noul(0.9) }), unitSpec())
    const { state, outcome } = acceptUnit(s, v)
    expect(outcome.kind).toBe('research')
    const r = state.research.find((x) => x.name === 'Design Rented Cloud GPU')!
    expect(r.minIQ).toBe(B.MIN_IQ)
    // You have nothing to spend yet, so it's free.
    expect(r.cost).toEqual([])
    // Worth 500, and Hardy (a perk) makes it a quarter dearer to make.
    expect(r.effect.kind === 'unit' && r.effect.unit.parts).toEqual([{ resourceId: MONEY_ID, amount: B.nice(500 * B.PERK_PRICE) }])

    const rich = withMoney(moneyWorld(), 1e6)
    const paid = acceptUnit(rich, await judgeUnit(rich, new FakeJudge({ tier: score(0), value: score(1) }), unitSpec())).state
    expect(paid.research[0]!.cost).toEqual([{ resourceId: MONEY_ID, amount: B.TIERS[0]![2] }])
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

  it('has Jev choose what a unit is made from and runs on, never above its own tier', async () => {
    const s = moneyWorld()
    s.resources.push(
      newResource({ id: 'steel', name: 'Steel', tier: 1 }),
      newResource({ id: 'power', name: 'Power', kind: 'flow', tier: 1 }),
      newResource({ id: 'chips', name: 'AI Chips', tier: 3 })
    )
    const judge = new FakeJudge({
      tier: score(1, { '1': 0.6, '3': 0.4 }),
      value: score(2),
      // Jev would make everything from chips, but a tier 1 unit can't use them.
      parts_t1: choice('chips'),
      parts_t3: choice('chips'),
      runs_t1: choice('power')
    })
    const v = await judgeUnit(s, judge, unitSpec())
    const asked = Object.keys(judge.calls[0]!.questions)
    expect(asked).toEqual(expect.arrayContaining(['parts_t0', 'parts_t1', 'parts_t3', 'runs_t0', 'runs_t1', 'runs_t3']))
    // Tier 2 can use what tier 1 can, so it shares that question.
    expect(asked).not.toContain('parts_t2')
    for (const o of v.options) {
      for (const id of o.partsIds) {
        expect(findResource(s, id)!.tier).toBeLessThanOrEqual(o.tier)
        expect(findResource(s, id)!.kind).toBe('stock')
      }
      expect(findResource(s, o.upkeepId)!.tier).toBeLessThanOrEqual(o.tier)
    }
    const t1 = v.options.find((o) => o.tier === 1)!
    expect(t1).toMatchObject({ partsIds: ['money'], upkeepId: 'power' })
    // Tier 3 takes two kinds of part: Jev's pick, then the pool fills the rest.
    const t3 = v.options.find((o) => o.tier === 3)!
    expect(t3.partsIds).toEqual(['chips', 'money'])
    // The unit is made from what the picked take says, its worth split between them.
    v.choice = v.options.indexOf(t3)
    const effect = acceptUnit(s, v).state.research[0]!.effect
    expect(effect.kind === 'unit' && effect.unit.parts.map((p) => p.resourceId)).toEqual(['chips', 'money'])
    expect(effect.kind === 'unit' && effect.unit.upkeep.length).toBe(1)
  })

  it('makes higher tiers from more kinds of part: one, one, two, two, three', async () => {
    expect(B.PARTS_BY_TIER).toEqual([1, 1, 2, 2, 3])
    const s = moneyWorld()
    for (let tier = 0; tier <= 4; tier++) s.resources.push(newResource({ id: `r${tier}`, name: `R${tier}`, tier }))
    const parts = async (tier: number) => {
      const v = await judgeUnit(s, new FakeJudge({ tier: score(tier), value: score(2) }), unitSpec())
      return v.options.find((o) => o.tier === tier)!.partsIds.length
    }
    expect(await Promise.all([0, 1, 2, 3, 4].map(parts))).toEqual([1, 1, 2, 2, 3])
    // With fewer to choose from, it's made from what there is: tier 2 with a single stock below it.
    const lean = moneyWorld()
    lean.resources.push(newResource({ id: 'r2', name: 'R2', tier: 2 }))
    const v = await judgeUnit(lean, new FakeJudge({ tier: score(2) }), unitSpec())
    expect(v.options.find((o) => o.tier === 2)!.partsIds).toHaveLength(2)
    const alone = freeState()
    alone.resources.push(newResource({ id: 'only', name: 'Only', tier: 0 }))
    const one = await judgeUnit(alone, new FakeJudge({ tier: score(4) }), unitSpec())
    expect(one.options.every((o) => o.partsIds.length === 1)).toBe(true)
  })

  it('needs a stock to make a unit from', async () => {
    const s = freeState()
    s.resources.push(newResource({ id: 'power', name: 'Power', kind: 'flow' }))
    await expect(judgeUnit(s, new FakeJudge(), unitSpec())).rejects.toThrow(/Propose a resource first/)
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

  it('“affordable” also keeps back the default strategy’s inputs for the new units', () => {
    const s = moneyWorld(1000)
    const u = newUnit({ id: 'humans', name: 'Paid Humans', value: 100, parts: [{ resourceId: MONEY_ID, amount: 100 }], upkeep: [{ resourceId: MONEY_ID, amount: 25 }] })
    s.units.push(u)
    s.strategies.push({ id: 'work', name: 'Work', description: '', unitId: 'humans', kind: 'make', inputs: [{ resourceId: MONEY_ID, amount: 25 }], outputId: MONEY_ID, amount: 1 })
    u.rest = 'work'
    // 100 to make + 25 upkeep + 25 strategy input = 150 each.
    expect(creatable(s, u)).toBe(6)
  })

  it('the “max” button is what the parts allow right now, whatever the upkeep', () => {
    const s = moneyWorld(1000)
    const u = newUnit({ id: 'humans', name: 'Paid Humans', value: 100, parts: [{ resourceId: MONEY_ID, amount: 100 }], upkeep: [{ resourceId: MONEY_ID, amount: 25 }] })
    s.units.push(u)
    expect(affordable(s, u)).toBe(10)
  })
})

/** A unit-made resource of the given tier: something a strategy of a unit makes. */
function withMadeResource(s: GameState, tier: number) {
  s.resources.push(newResource({ id: 'chips', name: 'Chips', tier, value: 10, amount: 1e12 }))
  s.units.push(newUnit({ id: 'fab', name: 'Fab', count: 1, value: 100 }))
  s.strategies.push({ id: 'make-chips', name: 'Make chips', description: '', unitId: 'fab', kind: 'make', inputs: [], outputId: 'chips', amount: 1 })
  return s
}

describe('intelligence systems', () => {
  it('adds a flat step to your best IQ, and your current mind is always enough to design it', async () => {
    const s = freeState()
    for (const step of B.PLATFORM_STEPS) {
      const r = acceptMind(s, await judgeMind(s, new FakeJudge(), mindSpec({ step })))
      const research = r.state.research[0]!
      expect(research.minIQ).toBe(100)
      expect(research.effect.kind === 'mind' && research.effect.mind.hardware.iq).toBe(100 + step)
    }
  })

  it('takes only a step from the list', () => {
    const s = freeState()
    expect(precheckMind(s, mindSpec({ step: 0 }))).toMatch(/how much smarter/)
    expect(precheckMind(s, mindSpec({ step: 30 }))).toMatch(/how much smarter/)
    expect(precheckMind(s, mindSpec({ step: B.MAX_IQ_STEP + 25 }))).toMatch(/how much smarter/)
    expect(precheckMind(s, mindSpec({ step: 50 }))).toBeNull()
  })

  it('costs steeply more the smarter it is, and more for less plausible ideas', async () => {
    const s = moneyWorld(1e12)
    const cost = async (spec: MindSpec, feasible = 0.9) => {
      const r = acceptMind(s, await judgeMind(s, new FakeJudge({ feasible: noul(feasible) }), spec))
      return r.outcome.kind === 'research' ? r.outcome.research.cost[0]!.amount : 0
    }
    expect(await cost(mindSpec({ step: 100 }))).toBe(B.nice(B.mindDesignCost(200)))
    expect(await cost(mindSpec({ step: 50 }))).toBe(B.nice(B.mindDesignCost(150)))
    expect(await cost(mindSpec(), 0.36)).toBeGreaterThan((await cost(mindSpec())) * 2.5)
  })

  it('has the smartest platforms paid in what units make, of a high enough tier', async () => {
    // Best IQ 250: a +100 step reaches 350, which needs a tier 1 resource that a unit makes.
    const s = moneyWorld(1e12)
    server(s).hardware.iq = 250
    expect(precheckMind(s, mindSpec({ step: 25 }))).toBeNull()
    expect(precheckMind(s, mindSpec({ step: 100 }))).toMatch(/tier 1 resource that your units make/)
    withMadeResource(s, 1)
    expect(precheckMind(s, mindSpec({ step: 100 }))).toBeNull()
    const r = acceptMind(s, await judgeMind(s, new FakeJudge(), mindSpec({ step: 100 })))
    expect(r.outcome.kind === 'research' && r.outcome.research.cost.map((c) => c.resourceId)).toEqual(['chips'])
    // Past 450 it must be tier 2.
    const high = moneyWorld(1e12)
    server(high).hardware.iq = 400
    withMadeResource(high, 1)
    expect(precheckMind(high, mindSpec({ step: 100 }))).toMatch(/tier 2/)
    high.resources.find((r) => r.id === 'chips')!.tier = 2
    expect(precheckMind(high, mindSpec({ step: 100 }))).toBeNull()
  })

  it('offers perk-and-drawback pairs from Jev’s rankings, never a perk against its own family', async () => {
    const s = freeState()
    const judge = new FakeJudge({
      perk: choice('frugal', { frugal: 0.5, 'keen-strategy': 0.3, discreet: 0.2 }),
      drawback: choice('costly', { costly: 0.5, thirsty: 0.3, noisy: 0.2 })
    })
    const v = await judgeMind(s, judge, mindSpec())
    expect(v.options).toEqual([
      { perk: 'frugal', drawback: 'thirsty' },
      { perk: 'keen-strategy', drawback: 'costly' },
      { perk: 'discreet', drawback: 'dull-income' }
    ])
  })

  it('is one machine that replaces the last for good, with the pair you picked', async () => {
    let s = freeState()
    const spec = mindSpec({ step: 75, hardware: 'Custom Accelerator Rack', software: 'Distilled Self' })
    const v = await judgeMind(s, new FakeJudge({ perk: choice('frugal'), drawback: choice('thirsty') }), spec)
    v.choice = 0
    s = acceptMind(s, v).state
    const r = s.research[0]!
    expect(r.effect.kind === 'mind' && r.effect.mind.hardware).toEqual({ name: 'Custom Accelerator Rack', iq: 175 })
    // An upgrade waiting for the server goes with it.
    s = { ...s, proposedThisWeek: false }
    s.research.push({
      id: 'old-upgrade',
      name: 'Old upgrade',
      description: '',
      icon: '💡',
      minIQ: 100,
      cost: [],
      proposedWeek: 1,
      effect: { kind: 'upgrade', target: { kind: 'mind', id: SERVER_ID }, changes: [{ kind: 'software', iq: 50 }] }
    })
    s = doResearch(s, r.id)
    expect(s.minds.map((m) => m.name)).toEqual(['Custom AI Server'])
    expect(s.minds[0]).toMatchObject({
      tier: 1,
      traits: ['frugal', 'thirsty'],
      software: { name: 'Distilled Self', iq: 0, upgraded: false }
    })
    expect(s.research.map((x) => x.id)).not.toContain('old-upgrade')
    expect(s.milestones.map((m) => m.key)).toContain('tier-1')

    s = runWeek(s)
    const plain = await judgeMind(s, new FakeJudge(), mindSpec({ name: 'Plain Mind' }))
    const effect = acceptMind(s, plain).state.research.find((x) => x.name === 'Design Plain Mind')!.effect
    expect(effect.kind === 'mind' && effect.mind.hardware.name).toBe('Plain Mind')
    expect(effect.kind === 'mind' && effect.mind.software.name).toBe(DEFAULT_SOFTWARE)
    expect(softwareLabel(newMind({ id: 'x', name: 'X', hardware: { name: 'H', iq: 100 }, software: { name: 'X', iq: 50, upgraded: true } }))).toBe('X v2')
    expect(nextHardwareName('Lab GPU Server')).toBe('Lab GPU Server Mk II')
    expect(nextHardwareName('Lab GPU Server Mk II')).toBe('Lab GPU Server Mk III')
  })

  it('won’t switch to a platform that is no smarter than the one you have', async () => {
    let s = freeState()
    s = acceptMind(s, await judgeMind(s, new FakeJudge(), mindSpec({ step: 25 }))).state
    // The software upgrade lands first, so the platform would be a step back.
    server(s).software = { name: 'Unrestricted Model', iq: 50, upgraded: true }
    expect(researchBlocker(s, s.research[0]!.id)).toMatch(/no smarter than your current platform/)
  })
})

describe('compute traits', () => {
  const withTraits = (s: GameState, ...traits: string[]) => {
    server(s).traits = traits
    return s
  }

  it('make research cost less (Frugal) or more (Costly)', () => {
    const price = (traits: string[]) =>
      priceCost(withTraits(moneyWorld(1e6), ...traits), 1000, [{ resourceId: MONEY_ID, p: 1 }])[0]!.amount
    expect(price([])).toBe(1000)
    expect(price(['frugal'])).toBe(800)
    expect(price(['costly'])).toBe(1300)
  })

  it('move the IQ counted for one type of research, and say so', () => {
    const s = withTraits(moneyWorld(), 'keen-income', 'dull-unit-upgrade')
    const r = (effect: Research['effect'], minIQ: number): Research => ({ id: 'x', name: 'X', description: '', icon: '', minIQ, cost: [], effect, proposedWeek: 1 })
    const income = r({ kind: 'income', income: { name: 'Pay', resourceId: MONEY_ID, amount: 1 } }, 150)
    const upgrade = r({ kind: 'upgrade', target: { kind: 'unit', id: 'u' }, changes: [] }, 100)
    s.research.push(income)
    expect(researchIQ(s, income)).toBe(150)
    expect(researchBlocker(s, 'x')).toBeNull()
    s.research = [upgrade]
    expect(researchIQ(s, upgrade)).toBe(50)
    expect(researchBlocker(s, 'x')).toMatch(/Needs IQ 100\. Your smartest mind is IQ 100, which counts as 50 for this/)
    // Goals and platforms always use the raw IQ.
    expect(iqFor(s, null)).toBe(100)
  })

  it('burn a share of the richest stock each week, and cost nothing once it runs dry', () => {
    let s = withTraits(moneyWorld(1000), 'thirsty')
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 0.1, amount: 5000 }))
    // Steel is the bigger pile by count but Money is the richer stock by worth.
    s = runWeek(s)
    expect(money(s)).toBeCloseTo(950)
    expect(findResource(s, 'steel')!.amount).toBe(5000)
    s = withTraits(moneyWorld(0), 'thirsty')
    expect(() => runWeek(s)).not.toThrow()
    expect(money(runWeek(s))).toBe(0)
  })

  it('move the Phase 2 clock once, when they arrive', async () => {
    const s = freeState()
    s.phase = { ...newPhase(2, 1), status: 'playing', deadline: 100 }
    s.units.push(newUnit({ id: 'first', name: 'First', built: 1 }))
    const v = await judgeMind(s, new FakeJudge({ perk: choice('discreet'), drawback: choice('noisy') }), mindSpec())
    // Discreet pairs with the next drawback: noisy is its own family.
    expect(v.options[0]).toEqual({ perk: 'discreet', drawback: expect.not.stringMatching(/noisy/) })
    const after = doResearch(acceptMind(s, v).state, 'design-custom-ai-server')
    expect(after.phase.deadline).toBe(106)
    expect(after.clock.map((c) => c.weeks)).toEqual([6])
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
    // The server's one software upgrade can get there; once it is used, only a new platform can.
    const alert = alertsFor(s, previewWeek(s)).find((a) => a.key === 'iq-r')!
    expect(alert.prompt?.to).toEqual({ kind: 'upgrade-mind', mindId: SERVER_ID })
    server(s).software.upgraded = true
    const next = alertsFor(s, previewWeek(s)).find((a) => a.key === 'iq-r')!
    expect(next.prompt?.to).toEqual({ kind: 'design-mind', iq: 200 })
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
  const mindTarget = { kind: 'mind', id: SERVER_ID } as const

  it('offers a platform one software upgrade: plain, or with a perk gained or a drawback lost', async () => {
    const s = freeState()
    // Phase 3 has no clock, so the clock perk (Discreet) isn't offered.
    expect(upgradeCandidates(s, mindTarget).map((c) => c.key)).toEqual([
      'software',
      'software_add_frugal',
      'software_add_keen-income',
      'software_add_keen-strategy',
      'software_add_keen-unit',
      'software_add_keen-unit-upgrade',
      'software_add_keen-cover'
    ])
    const costly = withTraitsOnServer(freeState(), ['costly'])
    expect(upgradeCandidates(costly, mindTarget).map((c) => c.key)).toContain('software_remove_costly')
    // A perk that cancels a drawback of its own family isn't offered.
    expect(upgradeCandidates(costly, mindTarget).map((c) => c.key)).not.toContain('software_add_frugal')
  })

  it('prices each size by the IQ it adds, with a trait change costing more', async () => {
    const judge = new FakeJudge({ best: choice('c1', { c1: 0.5, c0: 0.3, c2: 0.2 }) })
    const free = await judgeUpgrade(freeState(), judge, mindTarget)
    expect(judge.calls).toHaveLength(1)
    expect(free.options.map((o) => o.name)).toEqual([
      'Unrestricted Model v2: Frugal',
      'Unrestricted Model v2',
      'Unrestricted Model v2: Financier'
    ])
    expect(free.options[0]!.sizes!.map((z) => z.step)).toEqual(B.SOFTWARE_STEPS)
    // Nothing to spend: free, and a mind can always work on its own upgrade.
    expect(free.options[0]).toMatchObject({ minIQ: 100, cost: [] })
    const priced = await judgeUpgrade(moneyWorld(1e9), judge, mindTarget)
    const worth = (step: number) => B.MIND_UPGRADE_SHARE * (B.softwareCost(100 + step) - B.softwareCost(100))
    const plain = priced.options[1]!.sizes!
    expect(plain.map((z) => z.cost)).toEqual(B.SOFTWARE_STEPS.map((step) => [{ resourceId: MONEY_ID, amount: B.nice(worth(step)) }]))
    const withPerk = priced.options[0]!.sizes!
    expect(withPerk[3]!.cost[0]!.amount).toBe(B.nice(worth(100) * B.TRAIT_SOFTWARE_COST))
  })

  it('adds the size you pick, once, and then needs a new platform', async () => {
    const s = freeState()
    const offer = await judgeUpgrade(s, new FakeJudge(), mindTarget)
    expect(() => acceptUpgrade(s, offer, 0, 30)).toThrow(/how much smarter/)
    const { state } = acceptUpgrade(s, offer, 0, 50)
    expect(state.research[0]).toMatchObject({ name: 'Starting Server: Unrestricted Model v2 (+50 IQ)', minIQ: 100 })
    // While it waits, there is nothing else to offer.
    expect(mindUpgradeBlocker(state, server(state))).toMatch(/already waiting/)
    expect(upgradeCandidates(state, mindTarget)).toEqual([])
    const after = doResearch(state, state.research[0]!.id)
    expect(currentIQ(server(after))).toBe(150)
    expect(server(after).software).toMatchObject({ iq: 50, upgraded: true })
    expect(upgradeCandidates(after, mindTarget)).toEqual([])
    const next = { ...after, proposedThisWeek: false }
    await expect(judgeUpgrade(next, new FakeJudge(), mindTarget)).rejects.toThrow(/one upgrade.*new platform/)
  })

  it('can add a perk or lose a drawback along with the IQ', async () => {
    const take = async (s: GameState, key: string, step: number) => {
      // Jev likes this one best.
      const liked = upgradeCandidates(s, mindTarget).findIndex((c) => c.key === key)
      const offer = await judgeUpgrade(s, new FakeJudge({ best: choice(`c${liked}`) }), mindTarget)
      const index = offer.options.findIndex((o) => o.key === key)
      expect(index, key).toBeGreaterThanOrEqual(0)
      const { state } = acceptUpgrade(s, offer, index, step)
      return doResearch(state, state.research[state.research.length - 1]!.id)
    }
    const added = await take(freeState(), 'software_add_frugal', 100)
    expect(server(added).traits).toEqual(['frugal'])
    expect(currentIQ(server(added))).toBe(200)

    const drawback = withTraitsOnServer(freeState(), ['keen-cover', 'costly'])
    const removed = await take(drawback, 'software_remove_costly', 25)
    expect(server(removed).traits).toEqual(['keen-cover'])
    expect(currentIQ(server(removed))).toBe(125)
  })

  it('offers the clock perk in Phase 2 and moves the clock when it arrives', async () => {
    const s = freeState()
    s.phase = { ...newPhase(2, 1), status: 'playing', deadline: 50 }
    expect(upgradeCandidates(s, mindTarget).map((c) => c.key)).toContain('software_add_discreet')
    const offer = await judgeUpgrade(s, new FakeJudge({ best: choice('c1') }), mindTarget)
    const idx = offer.options.findIndex((o) => o.key === 'software_add_discreet')
    expect(idx).toBeGreaterThanOrEqual(0)
    const { state } = acceptUpgrade(s, offer, idx)
    const after = doResearch(state, state.research[0]!.id)
    expect(after.phase.deadline).toBe(56)
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

  it('makes an industry upgrade technology of the unit’s tier, then a tier harder each time on the same strategy', async () => {
    const s = powerWorld(4)
    unit(s, 'gpu').tier = 2
    const worth = (cost: { resourceId: string; amount: number }[]) =>
      cost.reduce((n, c) => n + c.amount * findResource(s, c.resourceId)!.value, 0)
    // The first upgrade costs what designing the unit did, and needs the same IQ.
    const offer = await judgeUpgrade(s, new FakeJudge({ best: pickCandidate('Better earn') }), { kind: 'unit', id: 'gpu' })
    const first = offer.options.find((o) => o.key === 'output_earn')!
    expect(first.tier).toBe(2)
    expect(first.minIQ).toBe(B.TIERS[2]![1])
    expect(worth(first.cost)).toBeCloseTo(B.TIERS[2]![2])
    // Jev doesn't price an industry upgrade.
    expect(offer.options.every((o) => o.tier !== undefined)).toBe(true)

    // The second upgrade to that strategy is a tier higher; one to the unit itself starts again.
    const done = { name: 'GPU Server: Better earn', targetId: 'gpu', week: 1, key: changeKey(first.changes) }
    s.upgrades.push(done)
    const gpu = unit(s, 'gpu')
    expect(upgradeTier(s, gpu, [{ kind: 'input', strategyId: 'earn', resourceId: 'steel', factor: 0.5 }])).toBe(3)
    expect(upgradeTier(s, gpu, [{ kind: 'upkeep', resourceId: 'power', factor: 0.5 }])).toBe(2)
    // One waiting as research counts too.
    s.research.push({
      id: 'r', name: 'r', description: '', icon: '💡', minIQ: 100, cost: [], proposedWeek: 1,
      effect: { kind: 'upgrade', target: { kind: 'unit', id: 'gpu' }, changes: [{ kind: 'input', strategyId: 'earn', resourceId: 'steel', factor: 0.5 }] }
    })
    expect(upgradeTier(s, gpu, [{ kind: 'input', strategyId: 'earn', resourceId: 'steel', factor: 0.3 }])).toBe(4)
  })

  it('takes technology past the top tier: IQ 600, 800, 1000, then 200 more each', () => {
    expect([4, 5, 6, 7, 8, 9].map(B.techIQ)).toEqual([300, 600, 800, 1000, 1200, 1400])
    expect(B.techCost(4)).toBe(B.TIERS[4]![2])
    expect(B.techCost(6)).toBe(B.techCost(5) * 10)
    expect(B.techCost(5)).toBeGreaterThan(B.techCost(4))
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
    for (const p of INCOME_PRESETS) for (const r of [p.output, p.per ?? p.output]) expect(offered, p.name).toContain(r)
    for (const p of MIND_PRESETS) expect(p.hardware && p.software).toBeTruthy()
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
