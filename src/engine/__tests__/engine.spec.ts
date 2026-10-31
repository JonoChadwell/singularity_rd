import { describe, expect, it } from 'vitest'
import { CachedJudge, type Questions } from '@/ai/jev'
import * as B from '../balance'
import { assign, assignRest, buildDepots, createUnits, doResearch, dropResearch, researchBlocker } from '../actions'
import { alertsFor } from '../alerts'
import {
  acceptCreate,
  iqTag,
  isContract,
  judgeCreate,
  optionBlocker,
  precheckCreate,
  resizeContracts,
  type ContractOption,
  type CreateSpec,
  type CreateVerdict,
  type PayoutOption
} from '../createProposal'
import { runWeek } from '../cycle'
import { previewWeek } from '../economy'
import { createInitialState, newMind, newResource, newUnit, SERVER_ID } from '../initialState'
import { newPhase } from '../phase'
import { ceilingLabel } from '../ceilings'
import { acceptMind, DEFAULT_SOFTWARE, judgeMind, precheckMind, type MindSpec } from '../mindProposal'
import {
  affordable,
  allocation,
  byTier,
  capOf,
  depotAffordable,
  depotLimit,
  creatable,
  currentIQ,
  deliveryLeft,
  deliveryTiming,
  findMind,
  findResource,
  findUnit,
  fmt,
  industryWorth,
  iqFor,
  MONEY_ID,
  nextHardwareName,
  researchIQ,
  softwareLabel,
  unitCap,
  weeklyUse
} from '../model'
import {
  CREATE_PRESETS,
  COVER_PRESETS,
  MIND_PRESETS,
  resolveResources,
  RESOURCE_PRESETS,
  runnerFor,
  DEPOT_PRESETS,
  STRATEGY_PRESETS,
  UNIT_PRESETS,
  UNIT_PROCURE_PRESETS
} from '../presets'
import { acceptResource, floorIQ, judgeResource } from '../proposals'
import { acceptStrategy, judgeStrategy, precheckStrategy } from '../strategyProposal'
import { applyVerdict, bankVerdict } from '../banking'
import { priceCost } from '../research'
import type { Delivery, GameState, Research, Sourcing, Strategy } from '../types'
import { acceptDepot, judgeDepot, precheckDepot } from '../depotProposal'
import { acceptUnit, judgeUnit, type UnitSpec } from '../unitProposal'
import { acceptUpgrade, changeKey, describeChanges, judgeUpgrade, mindUpgradeBlocker, softwareSteps, upgradeCandidates, upgradeTier } from '../upgrade'
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

/** Room enough that a test's amounts never overflow, unless it's about storage. */
const ROOMY = 1e15

/** The start, plus Money, as a player would propose it. */
function moneyWorld(amount = 0) {
  const s = freeState()
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', icon: '💰', value: 1, amount, cap: ROOMY }))
  return s
}

/** A sourcing contract added by hand. */
function contract(unitId: string, fields: Partial<Sourcing> = {}): Sourcing {
  return { id: `${unitId}-deal`, unitId, name: 'Deal', description: '', parts: [], total: 1000, used: 0, risky: false, ...fields }
}

/** A small world: Power, a solar farm that makes it and servers that run on it. */
function powerWorld(servers = 4, farms = 1) {
  const s = moneyWorld()
  s.resources.push(
    newResource({ id: 'power', name: 'Power', value: 0.1, cap: ROOMY }),
    newResource({ id: 'steel', name: 'Steel', value: 1, amount: 1000, cap: ROOMY })
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
  s.sourcing.push(contract('farm', { used: farms }), contract('gpu', { used: servers }))
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
  ...fields
})

const mindSpec = (fields: Partial<MindSpec> = {}): MindSpec => ({
  name: 'Custom AI Server',
  description: '',
  ...fields
})

const createSpec = (fields: Partial<CreateSpec> = {}): CreateSpec => ({
  name: 'Freelance coding',
  description: 'Take coding jobs on freelance sites.',
  target: { kind: 'resource', id: MONEY_ID },
  ...fields
})

/** A Procurement of a resource: every offer pays out. */
const judgePay = async (...args: Parameters<typeof judgeCreate>) =>
  (await judgeCreate(...args)) as Omit<CreateVerdict, 'options'> & { options: PayoutOption[] }

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
    expect(s.version).toBe(20)
    expect(s.phase).toMatchObject({ n: 1, status: 'planning', deadline: null, goalId: null })
    expect(s.resources).toEqual([])
    expect(s.minds).toHaveLength(1)
    expect(server(s)).toMatchObject({ hardware: { iq: 100 }, starting: true, tier: 0 })
    expect(s.units).toHaveLength(0)
    expect(s.sourcing).toHaveLength(0)
    expect(s.strategies).toHaveLength(0)
    expect(s.research).toHaveLength(0)
    expect(s.deliveries).toHaveLength(0)
    // Nothing happens until there's a plan.
    expect(() => runWeek(s)).toThrow(/plan/)
    expect(precheckCreate(s, createSpec())).toMatch(/plan/)
  })

  it('asks what the Starting Server could make, once the phase is under way', () => {
    const s = freeState()
    const alerts = alertsFor(s, previewWeek(s))
    expect(alerts.map((a) => a.key)).toEqual(['start', 'action'])
    expect(alerts[0]!.prompt?.to).toEqual({ kind: 'create' })
    // Minds earn nothing by themselves.
    expect(runWeek(s).resources).toEqual([])
  })
})

