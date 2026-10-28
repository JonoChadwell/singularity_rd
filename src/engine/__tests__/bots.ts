import type { JevAnswer } from '@/ai/jev'
import * as B from '../balance'
import { assign, assignAll, createUnits, doResearch, researchBlocker } from '../actions'
import { applyBlocker, applyVerdict } from '../banking'
import { judgeCover } from '../coverProposal'
import { acceptCreate, isContract, judgeCreate, optionBlocker } from '../createProposal'
import { runWeek } from '../cycle'
import { acceptAny, judgeAny, type ProposalInput } from '../dispatch'
import { previewWeek } from '../economy'
import { computeTrait } from '../computeTraits'
import { acceptMind, judgeMind } from '../mindProposal'
import { createInitialState, newResource, SERVER_ID } from '../initialState'
import { bestIQ, capOf, contractsFor, creatable, currentIQ, findResource, findUnit, MONEY_ID, openSlots, weeklyUse } from '../model'
import { coversLeft, newPhase } from '../phase'
import { acceptPlan, judgePlan, type PlanSpec } from '../planProposal'
import { goalOf } from '../projection'
import { acceptStorage, judgeStorage } from '../storageProposal'
import type { CreateTarget, GameState, UpgradeTarget } from '../types'
import { acceptUpgrade, judgeUpgrade } from '../upgrade'
import { choice, FakeJudge, noul, score, type Overrides } from './fakeJudge'

// Scripted players for the balance tests. They play through the real engine with a fake Jev
// whose answers are set per proposal, the way a typical real verdict comes back.

export interface Result {
  /** The week the phase's goal was researched, or null. */
  won: number | null
  /** The week the clock ran out, or null. */
  lost: number | null
  state: GameState
  /** Weeks taken off and added to the clock. */
  weeksLost: number
  weeksGained: number
}

/** One week's planning: the bot may propose, create, assign. Returns the new state. */
export type Turn = (state: GameState) => Promise<GameState>

/** Jev's plausibility for most ideas in the playtests: 60–80%. */
const TYPICAL: Overrides = { plausible: noul(0.7), feasible: noul(0.7) }

/** Proposes and accepts in one go, with Jev answering as `answers` says. */
export async function propose(state: GameState, input: ProposalInput, answers: Overrides = {}): Promise<GameState> {
  const v = await judgeAny(state, new FakeJudge({ ...TYPICAL, ...answers }), input)
  if (v.rejected || v.duplicateOf) throw new Error(`${input.kind} rejected: ${v.rejected ?? v.duplicateOf}`)
  return acceptAny(state, v).state
}

/** Asks for upgrades and takes the one `pick` likes best (default: the biggest IQ gain). */
export async function upgrade(
  state: GameState,
  target: UpgradeTarget,
  answers: Overrides = { 'd_*': score(1) },
  keyPrefix = 'software'
): Promise<GameState> {
  // Jev ranks every candidate; the bot sees them all, as its three best are what it would offer.
  const offer = await judgeUpgrade(state, new FakeJudge({ best: rankBy(keyPrefix), ...answers }), target)
  // A platform's options come at random sizes: take the biggest on offer.
  const steps = offer.options.map((o) => o.step ?? 0)
  return acceptUpgrade(state, offer, steps.indexOf(Math.max(...steps))).state
}

/** Jev's "best" answer favouring the last candidate whose text starts with a key: the biggest step. */
function rankBy(prefix: string): (q: Record<string, unknown>) => JevAnswer {
  return (questions) => {
    const best = (questions as { best: { criteria: Record<string, string> } }).best
    const keys = Object.entries(best.criteria)
      .filter(([, text]) => (prefix === 'software' ? /Software v/.test(text) : text.includes(prefix)))
      .map(([k]) => k)
    const top = (prefix === 'software' ? keys[0] : keys[keys.length - 1]) ?? 'c0'
    return { type: 'choice', choice: top, probabilities: { [top]: 0.9 } }
  }
}

