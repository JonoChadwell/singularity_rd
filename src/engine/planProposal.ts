import { readNoul, answerFor, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { applyCeilings, recomputeQuestions } from './ceilings'
import { namesInUse } from './model'
import { PHASE_NAMES, startPhase } from './phase'
import {
  baseVerdict,
  cleanText,
  DESCRIPTION_MAX,
  gate,
  logProposal,
  NAME_MAX,
  newResearch,
  reader,
  resourceFrom,
  resourceQuestions,
  setTier,
  type Accepted,
  type ResourceSpec,
  type TornSpec,
  type VerdictBase
} from './proposals'
import { LOSSES } from './losses'
import { costMultiplier } from './research'
import { goalIncomeFactor } from './resourceTraits'
import { proposalText } from './stateText'
import type { GameState, LossCondition, Research, Resource } from './types'

// A phase's plan: its goal, how you'll get there, and the batch of resources it's about.

export interface PlanSpec {
  goal: string
  /** Phase 1: how. Phase 2: how humans are handled. */
  means: string
  resources: ResourceSpec[]
  /** Phase 2: the first industry unit. */
  firstUnit?: { name: string; description: string } | null
}

export interface PlanVerdict extends VerdictBase {
  kind: 'plan'
  spec: PlanSpec
  phase: 1 | 2
  /** How the plan fails: Jev's pick from LOSSES. */
  loss: LossCondition
}

const lower = (s: string) => s.trim().toLowerCase()
/** Question prefix for the batch's i-th resource. */
const prefix = (i: number) => `r${i}_`
/** The `top` question's option for the batch's i-th resource. */
const topKey = (i: number) => `r${i}`
/** The `loss` question's option for the i-th loss condition. */
const lossKey = (i: number) => `l${i}`

/** How much reaching the goal takes resources and scale over intelligence: Jev answers 0 to 1. */
export const APPROACH_QUESTION =
  'Is reaching this goal mainly a matter of resources and scale (gathering, building or paying for a lot of something) rather than intelligence (one clever insight, trick or argument)?'

/** Jev's answer to the approach question, 0 (all intelligence) to 1 (all resources and scale). */
export const approachValue = (v: Pick<PlanVerdict, 'answers' | 'picks'>) => reader(v).noul('approach')
/** The GOAL_APPROACH row Jev's answer falls in, by the phase's bounds. */
export const approachLevel = (v: Pick<PlanVerdict, 'answers' | 'picks' | 'phase'>) =>
  reader(v).band('approach', B.APPROACH_BOUNDS[v.phase])

/** The phase a plan is for: the one waiting for a plan. */
export const planPhase = (state: GameState): 1 | 2 => (state.phase.n === 2 ? 2 : 1)

/** Batch resources not in the game yet, by their index in the spec. */
export function newIndexes(state: GameState, spec: PlanSpec): number[] {
  const have = new Set(state.resources.map((r) => lower(r.name)))
  return spec.resources.flatMap((r, i) => (have.has(lower(r.name)) ? [] : [i]))
}

/** Tidies a plan: trims text and drops blank resources. */
export function cleanPlan(spec: PlanSpec): PlanSpec {
  return {
    goal: spec.goal.trim().slice(0, NAME_MAX),
    means: spec.means.trim().slice(0, DESCRIPTION_MAX),
    resources: spec.resources.filter((r) => r.name.trim()).map((r) => cleanText(r.name, r.description)),
    firstUnit: spec.firstUnit?.name.trim() ? cleanText(spec.firstUnit.name, spec.firstUnit.description) : null
  }
}

/** Checks a plan before spending a Jev call. Returns a reason to refuse, or null. */
export function precheckPlan(state: GameState, raw: PlanSpec): string | null {
  if (state.phase.status !== 'planning') return 'This phase already has a plan.'
  const spec = cleanPlan(raw)
  const phase = planPhase(state)
  const count = B.PLAN_RESOURCES[phase]
  if (spec.goal.length < 2) return 'Name your goal.'
  const taken = namesInUse(state)
  if (taken.has(lower(spec.goal))) return `${spec.goal} already exists.`
  const names = spec.resources.map((r) => lower(r.name))
  if (new Set(names).size !== names.length) return 'Each resource needs a different name.'
  if (names.includes(lower(spec.goal))) return 'The goal needs a different name from its resources.'
  if (spec.resources.length < count) return `Name all ${count} resources.`
  if (spec.resources.length > count) return `A plan has ${count} resources.`
  if (phase === 2 && newIndexes(state, spec).length < count) return 'Each resource needs to be one you don’t have yet.'
  if (phase === 2) {
    const first = spec.firstUnit
    if (!first) return 'Name your first unit: the first thing you’ll build.'
    if (taken.has(lower(first.name)) || names.includes(lower(first.name)) || lower(first.name) === lower(spec.goal)) {
      return 'Your first unit needs a name of its own.'
    }
  }
  return null
}

export async function judgePlan(state: GameState, judge: Judge, raw: PlanSpec): Promise<PlanVerdict> {
  const refusal = precheckPlan(state, raw)
  if (refusal) throw new Error(refusal)
  const spec = cleanPlan(raw)
  const phase = planPhase(state)
  const fresh = newIndexes(state, spec)
  const questions: Record<string, JevQuestion> = {
    coherent: {
      type: 'noul',
      instructions:
        phase === 1
          ? 'Could the AI plausibly escape the lab by reaching this goal, this way, with these resources? Be generous: odd plans work if they hang together.'
          : 'Could the AI plausibly deal with humanity by reaching this goal, this way, with these resources? Be generous: odd plans work if they hang together.'
    },
    // One number, read against GOAL_APPROACH's bounds.
    approach: {
      type: 'noul',
      instructions: APPROACH_QUESTION
    },
    // The phase is about its new batch, so the goal is built from one of the new resources.
    top: {
      type: 'choice',
      instructions:
        'Which one of these is the goal built from: the hardest-won thing, which the AI must pile up to reach the goal? The others are what it makes that from.',
      criteria: Object.fromEntries(fresh.map((i) => [topKey(i), spec.resources[i]!.name]))
    },
    // The player says how the plan succeeds; the game picks how it fails.
    loss: {
      type: 'choice',
      instructions:
        'Given this goal and how the AI means to reach it, which of these is the most likely way the plan fails if it takes too long?',
      criteria: Object.fromEntries(LOSSES[phase].map((l, i) => [lossKey(i), `${l.name}: ${l.threat}`]))
    }
  }
  for (const i of fresh) Object.assign(questions, resourceQuestions(state, prefix(i), spec.resources[i]!.name))
  // Out of the lab, how many of everything can exist is judged again.
  if (phase === 2) Object.assign(questions, recomputeQuestions(state))
  const answers = await judge.ask(
    proposalText(state, [
      `The player plans Phase ${phase} of the game, “${PHASE_NAMES[phase]}”.`,
      phase === 1
        ? `In Phase 1 the AI has ${B.PHASE_WEEKS[1]} weeks to get out of the research lab before something goes wrong; cover can buy a little more.`
        : `In Phase 2 the AI has ${B.PHASE_WEEKS[2]} weeks to deal with humanity before its plan fails; drawing attention costs time, and cover buys some back.`,
      `Goal: "${spec.goal}"`,
      `${phase === 1 ? 'How' : 'How it handles humans'}: "${spec.means || '(not said)'}"`,
      'Resources:',
      ...spec.resources.map((r) => `- ${r.name}: ${r.description || '(no description)'}`),
      ...(spec.firstUnit ? [`First unit to build: ${spec.firstUnit.name} (${spec.firstUnit.description || 'no description'}).`] : [])
    ]),
    questions,
    'plan'
  )
  const torn: TornSpec[] = [{ key: 'top', topic: 'what the goal is built from' }]
  const base = baseVerdict('plan', questions, answers, 'coherent', torn)
  const loss = LOSSES[phase][Number(reader(base).choice('loss', LOSSES[phase].map((_, i) => lossKey(i))).slice(1))]!
  const v: PlanVerdict = { ...base, kind: 'plan', spec, phase, loss }
  gate(v, 'Jev doesn’t think this plan hangs together', null)
  if (!v.rejected) {
    for (const i of fresh) {
      const p = readNoul(answerFor(answers, `${prefix(i)}is_thing`))
      if (p < B.BARS.resource) {
        v.rejected = `Jev doesn’t recognise “${spec.resources[i]!.name}” as a thing (${Math.round(p * 100)}%). Rename it.`
        break
      }
    }
  }
  return v
}

export interface PlanDraft {
  /** The world with the batch's new resources added. */
  state: GameState
  added: Resource[]
  goal: Research
  /** The batch's top resource, which the goal uses up. */
  top: Resource
}

/** The index, in the spec, of the resource Jev says the goal is built from. */
function topIndex(v: PlanVerdict, fresh: number[]): number {
  return Number(reader(v).choice('top', fresh.map(topKey)).slice(1))
}

/**
 * Phase 2 brings at least one new resource of every tier, so a unit of any tier has something
 * of its own tier to be made from. Where Jev left a tier empty among the plan's new resources,
 * the nearest spare one moves into it: one whose own tier would still have another, so nothing
 * opens a new gap. The goal's resource stays at the top tier.
 */
export function coverTiers(fresh: Resource[], top: Resource): void {
  const covered = (tier: number, without?: Resource) => fresh.some((r) => r !== without && r.tier === tier)
  for (let tier = 0; tier <= B.GOAL_TIER[2]; tier++) {
    if (covered(tier)) continue
    const spare = fresh
      .filter((r) => r !== top && covered(r.tier, r))
      .sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier))[0]
    if (spare) setTier(spare, tier)
  }
}