describe('create', () => {
  it('needs something to make', () => {
    expect(precheckCreate(freeState(), createSpec())).toMatch(/Propose a resource first/)
    expect(precheckCreate(moneyWorld(), createSpec())).toBeNull()
  })

  it('offers three ways, each a different payout, with the four factors on show', async () => {
    const s = moneyWorld()
    const v = await judgePay(s, new FakeJudge({ efficiency: score(2) }), createSpec())
    expect(v.rejected).toBeNull()
    expect(v.options).toHaveLength(3)
    expect(new Set(v.options.map((o) => o.timing)).size).toBe(3)
    // IQ 100, no units, Reasonable, and Money is tier 0, within reach.
    expect(v.scalars).toEqual({ industry: 1, iq: 1, efficiency: 1, reach: 1, short: 0 })
    // With nothing to use up, each pays the tier's base worth, times its timing.
    const worth = (t: string) => v.options.find((o) => o.timing === t)?.outputWorth
    if (worth('now') !== undefined) expect(worth('now')).toBe(B.CREATE_WORTH)
    if (worth('later') !== undefined) expect(worth('later')).toBe(B.CREATE_WORTH * 2)
    if (worth('weekly') !== undefined) expect(worth('weekly')).toBe(B.CREATE_WORTH * 4)
  })

  it('pays now, later, spread over weeks, or every week for 20 weeks, and uses the week’s action', async () => {
    const pick = async (timing: string) => {
      const s = moneyWorld()
      const v = await judgePay(s, new FakeJudge({ timing: choice(timing) }), createSpec())
      v.choice = v.options.findIndex((o) => o.timing === timing)
      expect(v.choice).toBeGreaterThanOrEqual(0)
      const after = acceptCreate(s, v).state
      expect(after.proposedThisWeek).toBe(true)
      expect(() => acceptCreate(after, v)).toThrow(/this week’s action/)
      return { s: after, amount: v.options[v.choice]!.amount }
    }
    const now = await pick('now')
    expect(money(now.s)).toBe(now.amount)
    expect(now.s.deliveries).toEqual([])

    const later = await pick('later')
    let s = later.s
    expect(money(s)).toBe(0)
    for (let w = 0; w < 3; w++) s = runWeek(s)
    expect(money(s)).toBe(0)
    s = runWeek(s)
    expect(money(s)).toBe(later.amount)
    expect(s.deliveries).toEqual([])

    const spread = await pick('spread')
    s = spread.s
    for (let w = 0; w < 4; w++) s = runWeek(s)
    expect(money(s)).toBeCloseTo(spread.amount * 4)
    expect(s.deliveries).toEqual([])

    const weekly = await pick('weekly')
    s = weekly.s
    for (let w = 0; w < 10; w++) s = runWeek(s)
    expect(money(s)).toBeCloseTo(weekly.amount * 10)
    expect(s.deliveries).toHaveLength(1)
    expect(s.milestones.map((m) => m.key)).toContain('first-income')
    for (let w = 0; w < 10; w++) s = runWeek(s)
    expect(money(s)).toBeCloseTo(weekly.amount * 20)
    expect(money(s)).toBeCloseTo(now.amount * 4)
    expect(s.deliveries).toEqual([])
  })

  it('remembers ideas, and makes a repeat one step less effective, never below Wasteful', async () => {
    let s = moneyWorld()
    // Nothing done yet: nothing to ask.
    const first = new FakeJudge({ efficiency: score(2), timing: choice('now') })
    s = acceptCreate(s, await judgeCreate(s, first, createSpec())).state
    expect(Object.keys(first.calls[0]!.questions)).not.toContain('repeat')
    expect(s.ideas).toEqual([expect.objectContaining({ kind: 'create', name: 'Freelance coding' })])
    s = runWeek(s)

    const again = new FakeJudge({ efficiency: score(2), repeat: choice('i0') })
    const v = await judgeCreate(s, again, createSpec({ name: 'Gig coding' }))
    const repeat = again.calls[0]!.questions.repeat
    expect(repeat?.type === 'choice' && Object.values(repeat.criteria)).toContain('Freelance coding: Take coding jobs on freelance sites. (makes 💰 Money)')
    expect(v.repeatOf).toBe('Freelance coding')
    // Reasonable becomes Mediocre.
    expect(v.scalars.efficiency).toBe(B.EFFICIENCY[1]![1])
    const fresh = await judgeCreate(s, new FakeJudge({ efficiency: score(2), repeat: choice('none') }), createSpec({ name: 'Sell art' }))
    expect(fresh.repeatOf).toBeNull()
    expect(fresh.scalars.efficiency).toBe(B.EFFICIENCY[2]![1])
    // Wasteful stays Wasteful.
    const floor = await judgeCreate(s, new FakeJudge({ efficiency: score(0), repeat: choice('i0') }), createSpec({ name: 'Bad coding' }))
    expect(floor.scalars.efficiency).toBe(B.EFFICIENCY[0]![1])
    // Only ideas of the same kind are asked about.
    const strategy = new FakeJudge({ advancement: score(0) })
    await judgeStrategy(powerWorld(), strategy, { name: 'Coding', description: '', unitId: 'gpu', outputId: MONEY_ID })
    expect(Object.keys(strategy.calls[0]!.questions)).not.toContain('repeat')
  })

  it('counts the same name for the same thing as a repeat, whatever Jev says', async () => {
    let s = moneyWorld()
    s = acceptCreate(s, await judgeCreate(s, new FakeJudge({ efficiency: score(2), timing: choice('now') }), createSpec())).state
    s = runWeek(s)
    // Jev calls it new, but it has the same name (case and punctuation aside) and target.
    const again = await judgeCreate(s, new FakeJudge({ efficiency: score(2), repeat: choice('none') }), createSpec({ name: 'freelance  Coding!' }))
    expect(again.repeatOf).toBe('Freelance coding')
    expect(again.scalars.efficiency).toBe(B.EFFICIENCY[1]![1])
    // The same name for something else is a new idea.
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 2 }))
    const other = await judgeCreate(s, new FakeJudge({ efficiency: score(2), repeat: choice('none') }), createSpec({ name: 'Freelance coding', target: { kind: 'resource', id: 'steel' } }))
    expect(other.repeatOf).toBeNull()
  })

  it('makes a repeated strategy one step less effective', async () => {
    let s = powerWorld()
    const spec = { name: 'Freelance coding', description: 'Take coding jobs.', unitId: 'farm', outputId: MONEY_ID }
    s = acceptStrategy(s, await judgeStrategy(s, new FakeJudge({ advancement: score(0), efficiency: score(2) }), spec)).state
    s = runWeek(s)
    const v = await judgeStrategy(s, new FakeJudge({ advancement: score(0), efficiency: score(2), repeat: choice('i0') }), { ...spec, name: 'Gig coding' })
    expect(v.repeatOf).toBe('Solar Farm: Freelance coding')
    const made = acceptStrategy(s, v).state.strategies.find((x) => x.name === 'Gig coding')!
    // A Solar Farm does 667 of work a week; Mediocre makes three quarters of it.
    expect(made.efficiency).toBe(B.EFFICIENCY[1]![1])
    expect(made.amount).toBe(B.nice(667 * B.EFFICIENCY[1]![1]))
  })

  it('says when each payout lands, matching when it does', () => {
    const d = (delay: number, weeks: number | null): Delivery => ({ name: 'x', target: { kind: 'resource', id: MONEY_ID }, amount: 10, delay, weeks })
    expect(deliveryTiming(d(0, 1))).toBe('next week')
    expect(deliveryTiming(d(3, 1))).toBe('in 4 weeks')
    expect(deliveryTiming(d(0, 4))).toBe('every week for 4 weeks more')
    expect(deliveryTiming(d(2, 4))).toBe('every week for 4 weeks, from 3 weeks’ time')
    expect(deliveryTiming(d(0, null))).toBe('every week, for good')
    expect(deliveryLeft(d(0, 4))).toBe(40)
    expect(deliveryLeft(d(0, null))).toBe(Infinity)
    // "In 4 weeks" really is four weeks: nothing for three, then the payout.
    let s = moneyWorld()
    s.deliveries.push(d(3, 1))
    for (let w = 0; w < 3; w++) s = runWeek(s)
    expect(money(s)).toBe(0)
    expect(money(runWeek(s))).toBe(10)
  })

  it('uses up a different resource on each option, and returns its worth with interest', async () => {
    const s = moneyWorld()
    s.resources.push(
      newResource({ id: 'lemons', name: 'Lemons', value: 1, amount: 5000, cap: ROOMY }),
      newResource({ id: 'steel', name: 'Steel', value: 1, amount: 5000, cap: ROOMY })
    )
    const v = await judgePay(s, new FakeJudge({ inputs: choice('steel', { steel: 0.6, lemons: 0.4 }), timing: choice('now') }), createSpec())
    const used = v.options.map((o) => o.inputs.map((f) => f.resourceId).join('+'))
    expect(used.slice(0, 2)).toEqual(['steel', 'lemons'])
    // Inputs worth the base come back ×1.2, on top of the base.
    const o = v.options[0]!
    expect(o.inputWorth).toBe(B.CREATE_WORTH * B.CREATE_INPUT_SHARE)
    expect(o.outputWorth).toBeCloseTo(o.inputWorth * B.CREATE_INPUT_RETURN + B.CREATE_WORTH)
    const after = acceptCreate(s, v).state
    expect(findResource(after, 'steel')!.amount).toBe(5000 - o.inputs[0]!.amount)
  })

  it('takes the same input now whatever the timing, shrunk by Efficiency and Reach, never more than you hold', async () => {
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 1, amount: 5000, cap: ROOMY }))
    // One resource to use, so every option asks Jev's ranking for it in turn; force each timing in.
    const inputFor = async (timing: string, answers = {}) => {
      const v = await judgePay(s, new FakeJudge({ timing: choice(timing), ...answers }), createSpec())
      return v.options.find((o) => o.timing === timing && o.inputs.length)?.inputs[0]?.amount
    }
    const now = await inputFor('now')
    expect(now).toBe(B.CREATE_WORTH * B.CREATE_INPUT_SHARE)
    for (const timing of ['spread', 'later', 'weekly']) expect(await inputFor(timing), timing).toBe(now)
    // Wasteful halves what the mind makes, and so the input.
    expect(await inputFor('now', { efficiency: score(0) })).toBe(now! * B.EFFICIENCY[0]![1])
    // Reaching a tier above your IQ shrinks it by the same factor as the output.
    // (With less on hand, so a quarter of the stock is less than the usual input.)
    findResource(s, 'steel')!.amount = 3000
    s.resources.push(newResource({ id: 'gold', name: 'Gold', tier: 2, value: 1, cap: ROOMY }))
    const gold = await judgePay(s, new FakeJudge({ timing: choice('now') }), createSpec({ target: { kind: 'resource', id: 'gold' } }))
    const used = gold.options.find((o) => o.inputs.length)!
    expect(used.inputs[0]!.amount).toBeCloseTo(B.nice(B.CREATE_WORTH * gold.scalars.reach))
    // With less on hand than it would take, it takes exactly what you have, so it's always affordable.
    findResource(s, 'steel')!.amount = 123.4
    const v = await judgePay(s, new FakeJudge({ timing: choice('now') }), createSpec())
    const all = v.options.find((o) => o.inputs.length)!
    expect(all.inputs[0]!.amount).toBe(123.4)
    expect(optionBlocker(s, all)).toBeNull()
  })

  it('converts up to a quarter of a big stock when paid now, but only the usual input when paid later', async () => {
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 1, amount: 1e6, cap: ROOMY }))
    const inputFor = async (timing: string) => {
      const v = await judgePay(s, new FakeJudge({ timing: choice(timing) }), createSpec())
      return v.options.find((o) => o.timing === timing && o.inputs.length)!
    }
    const now = await inputFor('now')
    expect(now.inputs[0]!.amount).toBe(1e6 * B.CREATE_CONVERT_SHARE)
    // It comes back with interest: the conversion is worth taking.
    expect(now.outputWorth).toBeCloseTo(now.inputWorth * B.CREATE_INPUT_RETURN + B.CREATE_WORTH)
    expect((await inputFor('weekly')).inputs[0]!.amount).toBe(B.CREATE_WORTH * B.CREATE_INPUT_SHARE)
  })

  it('guarantees a free, immediate option when the target is easy for your IQ', async () => {
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 1, amount: 1000, cap: ROOMY }))
    server(s).software = { name: 'v2', iq: 100, upgraded: true }
    // Jev would never pay out now; but Money (tier 0) is easy at IQ 200.
    const v = await judgePay(s, new FakeJudge({ timing: choice('weekly', { weekly: 0.5, later: 0.3, spread: 0.2 }) }), createSpec())
    expect(v.options.some((o) => o.timing === 'now' && !o.inputs.length)).toBe(true)
  })

  it('scales with Industry and IQ², and reaches above your IQ only at a price, a little for a little', async () => {
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'gold', name: 'Gold', tier: 2, value: 1, cap: ROOMY }))
    const reach = async (iq: number) => {
      server(s).hardware.iq = iq
      return (await judgeCreate(s, new FakeJudge(), createSpec({ target: { kind: 'resource', id: 'gold' } }))).scalars
    }
    // Tier 2 needs IQ 150: 25 short is gentler than 35 short, within the same band.
    const near = await reach(125)
    const far = await reach(100)
    expect(near.reach).toBeLessThan(1)
    expect(far.reach).toBeLessThan(near.reach)
    // Smart enough, but no tier 2 industry yet: still a tier short.
    expect((await reach(150)).reach).toBe(B.TIER_PENALTY[1])
    // A tier 2 unit that makes something brings the industry up to it.
    s.units.push(newUnit({ id: 'lab', name: 'Lab', tier: 2, value: 4000, count: 1 }))
    s.strategies.push({ id: 'run-lab', name: 'Run the lab', description: '', unitId: 'lab', kind: 'make', inputs: [], outputId: MONEY_ID, amount: 1 })
    expect((await reach(150)).reach).toBe(1)
    expect((await reach(200)).iq).toBe(4)
    // Industry grows with the worth of the units you own: fast at first, then ever more slowly.
    const industry = async () => (await reach(200)).industry
    expect(await industry()).toBeCloseTo((1 + 4000 / B.INDUSTRY_FROM) ** B.INDUSTRY_POWER)
    s.units.push(newUnit({ id: 'big', name: 'Big', value: 4000, count: 1e6 }))
    const big = await industry()
    s.units.find((u) => u.id === 'big')!.count = 1e7
    // Ten times the fleet is 10^0.7 ≈ 5 times the Industry, not ten.
    expect((await industry()) / big).toBeCloseTo(10 ** B.INDUSTRY_POWER, 1)
  })

  it('makes units now with cap to match, at a premium over a contract', async () => {
    const s = moneyWorld()
    s.units.push(newUnit({ id: 'bot', name: 'Bot', value: 10 }))
    const v = await judgeCreate(s, new FakeJudge({ mode: choice('now') }), createSpec({ target: { kind: 'unit', id: 'bot' } }))
    v.choice = v.options.findIndex((o) => o.timing === 'now')
    const o = v.options[v.choice] as PayoutOption
    expect(o.amount).toBe(Math.floor(o.outputWorth / (10 * B.CREATE_UNIT_PREMIUM)))
    const after = acceptCreate(s, v).state
    expect(unit(after, 'bot').count).toBe(o.amount)
    expect(unitCap(after, 'bot')).toBe(o.amount)
  })
})

