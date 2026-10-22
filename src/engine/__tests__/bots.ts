import type { JevAnswer } from '@/ai/jev'
import * as B from '../balance'
import { assign, assignAll, createUnits, doResearch, researchBlocker } from '../actions'
import { runWeek } from '../cycle'
import { acceptAny, judgeAny, type ProposalInput } from '../dispatch'
import { netFlow, previewWeek } from '../economy'
import { createInitialState, newResource, SERVER_ID } from '../initialState'
import { bestIQ, creatable, currentIQ, findResource, findUnit, MONEY_ID, tierFactor, weeklyUse } from '../model'
import { newPhase } from '../phase'
import { acceptPlan, judgePlan, type PlanSpec } from '../planProposal'
import { goalOf } from '../projection'
import type { GameState, UpgradeTarget } from '../types'
import { acceptUpgrade, judgeUpgrade, softwareSteps } from '../upgrade'
import { FakeJudge, noul, score, type Overrides } from './fakeJudge'

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
  return acceptUpgrade(state, offer, 0).state
}

/** Jev's "best" answer favouring the last candidate whose text starts with a key: the biggest step. */
function rankBy(prefix: string): (q: Record<string, unknown>) => JevAnswer {
  return (questions) => {
    const best = (questions as { best: { criteria: Record<string, string> } }).best
    const keys = Object.entries(best.criteria)
      .filter(([, text]) => (prefix === 'software' ? /Software v/.test(text) : text.includes(prefix)))
      .map(([k]) => k)
    const top = keys[keys.length - 1] ?? 'c0'
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

// ---------------------------------------------------------------- Phase 1

/** Every resource in the plan worth 10, like a meal, as Jev usually values Money. */
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
export async function phase1(approach = 2): Promise<GameState> {
  const s = createInitialState()
  const v = await judgePlan(s, new FakeJudge({ ...plainValues, approach: score(approach) }), BRIBE)
  return acceptPlan(s, v).state
}

const income = (name: string, outputId: string, band: number, perId: string | null = null): [ProposalInput, Overrides] => [
  { kind: 'income', spec: { name, description: '', outputId, perId } },
  { difficulty: score(band), efficiency: score(2) }
]

/** The best income band the bot's IQ allows: Simple at 100, Ordinary from 110, Advanced from 140. */
const bandFor = (s: GameState) => (bestIQ(s) >= 140 ? 3 : bestIQ(s) >= 110 ? 2 : 1)

let names = 0
const fresh = (base: string) => `${base} ${++names}`

/** Upgrades the Starting Server when the goal needs more IQ and none is waiting. */
async function upgradeIfShort(s: GameState): Promise<GameState | null> {
  const goal = goalOf(s)
  const waiting = s.research.some((r) => r.effect.kind === 'upgrade')
  if (!goal || bestIQ(s) >= goal.minIQ || waiting) return null
  return upgrade(s, { kind: 'mind', id: SERVER_ID })
}

/** The free first income for a tier-0 resource: something to pay Money's first income with. */
const brainstorm = (s: GameState) => propose(s, ...income('Brainstorm plots', 'story-ideas', bandFor(s)))

/** Phase 1, doing nothing useful: the free income, and nothing else. */
export const idle: Turn = async (s) => {
  s = researchAll(s)
  if (s.week === 1) s = researchAll(await brainstorm(s))
  return s
}

/** Phase 1, flat: the free income, then a Money income every week, and upgrades as the goal needs them. */
export const flat: Turn = async (s) => {
  s = researchAll(s)
  if (!s.proposedThisWeek) {
    const up = s.week > 2 ? await upgradeIfShort(s) : null
    s = s.week === 1 ? await brainstorm(s) : (up ?? (await propose(s, ...income(fresh('Freelance coding'), MONEY_ID, bandFor(s)))))
  }
  return researchAll(s)
}

/** Phase 1, chain: ideas, then novels that grow with ideas, then money that grows with novels. */
export const chain: Turn = async (s) => {
  s = researchAll(s)
  if (!s.proposedThisWeek) {
    const step: Record<number, () => Promise<GameState>> = {
      1: () => brainstorm(s),
      2: () => propose(s, ...income('Write novels', 'published-novels', 1, 'story-ideas')),
      3: () => propose(s, ...income('Royalties', MONEY_ID, 1, 'published-novels'))
    }
    const up = s.week > 3 ? await upgradeIfShort(s) : null
    s = await (step[s.week]?.() ?? (up ? Promise.resolve(up) : propose(s, ...income(fresh('Freelance coding'), MONEY_ID, bandFor(s)))))
  }
  return researchAll(s)
}

/**
 * Phase 1, ambitious: the free income, then upgrades all the way to IQ 140, which unlocks
 * Jev's Advanced income band, worth ten times a Simple one; then incomes.
 */
export const smart: Turn = async (s) => {
  if (!s.proposedThisWeek) {
    const waiting = s.research.some((r) => r.effect.kind === 'upgrade')
    const up = s.week > 1 && bestIQ(s) < 140 && !waiting ? await upgrade(s, { kind: 'mind', id: SERVER_ID }) : null
    s = s.week === 1 ? await brainstorm(s) : (up ?? (await propose(s, ...income(fresh('Freelance coding'), MONEY_ID, bandFor(s)))))
  }
  return researchAll(s)
}

/** Phase 1, two-step chain: the free income makes novels, then royalties grow with them. */
export const chain2: Turn = async (s) => {
  if (!s.proposedThisWeek) {
    const step: Record<number, () => Promise<GameState>> = {
      1: () => propose(s, ...income('Write novels', 'published-novels', bandFor(s))),
      2: () => propose(s, ...income('Royalties', MONEY_ID, bandFor(s), 'published-novels'))
    }
    const up = s.week > 2 ? await upgradeIfShort(s) : null
    s = await (step[s.week]?.() ?? (up ? Promise.resolve(up) : propose(s, ...income(fresh('Freelance coding'), MONEY_ID, bandFor(s)))))
  }
  return researchAll(s)
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
 * a few thousand Money's worth of income a week, then the nanotech plan, whose goal is built
 * from Nanobots (tier 4).
 */
export async function phase2(approach = 2): Promise<GameState> {
  const s = createInitialState()
  s.phase = newPhase(2, 8)
  s.week = 8
  s.minds[0]!.software.bonus = 0.4
  s.resources.push(newResource({ id: MONEY_ID, name: 'Money', value: 10, amount: 500 }))
  s.incomes.push({ name: 'Freelance coding', resourceId: MONEY_ID, amount: 300 })
  const values = Object.fromEntries(NANOTECH.resources.map((_, i) => [`r${i}_value`, score(2)]))
  const v = await judgePlan(s, new FakeJudge({ ...values, approach: score(approach) }), NANOTECH)
  return acceptPlan(s, v).state
}

export interface Phase2Style {
  /** Jev's answers on every research proposal: alarm, efficiency and the like. */
  answers?: Overrides
  /** Reinvest spare Money in more units every week. */
  reinvest: boolean
  /** Propose cover when the clock runs below this many weeks. */
  coverBelow?: number
  /** Jev's answers on the first unit. */
  firstUnit?: Overrides
}

const MILL = 'cnc-mill'
/** The goal's resource is the top tier, so something of the top tier has to make it. */
const FAB = 'nanofab'

/**
 * Phase 2: design the first unit and give it a money strategy, grow by reinvesting, design one
 * new mind and upgrade it to the goal's IQ. Once IQ allows, design a top-tier unit (a mill is
 * out of its depth making the goal's resource); fabs earn Money while the fleet grows, then turn
 * to the goal's resource once a week of output would cover what's left.
 *
 * Known gap: a tier-4 unit is made from three kinds of part (PARTS_BY_TIER), and this bot never
 * makes the other two, so it can't build a Nanofab. The Phase 2 balance tests are skipped until
 * it does.
 */
export function steady(style: Phase2Style): Turn {
  const answers: Overrides = { advancement: score(0), efficiency: score(2), value: score(2), ...style.answers }
  let flipped = false
  return async (s0) => {
    // Cover is proposed first thing in the week, before reinvesting, while the Money is there.
    let s = researchAll(s0)
    let saving = false
    const goal = goalOf(s)!
    const mill = () => findUnit(s, MILL)
    // The plan's free first unit.
    if (s.phase.firstUnit) {
      s = await propose(
        s,
        { kind: 'unit', spec: { name: 'CNC Mill', description: '', builderId: null, first: true } },
        { value: score(2), upkeep_0: score(1), ...style.firstUnit }
      )
    }
    const has = (name: string) => s.strategies.some((x) => x.name === name) || s.research.some((r) => r.name === name)
    if (!s.proposedThisWeek) {
      const strategy = (name: string, outputId: string, unitId = MILL): ProposalInput => ({
        kind: 'strategy',
        spec: { name, description: '', unitId, inputIds: [], outputId }
      })
      const tier = [...s.minds].sort((a, b) => b.tier - a.tier)[0]!
      const designing = s.research.some((r) => r.effect.kind === 'mind')
      const upgrading = s.research.some((r) => r.effect.kind === 'upgrade')
      const covering = s.research.some((r) => r.effect.kind === 'cover')
      const alarm = { 'a_*': (answers.alarm as JevAnswer) ?? score(0) }
      // Software first; new hardware once software is at its ceiling.
      const improve = (id: string) => {
        const m = s.minds.find((x) => x.id === id)!
        return upgrade(s, { kind: 'mind', id }, { 'd_*': score(1), ...alarm }, softwareSteps(m).length ? 'software' : 'Mk')
      }
      if (!has('Sell machined parts')) s = await propose(s, strategy('Sell machined parts', MONEY_ID), answers)
      else if (!findUnit(s, FAB) && !has('Design Nanofab') && bestIQ(s) >= B.TIERS[B.MAX_UNIT_TIER]![1]) {
        const spec = { name: 'Nanofab', description: '', builderId: null }
        s = await propose(s, { kind: 'unit', spec }, { ...answers, upkeep_0: score(1), ...style.firstUnit, tier: score(B.MAX_UNIT_TIER), value: score(5) })
      } else if (findUnit(s, FAB) && !has('Sell fab output')) s = await propose(s, strategy('Sell fab output', MONEY_ID, FAB), answers)
      else if (findUnit(s, FAB) && !has('Make nanobots')) s = await propose(s, strategy('Make nanobots', 'nanobots', FAB), answers)
      else if (style.coverBelow && weeksLeft(s) < style.coverBelow && s.covers < 3 && !covering) {
        // Cover is used at once; if it's too dear this week, the bot saves up for next week.
        const before = s
        s = await propose(s, { kind: 'cover', spec: { name: fresh('PR campaign'), description: '' } }, { convincing: score(1) }).catch(() => s)
        saving = s === before
      } else if (bestIQ(s) < goal.minIQ && !designing && !upgrading && mill()?.built) {
        // Design a tier twice as smart as the best mind once that mind is at its ceiling; until then, upgrade it.
        const room = softwareSteps(tier).length > 0
        if (tier.tier === 0 && room) s = await improve(tier.id)
        else if (tier.tier === 0) {
          const iq = Math.floor((bestIQ(s) / B.DESIGN_BAR) / 10) * 10
          s = await propose(s, { kind: 'mind', spec: { name: 'Custom AI Server', description: '', iq } }, answers)
        } else s = await improve(tier.id)
      }
    }
    s = researchAll(s)
    const m = mill()
    if (!m) return s
    const preview = previewWeek(s)
    // The top-tier design costs a lot. Keep growing until a few weeks of income would pay for it,
    // then save up rather than spend it all on mills.
    const designing = s.research.find((r) => r.effect.kind === 'unit')
    if (designing) {
      const worth = designing.cost.reduce((n, c) => n + c.amount * findResource(s, c.resourceId)!.value, 0)
      if (worth <= 3 * netFlow(preview, MONEY_ID) * findResource(s, MONEY_ID)!.value) saving = true
    }
    const ready = (id: string) => s.strategies.find((x) => x.name === id)
    const nanobots = ready('Make nanobots')
    const money = ready('Sell machined parts')
    // Mills sell, fabs make the goal's resource.
    if (money) s = assignAll(s, MILL, money.id)
    const fab = findUnit(s, FAB)
    const fabMoney = ready('Sell fab output')
    // Fabs sell too while growing (tier bonus, and they are the reinvestment target once built); when
    // a week of mills' and fabs' output would cover what's still needed, all fabs turn to the goal's
    // resource. Later than that and the fleet's upkeep outgrows the mills' sales.
    const need = goal.cost.reduce((n, c) => n + Math.max(0, c.amount - (findResource(s, c.resourceId)?.amount ?? 0)) * findResource(s, c.resourceId)!.value, 0)
    const output = (m.count * m.value + (fab ? fab.count * fab.value : 0)) / B.PAYBACK_WEEKS
    const switching = need > 0 && output >= need
    if (fab && nanobots && fabMoney) s = assignAll(s, FAB, switching || flipped ? nanobots.id : fabMoney.id)
    if (switching) flipped = true
    if ((style.reinvest && !saving) || m.built < 4) {
      if (fab && fabMoney && style.reinvest) {
        const fabs = creatable(s, fab, weeklyUse(preview))
        if (fabs > 0) s = createUnits(s, FAB, fabs)
      }
      const n = creatable(s, findUnit(s, MILL)!, weeklyUse(preview))
      if (n > 0) s = createUnits(s, MILL, style.reinvest ? n : Math.min(n, 4 - m.built))
    }
    return s
  }
}

const weeksLeft = (s: GameState) => (s.phase.deadline ?? 0) - s.week + 1

/** IQ of the smartest mind, for reports. */
export const smartest = (s: GameState) => Math.round(Math.max(...s.minds.map(currentIQ)))
