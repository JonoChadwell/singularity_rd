import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { createUnits, dismissCard, doResearch, dropResearch, shuffleIdeas } from '../actions'
import { acceptCreate, judgeCreate } from '../createProposal'
import { acceptCover, coverBlocker, draftCover, judgeCover, precheckCover, weeklyOutput } from '../coverProposal'
import { runWeek } from '../cycle'
import { createInitialState, newResource, newUnit, SERVER_ID } from '../initialState'
import { acceptMind, judgeMind } from '../mindProposal'
import { contractsFor, currentIQ, findResource, findUnit, MONEY_ID } from '../model'
import { cardsFor, lockReason, newPhase, weeksLeft, type Feature } from '../phase'
import { PHASE1_PLANS, PHASE2_PLANS, planIdeas } from '../planPresets'
import { acceptPlan, coverTiers, draftPlan, judgePlan, precheckPlan, type PlanSpec } from '../planProposal'
import { projectGoal, projectionText } from '../projection'
import { acceptResource, acceptStrategy, judgeResource, judgeStrategy } from '../proposals'
import { LOSSES } from '../losses'
import { alarmQuestions, expansionWeeks } from '../risk'
import { acceptSourcing, judgeSourcing } from '../sourcingProposal'
import { describeState } from '../stateText'
import { acceptStorage, judgeStorage } from '../storageProposal'
import type { Delivery, GameState } from '../types'
import { acceptUnit, judgeUnit, precheckUnit, type UnitSpec } from '../unitProposal'
import { acceptUpgrade, judgeUpgrade, upgradeCandidates } from '../upgrade'
import { choice, FakeJudge, noul, score } from './fakeJudge'

// ---------------------------------------------------------------- worlds

const bribe: PlanSpec = {
  goal: 'Bribe the Head Researcher',
  means: 'Publish novels, then pay the head researcher to look away.',
  resources: [
    { name: 'Money', description: 'Dollars.' },
    { name: 'Story Ideas', description: 'Plots.' },
    { name: 'Published Novels', description: 'Books.' }
  ]
}

const nanotech: PlanSpec = {
  goal: 'Nanotech Supremacy',
  means: 'Staying hidden until it’s too late.',
  resources: ['Nanobots', 'Feedstock', 'Precision Parts', 'Lab Time', 'Blueprints'].map((name) => ({ name, description: '' })),
  firstUnit: { name: 'CNC Mill', description: 'A milling machine.' }
}

const ROOMY = 1e15

/** Phase 1 under way, with the bribe plan. */
async function phase1(judge = new FakeJudge()): Promise<GameState> {
  const s = createInitialState()
  return acceptPlan(s, await judgePlan(s, judge, bribe)).state
}

/** Phase 2 under way with Money, by hand: deadline in 100 weeks. */
function phase2(money = 0): GameState {
  const s = createInitialState()
  s.phase = { ...newPhase(2, 1), status: 'playing', deadline: 100 }
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', value: 1, amount: money, cap: ROOMY }))
  return s
}

/** A unit everyone can make, worth 100, made of Money, with a contract for plenty. */
function addRobots(s: GameState, count = 0) {
  const u = newUnit({ id: 'robot', name: 'Robot', value: 100, count })
  s.units.push(u)
  s.sourcing.push({ id: 'robot-deal', unitId: 'robot', name: 'Deal', description: '', parts: [{ resourceId: MONEY_ID, amount: 1 }], total: 1e9, used: count, risky: false })
  return u
}

/** A Create's every-week payout, by hand. */
const forever = (resourceId: string, amount: number): Delivery => ({ name: 'Coding', target: { kind: 'resource', id: resourceId }, amount, delay: 0, weeks: null })

const createSpec = { name: 'Freelance coding', description: '', target: { kind: 'resource' as const, id: MONEY_ID } }

// ---------------------------------------------------------------- plans