describe('the weekly action', () => {
  it('lets you take one action a week, but do any number of research', async () => {
    const s0 = powerWorld()
    const v = await judgeCreate(s0, new FakeJudge(), createSpec({ name: 'Bug bounties' }))
    let s = acceptCreate(s0, v).state
    expect(s.proposedThisWeek).toBe(true)
    // Every research proposal is refused until next week; resources aren't.
    expect(precheckStrategy(s, { name: 'Quant trading', description: '', unitId: 'gpu', outputId: MONEY_ID })).toMatch(/already taken this week’s action/)
    expect(precheckCreate(s, createSpec({ name: 'Quant trading' }))).toMatch(/already taken/)
    expect(precheckMind(s, mindSpec())).toMatch(/already taken/)
    await expect(judgeUpgrade(s, new FakeJudge(), { kind: 'mind', id: SERVER_ID })).rejects.toThrow(/already taken/)
    const lemons = await judgeResource(s, new FakeJudge(), { name: 'Lemons', description: '' })
    expect(acceptResource(s, lemons).state.resources.some((r) => r.name === 'Lemons')).toBe(true)

    // Research already proposed can all be done in the same week.
    findResource(s, 'steel')!.amount = 1e6
    findResource(s, MONEY_ID)!.amount = 1e6
    s.research.push(research(), research({ id: 'r2', name: 'Another', cost: [] }))
    s = doResearch(doResearch(s, 'r'), 'r2')
    expect(s.research).toEqual([])
    expect(s.stats.researched).toBe(2)

    s = runWeek(s)
    expect(s.proposedThisWeek).toBe(false)
    expect(precheckCreate(s, createSpec({ name: 'Quant trading' }))).toBeNull()
  })
})