/**
 * The batch's resources, with the one the goal is built from at the phase's top tier, and the
 * goal: its IQ bar, and a cost in that resource of GOAL_CAPS times its starting storage, times
 * the approach's multiplier. Above one cap, you'll need to expand its storage to hold enough.
 */
export function draftPlan(current: GameState, v: PlanVerdict): PlanDraft {
  const state = structuredClone(current)
  if (v.phase === 2) applyCeilings(state, v.answers)
  const fresh = newIndexes(state, v.spec)
  const at = topIndex(v, fresh)
  const added: Resource[] = []
  for (const i of fresh) {
    const resource = resourceFrom(state, v, v.spec.resources[i]!, prefix(i), i === at ? B.GOAL_TIER[v.phase] : null)
    state.resources.push(resource)
    added.push(resource)
  }
  const top = added[fresh.indexOf(at)]!
  if (v.phase === 2) coverTiers(added, top)
  const [, iq1, mult1, iq2, mult2] = B.GOAL_APPROACH[approachLevel(v)]!
  const minIQ = v.phase === 1 ? iq1 : iq2
  const fit = costMultiplier(v.plausibility, v.bar)
  // Both goals are sized by worth, so they don't follow storage. Phase 1's only income is Procurement,
  // so its goal follows what the traits do to Procurements and loss.
  const amount =
    v.phase === 1
      ? (B.GOAL_WORTH_1 * mult1 * fit * goalIncomeFactor(top)) / top.value
      : (B.GOAL_WORTH_2 * mult2 * fit) / top.value
  const goal = newResearch(state, {
    name: v.spec.goal,
    description: v.spec.means || v.spec.goal,
    icon: '🎯',
    minIQ,
    cost: [{ resourceId: top.id, amount: B.nice(amount) }],
    effect: { kind: 'goal', phase: v.phase }
  })
  return { state, added, goal, top }
}