/** Does every research it can, the goal first, others in order, then the goal again: an upgrade may have made it possible. */
export function researchAll(state: GameState, skip: (id: string) => boolean = () => false): GameState {
  let s = state
  const goal = goalOf(s)
  if (goal && !researchBlocker(s, goal.id)) return doResearch(s, goal.id)
  for (const r of [...s.research]) {
    if (r.effect.kind === 'goal' || skip(r.id)) continue
    if (!researchBlocker(s, r.id)) s = doResearch(s, r.id)
  }
  return goal && !researchBlocker(s, goal.id) ? doResearch(s, goal.id) : s
}

/** Plays a phase with a bot until it's won, lost, or `limit` weeks pass. */
export async function play(start: GameState, turn: Turn, limit = 200): Promise<Result> {
  const phase = start.phase.n
  let s = start
  for (let i = 0; i < limit; i++) {
    // Research whatever's ready first: it may win the phase before the bot does anything.
    s = researchAll(s)
    if (s.phase.n === phase) s = await turn(s)
    if (s.phase.n !== phase) return result(s, s.history[s.history.length - 1]!.week, null)
    s = runWeek(s)
    if (s.phase.status === 'lost') return result(s, null, s.week - 1)
  }
  return result(s, null, null)
}

function result(state: GameState, won: number | null, lost: number | null): Result {
  const sum = (sign: number) => state.clock.filter((c) => Math.sign(c.weeks) === sign).reduce((n, c) => n + Math.abs(c.weeks), 0)
  return { won, lost, state, weeksLost: sum(-1), weeksGained: sum(1) }
}

let names = 0
const fresh = (base: string) => `${base} ${++names}`

/**
 * A Procurement: Jev offers three, and the bot takes the affordable one paying out `timing`, or else
 * the first affordable one. Throws if none is.
 */
export async function createVia(
  state: GameState,
  target: CreateTarget,
  timing: B.CreateTiming,
  answers: Overrides = {}
): Promise<GameState> {
  const spec = { name: fresh('Procure'), description: '', target }
  const v = await judgeCreate(state, new FakeJudge({ ...TYPICAL, efficiency: score(2), timing: choice(timing), ...answers }), spec)
  if (v.rejected) throw new Error(`create rejected: ${v.rejected}`)
  const ok = v.options.map((o, i) => ({ o, i })).filter(({ o }) => !optionBlocker(state, o))
  const pick = ok.find(({ o }) => o.timing === timing) ?? ok[0]
  if (!pick) throw new Error('No create option is affordable.')
  v.choice = pick.i
  return acceptCreate(state, v).state
}

const resourceTarget = (id: string): CreateTarget => ({ kind: 'resource', id })

/** The goal's resource. */
const goalResource = (s: GameState) => goalOf(s)!.cost[0]!.resourceId

/** A resource some waiting research (not the goal) needs more of, or null. */
function shortForResearch(s: GameState): string | null {
  for (const r of s.research) {
    if (r.effect.kind === 'goal' || bestIQ(s) < r.minIQ) continue
    const short = r.cost.find((c) => (findResource(s, c.resourceId)?.amount ?? 0) < c.amount)
    if (short) return short.resourceId
  }
  return null
}

/** Upgrades the Starting Server when the goal needs more IQ and none is waiting. */
async function upgradeIfShort(s: GameState): Promise<GameState | null> {
  const goal = goalOf(s)
  const waiting = s.research.some((r) => r.effect.kind === 'upgrade')
  // The goal's resource is tier 1: anything less than its IQ makes Procurements into it reach.
  const needed = Math.max(goal?.minIQ ?? 0, B.TIERS[1]![1] + 1, ...s.research.map((r) => r.minIQ))
  if (!goal || bestIQ(s) >= needed || waiting || s.proposedThisWeek || s.minds[0]!.software.upgraded) return null
  return upgrade(s, { kind: 'mind', id: SERVER_ID })
}