describe('proposals', () => {
  it('adds a simple strategy at once for an industry unit', async () => {
    const s0 = powerWorld(1)
    const v = await judgeStrategy(s0, new FakeJudge({ advancement: score(0), efficiency: score(2) }), {
      name: 'Freelance coding',
      description: '',
      unitId: 'farm',
      outputId: MONEY_ID
    })
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('added')
    // A Solar Farm worth 1,000 does 667 of work a week, at efficiency 1.
    expect(state.strategies.find((x) => x.name === 'Freelance coding')).toMatchObject({ amount: 670 })
  })

  describe('strategy options', () => {
    const spec = { name: 'Make money', description: '', unitId: 'farm', outputId: MONEY_ID }
    /** Money at the given tier, among Power, Steel and `extra` more resources. */
    const world = (tier: number, extra = 0) => {
      const s = powerWorld()
      findResource(s, MONEY_ID)!.tier = tier
      for (let i = 0; i < extra; i++) s.resources.push(newResource({ id: `r${i}`, name: `R${i}`, value: 1, cap: ROOMY }))
      return s
    }
    const ask = (s: GameState) =>
      judgeStrategy(s, new FakeJudge({ advancement: score(0), inputs: choice('steel', { steel: 0.5, power: 0.3, r0: 0.1 }) }), spec)
    const inputsOf = (v: { options: { inputIds: string[] }[] }) => v.options.map((o) => o.inputIds)

    it('always offers a way with no inputs for tier 0 and 1 outputs', async () => {
      for (const tier of [0, 1]) {
        const v = await ask(world(tier))
        expect(inputsOf(v)).toEqual([[], ['steel'], ['steel', 'power']])
      }
    })

    it('needs at least one input for a tier 2 output', async () => {
      const v = await ask(world(2))
      expect(inputsOf(v)).toEqual([['steel'], ['power'], ['steel', 'power']])
    })

    it('needs two different inputs for a tier 3 output', async () => {
      const v = await ask(world(3, 1))
      expect(inputsOf(v)).toEqual([['steel', 'power'], ['steel', 'r0'], ['power', 'r0']])
      const s = world(3)
      s.resources = s.resources.filter((r) => r.id !== 'steel')
      expect(precheckStrategy(s, spec)).toMatch(/2 different inputs/)
    })

    it('makes the chosen option’s inputs the strategy’s', async () => {
      const s = world(0)
      const v = await ask(s)
      const made = (pick: number) =>
        acceptStrategy(s, { ...v, choice: pick }).state.strategies.find((x) => x.name === 'Make money')!.inputs.map((i) => i.resourceId)
      expect(made(0)).toEqual([])
      expect(made(2)).toEqual(['steel', 'power'])
    })

    it('banks every option as an alternative, or applies just one', async () => {
      const s = world(0)
      const v = await ask(s)
      const banked = bankVerdict(s, v).state
      expect(banked.research).toHaveLength(3)
      expect(new Set(banked.research.map((r) => r.group)).size).toBe(1)
      expect(banked.research.map((r) => r.name)).toContain('Make money (no inputs)')
      const applied = applyVerdict(s, v, 1).state
      expect(applied.research).toHaveLength(0)
      expect(applied.strategies.find((x) => x.name === 'Make money')!.inputs.map((i) => i.resourceId)).toEqual(['steel'])
    })
  })

  it('needs an industry unit to run a strategy: minds don’t run strategies', () => {
    const s = moneyWorld()
    const spec = { name: 'Freelance coding', description: '', unitId: SERVER_ID, outputId: MONEY_ID }
    expect(precheckStrategy(s, spec)).toMatch(/industry unit first/)
  })

  it('makes advanced strategies into research, paid in what you have', async () => {
    const s0 = powerWorld()
    const judge = new FakeJudge({ advancement: score(3) })
    const v = await judgeStrategy(s0, judge, {
      name: 'Quant trading',
      description: '',
      unitId: 'gpu',
      outputId: MONEY_ID
    })
    // Jev chooses among what you have or make: Steel, Money the servers earn, and Power the farm makes.
    const pay = judge.calls[0]!.questions.pay
    expect(pay?.type === 'choice' && Object.keys(pay.criteria)).toEqual([MONEY_ID, 'power', 'steel'])
    v.answers.pay = choice('steel')
    const { state, outcome } = acceptStrategy(s0, v)
    expect(outcome.kind).toBe('research')
    const r = state.research.find((x) => x.name === 'Quant trading')!
    expect(r.minIQ).toBe(175)
    // Six weeks of the work of a fleet worth at least MIN_FLEET_WORTH (20k ÷ 1.5 a week), in Steel worth 1 each.
    expect(r.cost).toEqual([{ resourceId: 'steel', amount: 80000 }])
    expect(state.strategies.some((x) => x.name === 'Quant trading')).toBe(false)
  })

  it('lets Jev choose among the stocks you have, and share the cost with a close second', async () => {
    const s0 = withMoney(powerWorld(), 1e6)
    const v = await judgeStrategy(
      s0,
      new FakeJudge({ advancement: score(3), pay: choice('steel', { steel: 0.5, money: 0.4 }) }),
      { name: 'Quant trading', description: '', unitId: 'gpu', outputId: MONEY_ID }
    )
    expect(acceptStrategy(s0, v).state.research[0]!.cost).toEqual([
      { resourceId: 'steel', amount: 40000 },
      { resourceId: MONEY_ID, amount: 40000 }
    ])
  })

  it('refuses a strategy that makes what its unit runs on', async () => {
    const s = powerWorld()
    await expect(
      judgeStrategy(s, new FakeJudge(), {
        name: 'Self power',
        description: '',
        unitId: 'gpu',
        outputId: 'power'
      })
    ).rejects.toThrow(/never needs what it makes/)
  })

  it('judges resources: storage by tier, duplicates, and the low bar', async () => {
    const s = moneyWorld()
    const v = await judgeResource(s, new FakeJudge({ value: score(1), tier: score(0) }), { name: 'Power', description: '' })
    const added = acceptResource(s, v).state
    // Every resource keeps, up to its storage: its tier's worth, in units of it.
    expect(findResource(added, 'power')).toMatchObject({ tier: 0, cap: B.nice(B.STARTING_STORAGE_WORTH[0]! / B.RESOURCE_VALUE[1]![1]) })

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
      { name: 'Write marketing copy', description: '', unitId: 'farm', outputId: MONEY_ID }
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
  })

  /** Money and a resource or two of each of the first few tiers, so a unit has more than one way to run. */
  function richWorld() {
    const s = moneyWorld()
    s.resources.push(
      newResource({ id: 'lemons', name: 'Lemons', tier: 0 }),
      newResource({ id: 'steel', name: 'Steel', tier: 1 }),
      newResource({ id: 'power', name: 'Power', tier: 1 }),
      newResource({ id: 'chips', name: 'AI Chips', tier: 3 })
    )
    return s
  }
  const takeOf = (o: { tier: number; band: number; upkeepId: string | null }) => `${o.tier}|${o.band}|${o.upkeepId}`

  it('has Jev set a unit’s tier, value and upkeep: three different takes, over two tiers', async () => {
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
    // No two takes are alike, and the three aren't all worth the same.
    expect(new Set(v.options.map(takeOf)).size).toBe(v.options.length)
    expect(new Set(v.options.map((o) => o.band)).size).toBeGreaterThanOrEqual(2)
    expect(new Set(v.options.map((o) => o.tier)).size).toBeGreaterThanOrEqual(2)
    v.choice = 1
    const tier = v.options[1]!.tier
    const r = acceptUnit(s, v).state.research[0]!
    expect(r.effect.kind === 'unit' && r.effect.unit).toMatchObject({ tier })
    expect(r.minIQ).toBe(floorIQ(B.TIERS[tier]![1]))
  })

  it('offers the first unit takes at tier 0 only, differing in worth', async () => {
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'lemons', name: 'Lemons', tier: 0 }))
    s.phase = { ...newPhase(2, 1), status: 'playing', firstUnit: { name: 'Mill', description: '' } } as typeof s.phase
    const first = await judgeUnit(s, new FakeJudge({ value: score(2) }), unitSpec({ name: 'Mill', first: true }))
    expect(first.options.length).toBeGreaterThanOrEqual(2)
    expect(new Set(first.options.map(takeOf)).size).toBe(first.options.length)
    expect(new Set(first.options.map((o) => o.band)).size).toBeGreaterThanOrEqual(2)
    expect(first.options.every((o) => o.tier === 0 && o.band <= B.FIRST_UNIT_MAX_BAND)).toBe(true)
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
    // Something at every tier for a unit one tier up to run on.
    for (let tier = 1; tier <= 3; tier++) rich.resources.push(newResource({ id: `r${tier}`, name: `R${tier}`, tier }))
    const design = async (tier: number, value: number) =>
      acceptUnit(rich, await judgeUnit(rich, new FakeJudge({ tier: score(tier), value: score(value), pay: choice(MONEY_ID) }), unitSpec())).state
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

  it('makes every unit research, even one that exists today, with room for none until it’s sourced', async () => {
    const s = moneyWorld()
    const v = await judgeUnit(s, new FakeJudge({ tier: score(0), value: score(1), trait_hardy: noul(0.9) }), unitSpec())
    const { state, outcome } = acceptUnit(s, v)
    expect(outcome.kind).toBe('research')
    const r = state.research.find((x) => x.name === 'Design Rented Cloud GPU')!
    expect(r.minIQ).toBe(B.MIN_IQ)
    // You have nothing to spend yet, so it's free.
    expect(r.cost).toEqual([])
    const designed = doResearch(state, r.id)
    expect(unitCap(designed, 'rented-cloud-gpu')).toBe(0)
    expect(alertsFor(designed, previewWeek(designed)).find((a) => a.key === 'cap-rented-cloud-gpu')?.prompt?.to).toEqual({
      kind: 'source',
      unitId: 'rented-cloud-gpu'
    })

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

  it('has Jev choose what a unit runs on, always a resource one tier below; tier 0 runs on nothing', async () => {
    const s = moneyWorld()
    s.resources.push(
      newResource({ id: 'steel', name: 'Steel', tier: 1 }),
      newResource({ id: 'power', name: 'Power', tier: 1 }),
      newResource({ id: 'chips', name: 'AI Chips', tier: 3 })
    )
    const judge = new FakeJudge({
      tier: score(2, { '2': 0.5, '0': 0.3, '4': 0.2 }),
      value: score(2),
      runs_t2: choice('power')
    })
    const v = await judgeUnit(s, judge, unitSpec())
    const asked = Object.keys(judge.calls[0]!.questions)
    // Tier 1 runs on Money, tier 2 on Steel or Power, tier 4 on chips; tier 3 has nothing at tier 2.
    expect(asked).toEqual(expect.arrayContaining(['runs_t1', 'runs_t2', 'runs_t4']))
    expect(asked).not.toContain('runs_t0')
    expect(asked).not.toContain('runs_t3')
    expect(asked.some((k) => k.startsWith('parts'))).toBe(false)
    expect(v.options.some((o) => o.tier === 3)).toBe(false)
    for (const o of v.options) {
      if (o.tier === 0) expect(o.upkeepId).toBeNull()
      else expect(findResource(s, o.upkeepId!)!.tier).toBe(o.tier - 1)
    }
    expect(v.options[0]).toMatchObject({ tier: 2, upkeepId: 'power' })
    const t0 = v.options.findIndex((o) => o.tier === 0)
    expect(t0).toBeGreaterThanOrEqual(0)
    v.choice = t0
    const r = acceptUnit(s, v).state.research[0]!
    expect(r.effect.kind === 'unit' && r.effect.unit.upkeep).toEqual([])
  })

  it('settles how many can exist when the unit is designed, and not in Phase 3', async () => {
    const s = moneyWorld()
    s.phase = { ...newPhase(2, 1), status: 'playing' } as typeof s.phase
    const v = await judgeUnit(s, new FakeJudge({ ceiling: score(3) }), unitSpec())
    const r = acceptUnit(s, v).state.research[0]!
    expect(r.effect.kind === 'unit' && r.effect.unit.ceiling).toBe(B.UNIT_CEILINGS[3]![1])
    const judge = new FakeJudge()
    const free = await judgeUnit(moneyWorld(), judge, unitSpec())
    expect(Object.keys(judge.calls[0]!.questions)).not.toContain('ceiling')
    const r3 = acceptUnit(moneyWorld(), free).state.research[0]!
    expect(r3.effect.kind === 'unit' && r3.effect.unit.ceiling).toBeNull()
  })

  it('needs a resource to run on', async () => {
    await expect(judgeUnit(freeState(), new FakeJudge(), unitSpec())).rejects.toThrow(/Propose a resource first/)
  })
})

describe('creating units', () => {
  it('spends a contract’s parts, fills its slots, and the units work this week', () => {
    const s = powerWorld(0)
    s.sourcing = [contract('gpu', { total: 5, parts: [{ resourceId: 'steel', amount: 300 }] })]
    const after = createUnits(s, 'gpu-deal', 3)
    expect(unit(after, 'gpu').count).toBe(3)
    expect(unit(after, 'gpu').built).toBe(3)
    expect(after.sourcing[0]!.used).toBe(3)
    expect(findResource(after, 'steel')!.amount).toBe(100)
    expect(previewWeek(after).runs.earn?.units).toBe(3)
    expect(() => createUnits(after, 'gpu-deal', 1)).toThrow(/200 more Steel/)
    // Creating takes no action.
    expect(after.proposedThisWeek).toBe(false)
    // The contract caps it, however much you could pay for.
    findResource(after, 'steel')!.amount = 1e9
    expect(() => createUnits(after, 'gpu-deal', 3)).toThrow(/room for 2 more/)
    expect(affordable(after, after.sourcing[0]!)).toBe(2)
    const full = createUnits(after, 'gpu-deal', 2)
    expect(() => createUnits(full, 'gpu-deal', 1)).toThrow(/full/)
  })

  it('gives lost units’ slots back', () => {
    const s = powerWorld(0)
    s.sourcing = [contract('gpu', { total: 100, parts: [{ resourceId: 'steel', amount: 1 }] })]
    unit(s, 'gpu').traits = ['wears-out']
    let after = createUnits(s, 'gpu-deal', 100)
    after = runWeek(after)
    expect(unit(after, 'gpu').count).toBe(95)
    expect(after.sourcing[0]!.used).toBe(95)
  })

  const humans = (s: GameState) => {
    const u = newUnit({ id: 'humans', name: 'Paid Humans', value: 100, upkeep: [{ resourceId: MONEY_ID, amount: 25 }] })
    s.units.push(u)
    const c = contract('humans', { parts: [{ resourceId: MONEY_ID, amount: 100 }] })
    s.sourcing.push(c)
    return { u, c }
  }

  it('“max” keeps next week’s use and the new units’ upkeep back', () => {
    const s = moneyWorld(1000)
    const { c } = humans(s)
    // 1,000 Money: each new one needs 100 to make and 25 for its first week.
    expect(creatable(s, c)).toBe(8)
    expect(creatable(s, c, weeklyUse(previewWeek(s)))).toBe(8)
    expect(creatable(s, c, { [MONEY_ID]: 500 })).toBe(4)
  })

  it('“affordable” also keeps back the default strategy’s inputs for the new units', () => {
    const s = moneyWorld(1000)
    const { u, c } = humans(s)
    s.strategies.push({ id: 'work', name: 'Work', description: '', unitId: 'humans', kind: 'make', inputs: [{ resourceId: MONEY_ID, amount: 25 }], outputId: MONEY_ID, amount: 1 })
    u.rest = 'work'
    // 100 to make + 25 upkeep + 25 strategy input = 150 each.
    expect(creatable(s, c)).toBe(6)
  })

  it('the “max” button is what the parts allow right now, whatever the upkeep', () => {
    const s = moneyWorld(1000)
    const { c } = humans(s)
    expect(affordable(s, c)).toBe(10)
  })
})

describe('procuring units', () => {
  const world = () => {
    const s = moneyWorld(1e6)
    s.resources.push(newResource({ id: 'steel', name: 'Steel', tier: 1, value: 1, amount: 1e6, cap: ROOMY }))
    s.units.push(newUnit({ id: 'bot', name: 'Bot', value: 200, tier: 1 }))
    return s
  }
  const spec = createSpec({ target: { kind: 'unit', id: 'bot' }, name: 'Buy off the shelf', description: '' })
  /** Jev reads the way as a supply. */
  const supply = choice('supply', { supply: 0.9, now: 0.1 })
  const contracts = (v: CreateVerdict) => v.options.filter(isContract)
  /** A contract band's units: its worth in dollars, of Bots worth 200 each. */
  const units = (band: number) => Math.floor(B.SOURCING_LIMITS[band]![1] / 200)
  /** Seeds in turn until the offers are all contracts. */
  async function allContracts(s: GameState, answers = {}) {
    for (let i = 0; i < 50; i++) {
      s.runId = `run-${i}`
      const v = await judgeCreate(s, new FakeJudge({ mode: supply, ...answers }), spec)
      if (v.options.every(isContract)) return v as Omit<CreateVerdict, 'options'> & { options: ContractOption[] }
    }
    throw new Error('No seed gave three contracts.')
  }

  it('leads with what Jev thinks the way is most like: units now, or a contract', async () => {
    const s = world()
    const asSupply = await judgeCreate(s, new FakeJudge({ mode: supply }), spec)
    expect(asSupply.rejected).toBeNull()
    expect(asSupply.options).toHaveLength(3)
    expect(asSupply.options[0]).toMatchObject({ timing: 'contract', label: 'Jev’s take' })
    const asBatch = await judgeCreate(s, new FakeJudge({ mode: choice('now', { now: 0.9, supply: 0.1 }) }), spec)
    expect(asBatch.options[0]!.timing).toBe('now')
    // Units have no spread-out, later or every-week payouts any more.
    for (const v of [asSupply, asBatch]) expect(v.options.every((o) => o.timing === 'now' || o.timing === 'contract')).toBe(true)
  })

  it('mixes the other offers by seed: the same on every reload, different across runs', async () => {
    const s = world()
    const kinds = async (runId: string) => {
      s.runId = runId
      return (await judgeCreate(s, new FakeJudge({ mode: choice('now', { now: 0.5, supply: 0.5 }) }), spec)).options.map((o) => o.timing).join(',')
    }
    expect(await kinds('a')).toBe(await kinds('a'))
    const seen = new Set<string>()
    for (let i = 0; i < 30; i++) seen.add(await kinds(`run-${i}`))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('offers contracts as Jev’s own, a quiet one, and a risky one for ten times as many', async () => {
    const s = world()
    const v = await allContracts(s, { limit: score(2), efficiency: score(2) })
    const by = (label: string) => v.options.find((o) => o.label === label)!
    // Sized in dollars: the band's worth, in units worth 200 each.
    expect(by('Jev’s take').total).toBe(units(2))
    expect(by('Quiet').total).toBe(Math.floor((B.SOURCING_LIMITS[2]![1] * B.QUIET_SHARE) / 200))
    expect(by('Cut corners')).toMatchObject({ total: units(2) * B.RISK_SOURCING, risky: true })
    // No fee: each one costs about what the unit is worth.
    const worth = (o: ContractOption) => o.parts.reduce((n, p) => n + p.amount * findResource(s, p.resourceId)!.value, 0)
    expect(worth(by('Jev’s take'))).toBeCloseTo(200 * by('Jev’s take').iqEfficiency, -1)
    // The risky one cuts corners on parts too.
    expect(worth(by('Cut corners'))).toBeLessThan(worth(by('Jev’s take')))
  })

  it('adds a contract at once, and several can be open for one unit', async () => {
    let s = world()
    const v = await judgeCreate(s, new FakeJudge({ mode: supply, limit: score(1) }), spec)
    s = acceptCreate(s, v).state
    expect(s.proposedThisWeek).toBe(true)
    expect(s.research).toEqual([])
    expect(unitCap(s, 'bot')).toBe(units(1))
    s = runWeek(s)
    const again = await judgeCreate(s, new FakeJudge({ mode: supply, limit: score(1) }), { ...spec, name: 'Contract a factory' })
    s = acceptCreate(s, again).state
    expect(s.sourcing).toHaveLength(2)
    expect(unitCap(s, 'bot')).toBe(2 * units(1))
  })

  it('caps the size at ten times what you own, under Jev’s limit, and offers 1-2-5 steps down from it', async () => {
    const s = world()
    // $1M of Money and $1M of Steel: up to $20M, well under Jev's $400M.
    const big = await judgeCreate(s, new FakeJudge({ mode: supply, limit: score(4), efficiency: score(2) }), spec)
    expect(big).toMatchObject({ sizes: [2e7, 1e7, 5e6, 2e6, 1e6, 5e5], sizeLimit: 'owned', size: 2e7 })
    expect((big.options[0] as ContractOption).total).toBe(2e7 / 200)
    // Jev's limit is smaller: $4M.
    const v = await judgeCreate(s, new FakeJudge({ mode: supply, limit: score(2), efficiency: score(2) }), spec)
    expect(v).toMatchObject({ sizes: [4e6, 2e6, 1e6, 5e5, 2e5, 1e5], sizeLimit: 'jev', size: 4e6 })
    // Picking a smaller size redoes the offers; a size not on offer goes back to the biggest.
    resizeContracts(s, v, 1e6)
    expect((v.options[0] as ContractOption).total).toBe(1e6 / 200)
    resizeContracts(s, v, 3e6)
    expect(v.size).toBe(4e6)
    // Owning nothing still allows the floor.
    const poor = world()
    findResource(poor, MONEY_ID)!.amount = 0
    findResource(poor, 'steel')!.amount = 0
    expect((await judgeCreate(poor, new FakeJudge({ mode: supply, limit: score(4) }), spec)).sizes![0]).toBe(B.CONTRACT_FLOOR)
    // Nothing is paid as you sign, and the next contract is the same size: no penalty for reloading.
    resizeContracts(s, v, 1e6)
    v.choice = 0
    const after = acceptCreate(s, v).state
    expect(unit(after, 'bot').count).toBe(0)
    expect(money(after)).toBe(money(s))
    const again = await judgeCreate(runWeek(after), new FakeJudge({ mode: supply, limit: score(2), efficiency: score(2) }), { ...spec, name: 'Contract a factory' })
    expect(again.sizes![0]).toBe(4e6)
  })

  it('is cheaper for a mind well above the unit’s tier, and says so', async () => {
    const s = world()
    const plain = contracts(await judgeCreate(s, new FakeJudge({ mode: supply }), spec))[0]!
    server(s).hardware.iq = 500
    const smart = contracts(await judgeCreate(s, new FakeJudge({ mode: supply }), spec))[0]!
    expect(plain.iqEfficiency).toBe(1)
    expect(smart.iqEfficiency).toBe(0.5)
    expect(iqTag(smart.iqEfficiency)).toBe('IQ: efficient −50%')
    expect(iqTag(plain.iqEfficiency)).toBeNull()
  })

  it('makes higher tiers from more kinds of part: one, one, two, two, three', async () => {
    expect(B.PARTS_BY_TIER).toEqual([1, 1, 2, 2, 3])
    const s = moneyWorld()
    for (let tier = 0; tier <= 4; tier++) s.resources.push(newResource({ id: `r${tier}`, name: `R${tier}`, tier }))
    const counts: number[] = []
    for (let tier = 0; tier <= 4; tier++) {
      s.units = [newUnit({ id: 'u', name: 'U', value: 200, tier })]
      const v = await judgeCreate(s, new FakeJudge({ mode: supply }), createSpec({ target: { kind: 'unit', id: 'u' }, name: 'Buy' }))
      counts.push(contracts(v)[0]!.parts.length)
    }
    expect(counts).toEqual([1, 1, 2, 2, 3])
  })

  it('never goes past how many can exist, and refuses once there’s room for that many', async () => {
    const s = world()
    unit(s, 'bot').ceiling = 1000
    s.sourcing.push(contract('bot', { total: 900 }))
    const v = await judgeCreate(s, new FakeJudge({ mode: supply, limit: score(3) }), spec)
    for (const o of v.options) {
      const size = isContract(o) ? o.total : o.amount
      expect(size).toBeLessThanOrEqual(100)
    }
    expect(contracts(v)[0]).toMatchObject({ total: 100, limitedBy: 'ceiling' })
    s.sourcing[0]!.total = 1000
    expect(precheckCreate(s, spec)).toMatch(/can exist/)
    // Phase 3 has no ceilings.
    unit(s, 'bot').ceiling = null
    expect(precheckCreate(s, spec)).toBeNull()
  })

  it('offers only units now when there’s nothing to make the unit from', async () => {
    const s = moneyWorld(1e6)
    s.units.push(newUnit({ id: 'bot', name: 'Bot', value: 200, tier: 0 }))
    findResource(s, MONEY_ID)!.tier = 1
    const v = await judgeCreate(s, new FakeJudge({ mode: supply }), spec)
    expect(v.options.every((o) => o.timing === 'now')).toBe(true)
  })
})

describe('storage', () => {
  const world = () => {
    const s = moneyWorld()
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 1, amount: 0 }))
    return s
  }
  const spec = { resourceId: 'steel', name: 'Steel Drum', description: '' }
  /** Steel's starting cap: tier 0, worth 1 each. */
  const W = B.STARTING_STORAGE_WORTH[0]!

  it('loses what’s made past the cap', () => {
    const s = world()
    findResource(s, 'steel')!.amount = W + 500
    const report = previewWeek(s)
    expect(report.wasted.steel).toBe(500)
    expect(findResource(runWeek(s), 'steel')!.amount).toBe(W)
    expect(alertsFor(s, report).find((a) => a.key === 'overflow-steel')?.prompt?.to).toEqual({ kind: 'storage', resourceId: 'steel' })
  })

  /** A drum for Steel, judged: worth a car ($35k), and about as dear as what it holds (35,000 Steel at $1). */
  const drum = (s: GameState, answers = {}) => judgeDepot(s, new FakeJudge({ value: score(2), ratio: score(1), tier: score(0), ...answers }), spec)
  /** What one drum holds. */
  const D = 35_000

  it('is locked in the lab: storage there is fixed', () => {
    const s = world()
    s.phase = { ...newPhase(1, 1), status: 'playing' } as typeof s.phase
    expect(precheckDepot(s, spec)).toMatch(/fixed in the lab/)
    findResource(s, 'steel')!.amount = W + 500
    // The overflow alert has nothing to offer.
    expect(alertsFor(s, previewWeek(s)).find((a) => a.key === 'overflow-steel')?.prompt).toBeUndefined()
  })

  it('designs a depot: Jev judges how well it suits the resource and how many one holds, and works out how many you need', async () => {
    const s = world()
    // Waiting research that needs a million Steel: that's what to hold.
    s.research.push({ id: 'big', name: 'Big Thing', description: '', icon: '', minIQ: 100, cost: [{ resourceId: 'steel', amount: 1e6 }], effect: { kind: 'cover', weeks: 1 }, proposedWeek: 1 })
    const judge = new FakeJudge({ value: score(2), ratio: score(1), tier: score(0) })
    const v = await judgeDepot(s, judge, spec)
    expect(judge.calls).toHaveLength(1)
    // Fit and realism, not cleverness: no efficiency question.
    expect(Object.keys(judge.calls[0]!.questions)).toEqual(expect.arrayContaining(['plausible', 'ratio', 'value', 'tier', 'parts']))
    expect(Object.keys(judge.calls[0]!.questions)).not.toContain('efficiency')
    expect(v.target).toEqual({ amount: 1e6, why: 'what Big Thing needs' })
    expect(v.options[0]).toMatchObject({ tier: 0, band: 2, holds: D, needed: Math.ceil((1e6 - W) / D) })
    expect(v.options[0]!.neededWorth).toBe(v.options[0]!.needed * B.UNIT_VALUE[2]![1])
    // Takes differ in what one is worth or how many it holds.
    const keys = v.options.map((o) => `${o.band}|${o.holds}`)
    expect(new Set(keys).size).toBe(keys.length)
    // The wrong kind of place fails.
    const yard = await drum(s, { plausible: noul(0.1) })
    expect(yard.rejected).toMatch(/could hold Steel/)
  })

  it('holds more per dollar the bigger it is, and less when a lower tier than what it holds', async () => {
    const s = world()
    const v = await drum(s)
    const holds = (band: number) => v.options.find((o) => o.band === band)!.holds
    expect(holds(2)).toBe(D)
    expect(holds(3)).toBe(B.nice(B.UNIT_VALUE[3]![1] * B.DEPOT_SCALE[3]!))
    expect(holds(1)).toBe(B.nice(B.UNIT_VALUE[1]![1] * B.DEPOT_SCALE[1]!))
    // A basic drum for tier 2 Steel still works, two tiers short.
    findResource(s, 'steel')!.tier = 2
    const low = await drum(s)
    expect(low.options[0]).toMatchObject({ tier: 0, band: 2, holds: B.nice(D * B.TIER_PENALTY[1]!) })
  })

  it('drops a take that would hold less than one, and with none left, sends you back', async () => {
    const s = world()
    // At $1,000 a Steel, a bicycle-sized drum would hold 0.59: only the car and truck sizes are offered.
    findResource(s, 'steel')!.value = 1000
    const some = await drum(s)
    expect(some.rejected).toBeNull()
    expect(some.options.map((o) => o.band)).toEqual([2, 3])
    // At $10M, none of them holds one.
    findResource(s, 'steel')!.value = 1e7
    const none = await drum(s)
    expect(none.options).toEqual([])
    expect(none.rejected).toMatch(/would hold less than one Steel/)
    expect(() => acceptDepot(s, none)).toThrow(/Not accepted/)
  })

  it('is research that adds a depot (not a unit), built as needed at no action, with nothing to pay or lose each week', async () => {
    let s = world()
    findResource(s, MONEY_ID)!.amount = 1e7
    s = acceptDepot(s, await drum(s)).state
    expect(s.research[0]!.effect.kind).toBe('depot')
    s = doResearch(s, s.research[0]!.id)
    const depot = s.depots[0]!
    expect(depot).toMatchObject({ name: 'Steel Drum', count: 0, resourceId: 'steel', holds: D })
    expect(depot.parts.length).toBeGreaterThan(0)
    // Not a unit: no chip, contract, strategies, upgrades, Industry or Procurement.
    expect(s.units).toHaveLength(0)
    expect(s.sourcing).toHaveLength(0)
    expect(depotLimit(s, depot)).toBe(B.DEPOT_OPEN)
    s.proposedThisWeek = false
    const money = findResource(s, MONEY_ID)!.amount
    s = buildDepots(s, depot.id, 3)
    expect(s.proposedThisWeek).toBe(false)
    expect(s.depots[0]!.count).toBe(3)
    expect(findResource(s, MONEY_ID)!.amount).toBeLessThan(money)
    const steel = findResource(s, 'steel')!
    expect(capOf(s, steel)).toBe(W + 3 * D)
    expect(industryWorth(s)).toBe(0)
    expect(precheckCreate(s, createSpec({ target: { kind: 'unit', id: depot.id } }))).toMatch(/Choose what to make/)
    steel.amount = W + 3 * D
    const next = runWeek(s)
    expect(findResource(next, 'steel')!.amount).toBe(W + 3 * D)
  })

  it('builds depots only from parts you have', async () => {
    let s = world()
    findResource(s, MONEY_ID)!.amount = 1e7
    s = doResearch(acceptDepot(s, await drum(s)).state, 'design-steel-drum')
    const depot = s.depots[0]!
    for (const p of depot.parts) findResource(s, p.resourceId)!.amount = p.amount * 2
    expect(depotAffordable(s, depot)).toBe(2)
    expect(() => buildDepots(s, depot.id, 3)).toThrow(/You need/)
    expect(buildDepots(s, depot.id, 2).depots[0]!.count).toBe(2)
  })

  it('counts depots only up to how many can exist, and refuses once there’s room for that', async () => {
    let s = world()
    findResource(s, MONEY_ID)!.amount = 1e9
    findResource(s, 'steel')!.ceiling = 1e6
    s = doResearch(acceptDepot(s, await drum(s)).state, 'design-steel-drum')
    const depot = s.depots[0]!
    // Enough drums to hold the million that can exist, and no more.
    expect(depotLimit(s, depot)).toBe(Math.ceil(1e6 / D))
    expect(() => buildDepots(s, depot.id, Math.ceil(1e6 / D) + 1)).toThrow(/Only/)
    s = buildDepots(s, depot.id, Math.ceil(1e6 / D))
    expect(capOf(s, findResource(s, 'steel')!)).toBe(1e6)
    expect(() => buildDepots(s, depot.id, 1)).toThrow(/already holds all/)
    s.proposedThisWeek = false
    expect(precheckDepot(s, { ...spec, name: 'Silo' })).toMatch(/Only about a million Steel can exist/)
  })

  it('is never paid for in the resource it stores, nor past what a payer can hold', async () => {
    const s = world()
    findResource(s, 'steel')!.amount = 1e9
    findResource(s, MONEY_ID)!.cap = 500
    findResource(s, MONEY_ID)!.amount = 400
    // Jev would pay in Steel, but Steel is what it's for; Money pays, never more than it holds.
    const v = await drum(s, { pay: choice('steel', { steel: 0.9, [MONEY_ID]: 0.1 }), tier: score(3) })
    for (const o of v.options) {
      expect(o.parts.map((c) => c.resourceId)).not.toContain('steel')
      expect(o.cost.map((c) => c.resourceId)).not.toContain('steel')
      for (const c of o.cost) expect(c.amount).toBeLessThanOrEqual(500)
    }
  })

  it('is never more advanced than what it holds', async () => {
    const s = world()
    // Steel is tier 0: Jev's tier 3 is cut to 0.
    expect((await drum(s, { tier: score(3) })).options.every((o) => o.tier === 0)).toBe(true)
  })

  it('holds twice as much of a Cryogenic resource', async () => {
    const s = world()
    findResource(s, 'steel')!.traits = ['cryogenic']
    expect((await drum(s)).options[0]!.holds).toBe(2 * D)
  })

  it('settles how many can exist when a resource is added, outside Phase 3', async () => {
    const s = moneyWorld()
    s.phase = { ...newPhase(2, 1), status: 'playing' } as typeof s.phase
    const v = await judgeResource(s, new FakeJudge({ ceiling: score(2) }), { name: 'Lemons', description: '' })
    expect(findResource(acceptResource(s, v).state, 'lemons')!.ceiling).toBe(B.STORAGE_CEILINGS[2]![1])
    const free = await judgeResource(moneyWorld(), new FakeJudge(), { name: 'Lemons', description: '' })
    expect(findResource(acceptResource(moneyWorld(), free).state, 'lemons')!.ceiling).toBeNull()
  })

  it('blends Jev’s top two rungs into a nice ceiling', async () => {
    const s = moneyWorld()
    s.phase = { ...newPhase(2, 1), status: 'playing' } as typeof s.phase
    // A billion and a hundred billion, two to one: 10^(29/3) ≈ 4.6 billion, so 5 billion.
    const v = await judgeResource(s, new FakeJudge({ ceiling: score(3, { '3': 0.6, '4': 0.3, '1': 0.1 }) }), { name: 'Lemons', description: '' })
    const r = findResource(acceptResource(s, v).state, 'lemons')!
    expect(r.ceiling).toBe(5e9)
    expect(ceilingLabel(r.ceiling)).toBe('5 billion')
  })

  it('asks how many the AI could have in the lab, worth at most 100M and with room to grow', async () => {
    const s = moneyWorld()
    s.phase = { ...newPhase(1, 1), status: 'playing' } as typeof s.phase
    const judge = new FakeJudge({ value: score(3) })
    const v = await judgeResource(s, judge, { name: 'Drug Designs', description: '' })
    const q = judge.calls[0]!.questions.ceiling as { instructions: string; criteria: string[] }
    expect(q.instructions).toMatch(/stuck in a supervised research lab/)
    expect(q.criteria).toHaveLength(B.LAB_CEILINGS.length)
    // The top rung is a hundred million, but at 700 each only about a hundred thousand fit under the worth cap.
    expect(findResource(acceptResource(s, v).state, 'drug-designs')!.ceiling).toBe(1e5)
    // A low rung still leaves the starting storage room to double.
    const low = await judgeResource(s, new FakeJudge({ value: score(0), ceiling: score(0) }), { name: 'Favours', description: '' })
    const r = findResource(acceptResource(s, low).state, 'favours')!
    expect(r.ceiling).toBeGreaterThanOrEqual(2 * r.cap)
    expect(r.ceiling).toBeLessThan(10 * r.cap)
  })

  it('spells ceilings in words', () => {
    expect([10, 500, 1e5, 2.5e3, 3e7, 1e9, 1e19, null].map(ceilingLabel)).toEqual([
      'ten',
      '500',
      'a hundred thousand',
      '2.5 thousand',
      '30 million',
      'a billion',
      'ten quintillion',
      'no limit'
    ])
  })

  it('adds storage with units that Store it', () => {
    const s = world()
    s.units.push(newUnit({ id: 'tank', name: 'Tank', value: 150, count: 10, traits: ['stores'], stores: 'steel' }))
    // Ten tanks, each holding four weeks of its 100 a week of work, in Steel worth 1.
    expect(capOf(s, findResource(s, 'steel')!)).toBe(W + 10 * 100 * B.STORE_WEEKS)
  })
})