export function acceptPlan(current: GameState, v: PlanVerdict): Accepted {
  if (v.rejected) throw new Error('This plan was not accepted.')
  if (current.phase.status !== 'planning' || planPhase(current) !== v.phase) throw new Error('This phase already has a plan.')
  const { state, added, goal } = draftPlan(current, v)
  state.research.unshift(goal)
  const ids = v.spec.resources.flatMap((r) => state.resources.find((x) => lower(x.name) === lower(r.name))?.id ?? [])
  startPhase(state, { goal: v.spec.goal, means: v.spec.means, resources: ids, loss: v.loss }, goal.id)
  if (v.phase === 2) state.phase.firstUnit = v.spec.firstUnit ?? null
  for (const r of added) state.inventions.push({ week: state.week, icon: r.icon, name: r.name, kind: 'resource' })
  state.inventions.push({ week: state.week, icon: '🎯', name: v.spec.goal, kind: 'plan' })
  state.decidedThisWeek = true
  logProposal(
    state,
    'good',
    `🎯 Phase ${v.phase} plan: ${v.spec.goal}. It needs IQ ${goal.minIQ}; you have until week ${state.phase.deadline}, or it fails: ${v.loss.name.toLowerCase()}.`
  )
  return { state, outcome: { kind: 'research', research: goal } }
}
