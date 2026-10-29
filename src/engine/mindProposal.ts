import { ranked, type JevAnswer, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { clockOf, compatible, computeTrait, DRAWBACKS, PERKS, type ComputeTrait, type ComputeTraitId } from './computeTraits'
import { bestIQ, bestMind, makeId } from './model'
import { effectiveTier } from './resourceTraits'
import { newMind } from './initialState'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  currentIQBar,
  gate,
  iconQuestion,
  newResearch,
  options,
  payers,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  reader,
  refuseUnaccepted,
  type Accepted,
  type Payable,
  type VerdictBase
} from './proposals'
import { lockReason } from './phase'
import { costMultiplier, priceCost, spendable } from './research'
import { softwareSteps } from './upgrade'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import type { Cost, GameState, Mind, Resource } from './types'

/**
 * A new platform: hardware that replaces the old one for good, running fresh software. Its IQ is
 * a step over your best.
 */
export interface MindSpec {
  name: string
  description: string
}

/**
 * One of Jev's three takes: a perk and the drawback that comes with it, how much smarter it is
 * (one of PLATFORM_STEPS) and the stock that pays for it.
 */
export interface MindOption {
  perk: ComputeTraitId
  drawback: ComputeTraitId
  step: number
  payId: string | null
}

type TraitPair = Pick<MindOption, 'perk' | 'drawback'>

export interface MindVerdict extends VerdictBase {
  kind: 'mind'
  spec: MindSpec
  /** Jev's takes, to pick one from. */
  options: MindOption[]
  choice: number
}

export const DEFAULT_SOFTWARE = 'Base Model'

/** The IQ a platform of this step would have. */
export const platformIQ = (state: GameState, step: number) => Math.round(bestIQ(state)) + step

/**
 * The stocks a platform of this IQ may be paid in. The smartest ones have to be paid in what
 * your units make, of a high enough tier: Money alone won't do.
 */
export function platformPayable(iq: number, state: GameState): Payable | undefined {
  const tier = B.platformGateTier(iq)
  if (tier === null) return undefined
  const made = new Set(state.strategies.filter((s) => s.kind === 'make').map((s) => s.outputId))
  // Prestigious resources pay as if a tier higher.
  return (r: Resource) => effectiveTier(r, 'platform') >= tier && made.has(r.id)
}

export function precheckMind(state: GameState, spec: MindSpec): string | null {
  const locked = lockReason(state, 'mind')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!allowedSteps(state).length) {
    const iq = platformIQ(state, B.PLATFORM_STEPS[0]!)
    return `A platform of IQ ${iq} has to be paid for in a tier ${B.platformGateTier(iq)} resource that your units make. You have none yet.`
  }
  return null
}

/**
 * The sizes on offer: the usual steps, and none at all once the software has added IQ, which
 * turns it into hardware and lets the software start again from there.
 */
function stepPool(state: GameState): number[] {
  return (bestMind(state)?.software.iq ?? 0) > 0 ? [0, ...B.PLATFORM_STEPS] : B.PLATFORM_STEPS
}

/** The steps that can be paid for: the smartest platforms need a stock your units make. */
function allowedSteps(state: GameState): number[] {
  return stepPool(state).filter((step) => {
    const payable = platformPayable(platformIQ(state, step), state)
    return !payable || spendable(state, payable).length > 0
  })
}

/** Each take's step: random but not all the same, fixed for the week (renaming it won't reroll), never one nobody could pay for. */
function stepsFor(state: GameState, count: number): number[] {
  const allowed = allowedSteps(state)
  return softwareSteps(state, 'new-platform', count, stepPool(state)).map((s) => (allowed.includes(s) ? s : allowed[allowed.length - 1]!))
}

/**
 * Each take's payer: Jev's favourite stock that may pay for that size, a different one for each
 * take where the stocks allow.
 */
function payersFor(state: GameState, answers: Record<string, JevAnswer>, steps: number[]): (string | null)[] {
  const taken = new Set<string>()
  return steps.map((step) => {
    const stocks = spendable(state, platformPayable(platformIQ(state, step), state)).map((r) => r.id)
    const order = [...payers(answers).map((p) => p.resourceId), ...stocks].filter(
      (id, i, all) => stocks.includes(id) && all.indexOf(id) === i
    )
    const id = order.find((x) => !taken.has(x)) ?? order[0] ?? null
    if (id) taken.add(id)
    return id
  })
}

/** Traits in Jev's order of fit, then the rest in list order. */
function rankedTraits(answer: JevAnswer | undefined, list: ComputeTrait[]): ComputeTrait[] {
  const order = answer ? ranked(answer).map(([k]) => k) : []
  return [...order, ...list.map((t) => t.id)]
    .filter((id, i, all) => list.some((t) => t.id === id) && all.indexOf(id) === i)
    .map((id) => computeTrait(id))
}