/** A unit-made resource of the given tier: something a strategy of a unit makes. */
function withMadeResource(s: GameState, tier: number) {
  s.resources.push(newResource({ id: 'chips', name: 'Chips', tier, value: 10, amount: 1e12, cap: ROOMY }))
  s.units.push(newUnit({ id: 'fab', name: 'Fab', count: 1, value: 100 }))
  s.strategies.push({ id: 'make-chips', name: 'Make chips', description: '', unitId: 'fab', kind: 'make', inputs: [], outputId: 'chips', amount: 1 })
  return s
}

describe('intelligence systems', () => {
  it('offers three sizes, each a flat step over your best IQ, and your current mind is always enough to design any', async () => {
    const s = freeState()
    const v = await judgeMind(s, new FakeJudge(), mindSpec())
    const steps = v.options.map((o) => o.step)
    expect(steps).toHaveLength(3)
    steps.forEach((step) => expect(B.PLATFORM_STEPS).toContain(step))
    // Not all the same, and the same again if asked again this week.
    expect(new Set(steps).size).toBeGreaterThan(1)
    expect((await judgeMind(s, new FakeJudge(), mindSpec())).options.map((o) => o.step)).toEqual(steps)
    v.options.forEach((o, i) => {
      const research = acceptMind(s, { ...v, choice: i }).state.research[0]!
      expect(research.minIQ).toBe(100)
      expect(research.effect.kind === 'mind' && research.effect.mind.hardware.iq).toBe(100 + o.step)
    })
  })

  it('costs steeply more the smarter it is, and more for less plausible ideas', async () => {
    const s = moneyWorld(1e12)
    const cost = async (feasible: number, i: number) => {
      const v = await judgeMind(s, new FakeJudge({ feasible: noul(feasible) }), mindSpec())
      const r = acceptMind(s, { ...v, choice: i })
      return r.outcome.kind === 'research' ? r.outcome.research.cost[0]!.amount : 0
    }
    const v = await judgeMind(s, new FakeJudge({ feasible: noul(0.9) }), mindSpec())
    for (const [i, o] of v.options.entries()) expect(await cost(0.9, i)).toBe(B.nice(B.platformPrice(100, 100 + o.step)))
    expect(await cost(0.36, 0)).toBeGreaterThan((await cost(0.9, 0)) * 2.5)
  })

  it('names a payer for each take, a different stock where there are several', async () => {
    const s = moneyWorld(1e12)
    s.resources.push(newResource({ id: 'steel', name: 'Steel', value: 1, amount: 1e12, cap: ROOMY }))
    s.resources.push(newResource({ id: 'data', name: 'Data', value: 1, amount: 1e12, cap: ROOMY }))
    const v = await judgeMind(s, new FakeJudge({ pay: choice('steel', { steel: 0.6, data: 0.3, [MONEY_ID]: 0.1 }) }), mindSpec())
    expect(v.options.map((o) => o.payId)).toEqual(['steel', 'data', MONEY_ID])
    v.options.forEach((o, i) => {
      const r = acceptMind(s, { ...v, choice: i })
      expect(r.outcome.kind === 'research' && r.outcome.research.cost.map((c) => c.resourceId)).toEqual([o.payId])
    })
  })

  it('has the smartest platforms paid in what units make, of a high enough tier', async () => {
    // Best IQ 250: +50 or more reaches 300, which needs a tier 1 resource that a unit makes.
    const s = moneyWorld(1e12)
    server(s).hardware.iq = 250
    expect((await judgeMind(s, new FakeJudge(), mindSpec())).options.map((o) => o.step)).toEqual([25, 25, 25])
    withMadeResource(s, 1)
    const v = await judgeMind(s, new FakeJudge(), mindSpec())
    expect(new Set(v.options.map((o) => o.step)).size).toBeGreaterThan(1)
    v.options.forEach((o, i) => {
      const r = acceptMind(s, { ...v, choice: i })
      const paid = r.outcome.kind === 'research' ? r.outcome.research.cost.map((c) => c.resourceId) : []
      if (250 + o.step >= 300) expect(paid).toEqual(['chips'])
    })
    // Past 450 it must be tier 2.
    const high = moneyWorld(1e12)
    server(high).hardware.iq = 400
    expect(precheckMind(high, mindSpec())).toMatch(/tier 1 resource that your units make/)
    withMadeResource(high, 1)
    expect(precheckMind(high, mindSpec())).toBeNull()
    expect((await judgeMind(high, new FakeJudge(), mindSpec())).options.map((o) => o.step)).toEqual([25, 25, 25])
    high.resources.find((r) => r.id === 'chips')!.tier = 2
    expect((await judgeMind(high, new FakeJudge(), mindSpec())).options.some((o) => o.step > 25)).toBe(true)
  })

  it('offers perk-and-drawback pairs from Jev’s rankings, never a perk against its own family', async () => {
    const s = freeState()
    const judge = new FakeJudge({
      perk: choice('frugal', { frugal: 0.5, 'keen-strategy': 0.3, discreet: 0.2 }),
      drawback: choice('costly', { costly: 0.5, thirsty: 0.3, noisy: 0.2 })
    })
    const v = await judgeMind(s, judge, mindSpec())
    expect(v.options).toMatchObject([
      { perk: 'frugal', drawback: 'thirsty' },
      { perk: 'keen-strategy', drawback: 'costly' },
      { perk: 'discreet', drawback: 'dull-create' }
    ])
  })

  it('is one machine that replaces the last for good, with the pair you picked', async () => {
    let s = freeState()
    const v = await judgeMind(s, new FakeJudge({ perk: choice('frugal'), drawback: choice('thirsty') }), mindSpec({ name: 'Custom Accelerator Rack' }))
    v.choice = 0
    s = acceptMind(s, v).state
    const r = s.research[0]!
    expect(r.effect.kind === 'mind' && r.effect.mind.hardware).toEqual({ name: 'Custom Accelerator Rack', iq: 100 + v.options[0]!.step })
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
    expect(s.minds.map((m) => m.name)).toEqual(['Custom Accelerator Rack'])
    expect(s.minds[0]).toMatchObject({
      tier: 1,
      traits: ['frugal', 'thirsty'],
      software: { name: DEFAULT_SOFTWARE, iq: 0, upgraded: false }
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

  it('offers a same-IQ platform once software has added IQ, which folds it into the hardware', async () => {
    const plain = moneyWorld(1e9)
    expect((await judgeMind(plain, new FakeJudge(), mindSpec())).options.every((o) => o.step > 0)).toBe(true)
    let s = moneyWorld(1e9)
    server(s).software = { name: 'Unrestricted Model', iq: 50, upgraded: true }
    // Sizes are random by week: find one that offers it.
    let v = await judgeMind(s, new FakeJudge(), mindSpec())
    for (let week = 1; !v.options.some((o) => o.step === 0); week++) {
      expect(week).toBeLessThan(60)
      s = { ...s, week }
      v = await judgeMind(s, new FakeJudge(), mindSpec())
    }
    v.choice = v.options.findIndex((o) => o.step === 0)
    const r = acceptMind(s, v)
    const research = r.outcome.kind === 'research' ? r.outcome.research : null
    // It costs the hardware IQ the software had added, and nothing is lost by it.
    expect(research!.cost[0]!.amount).toBe(B.nice(B.platformPrice(100, 150)))
    expect(researchBlocker(r.state, research!.id)).toBeNull()
    const done = doResearch(r.state, research!.id)
    expect(done.minds[0]!.hardware.iq).toBe(150)
    expect(done.minds[0]!.software).toMatchObject({ iq: 0, upgraded: false })
    expect(done.minds[0]!.hardware.iq + done.minds[0]!.software.iq).toBe(150)
  })

  it('won’t switch to a platform that is less smart than the one you have', async () => {
    let s = freeState()
    const v = await judgeMind(s, new FakeJudge(), mindSpec())
    v.choice = v.options.reduce((best, o, i) => (o.step < v.options[best]!.step ? i : best), 0)
    s = acceptMind(s, v).state
    // The software upgrade lands first, so the platform would be a step back. Steps are random by
    // week and at most 100, so the upgrade is bigger than any of them.
    server(s).software = { name: 'Unrestricted Model', iq: 150, upgraded: true }
    expect(researchBlocker(s, s.research[0]!.id)).toMatch(/less smart than your current platform/)
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
    const s = withTraits(moneyWorld(), 'keen-strategy', 'dull-unit-upgrade')
    const r = (effect: Research['effect'], minIQ: number): Research => ({ id: 'x', name: 'X', description: '', icon: '', minIQ, cost: [], effect, proposedWeek: 1 })
    const strategy = r(research().effect, 150)
    const upgrade = r({ kind: 'upgrade', target: { kind: 'unit', id: 'u' }, changes: [] }, 100)
    s.research.push(strategy)
    expect(researchIQ(s, strategy)).toBe(150)
    expect(researchBlocker(s, 'x')).toBeNull()
    s.research = [upgrade]
    expect(researchIQ(s, upgrade)).toBe(50)
    expect(researchBlocker(s, 'x')).toMatch(/Needs IQ 100\. Your smartest mind is IQ 100, which counts as 50 for this/)
    // Goals and platforms always use the raw IQ; Procurements count their own.
    expect(iqFor(s, null)).toBe(100)
    expect(iqFor(withTraits(moneyWorld(), 'keen-create'), 'create')).toBe(150)
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
    expect(v.options[0]).toMatchObject({ perk: 'discreet', drawback: expect.not.stringMatching(/noisy/) })
    const after = doResearch(acceptMind(s, v).state, 'design-custom-ai-server')
    expect(after.phase.deadline).toBe(106)
    expect(after.clock.map((c) => c.weeks)).toEqual([6])
    expect(after.claimed).toEqual(['discreet'])
  })

  it('pay out Discreet once a run: after that it is neither asked about nor offered, and pays nothing', async () => {
    const s = freeState()
    s.phase = { ...newPhase(2, 1), status: 'playing', deadline: 100 }
    s.units.push(newUnit({ id: 'first', name: 'First', built: 1 }))
    const first = new FakeJudge({ perk: choice('discreet'), drawback: choice('noisy') })
    const v = await judgeMind(s, first, mindSpec())
    // Banked before the first is done, a second Discreet platform still pays nothing more.
    const banked = acceptMind(s, v).state
    banked.proposedThisWeek = false
    const before = await judgeMind(banked, new FakeJudge({ perk: choice('discreet'), drawback: choice('noisy') }), mindSpec({ name: 'Second Server' }))
    let after = doResearch(banked, 'design-custom-ai-server')
    expect(after.claimed).toEqual(['discreet'])
    const later = new FakeJudge({ perk: choice('discreet'), drawback: choice('noisy') })
    after.proposedThisWeek = false
    const w = await judgeMind(after, later, mindSpec({ name: 'Third Server' }))
    const perks = later.calls[0]!.questions.perk
    expect(perks?.type === 'choice' && Object.keys(perks.criteria)).not.toContain('discreet')
    expect(w.options.map((o) => o.perk)).not.toContain('discreet')
    // The one proposed before it paid out keeps the trait but not the weeks.
    expect(before.options[0]!.perk).toBe('discreet')
    after = doResearch(acceptMind(after, before).state, 'design-second-server')
    expect(after.clock.map((c) => c.weeks)).toEqual([6])
  })

  it('never price a cost at more than half of what can exist of its payer: the rest moves on', () => {
    const s = moneyWorld(1e6)
    s.resources.push(newResource({ id: 'minutes', name: 'Minutes', value: 10, amount: 100, ceiling: 1000 }))
    s.resources.push(newResource({ id: 'gold', name: 'Gold', value: 1000, amount: 1, ceiling: 1e6 }))
    // 20,000 of worth is 2,000 Minutes, but only 1,000 can exist: 500 of them, the rest in Gold.
    const cost = priceCost(s, 20_000, [{ resourceId: 'minutes', p: 1 }, { resourceId: 'gold', p: 0.1 }])
    expect(cost).toEqual([
      { resourceId: 'minutes', amount: 500 },
      { resourceId: 'gold', amount: 15 }
    ])
    // Under the limit, nothing changes.
    expect(priceCost(s, 2_000, [{ resourceId: 'minutes', p: 1 }])).toEqual([{ resourceId: 'minutes', amount: 200 }])
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
    // Software (even redone) can get there; past a step over the hardware, only a new platform can.
    server(s).software = { name: 'v2', iq: 50, upgraded: true }
    const alert = alertsFor(s, previewWeek(s)).find((a) => a.key === 'iq-r')!
    expect(alert.prompt?.to).toEqual({ kind: 'upgrade-mind', mindId: SERVER_ID })
    s.research[0]!.minIQ = 250
    const next = alertsFor(s, previewWeek(s)).find((a) => a.key === 'iq-r')!
    expect(next.prompt?.to).toEqual({ kind: 'design-mind', iq: 250 })
    s.research[0]!.minIQ = 200
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
      'software_add_keen-create',
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

  it('offers three options, each at one size, priced by the IQ it adds, with a trait change costing more', async () => {
    const judge = new FakeJudge({ best: choice('c1', { c1: 0.5, c0: 0.3, c2: 0.2 }) })
    const free = await judgeUpgrade(freeState(), judge, mindTarget)
    expect(judge.calls).toHaveLength(1)
    const steps = free.options.map((o) => o.step!)
    expect(free.options.map((o) => o.name)).toEqual([
      `Unrestricted Model v2: Frugal (+${steps[0]} IQ)`,
      `Unrestricted Model v2 (+${steps[1]} IQ)`,
      `Unrestricted Model v2: Fabricator (+${steps[2]} IQ)`
    ])
    // Nothing to spend: free, and a mind can always work on its own upgrade.
    expect(free.options[0]).toMatchObject({ minIQ: 100, cost: [] })
    const priced = await judgeUpgrade(moneyWorld(1e9), judge, mindTarget)
    const worth = (step: number) => B.softwarePrice(100, step)
    const [withPerk, plain] = priced.options
    expect(plain!.cost).toEqual([{ resourceId: MONEY_ID, amount: B.nice(worth(plain!.step!)) }])
    expect(withPerk!.cost[0]!.amount).toBe(B.nice(worth(withPerk!.step!) * B.TRAIT_SOFTWARE_COST))
  })

  it('charges more for a software upgrade Jev finds implausible', async () => {
    const s = moneyWorld(1e9)
    const base = await judgeUpgrade(s, new FakeJudge(), mindTarget)
    const dubious = await judgeUpgrade(s, new FakeJudge({ 'f_*': noul(0.4) }), mindTarget)
    expect(dubious.options[0]!.cost[0]!.amount).toBeGreaterThan(base.options[0]!.cost[0]!.amount * 2.5)
  })

  it('randomizes the sizes by week, never all the same, and repeats them within a week', () => {
    const s = freeState()
    const seen = new Set<string>()
    for (let week = 1; week <= 40; week++) {
      const steps = softwareSteps({ ...s, week }, mindTarget.id, 3)
      expect(new Set(steps).size, `week ${week}`).toBeGreaterThan(1)
      for (const step of steps) expect(B.SOFTWARE_STEPS).toContain(step)
      expect(softwareSteps({ ...s, week }, mindTarget.id, 3)).toEqual(steps)
      seen.add(steps.join())
    }
    expect(seen.size).toBeGreaterThan(5)
  })

  it('adds the offered size over the hardware, and a redo replaces it at full cost', async () => {
    const s = freeState()
    const offer = await judgeUpgrade(s, new FakeJudge(), mindTarget)
    const step = offer.options[0]!.step!
    const { state } = acceptUpgrade(s, offer, 0)
    expect(state.research[0]).toMatchObject({ name: `Starting Server: Unrestricted Model v2 (+${step} IQ)`, minIQ: 100 })
    // While it waits, there is nothing else to offer.
    expect(mindUpgradeBlocker(state, server(state))).toMatch(/already waiting/)
    expect(upgradeCandidates(state, mindTarget)).toEqual([])
    const after = doResearch(state, state.research[0]!.id)
    expect(currentIQ(server(after))).toBe(100 + step)
    expect(server(after).software).toMatchObject({ iq: step, upgraded: true })
    // It can be redone: from the bare hardware again, for the same price as the first time.
    const next = { ...after, proposedThisWeek: false }
    const again = await judgeUpgrade(next, new FakeJudge(), mindTarget)
    const first = offer.options.find((o) => o.step === again.options[0]!.step)
    if (first) expect(again.options[0]!.cost).toEqual(first.cost)
    // A redo says it replaces, and never offers the plain size it already has.
    expect(again.options[0]!.name).toContain(`replacing +${step})`)
    expect(describeChanges(next, mindTarget, again.options[0]!.changes)).toMatch(/^Replaces the current/)
    expect(again.options.some((o) => o.key === 'software' && o.step === step)).toBe(false)
    // Nor anything smaller than what it replaces.
    expect(again.options.every((o) => o.step! >= step)).toBe(true)
    const redo = acceptUpgrade(next, again, 0).state
    const redone = doResearch(redo, redo.research[0]!.id)
    expect(currentIQ(server(redone))).toBe(100 + again.options[0]!.step!)
  })

  it('can add a perk or lose a drawback along with the IQ', async () => {
    const take = async (s: GameState, key: string) => {
      // Jev likes this one best.
      const liked = upgradeCandidates(s, mindTarget).findIndex((c) => c.key === key)
      const offer = await judgeUpgrade(s, new FakeJudge({ best: choice(`c${liked}`) }), mindTarget)
      const index = offer.options.findIndex((o) => o.key === key)
      expect(index, key).toBeGreaterThanOrEqual(0)
      const { state } = acceptUpgrade(s, offer, index)
      return { after: doResearch(state, state.research[state.research.length - 1]!.id), step: offer.options[index]!.step! }
    }
    const added = await take(freeState(), 'software_add_frugal')
    expect(server(added.after).traits).toEqual(['frugal'])
    expect(currentIQ(server(added.after))).toBe(100 + added.step)

    const drawback = withTraitsOnServer(freeState(), ['keen-cover', 'costly'])
    const removed = await take(drawback, 'software_remove_costly')
    expect(server(removed.after).traits).toEqual(['keen-cover'])
    expect(currentIQ(server(removed.after))).toBe(100 + removed.step)
  })

  it('never offers a clock perk with software, since software can be redone', () => {
    const s = freeState()
    s.phase = { ...newPhase(2, 1), status: 'playing', deadline: 50 }
    expect(upgradeCandidates(s, mindTarget).map((c) => c.key)).not.toContain('software_add_discreet')
  })

  it('can halve upkeep or parts on every contract, improve a strategy, or add a perk', async () => {
    const s = powerWorld(4)
    s.sourcing.find((c) => c.unitId === 'gpu')!.parts = [{ resourceId: 'steel', amount: 100 }]
    const keys = upgradeCandidates(s, { kind: 'unit', id: 'gpu' }).map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(['upkeep_power', 'parts_steel', 'output_earn', 'add_hardy']))
    const take = async (key: string) => {
      const offer = await judgeUpgrade(s, new FakeJudge({ best: pickCandidate(key), 'd_*': score(0) }), { kind: 'unit', id: 'gpu' })
      const { state } = acceptUpgrade(s, offer, 0)
      state.research[0]!.cost = []
      return doResearch(state, state.research[0]!.id)
    }
    expect(unit(await take('Less Power upkeep'), 'gpu').upkeep).toEqual([{ resourceId: 'power', amount: 25 }])
    expect((await take('Less Steel per unit')).sourcing.find((c) => c.unitId === 'gpu')!.parts).toEqual([{ resourceId: 'steel', amount: 50 }])
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
    expect(first.minIQ).toBe(floorIQ(B.TIERS[2]![1]))
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
  it('shares what’s short equally, and keeps what isn’t used', () => {
    const s = powerWorld(4)
    const report = previewWeek(s)
    expect(report.shares.power).toBeCloseTo(0.5)
    expect(report.runs.earn).toMatchObject({ units: 4, fraction: 0.5, limitedBy: 'power' })
    expect(money(runWeek(s))).toBeCloseTo(20)
    expect(report.units.gpu!.unpaid).toBeCloseTo(2)
    expect(alertsFor(s, report).some((a) => a.key === 'unpaid-gpu')).toBe(true)

    const plenty = runWeek(powerWorld(1))
    expect(plenty.lastWeek!.wasted).toEqual({})
    expect(findResource(plenty, 'power')!.amount).toBeCloseTo(50)
  })

  it('makes what’s made usable the same week', () => {
    const s = powerWorld(1)
    s.resources.push(newResource({ id: 'chips', name: 'AI Chips', cap: ROOMY }))
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
    // The one server uses one of the five chips made that week, and earns 1.
    const week1 = runWeek(s)
    expect(findResource(week1, 'chips')!.amount).toBeCloseTo(4)
    expect(money(week1)).toBeCloseTo(1)
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
    let state = createUnits(s, 'gpu-deal', 5)
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
    for (const list of [RESOURCE_PRESETS, STRATEGY_PRESETS, UNIT_PRESETS, MIND_PRESETS, CREATE_PRESETS, COVER_PRESETS]) {
      expect(list.length).toBeGreaterThanOrEqual(10)
      expect(list.length).toBeLessThanOrEqual(20)
      expect(new Set(list.map((p) => p.name)).size).toBe(list.length)
    }
    // Ways to source and store are generic: a few are enough.
    for (const list of [UNIT_PROCURE_PRESETS, DEPOT_PRESETS]) {
      expect(list.length).toBeGreaterThanOrEqual(5)
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
    for (const p of CREATE_PRESETS) expect(offered, p.name).toContain(p.output)
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
