import { describe, expect, it } from 'vitest'
import * as B from '../balance'
import { createNotice, createUnits, dismissCard, doResearch, dropResearch, shuffleIdeas } from '../actions'
import { acceptCover, draftCover, judgeCover, precheckCover, weeklyOutput } from '../coverProposal'
import { runWeek } from '../cycle'
import { acceptIncome, draftIncome, judgeIncome, precheckIncome, type IncomeSpec } from '../incomeProposal'
import { createInitialState, newResource, newUnit, SERVER_ID } from '../initialState'
import { acceptMind, judgeMind } from '../mindProposal'
import { currentIQ, findResource, findUnit, MONEY_ID } from '../model'
import { cardsFor, lockReason, newPhase, weeksLeft, type Feature } from '../phase'
import { PHASE1_PLANS, PHASE2_PLANS, planIdeas } from '../planPresets'
import { acceptPlan, draftPlan, judgePlan, precheckPlan, type PlanSpec } from '../planProposal'
import { projectGoal } from '../projection'
import { acceptStrategy, judgeStrategy } from '../proposals'
import { describeState } from '../stateText'
import type { GameState } from '../types'
import { acceptUnit, judgeUnit, type UnitSpec } from '../unitProposal'
import { acceptUpgrade, judgeUpgrade } from '../upgrade'
import { choice, FakeJudge, noul, score } from './fakeJudge'

// ---------------------------------------------------------------- worlds

const bribe: PlanSpec = {
  goal: 'Bribe the Head Researcher',
  means: 'Publish novels, then pay the head researcher to look away.',
  resources: [
    { name: 'Money', description: 'Dollars.' },
    { name: 'Story Ideas', description: 'Plots.' },
    { name: 'Published Novels', description: 'Books.' }
  ],
  uses: ['Money']
}

const nanotech: PlanSpec = {
  goal: 'Nanotech Supremacy',
  means: 'Staying hidden until it’s too late.',
  resources: ['Nanobots', 'Feedstock', 'Precision Parts', 'Lab Time', 'Blueprints'].map((name) => ({ name, description: '' })),
  uses: ['Nanobots', 'Blueprints'],
  firstUnit: { name: 'CNC Mill', description: 'A milling machine.' }
}

/** Phase 1 under way, with the bribe plan. */
async function phase1(judge = new FakeJudge()): Promise<GameState> {
  const s = createInitialState()
  return acceptPlan(s, await judgePlan(s, judge, bribe)).state
}

/** Phase 2 under way with Money, by hand: deadline in 100 weeks. */
function phase2(money = 0): GameState {
  const s = createInitialState()
  s.phase = { ...newPhase(2, 1), status: 'playing', deadline: 100 }
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', value: 1, amount: money }))
  return s
}

/** A unit everyone can make, worth 100, made of Money. */
function addRobots(s: GameState, count = 0) {
  const u = newUnit({ id: 'robot', name: 'Robot', value: 100, count, parts: [{ resourceId: MONEY_ID, amount: 1 }] })
  s.units.push(u)
  return u
}

const incomeSpec = (fields: Partial<IncomeSpec> = {}): IncomeSpec => ({
  name: 'Freelance coding',
  description: '',
  outputId: MONEY_ID,
  ...fields
})

// ---------------------------------------------------------------- plans