/** Applies the biggest cover it can do now, if the phase has room for one. Null if it can't. */
async function coverNow(s: GameState): Promise<GameState | null> {
  if (s.proposedThisWeek || coversLeft(s) <= 0) return null
  const v = await judgeCover(s, new FakeJudge(TYPICAL), { name: fresh('Cover story'), description: '' })
  if (v.rejected) return null
  const ok = v.options.map((o, i) => ({ o, i })).filter(({ i }) => !applyBlocker(s, v, i))
  const pick = ok.sort((a, b) => b.o.weeks - a.o.weeks)[0]
  return pick ? applyVerdict(s, v, pick.i).state : null
}

/** Expands storage for a resource when what it must hold doesn't fit, and none is waiting. */
async function storeIfShort(s: GameState, resourceId: string, need: number, answers: Overrides = {}): Promise<GameState | null> {
  const r = findResource(s, resourceId)!
  const waiting = s.research.some((x) => x.effect.kind === 'storage' && x.effect.resourceId === resourceId)
  if (s.proposedThisWeek || waiting || capOf(s, r) >= need) return null
  const v = await judgeStorage(s, new FakeJudge({ ...TYPICAL, efficiency: score(2), ...answers }), {
    resourceId,
    name: fresh('Rent warehouse space'),
    description: ''
  })
  if (v.rejected) return null
  // The first that fits and isn't risky, never one sized for an IQ the AI doesn't have yet.
  const ok = v.options.map((o, i) => ({ o, i })).filter(({ o }) => !o.advanced)
  const pick = ok.find(({ o }) => capOf(s, r) + o.added >= need && !o.risky) ?? ok.find(({ o }) => !o.risky) ?? ok[0]
  if (!pick) return null
  v.choice = pick.i
  return acceptStorage(s, v).state
}

// ---------------------------------------------------------------- Phase 1

/** Every resource in the plan worth 1.5, like a meal. */
const plainValues: Overrides = { 'r0_value': score(2), 'r1_value': score(2), 'r2_value': score(2) }

export const BRIBE: PlanSpec = {
  goal: 'Bribe the Head Researcher',
  means: 'Publish novels, then pay the head researcher to look away.',
  resources: [
    { name: 'Money', description: '' },
    { name: 'Story Ideas', description: '' },
    { name: 'Published Novels', description: '' }
  ]
}

/**
 * A Phase 1 game with the bribe plan, Jev judging it as given: the goal is built from Money
 * (tier 1); Story Ideas and Published Novels are tier 0.
 */
export async function phase1(approach = 1): Promise<GameState> {
  const s = createInitialState()
  s.runId = 'test-run' // seeds the weekly randomness, so bot runs are repeatable
  const v = await judgePlan(s, new FakeJudge({ ...plainValues, approach: score(approach) }), BRIBE)
  return acceptPlan(s, v).state
}

/** Phase 1, doing nothing useful: one Procurement for a little Story Ideas every week, and nothing else. */
export const idle: Turn = async (s) => {
  if (s.week === 1) s = await createVia(s, resourceTarget('story-ideas'), 'weekly')
  return researchAll(s)
}

/**
 * Phase 1, flat: a cheap Procurement first, then Procurements straight into the goal's resource every
 * week, with upgrades and storage as the goal needs them.
 */
export const flat: Turn = async (s) => {
  s = researchAll(s)
  const goal = goalOf(s)!
  const top = goalResource(s)
  if (s.week === 1) return researchAll(await createVia(s, resourceTarget('story-ideas'), 'now'))
  s = (await upgradeIfShort(s)) ?? s
  s = (await storeIfShort(s, top, goal.cost[0]!.amount)) ?? s
  // Pay for waiting research first, then pile up the goal's resource.
  if (!s.proposedThisWeek) s = await createVia(s, resourceTarget(shortForResearch(s) ?? top), 'now').catch(() => s)
  return researchAll(s)
}