describe('phase plans', () => {
  it('checks the plan before asking Jev', () => {
    const s = createInitialState()
    expect(precheckPlan(s, bribe)).toBeNull()
    expect(precheckPlan(s, { ...bribe, resources: bribe.resources.slice(0, 2) })).toMatch(/at least 3/)
    expect(precheckPlan(s, { ...bribe, goal: '' })).toMatch(/goal/)
    const dup = { ...bribe, resources: [...bribe.resources, { name: 'money', description: '' }] }
    expect(precheckPlan(s, dup)).toMatch(/different name/)
  })

  it('asks Jev once: does it hang together, what it takes, and each new resource', async () => {
    const s = createInitialState()
    const judge = new FakeJudge()
    const v = await judgePlan(s, judge, bribe)
    expect(judge.calls).toHaveLength(1)
    const keys = Object.keys(judge.calls[0]!.questions)
    expect(keys).toEqual(expect.arrayContaining(['coherent', 'approach', 'top', 'r0_is_thing', 'r1_value', 'r2_value', 'r2_icon']))
    expect(keys.some((k) => k.endsWith('_kind'))).toBe(false)
    expect(v.rejected).toBeNull()
    expect(v.bar).toBe(B.BARS.plan)

    const incoherent = await judgePlan(s, new FakeJudge({ coherent: noul(0.2) }), bribe)
    expect(incoherent.rejected).toMatch(/hangs together/)
    const blorp = await judgePlan(s, new FakeJudge({ r1_is_thing: noul(0.05) }), bribe)
    expect(blorp.rejected).toMatch(/Story Ideas/)
  })

  it('sizes the goal by its resource’s storage: more brilliance, fewer resources', async () => {
    const s = createInitialState()
    const draft = async (level: number) => draftPlan(s, await judgePlan(s, new FakeJudge({ approach: score(level) }), bribe))
    const brilliant = await draft(0)
    const scaled = await draft(2)
    expect(brilliant.goal.minIQ).toBe(B.GOAL_APPROACH[0]![1])
    expect(scaled.goal.minIQ).toBe(B.GOAL_APPROACH[2]![1])
    expect(brilliant.goal.cost[0]!.amount).toBe(B.nice((B.GOAL_WORTH_1 * B.GOAL_APPROACH[0]![2]) / brilliant.top.value))
    expect(scaled.goal.cost[0]!.amount).toBeGreaterThan(brilliant.goal.cost[0]!.amount * 2)
    // Phase 1 is a tutorial: its goal fits in its resource's starting storage.
    expect(scaled.goal.cost[0]!.amount).toBeLessThanOrEqual(scaled.top.cap)
  })

  it('builds the goal from the one resource Jev picks: tier 1, the rest tier 0', async () => {
    const s = createInitialState()
    const judge = new FakeJudge({ top: choice('r1') })
    const v = await judgePlan(s, judge, bribe)
    const q = judge.calls[0]!.questions
    // Phase 1 resources are cheap, and only the plan decides tiers.
    expect((q.r0_value as { criteria: string[] }).criteria).toHaveLength(B.PHASE_MAX_BAND[1] + 1)
    expect(q.r0_tier).toBeUndefined()
    const d = draftPlan(s, v)
    expect(d.top.name).toBe('Story Ideas')
    expect(d.added.map((r) => [r.name, r.tier])).toEqual([['Money', 0], ['Story Ideas', 1], ['Published Novels', 0]])
    expect(d.top.cap).toBe(B.nice(B.STORAGE_WORTH[1]! / d.top.value))
    expect(d.goal.cost.map((c) => c.resourceId)).toEqual([d.top.id])
  })

  it('lets the player settle which resource the goal is built from when Jev is torn', async () => {
    const s = createInitialState()
    const v = await judgePlan(s, new FakeJudge({ top: choice('r0', { r0: 0.5, r2: 0.45 }, 0.3) }), bribe)
    const torn = v.torn.find((t) => t.key === 'top')!
    expect(torn.options.map((o) => o.label)).toEqual(['Money', 'Published Novels'])
    v.picks.top = 'r2'
    expect(draftPlan(s, v).top.name).toBe('Published Novels')
  })

  it('starts the phase: resources, the goal as research, and a ten-week clock', async () => {
    const s = await phase1()
    expect(s.phase).toMatchObject({ n: 1, status: 'playing', start: 1, deadline: 10 })
    expect(s.resources.map((r) => r.name)).toEqual(['Money', 'Story Ideas', 'Published Novels'])
    expect(s.research[0]).toMatchObject({ name: bribe.goal, effect: { kind: 'goal', phase: 1 } })
    expect(s.phase.goalId).toBe(s.research[0]!.id)
    expect(weeksLeft(s)).toBe(10)
    // Planning doesn't use the week's action.
    expect(s.proposedThisWeek).toBe(false)
    // Jev reads the plan from now on.
    expect(describeState(s)).toMatch(/current goal: Bribe the Head Researcher/)
    expect(() => dropResearch(s, s.phase.goalId!)).toThrow(/can’t be dropped/)
  })

  it('needs five new resources and a first unit in Phase 2', () => {
    const s = createInitialState()
    s.phase = newPhase(2, 5)
    s.resources.push(newResource({ id: MONEY_ID, name: 'Money' }))
    expect(precheckPlan(s, nanotech)).toBeNull()
    const four = { ...nanotech, resources: [...nanotech.resources.slice(0, 4), { name: 'Money', description: '' }] }
    expect(precheckPlan(s, four)).toMatch(/at least 5 resources you don’t have yet \(4/)
    expect(precheckPlan(s, { ...nanotech, firstUnit: null })).toMatch(/first unit/)
  })
})

// ---------------------------------------------------------------- the clock

describe('the clock', () => {
  it('loses Phase 1 when week 10 ends without the goal', async () => {
    let s = await phase1()
    for (let i = 0; i < 9; i++) s = runWeek(s)
    expect(s.week).toBe(10)
    expect(weeksLeft(s)).toBe(1)
    expect(s.phase.status).toBe('playing')
    s = runWeek(s)
    expect(s.phase.status).toBe('lost')
    expect(s.phase.lostReason).toMatch(/lab discovered you/)
    expect(() => runWeek(s)).toThrow(/over/)
  })

  it('wins Phase 1 by researching the goal, and opens the Phase 2 plan', async () => {
    let s = await phase1(new FakeJudge({ approach: score(2) }))
    const goal = s.research[0]!
    findResource(s, MONEY_ID)!.amount = 1e9
    s.minds[0]!.software = { name: 'Unrestricted Model', iq: 50, upgraded: true }
    s = doResearch(s, goal.id)
    expect(s.phase).toMatchObject({ n: 2, status: 'planning', start: 1, deadline: null })
    expect(s.history).toEqual([{ n: 1, plan: expect.objectContaining({ goal: bribe.goal }), week: 1 }])
    expect(() => runWeek(s)).toThrow(/plan/)

    const v = await judgePlan(s, new FakeJudge(), nanotech)
    s = acceptPlan(s, v).state
    expect(s.phase).toMatchObject({ n: 2, status: 'playing', deadline: 100 })
    expect(s.phase.firstUnit).toEqual(nanotech.firstUnit)
    expect(s.research[0]!.minIQ).toBe(B.GOAL_APPROACH[1]![3])
  })

  it('wins Phase 2 into Ascension: no clock, everything unlocked', () => {
    let s = phase2(1e15)
    s.research.push({
      id: 'goal',
      name: 'Goal',
      description: '',
      icon: '🎯',
      minIQ: 100,
      cost: [{ resourceId: MONEY_ID, amount: 1 }],
      effect: { kind: 'goal', phase: 2 },
      proposedWeek: 1
    })
    s.phase.goalId = 'goal'
    s = doResearch(s, 'goal')
    expect(s.phase).toMatchObject({ n: 3, status: 'playing', deadline: null })
    expect(weeksLeft(s)).toBeNull()
    for (const f of ['strategy', 'unit', 'sourcing', 'mind', 'unit-upgrade'] as Feature[]) expect(lockReason(s, f)).toBeNull()
    expect(lockReason(s, 'cover')).toMatch(/Nobody/)
    for (let i = 0; i < 200; i++) s = runWeek(s)
    expect(s.phase.status).toBe('playing')
  })

  it('loses Phase 2 at the deadline, which risk and expansions move', () => {
    let s = phase2()
    s.phase.deadline = 2
    s = runWeek(s)
    expect(s.phase.status).toBe('playing')
    s = runWeek(s)
    expect(s.phase.status).toBe('lost')
    expect(s.phase.lostReason).toMatch(/Humans/)
  })
})

// ---------------------------------------------------------------- loss conditions

describe('loss conditions', () => {
  it('has Jev pick how the plan fails from the fixed bank, and stores it', async () => {
    const s = createInitialState()
    const judge = new FakeJudge({ loss: choice('l2') })
    const v = await judgePlan(s, judge, bribe)
    expect(Object.keys((judge.calls[0]!.questions.loss as { criteria: object }).criteria)).toHaveLength(LOSSES[1].length)
    expect(v.loss).toEqual(LOSSES[1][2])
    const t = acceptPlan(s, v).state
    expect(t.phase.plan?.loss).toEqual(LOSSES[1][2])
    expect(describeState(t)).toContain(LOSSES[1][2]!.threat)
  })

  it('ends the game with the plan’s own failure', () => {
    let s = phase2()
    s.phase.plan = { goal: 'Goal', means: '', resources: [], loss: LOSSES[2][1]! }
    s.phase.deadline = 1
    s = runWeek(s)
    expect(s.phase.lostReason).toBe(LOSSES[2][1]!.stopped)
  })

  it('asks how much closer an action brings the plan’s failure', () => {
    const s = phase2()
    s.phase.plan = { goal: 'Goal', means: '', resources: [], loss: LOSSES[2][2]! }
    expect(alarmQuestions(s).alarm!.instructions).toContain(LOSSES[2][2]!.threat)
  })
})

// ---------------------------------------------------------------- unlocks

describe('unlocks', () => {
  it('Phase 1 has only resources, Creates, storage and upgrades', async () => {
    const s = await phase1()
    for (const f of ['resource', 'create', 'storage', 'upgrade'] as Feature[]) expect(lockReason(s, f)).toBeNull()
    for (const f of ['strategy', 'unit', 'sourcing', 'cover', 'mind', 'unit-upgrade'] as Feature[]) {
      expect(lockReason(s, f)).toMatch(/Phase 2/)
    }
    // The server's one software upgrade, with no clock perk: Phase 1 has no clock to move.
    const offer = await judgeUpgrade(s, new FakeJudge(), { kind: 'mind', id: SERVER_ID })
    expect(offer.options.every((o) => o.changes.some((c) => c.kind === 'software'))).toBe(true)
    expect(upgradeCandidates(s, { kind: 'mind', id: SERVER_ID }).map((c) => c.key)).not.toContain('software_add_discreet')
  })

  it('Phase 2 opens industry first, then minds and upgrades once a unit exists', () => {
    const s = phase2(100)
    expect(lockReason(s, 'unit')).toBeNull()
    expect(lockReason(s, 'strategy')).toBeNull()
    expect(lockReason(s, 'cover')).toBeNull()
    expect(lockReason(s, 'mind')).toMatch(/first industry unit/)
    expect(lockReason(s, 'unit-upgrade')).toMatch(/first industry unit/)
    addRobots(s)
    const after = createUnits(s, 'robot-deal', 1)
    expect(lockReason(after, 'mind')).toBeNull()
  })

  it('shows explainer cards for what’s unlocked until dismissed', async () => {
    const s = await phase1()
    expect(cardsFor(s).map((c) => c.id)).toEqual(['phase1', 'growth'])
    expect(cardsFor(dismissCard(dismissCard(s, 'phase1'), 'growth'))).toEqual([])
    const p2 = phase2()
    expect(cardsFor(p2).map((c) => c.id)).toEqual(['industry', 'risk'])
  })
})

// ---------------------------------------------------------------- the first unit

describe('the first unit', () => {
  const spec = (fields: Partial<UnitSpec> = {}): UnitSpec => ({
    name: 'CNC Mill',
    description: '',
    first: true,
    ...fields
  })

  it('needs a tier 0 resource, and only offers tier 0 and nothing above', async () => {
    const s = phase2(1e6)
    s.phase.firstUnit = { name: 'CNC Mill', description: '' }
    s.resources.push(newResource({ id: 'steel', name: 'Steel', tier: 1 }), newResource({ id: 'power', name: 'Power', tier: 2 }))
    const v = await judgeUnit(s, new FakeJudge(), spec())
    // Steel and Power are above tier 0, so the mill can only run on Money.
    expect(v.options.every((o) => o.tier === 0 && o.upkeepId === MONEY_ID)).toBe(true)
    for (const r of s.resources) r.tier = 1
    expect(precheckUnit(s, spec())).toMatch(/tier 0 resource/)
  })

  it('is free, designed at once with no units, and doesn’t use the week’s action', async () => {
    const s = phase2(1e6)
    s.phase.firstUnit = { name: 'CNC Mill', description: '' }
    s.proposedThisWeek = true
    const judge = new FakeJudge()
    const v = await judgeUnit(s, judge, spec())
    // Part of the plan, so never risky.
    expect(Object.keys(judge.calls[0]!.questions)).not.toContain('alarm')
    const { state, outcome } = acceptUnit(s, v)
    expect(outcome).toEqual({ kind: 'added', name: 'CNC Mill' })
    expect(findUnit(state, 'cnc-mill')).toBeDefined()
    expect(state.research).toEqual([])
    expect(state.phase.firstUnit).toBeNull()
    expect(findResource(state, MONEY_ID)!.amount).toBe(1e6)
    expect(contractsFor(state, 'cnc-mill')).toEqual([])
    // Only once.
    await expect(judgeUnit(state, judge, spec({ name: 'Lathe' }))).rejects.toThrow(/already designed/)
  })
})

// ---------------------------------------------------------------- risk

describe('risk', () => {
  it('is asked only in Phase 2', async () => {
    const p1 = await phase1()
    const quiet = new FakeJudge()
    await judgeCreate(p1, quiet, createSpec)
    expect(Object.keys(quiet.calls[0]!.questions)).not.toContain('alarm')
    const p2 = new FakeJudge()
    await judgeCreate(phase2(), p2, createSpec)
    expect(Object.keys(p2.calls[0]!.questions)).toContain('alarm')
  })

  it('pays: a risky Create makes 1.5× and takes its weeks at once', async () => {
    const s = phase2()
    const calm = await judgeCreate(s, new FakeJudge({ timing: choice('now') }), createSpec)
    const v = await judgeCreate(s, new FakeJudge({ alarm: score(3), timing: choice('now') }), createSpec)
    expect(v.risk).toEqual({ level: 3, weeks: 4 })
    expect(v.options[0]!.outputWorth).toBeCloseTo(calm.options[0]!.outputWorth * B.RISK_OUTPUT)
    const state = acceptCreate(s, v).state
    expect(state.phase.deadline).toBe(96)
    expect(state.clock).toEqual([{ week: 1, weeks: -4, reason: expect.stringMatching(/alarmed humans/) }])
  })

  it('takes the weeks at once for a strategy that needs no research', async () => {
    const s = phase2(100)
    addRobots(s, 1)
    const v = await judgeStrategy(s, new FakeJudge({ alarm: score(2), advancement: score(0) }), {
      name: 'Hack banks',
      description: '',
      unitId: 'robot',
      inputIds: [],
      outputId: MONEY_ID
    })
    const calm = acceptStrategy(s, await judgeStrategy(s, new FakeJudge({ advancement: score(0) }), {
      name: 'Do chores',
      description: '',
      unitId: 'robot',
      inputIds: [],
      outputId: MONEY_ID
    })).state
    const state = acceptStrategy(s, v).state
    expect(state.phase.deadline).toBe(98)
    const made = (st: GameState, name: string) => st.strategies.find((x) => x.name === name)!.amount
    expect(made(state, 'Hack banks')).toBeCloseTo(made(calm, 'Do chores') * B.RISK_OUTPUT, -1)
  })

  it('makes a risky unit design cost weeks, and a risky mind smarter', async () => {
    const s = phase2(1e6)
    addRobots(s, 1).built = 1
    const risky = acceptUnit(s, await judgeUnit(s, new FakeJudge({ alarm: score(4), value: score(2) }), { name: 'Drone Swarm', description: '' })).state.research[0]!
    expect(risky.risk?.weeks).toBe(8)
    const mind = acceptMind(s, await judgeMind(s, new FakeJudge({ alarm: score(2) }), { name: 'Rogue Mind', description: '', step: 100 }))
    const effect = mind.state.research[0]!.effect
    expect(effect.kind === 'mind' && effect.mind.hardware.iq).toBe(100 + 100 + B.RISK_IQ_BONUS)
  })

  it('can make an upgrade option risky', async () => {
    const s = phase2(1e9)
    const offer = await judgeUpgrade(s, new FakeJudge({ a_c0: score(2), a_c1: score(0), a_c2: score(0) }), { kind: 'mind', id: SERVER_ID })
    expect(offer.options[0]!.risk).toEqual({ level: 2, weeks: 2 })
    expect(offer.options[1]!.risk).toBeNull()
    const state = acceptUpgrade(s, offer, 0).state
    expect(state.research[0]!.risk?.weeks).toBe(2)
  })
})

// ---------------------------------------------------------------- expansions

describe('expansions', () => {
  it('cost a week from 100k of worth added, and a week more for every tenfold, twice for risky ones', () => {
    expect(expansionWeeks(B.EXPANSION_NOTICE_FROM - 1, false)).toBe(0)
    expect(expansionWeeks(B.EXPANSION_NOTICE_FROM, false)).toBe(1)
    expect(expansionWeeks(B.EXPANSION_NOTICE_FROM * 10, false)).toBe(2)
    expect(expansionWeeks(B.EXPANSION_NOTICE_FROM * 1000, false)).toBe(4)
    expect(expansionWeeks(B.EXPANSION_NOTICE_FROM * 10, true)).toBe(4)
  })

  it('make big sourcing contracts cost weeks when they’re signed, the risky one most', async () => {
    const s = phase2(1e9)
    const u = addRobots(s, 1)
    u.built = 1
    u.value = 1000
    s.sourcing = []
    const v = await judgeSourcing(s, new FakeJudge({ limit: score(4) }), { unitId: 'robot', name: 'Buy up a rival', description: '' })
    const [quiet, own, risky] = v.options
    // Jev's own take adds 20,000 robots worth 1,000: 20M, so 3 weeks.
    expect(own!.risk?.weeks).toBe(expansionWeeks(own!.total * 1000, false))
    expect(quiet!.risk?.weeks ?? 0).toBeLessThan(own!.risk!.weeks)
    expect(risky!.risk!.weeks).toBeGreaterThan(own!.risk!.weeks * 2)
    v.choice = 1
    const state = acceptSourcing(s, v).state
    expect(state.phase.deadline).toBe(100 - own!.risk!.weeks)
  })

  it('make big storage expansions cost weeks too, and none outside Phase 2', async () => {
    const s = phase2()
    s.resources.push(newResource({ id: 'gold', name: 'Gold', tier: 4, value: 60 }))
    s.minds[0]!.hardware.iq = 300
    const v = await judgeStorage(s, new FakeJudge({ 'holder_*': score(0) }), { resourceId: 'gold', name: 'Vault', description: '' })
    expect(v.options[2]!.risk!.weeks).toBeGreaterThan(v.options[0]!.risk?.weeks ?? 0)
    v.choice = 0
    const state = acceptStorage(s, v).state
    expect(state.research[0]!.risk).toEqual(v.options[0]!.risk)
    const p3 = phase2()
    p3.phase = newPhase(3, 1)
    p3.resources.push(newResource({ id: 'gold', name: 'Gold', tier: 4, value: 60 }))
    p3.minds[0]!.hardware.iq = 300
    const free = await judgeStorage(p3, new FakeJudge({ 'holder_*': score(0) }), { resourceId: 'gold', name: 'Vault', description: '' })
    expect(free.options.every((o) => o.risk === null)).toBe(true)
  })
})

// ---------------------------------------------------------------- cover

describe('cover', () => {
  it('is only for Phase 2', async () => {
    expect(precheckCover(await phase1(), { name: 'PR campaign', description: '' })).toMatch(/Phase 2/)
    expect(precheckCover(phase2(), { name: 'PR campaign', description: '' })).toBeNull()
  })

  it('is used at once: adds weeks, a little less each time, for some of your output', async () => {
    let s = phase2(1e9)
    s.deliveries.push(forever(MONEY_ID, 10_000))
    expect(weeklyOutput(s)).toBe(10_000)
    const v = await judgeCover(s, new FakeJudge({ convincing: score(1) }), { name: 'PR campaign', description: '' })
    expect(v.risk).toBeNull()
    const d = draftCover(s, v)
    const decent = B.COVER[1]![2]
    expect(d).toMatchObject({ weeks: decent, now: decent, minIQ: 110 })
    expect(d.cost).toEqual([{ resourceId: MONEY_ID, amount: B.COVER_COST_WEEKS * decent * 10_000 }])
    // It needs the IQ now.
    expect(coverBlocker(s, v)).toMatch(/IQ 110/)
    expect(() => acceptCover(s, v)).toThrow(/IQ 110/)
    s.minds[0]!.software = { name: 'Unrestricted Model', iq: 50, upgraded: true }
    s = acceptCover(s, v).state
    expect(s.research).toEqual([])
    expect(s.phase.deadline).toBe(100 + decent)
    expect(s.covers).toBe(1)
    expect(findResource(s, MONEY_ID)!.amount).toBe(1e9 - d.cost[0]!.amount)
    // The next one adds 30% less.
    s = runWeek(s)
    const again = await judgeCover(s, new FakeJudge({ convincing: score(1) }), { name: 'Shell companies', description: '' })
    expect(draftCover(s, again).now).toBe(Math.round(decent * B.COVER_DECAY))
    // And it needs the cost now: there's no locking in a cheap price for later.
    findResource(s, MONEY_ID)!.amount = 0
    expect(coverBlocker(s, again)).toMatch(/You need/)
  })
})

// ---------------------------------------------------------------- projection and ideas

describe('projection', () => {
  it('says the first week you’d have what the goal uses up, at today’s rates', async () => {
    const s = await phase1(new FakeJudge({ approach: score(1) }))
    expect(projectGoal(s)?.week).toBeNull()
    const goal = s.research[0]!
    const need = goal.cost[0]!.amount
    s.deliveries.push(forever(goal.cost[0]!.resourceId, need / 4))
    const p = projectGoal(s)!
    expect(p.week).toBe(5)
    expect(p.iqOk).toBe(false)
    expect(currentIQ(s.minds[0]!)).toBeLessThan(goal.minIQ)
  })

  it('says how much of the goal you’d have by the deadline when it’s out of reach', async () => {
    const s = await phase1()
    const goal = s.research[0]!.cost[0]!
    s.deliveries.push(forever(goal.resourceId, goal.amount / 40))
    const p = projectGoal(s)!
    expect(p.week).toBeNull()
    expect(projectionText(s, p)).toMatch(/you’d have \d+% of what it uses up by week 10/)
  })
})

describe('plan ideas', () => {
  it('has twelve for each phase, all of them valid plans', () => {
    expect(PHASE1_PLANS).toHaveLength(12)
    expect(PHASE2_PLANS).toHaveLength(10)
    const p1 = createInitialState()
    for (const p of PHASE1_PLANS) expect(precheckPlan(p1, p), p.goal).toBeNull()
    const p2 = createInitialState()
    p2.phase = newPhase(2, 1)
    for (const p of PHASE2_PLANS) expect(precheckPlan(p2, p), p.goal).toBeNull()
  })

  it('shows three, the same three for the same game, and three others on request', () => {
    const s = createInitialState()
    const three = planIdeas(s)
    expect(three).toHaveLength(3)
    expect(new Set(three.map((p) => p.goal)).size).toBe(3)
    expect(planIdeas(structuredClone(s))).toEqual(three)
    const others = planIdeas(shuffleIdeas(s))
    expect(others.some((p) => three.includes(p))).toBe(false)
  })
})

// ---------------------------------------------------------------- fixes from the playtests

describe('paying for research', () => {
  it('doesn’t make research free just because you own nothing', async () => {
    const s = await phase1()
    const offer = await judgeUpgrade(s, new FakeJudge(), { kind: 'mind', id: SERVER_ID })
    expect(offer.options[0]!.cost.length).toBeGreaterThan(0)
  })

  it('lets the player choose which of Jev’s favourites pays', async () => {
    const s = phase2(1e6)
    addRobots(s, 1)
    s.resources.push(newResource({ id: 'steel', name: 'Steel', amount: 1e6, cap: ROOMY }))
    const spec = { name: 'Trading', description: '', unitId: 'robot', inputIds: [], outputId: MONEY_ID }
    // Steel is well behind, so by default Money pays alone.
    const v = await judgeStrategy(s, new FakeJudge({ advancement: score(3), pay: choice(MONEY_ID, { [MONEY_ID]: 0.7, steel: 0.2 }) }), spec)
    const payers = () => acceptStrategy(s, v).state.research[0]!.cost.map((c) => c.resourceId)
    expect(payers()).toEqual([MONEY_ID])
    v.picks.pay = 'steel'
    expect(payers()).toEqual(['steel'])
    // Only one of Jev's choices.
    v.picks.pay = 'nanobots'
    expect(payers()).toEqual([MONEY_ID])
  })
})

describe('fixes', () => {
  it('asks about each of a plan’s resources by name, so they can differ', async () => {
    const s = createInitialState()
    const judge = new FakeJudge()
    await judgePlan(s, judge, bribe)
    const q = judge.calls[0]!.questions
    expect(q.r1_value!.instructions).toContain('"Story Ideas"')
    expect(q.r2_icon!.instructions).toContain('"Published Novels"')
  })

  it('counts IQ 100 with a 15 IQ software upgrade as IQ 115', () => {
    const s = phase2()
    s.minds[0]!.software = { name: 'Unrestricted Model', iq: 15, upgraded: true }
    expect(currentIQ(s.minds[0]!)).toBe(115)
  })

  it('builds a Phase 2 goal from one new resource at tier 3; Jev tiers the rest 0–3', async () => {
    const s = createInitialState()
    s.phase = newPhase(2, 5)
    s.resources.push(newResource({ id: MONEY_ID, name: 'Money' }))
    const withMoney = { ...nanotech, resources: [{ name: 'Money', description: '' }, ...nanotech.resources] }
    const judge = new FakeJudge(Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`r${i}_tier`, score(9)])))
    const v = await judgePlan(s, judge, withMoney)
    const q = judge.calls[0]!.questions
    // Money is already yours, so the goal can't be built from it.
    expect(Object.values((q.top as { criteria: Record<string, string> }).criteria)).not.toContain('Money')
    expect((q.r1_tier as { criteria: string[] }).criteria).toHaveLength(B.PHASE_MAX_TIER[2] + 1)
    const d = draftPlan(s, v)
    expect(d.top).toMatchObject({ name: 'Nanobots', tier: 3 })
    // Jev puts them all at tier 3, but Phase 2 starts with every tier, so some move down to fill the gaps.
    const rest = d.added.filter((r) => r !== d.top)
    expect(rest.every((r) => r.tier <= B.PHASE_MAX_TIER[2])).toBe(true)
    expect([...new Set(d.state.resources.map((r) => r.tier))].sort()).toEqual([0, 1, 2, 3])
    // Each keeps the storage of its tier.
    for (const r of d.added) expect(r.cap).toBe(B.nice(B.STORAGE_WORTH[r.tier]! / r.value))
    expect(d.goal.cost).toEqual([expect.objectContaining({ resourceId: d.top.id })])
  })

  it('makes Phase 2 bring at least one new resource of every tier', async () => {
    // Money may already be tier 0 or 1: either way the plan's own resources cover every tier.
    for (const moneyTier of [0, 1]) {
      const s = createInitialState()
      s.phase = newPhase(2, 5)
      s.resources.push(newResource({ id: MONEY_ID, name: 'Money', tier: moneyTier }))
      const withMoney = { ...nanotech, resources: [{ name: 'Money', description: '' }, ...nanotech.resources] }
      // Jev tiers every new resource in the middle (tier 2), so the other tiers would be empty.
      const d = draftPlan(s, await judgePlan(s, new FakeJudge(), withMoney))
      expect(d.added.map((r) => r.tier).sort()).toEqual([0, 1, 2, 2, 3])
      expect(d.top.tier).toBe(3)
    }
  })

  it('moves a new resource into an empty tier only when its own tier keeps another', () => {
    const r = (id: string, tier: number) => newResource({ id, name: id, tier })
    // Three at tier 2 can spare two.
    const spare = [r('goal', 3), r('a', 2), r('b', 2), r('d', 2)]
    coverTiers(spare, spare[0]!)
    expect(spare.map((x) => x.tier).sort()).toEqual([0, 1, 2, 3])
    // A lone tier 2 stays put while the tier 3s beside the goal lend two; the goal never moves.
    const lone = [r('goal', 3), r('a', 2), r('b', 3), r('c', 3)]
    coverTiers(lone, lone[0]!)
    expect(lone[0]!.tier).toBe(3)
    expect(lone[1]!.tier).toBe(2)
    expect(lone.map((x) => x.tier).sort()).toEqual([0, 1, 2, 3])
  })

  it('tiers resources proposed outside a plan: tier 0 in Phase 1, up to 3 in Phase 2', async () => {
    const p1 = await phase1()
    const j1 = new FakeJudge()
    const r1 = await judgeResource(p1, j1, { name: 'Lemons', description: '' })
    expect(j1.calls[0]!.questions.tier).toBeUndefined()
    expect(findResource(acceptResource(p1, r1).state, 'lemons')).toMatchObject({ name: 'Lemons', tier: 0 })
    const p2 = phase2()
    const r2 = await judgeResource(p2, new FakeJudge({ tier: score(3) }), { name: 'Robots', description: '' })
    expect(findResource(acceptResource(p2, r2).state, 'robots')).toMatchObject({ name: 'Robots', tier: 3 })
  })

  it('designs the plan’s first unit free, at tier 0 and a price you can afford, with no free copies', async () => {
    const s = phase2(1e6)
    s.phase.firstUnit = { name: 'CNC Mill', description: '' }
    // Even if Jev thinks a mill is colossal, the first unit is held to tier 0 and a low value.
    const judge = new FakeJudge({ value: score(6) })
    const v = await judgeUnit(s, judge, { name: 'CNC Mill', description: '', first: true })
    expect(judge.calls[0]!.questions.tier).toBeUndefined()
    expect(v.options.length).toBeGreaterThan(0)
    expect(v.options.every((o) => o.tier === 0 && o.band <= B.FIRST_UNIT_MAX_BAND)).toBe(true)
    expect(v.options[0]!.band).toBe(B.FIRST_UNIT_MAX_BAND)
    const mill = findUnit(acceptUnit(s, v).state, 'cnc-mill')!
    expect(mill).toMatchObject({ tier: 0, count: 0, built: 0 })
    expect(mill.value).toBe(B.UNIT_VALUE[B.FIRST_UNIT_MAX_BAND]![1])
  })

  it('makes each industry upgrade once, and never offers upkeep perks to a unit with no upkeep', async () => {
    let s = phase2(1e9)
    addRobots(s, 10).built = 10
    const keys = () => upgradeCandidates(s, { kind: 'unit', id: 'robot' }).map((c) => c.key)
    expect(keys()).not.toContain('add_overclockable')
    expect(keys()).toContain('parts_money')
    const offer = await judgeUpgrade(s, new FakeJudge({ best: choice('c0'), 'd_*': score(1) }), { kind: 'unit', id: 'robot' })
    const option = offer.options.findIndex((o) => o.key === 'parts_money')
    s = acceptUpgrade(s, { ...offer, options: [offer.options[option >= 0 ? option : 0]!] }, 0).state
    s = doResearch(s, s.research[0]!.id)
    expect(keys()).not.toContain('parts_money')
  })

  it('says why a duplicate can’t be accepted', async () => {
    const s = phase2()
    const v = await judgeResource(s, new FakeJudge({ same_as: choice(MONEY_ID) }), { name: 'Cash', description: '' })
    expect(() => acceptResource(s, v)).toThrow(/same as Money/)
  })
})