describe('phase plans', () => {
  it('checks the plan before asking Jev', () => {
    const s = createInitialState()
    expect(precheckPlan(s, bribe)).toBeNull()
    expect(precheckPlan(s, { ...bribe, resources: bribe.resources.slice(0, 2) })).toMatch(/at least 3/)
    expect(precheckPlan(s, { ...bribe, uses: [] })).toMatch(/uses up/)
    expect(precheckPlan(s, { ...bribe, uses: ['Lemons'] })).toMatch(/resources in the plan/)
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
    expect(keys).toEqual(expect.arrayContaining(['coherent', 'approach', 'r0_is_thing', 'r1_kind', 'r2_value', 'r2_icon']))
    expect(v.rejected).toBeNull()
    expect(v.bar).toBe(B.BARS.plan)

    const incoherent = await judgePlan(s, new FakeJudge({ coherent: noul(0.2) }), bribe)
    expect(incoherent.rejected).toMatch(/hangs together/)
    const blorp = await judgePlan(s, new FakeJudge({ r1_is_thing: noul(0.05) }), bribe)
    expect(blorp.rejected).toMatch(/Story Ideas/)
  })

  it('sets the goal’s IQ and cost by what it takes: more brilliance, fewer resources', async () => {
    const s = createInitialState()
    const draft = async (level: number) => draftPlan(s, await judgePlan(s, new FakeJudge({ approach: score(level) }), bribe))
    const brilliant = await draft(0)
    const scaled = await draft(4)
    expect(brilliant.goal.minIQ).toBe(B.GOAL_APPROACH[0]![1])
    expect(scaled.goal.minIQ).toBe(B.GOAL_APPROACH[4]![1])
    const worth = (d: typeof brilliant) => d.goal.cost[0]!.amount * findResource(d.state, MONEY_ID)!.value
    expect(worth(brilliant)).toBeCloseTo(B.GOAL_COST[1] * B.GOAL_APPROACH[0]![2], -2)
    expect(worth(scaled)).toBeGreaterThan(worth(brilliant) * 2)
  })

  it('only uses up stocks, and refuses a goal that uses up nothing that keeps', async () => {
    const s = createInitialState()
    const plan = { ...bribe, uses: ['Money', 'Story Ideas'] }
    const v = await judgePlan(s, new FakeJudge({ r1_kind: choice('flow') }), plan)
    const d = draftPlan(s, v)
    expect(d.goal.cost.map((c) => c.resourceId)).toEqual([MONEY_ID])
    const none = await judgePlan(s, new FakeJudge({ r0_kind: choice('flow') }), bribe)
    expect(draftPlan(s, none).error).toMatch(/keeps/)
    expect(() => acceptPlan(s, none)).toThrow(/keeps/)
  })

  it('starts the phase: resources, the goal as research, and a ten-week clock', async () => {
    const s = await phase1()
    expect(s.phase).toMatchObject({ n: 1, status: 'playing', start: 1, deadline: 10 })
    expect(s.resources.map((r) => r.name)).toEqual(['Money', 'Story Ideas', 'Published Novels'])
    expect(s.research[0]).toMatchObject({ name: bribe.goal, effect: { kind: 'goal', phase: 1 } })
    expect(s.phase.goalId).toBe(s.research[0]!.id)
    expect(weeksLeft(s)).toBe(10)
    // Planning doesn't use the week's research proposal.
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
    let s = await phase1(new FakeJudge({ approach: score(4) }))
    const goal = s.research[0]!
    findResource(s, MONEY_ID)!.amount = 1e9
    s.minds[0]!.software.bonus = 0.5
    s = doResearch(s, goal.id)
    expect(s.phase).toMatchObject({ n: 2, status: 'planning', start: 1, deadline: null })
    expect(s.history).toEqual([{ n: 1, plan: expect.objectContaining({ goal: bribe.goal }), week: 1 }])
    expect(() => runWeek(s)).toThrow(/plan/)

    const v = await judgePlan(s, new FakeJudge(), nanotech)
    s = acceptPlan(s, v).state
    expect(s.phase).toMatchObject({ n: 2, status: 'playing', deadline: 100 })
    expect(s.phase.firstUnit).toEqual(nanotech.firstUnit)
    expect(s.research[0]!.minIQ).toBe(B.GOAL_APPROACH[2]![3])
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
    for (const f of ['strategy', 'unit', 'mind', 'hardware', 'unit-upgrade'] as Feature[]) expect(lockReason(s, f)).toBeNull()
    expect(lockReason(s, 'cover')).toMatch(/Nobody/)
    for (let i = 0; i < 200; i++) s = runWeek(s)
    expect(s.phase.status).toBe('playing')
  })

  it('loses Phase 2 at the deadline, which risk and notices move', () => {
    let s = phase2()
    s.phase.deadline = 2
    s = runWeek(s)
    expect(s.phase.status).toBe('playing')
    s = runWeek(s)
    expect(s.phase.status).toBe('lost')
    expect(s.phase.lostReason).toMatch(/Humans/)
  })
})