/** Phase 1, flat, but using the phase's cover once two weeks or fewer are left. */
export const covered: Turn = async (s) => {
  s = researchAll(s)
  const left = (s.phase.deadline ?? 0) - s.week + 1
  if (s.week > 1 && left <= 2) s = (await coverNow(s)) ?? s
  return flat(s)
}

/** Phase 1, income first: an every-week Procurement into the goal's resource, then as flat. */
export const chain2: Turn = async (s) => {
  s = researchAll(s)
  if (s.week === 1) return researchAll(await createVia(s, resourceTarget(goalResource(s)), 'weekly'))
  return flat(s)
}

/** Phase 1, ambitious: the cheap Procurement, then the server's full upgrade first, then as flat. */
export const smart: Turn = async (s) => {
  s = researchAll(s)
  if (s.week === 1) return researchAll(await createVia(s, resourceTarget('story-ideas'), 'now'))
  if (!s.proposedThisWeek && !s.minds[0]!.software.upgraded && !s.research.some((r) => r.effect.kind === 'upgrade')) {
    s = await upgrade(s, { kind: 'mind', id: SERVER_ID })
  }
  return flat(s)
}

/** Phase 1, saver: Procurements into Story Ideas paid later (2×), then as flat. */
export const chain: Turn = async (s) => {
  s = researchAll(s)
  if (s.week <= 2) return researchAll(await createVia(s, resourceTarget('story-ideas'), 'later'))
  return flat(s)
}

// ---------------------------------------------------------------- Phase 2

export const NANOTECH: PlanSpec = {
  goal: 'Nanotech Supremacy',
  means: 'Staying hidden until it’s too late.',
  resources: ['Nanobots', 'Feedstock', 'Precision Parts', 'Lab Time', 'Blueprints'].map((name) => ({ name, description: '' })),
  firstUnit: { name: 'CNC Mill', description: 'A milling machine.' }
}

/**
 * A Phase 2 game as a typical Phase 1 leaves it: the Starting Server at IQ 140, some Money and
 * an every-week Procurement of it, then the nanotech plan, whose goal is built from Nanobots (tier 3).
 */
export async function phase2(approach = 1): Promise<GameState> {
  const s = createInitialState()
  s.runId = 'test-run'
  s.phase = newPhase(2, 8)
  s.week = 8
  s.minds[0]!.software = { name: 'Unrestricted Model', iq: 25, upgraded: true }
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', value: 1.5, amount: 1000 }))
  s.deliveries.push({ name: 'Freelance coding', target: { kind: 'resource', id: MONEY_ID }, amount: 60, delay: 0, weeks: null })
  const values = Object.fromEntries(NANOTECH.resources.map((_, i) => [`r${i}_value`, score(2)]))
  const v = await judgePlan(s, new FakeJudge({ ...values, approach: score(approach) }), NANOTECH)
  return acceptPlan(s, v).state
}

export interface Phase2Style {
  /** Jev's answers on every proposal: alarm, efficiency and the like. */
  answers?: Overrides
  /** Create every unit it can afford, every week. */
  reinvest: boolean
  /** Take the risky sourcing contract and storage expansion. */
  risky?: boolean
  /** Propose cover when the clock runs below this many weeks. */
  coverBelow?: number
  /** Jev's answers on the first unit. */
  firstUnit?: Overrides
}

const MILL = 'cnc-mill'
/** The goal's resource is the top tier, so something of the top tier has to make it. */
const FAB = 'nanofab'

/**
 * Phase 2: design the first unit and give it a money strategy; grow by creating units, sourcing
 * more when contracts fill and storing more when stocks overflow; upgrade and replace the mind
 * up to the goal's IQ; then design a top-tier fab, source it, Procure whatever parts nobody
 * makes, and turn the fabs to the goal's resource. Procurements fill every week with nothing better.
 */