/** The perks a new platform may have: one that buys time (Discreet) only until a platform has paid it out. */
export const perksOnOffer = (state: GameState) => PERKS.filter((t) => !(clockOf(t.id) > 0 && state.claimed.includes(t.id)))

/** Pairs the best perks with the best drawbacks, never a perk with a drawback of its own family. */
export function pairTraits(answers: Record<string, JevAnswer>, perks: ComputeTrait[] = PERKS): TraitPair[] {
  const drawbacks = rankedTraits(answers.drawback, DRAWBACKS)
  const used = new Set<string>()
  const pairs: TraitPair[] = []
  for (const perk of rankedTraits(answers.perk, perks).slice(0, B.TRAIT_OPTIONS)) {
    const drawback = drawbacks.find((d) => !used.has(d.id) && compatible(perk, d))
    if (!drawback) continue
    used.add(drawback.id)
    pairs.push({ perk: perk.id, drawback: drawback.id })
  }
  return pairs
}

export async function judgeMind(state: GameState, judge: Judge, raw: MindSpec): Promise<MindVerdict> {
  const spec: MindSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckMind(state, spec)
  if (refusal) throw new Error(refusal)
  const questions: Record<string, JevQuestion> = {
    feasible: {
      type: 'noul',
      instructions:
        'Could the AI plausibly design and build this intelligence system? Advanced ideas can still pass; they just cost more research.'
    },
    same_as: {
      type: 'choice',
      instructions: 'Is it exactly the same as an intelligence system that already exists, just renamed?',
      criteria: { none: 'It is a different mind', ...options(state.minds) }
    },
    perk: {
      type: 'choice',
      instructions: `Going by its description and hardware, which strength would this platform most naturally have?`,
      criteria: Object.fromEntries(perksOnOffer(state).map((t) => [t.id, `${t.name}: ${t.rule}`]))
    },
    drawback: {
      type: 'choice',
      instructions: `Going by its description and hardware, which weakness would this platform most naturally have?`,
      criteria: Object.fromEntries(DRAWBACKS.map((t) => [t.id, `${t.name}: ${t.rule}`]))
    },
    icon: iconQuestion,
    ...payQuestion(state, `the design of ${spec.name}`),
    ...alarmQuestions(state)
  }
  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new intelligence system: one machine that thinks and does research. It replaces the AI’s current one for good.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `The current best is IQ ${Math.round(bestIQ(state))}.`
    ]),
    questions,
    'mind'
  )
  const pairs = pairTraits(answers, perksOnOffer(state))
  const steps = stepsFor(state, pairs.length)
  const pay = payersFor(state, answers, steps)
  const v: MindVerdict = {
    ...baseVerdict('mind', questions, answers, 'feasible', []),
    kind: 'mind',
    spec,
    options: pairs.map((pair, i) => ({ ...pair, step: steps[i]!, payId: pay[i] ?? null })),
    choice: 0
  }
  gate(v, 'Jev doesn’t think the AI could build this mind', {
    key: 'same_as',
    names: Object.fromEntries(state.minds.map((m) => [m.id, m.name]))
  })
  return v
}

/**
 * A platform's design: its IQ is the picked take's step over your best, its traits are that
 * take's pair, and its cost is the hardware IQ it adds over the old platform's. A mind can always work on its own successor.
 */
export function draftMind(state: GameState, v: MindVerdict): { mind: Mind; minIQ: number; cost: Cost } {
  const read = reader(v)
  const pick = v.options[v.choice] ?? v.options[0]
  const iq = platformIQ(state, pick?.step ?? B.MAX_IQ_STEP)
  const mind = newMind({
    id: makeId(state, v.spec.name),
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    hardware: { name: v.spec.name, iq },
    software: { name: DEFAULT_SOFTWARE, iq: 0, upgraded: false },
    traits: pick ? [pick.perk, pick.drawback] : [],
    plausibility: v.plausibility
  })
  return {
    mind,
    minIQ: currentIQBar(bestIQ(state)),
    cost: priceCost(
      state,
      B.platformPrice(bestMind(state)?.hardware.iq ?? B.START_IQ, iq) * costMultiplier(v.plausibility, v.bar) * (v.risk ? B.RISK_COST : 1),
      pick?.payId ? [{ resourceId: pick.payId, p: 1 }] : [],
      platformPayable(iq, state)
    )
  }
}

export function acceptMind(current: GameState, v: MindVerdict): Accepted {
  refuseUnaccepted(v)
  const state = structuredClone(current)
  claimProposal(state)
  const { mind, minIQ, cost } = draftMind(state, v)
  state.inventions.push({ week: state.week, icon: mind.icon, name: mind.name, kind: 'mind' })
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name: `Design ${mind.name}`,
      description: `Design ${mind.hardware.name} hardware with IQ ${mind.hardware.iq}, running ${mind.software.name}. It replaces your current platform for good.`,
      icon: mind.icon,
      minIQ,
      cost,
      effect: { kind: 'mind', mind },
      risk: v.risk
    })
  )
}