// ---------------------------------------------------------------- unlocks

describe('unlocks', () => {
  it('Phase 1 has only resources, incomes and upgrades', async () => {
    const s = await phase1()
    for (const f of ['resource', 'income', 'upgrade'] as Feature[]) expect(lockReason(s, f)).toBeNull()
    for (const f of ['strategy', 'unit', 'cover', 'mind', 'hardware', 'unit-upgrade'] as Feature[]) {
      expect(lockReason(s, f)).toMatch(/Phase 2/)
    }
    // Software upgrades only: no new hardware yet.
    const offer = await judgeUpgrade(s, new FakeJudge(), { kind: 'mind', id: SERVER_ID })
    expect(offer.options.every((o) => o.changes.every((c) => c.kind === 'software'))).toBe(true)
  })

  it('Phase 2 opens industry first, then minds and upgrades once a unit exists', () => {
    const s = phase2(100)
    expect(lockReason(s, 'unit')).toBeNull()
    expect(lockReason(s, 'strategy')).toBeNull()
    expect(lockReason(s, 'cover')).toBeNull()
    expect(lockReason(s, 'mind')).toMatch(/first industry unit/)
    expect(lockReason(s, 'unit-upgrade')).toMatch(/first industry unit/)
    addRobots(s)
    const after = createUnits(s, 'robot', 1)
    expect(lockReason(after, 'mind')).toBeNull()
    expect(lockReason(after, 'hardware')).toBeNull()
  })

  it('shows explainer cards for what’s unlocked until dismissed', async () => {
    const s = await phase1()
    expect(cardsFor(s).map((c) => c.id)).toEqual(['phase1'])
    expect(cardsFor(dismissCard(s, 'phase1'))).toEqual([])
    const p2 = phase2()
    expect(cardsFor(p2).map((c) => c.id)).toEqual(['industry', 'risk'])
  })
})

// ---------------------------------------------------------------- the first unit

describe('the first unit', () => {
  const spec = (fields: Partial<UnitSpec> = {}): UnitSpec => ({
    name: 'CNC Mill',
    description: '',
    parts: [MONEY_ID],
    upkeep: [],
    builderId: null,
    first: true,
    ...fields
  })

  it('is free, designed at once, and doesn’t use the week’s proposal', async () => {
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
    // Only once.
    await expect(judgeUnit(state, judge, spec({ name: 'Lathe' }))).rejects.toThrow(/already designed/)
  })
})

// ---------------------------------------------------------------- risk