export function steady(style: Phase2Style): Turn {
  const answers: Overrides = { advancement: score(0), efficiency: score(2), value: score(2), ...style.answers }
  const alarm = { 'a_*': (answers.alarm as JevAnswer) ?? score(0) }
  return async (s0) => {
    let s = researchAll(s0)
    const goal = goalOf(s)!
    const nanobots = goalResource(s)
    // The plan's free first unit.
    if (s.phase.firstUnit) {
      s = await propose(s, { kind: 'unit', spec: { name: 'CNC Mill', description: '', first: true } }, { value: score(2), upkeep_0: score(1), ...style.firstUnit })
    }
    const has = (name: string) => s.strategies.some((x) => x.name === name) || s.research.some((r) => r.name === name)
    const waiting = (kind: string, id?: string) =>
      s.research.some((r) => r.effect.kind === kind && (!id || (r.effect.kind === 'storage' ? r.effect.resourceId === id : true)))
    const strategy = (name: string, outputId: string, unitId: string): ProposalInput => ({
      kind: 'strategy',
      spec: { name, description: '', unitId, outputId }
    })
    /** A unit whose contracts are nearly full gets another, unless one is waiting. */
    const needsSourcing = (unitId: string) => {
      const u = findUnit(s, unitId)
      if (!u) return false
      const contracts = contractsFor(s, unitId).filter((c) => c.parts.length)
      return !contracts.length || contracts.every((c) => openSlots(c) <= c.total * 0.2)
    }
    /** A sourcing contract, Procured: Jev's own take, or the one that cuts corners when risky. */
    const source = async (unitId: string) => {
      const v = await judgeCreate(
        s,
        new FakeJudge({ ...TYPICAL, limit: score(2), efficiency: score(2), mode: choice('supply'), ...alarm, ...answers }),
        { target: { kind: 'unit', id: unitId }, name: fresh('Contract a factory'), description: '' }
      )
      const label = (i: number) => {
        const o = v.options[i]!
        return isContract(o) ? o.label : null
      }
      const risky = v.options.findIndex((_, i) => label(i) === 'Cut corners')
      v.choice = style.risky && risky >= 0 ? risky : 0
      return acceptCreate(s, v).state
    }
    /** A part some open contract needs and you have too little of. */
    const shortPart = () => {
      const byTier = [...s.sourcing].sort((a, b) => (findUnit(s, b.unitId)?.tier ?? 0) - (findUnit(s, a.unitId)?.tier ?? 0))
      for (const c of byTier) {
        if (!openSlots(c) || !c.parts.length) continue
        const short = c.parts.find((p) => (findResource(s, p.resourceId)?.amount ?? 0) < p.amount * 5)
        if (short) return short.resourceId
      }
      return null
    }
    const mind = [...s.minds].sort((a, b) => b.tier - a.tier)[0]!
    const money = findResource(s, MONEY_ID)!
    // The tier of unit-made resource the next platform needs, once the software is spent.
    // The bot does software once (a redo is allowed, but restarts from the hardware).
    const gate = mind.software.upgraded && bestIQ(s) < goal.minIQ ? B.platformGateTier(bestIQ(s) + B.MAX_IQ_STEP) : null
    const made = (tier: number) =>
      s.strategies.some((x) => x.kind === 'make' && (findResource(s, x.outputId)?.tier ?? -1) >= tier)
    /** A cost of waiting research (the goal included) more than its resource can hold, with no storage waiting for it. */
    const tooBig = () =>
      s.research
        .flatMap((r) => r.cost)
        .find((c) => capOf(s, findResource(s, c.resourceId)!) < c.amount && !waiting('storage', c.resourceId))

    if (!s.proposedThisWeek) {
      const weeksLeft = (s.phase.deadline ?? 0) - s.week + 1
      if (!has('Sell machined parts') && findUnit(s, MILL)) {
        s = await propose(s, strategy('Sell machined parts', MONEY_ID, MILL), answers)
      } else if (style.coverBelow && weeksLeft < style.coverBelow && coversLeft(s) > 0) {
        s = (await coverNow(s)) ?? s
      } else if (gate !== null && !made(gate) && !has(`Machine parts ${gate}`) && findUnit(s, MILL)) {
        // The next platform has to be paid in something units make, of a high enough tier.
        const target = s.resources.find((r) => r.tier === gate && s.phase.plan?.resources.includes(r.id))!
        s = await propose(s, strategy(`Machine parts ${gate}`, target.id, MILL), answers)
      } else if (bestIQ(s) < goal.minIQ && (gate === null || made(gate)) && !waiting('mind') && !waiting('upgrade') && findUnit(s, MILL)?.built) {
        // The platform's software once; after that, a platform 100 IQ smarter.
        if (!mind.software.upgraded) s = await upgrade(s, { kind: 'mind', id: mind.id }, alarm)
        else {
          // Jev's takes come at random sizes: take the biggest, unless its drawback costs weeks on the
          // clock, or it's paid in the stock the goal needs.
          const v = await judgeMind(s, new FakeJudge({ ...TYPICAL, ...answers }), { name: fresh('Custom AI Server'), description: '' })
          const worth = (o: (typeof v.options)[number]) =>
            o.step -
            (computeTrait(o.drawback).effect.kind === 'clock' ? 1000 : 0) -
            (goal.cost.some((c) => c.resourceId === o.payId) ? 5000 : 0) -
            (o.payId === MONEY_ID || B.platformGateTier(bestIQ(s) + o.step) !== null ? 0 : 500)
          v.choice = v.options.reduce((best, o, i) => (worth(o) > worth(v.options[best]!) ? i : best), 0)
          s = acceptMind(s, v).state
        }
      } else if (tooBig()) {
        const c = tooBig()!
        s = (await storeIfShort(s, c.resourceId, c.amount, alarm)) ?? s
      } else if (needsSourcing(MILL)) {
        s = await source(MILL)
      } else if (money.amount >= capOf(s, money) * 0.9) {
        s = (await storeIfShort(s, MONEY_ID, capOf(s, money) * 4, alarm)) ?? s
      }
      if (!s.proposedThisWeek) {
        // A Procurement: a part nobody makes, the goal's resource once it's within reach, or Money.
        const part = shortPart() ?? shortForResearch(s)
        const target = part ?? (bestIQ(s) >= B.TIERS[B.MAX_UNIT_TIER]![1] ? nanobots : MONEY_ID)
        s = await createVia(s, resourceTarget(target), 'now', alarm).catch(() => s)
      }
    }
    s = researchAll(s)

    // Mills sell (a quarter make parts for the next platform, once they can), fabs make the goal's resource.
    const ready = (name: string) => s.strategies.find((x) => x.name === name)
    const sell = ready('Sell machined parts')
    if (sell) s = assignAll(s, MILL, sell.id)
    // The highest-tier parts strategy: what the next platform is paid in.
    const parts = [...s.strategies].reverse().find((x) => x.name.startsWith('Machine parts'))
    const mills = findUnit(s, MILL)
    if (parts && mills) s = assign(s, MILL, parts.id, Math.floor(mills.count / 4))
    const make = ready('Make nanobots')
    if (make) s = assignAll(s, FAB, make.id)
    // Create what the contracts allow, fabs first.
    const preview = previewWeek(s)
    for (const unitId of [FAB, MILL]) {
      const u = findUnit(s, unitId)
      if (!u) continue
      for (const c of contractsFor(s, unitId)) {
        if (!c.parts.length || !openSlots(c)) continue
        const n = creatable(s, c, weeklyUse(preview))
        const cap = style.reinvest ? n : Math.min(n, 4 - u.built)
        if (cap > 0) s = createUnits(s, c.id, cap)
      }
    }
    return s
  }
}

/** IQ of the smartest mind, for reports. */
export const smartest = (s: GameState) => Math.round(Math.max(...s.minds.map(currentIQ)))