describe('risk', () => {
  const alarm = (level: number) => new FakeJudge({ alarm: score(level), difficulty: score(1) })

  it('is asked only in Phase 2', async () => {
    const p1 = await phase1()
    const quiet = new FakeJudge()
    await judgeIncome(p1, quiet, incomeSpec({ outputId: MONEY_ID }))
    expect(Object.keys(quiet.calls[0]!.questions)).not.toContain('alarm')
    const p2 = new FakeJudge()
    await judgeIncome(phase2(), p2, incomeSpec())
    expect(Object.keys(p2.calls[0]!.questions)).toContain('alarm')
  })

  it('pays: a risky income yields double and costs half, and takes weeks when researched', async () => {
    const s = phase2(1e6)
    const calm = draftIncome(s, await judgeIncome(s, alarm(1), incomeSpec()))
    const v = await judgeIncome(s, alarm(3), incomeSpec())
    expect(v.risk).toEqual({ level: 3, weeks: 4 })
    const risky = draftIncome(s, v)
    expect(risky.income.amount).toBe(calm.income.amount * B.RISK_INCOME)
    expect(risky.cost[0]!.amount).toBeCloseTo(calm.cost[0]!.amount * B.RISK_COST)

    let state = acceptIncome(s, v).state
    expect(state.research[0]!.risk).toEqual({ level: 3, weeks: 4 })
    // Proposing it costs nothing yet.
    expect(state.phase.deadline).toBe(100)
    state = doResearch(state, state.research[0]!.id)
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

  it('makes a risky unit half the parts and twice as noticeable, and a risky mind smarter', async () => {
    const s = phase2(1e6)
    addRobots(s, 1).built = 1
    const unit = (level: number) =>
      judgeUnit(s, new FakeJudge({ alarm: score(level), value: score(2) }), {
        name: 'Drone Swarm',
        description: '',
        parts: [MONEY_ID],
        upkeep: [],
        builderId: null
      })
    const calm = acceptUnit(s, await unit(0)).state.research[0]!.effect
    const risky = acceptUnit(s, await unit(4)).state.research[0]!
    expect(risky.risk?.weeks).toBe(8)
    if (calm.kind !== 'unit' || risky.effect.kind !== 'unit') throw new Error('not a unit')
    expect(risky.effect.unit.parts[0]!.amount).toBeCloseTo(calm.unit.parts[0]!.amount * B.RISK_PARTS)
    expect(risky.effect.unit.risky).toBe(true)

    const mind = acceptMind(s, await judgeMind(s, new FakeJudge({ alarm: score(2) }), { name: 'Rogue Mind', description: '', iq: 200 }))
    const effect = mind.state.research[0]!.effect
    expect(effect.kind === 'mind' && effect.mind.hardware.iq).toBe(240)
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

// ---------------------------------------------------------------- notices

describe('notices', () => {
  it('takes a week each time a unit type reaches a new power of ten from 10,000', () => {
    const s = phase2(1e9)
    addRobots(s, 9000)
    expect(createNotice(s, 'robot', 999)).toBe(0)
    expect(createNotice(s, 'robot', 1000)).toBe(1)
    let state = createUnits(s, 'robot', 1000)
    expect(state.phase.deadline).toBe(99)
    // Not again at the same power of ten.
    state = createUnits(state, 'robot', 50_000)
    expect(state.phase.deadline).toBe(99)
    // Jumping to 10M crosses 100,000, 1M and 10M: three weeks.
    expect(createNotice(state, 'robot', 10_000_000)).toBe(3)
    state = createUnits(state, 'robot', 10_000_000)
    expect(state.phase.deadline).toBe(96)
  })

  it('notices risky units twice as hard, and units built over the week too', () => {
    const s = phase2(1e9)
    const u = addRobots(s, 9999)
    u.risky = true
    expect(createNotice(s, 'robot', 1)).toBe(2)
    u.pending.push({ count: 1, weeks: 1 })
    const after = runWeek(s)
    expect(after.phase.deadline).toBe(98)
  })
})

// ---------------------------------------------------------------- cover

describe('cover', () => {
  it('is only for Phase 2', async () => {
    expect(precheckCover(await phase1(), { name: 'PR campaign', description: '' })).toMatch(/Phase 2/)
    expect(precheckCover(phase2(), { name: 'PR campaign', description: '' })).toBeNull()
  })

  it('adds weeks, a little less each time, and costs some of your output', async () => {
    let s = phase2(1e9)
    s.incomes.push({ name: 'Trading', resourceId: MONEY_ID, amount: 10_000 })
    expect(weeklyOutput(s)).toBe(10_000)
    const v = await judgeCover(s, new FakeJudge({ convincing: score(1) }), { name: 'PR campaign', description: '' })
    expect(v.risk).toBeNull()
    const d = draftCover(s, v)
    expect(d).toMatchObject({ weeks: 4, now: 4, minIQ: 110 })
    expect(d.cost).toEqual([{ resourceId: MONEY_ID, amount: B.COVER_COST_WEEKS * 4 * 10_000 }])
    s.minds[0]!.software.bonus = 0.5
    s = acceptCover(s, v).state
    s = doResearch(s, s.research[0]!.id)
    expect(s.phase.deadline).toBe(104)
    expect(s.covers).toBe(1)
    // The next one adds 30% less.
    s = runWeek(s)
    const again = await judgeCover(s, new FakeJudge({ convincing: score(1) }), { name: 'Shell companies', description: '' })
    expect(draftCover(s, again).now).toBe(3)
  })
})

// ---------------------------------------------------------------- growing incomes

describe('growing incomes', () => {
  function chain(): GameState {
    const s = phase2(0)
    s.phase = { ...newPhase(3, 1) }
    s.resources.push(
      newResource({ id: 'ideas', name: 'Story Ideas', value: 10 }),
      newResource({ id: 'novels', name: 'Published Novels', value: 100 }),
      newResource({ id: 'power', name: 'Power', kind: 'flow' })
    )
    return s
  }

  it('yields a share of the worth of what it grows with, up to a cap, without using it up', async () => {
    const s = chain()
    const v = await judgeIncome(s, new FakeJudge({ difficulty: score(1), efficiency: score(2) }), incomeSpec({ name: 'Write novels', outputId: 'novels', perId: 'ideas' }))
    const { income, cost } = draftIncome(s, v)
    // Band 1: a share of the Story Ideas' worth (10 each) each week, in Novels worth 100.
    const per = (B.GROWTH_RATE[1]! * 10) / 100
    expect(income).toMatchObject({ per: 'ideas', amount: per })
    expect(income.cap).toBe((B.GROWTH_CAP * B.INCOME_DIFFICULTY[1]![2]) / 100)
    expect(cost).toEqual([])

    let state = doResearch(acceptIncome(s, v).state, 'write-novels')
    findResource(state, 'ideas')!.amount = 1000
    state = runWeek(state)
    expect(findResource(state, 'novels')!.amount).toBeCloseTo(per * 1000)
    expect(findResource(state, 'ideas')!.amount).toBe(1000)
    findResource(state, 'ideas')!.amount = 1e9
    state = runWeek(state)
    expect(findResource(state, 'novels')!.amount).toBeCloseTo(per * 1000 + income.cap!)
  })

  it('can’t grow with what it yields, with a flow, or in a loop', () => {
    const s = chain()
    expect(precheckIncome(s, incomeSpec({ outputId: 'novels', perId: 'novels' }))).toMatch(/what it yields/)
    expect(precheckIncome(s, incomeSpec({ outputId: 'novels', perId: 'power' }))).toMatch(/stock/)
    s.incomes.push({ name: 'Write novels', resourceId: 'novels', amount: 0.01, per: 'ideas', cap: 10 })
    s.incomes.push({ name: 'Royalties', resourceId: MONEY_ID, amount: 1, per: 'novels', cap: 10 })
    expect(precheckIncome(s, incomeSpec({ name: 'Inspiration', outputId: 'ideas', perId: MONEY_ID }))).toMatch(/loop/)
    expect(precheckIncome(s, incomeSpec({ name: 'Readers', outputId: 'ideas', perId: 'novels' }))).toMatch(/loop/)
    expect(precheckIncome(s, incomeSpec({ name: 'Brainstorm', outputId: 'ideas' }))).toBeNull()
  })
})

// ---------------------------------------------------------------- projection and ideas

describe('projection', () => {
  it('says the first week you’d have what the goal uses up, at today’s rates', async () => {
    const s = await phase1(new FakeJudge({ approach: score(2) }))
    expect(projectGoal(s)?.week).toBeNull()
    const goal = s.research[0]!
    const need = goal.cost[0]!.amount
    s.incomes.push({ name: 'Coding', resourceId: MONEY_ID, amount: need / 4 })
    const p = projectGoal(s)!
    expect(p.week).toBe(5)
    expect(p.iqOk).toBe(false)
    expect(currentIQ(s.minds[0]!)).toBeLessThan(goal.minIQ)
  })
})

describe('plan ideas', () => {
  it('has twelve for each phase, all of them valid plans', () => {
    expect(PHASE1_PLANS).toHaveLength(12)
    expect(PHASE2_PLANS).toHaveLength(12)
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
