import { ranked, type JevAnswer, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { compatible, computeTrait, DRAWBACKS, PERKS, type ComputeTrait, type ComputeTraitId } from './computeTraits'
import { bestIQ, makeId } from './model'
import { newMind } from './initialState'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  costFor,
  floorIQ,
  gate,
  iconQuestion,
  newResearch,
  options,
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
import { spendable } from './research'
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
  /** IQ added to your best mind's: one of PLATFORM_STEPS. */
  step: number
  /** The hardware platform's name. Blank means named after the mind. */
  hardware?: string
  /** The software's name. Blank means "Base Model". */
  software?: string
}

/** A perk and the drawback that comes with it: one of Jev's offered options. */
export interface TraitPair {
  perk: ComputeTraitId
  drawback: ComputeTraitId
}

export interface MindVerdict extends VerdictBase {
  kind: 'mind'
  spec: MindSpec
  /** Jev's perk-and-drawback pairs, to pick one from. */
  options: TraitPair[]
  choice: number
}

export const DEFAULT_SOFTWARE = 'Base Model'
const hardwareName = (spec: MindSpec) => spec.hardware?.trim() || spec.name.trim()
const softwareName = (spec: MindSpec) => spec.software?.trim() || DEFAULT_SOFTWARE

/** The IQ a platform of this step would have. */
export const platformIQ = (state: GameState, step: number) => Math.round(bestIQ(state)) + step

/** The biggest step that still reaches `iq`, or the biggest step there is. */
export function stepFor(state: GameState, iq: number): number {
  const need = iq - Math.round(bestIQ(state))
  return B.PLATFORM_STEPS.find((s) => s >= need) ?? B.MAX_IQ_STEP
}

/**
 * The stocks a platform of this IQ may be paid in. The smartest ones have to be paid in what
 * your units make, of a high enough tier: Money alone won't do.
 */
export function platformPayable(iq: number, state: GameState): Payable | undefined {
  const tier = B.platformGateTier(iq)
  if (tier === null) return undefined
  const made = new Set(state.strategies.filter((s) => s.kind === 'make').map((s) => s.outputId))
  return (r: Resource) => r.tier >= tier && made.has(r.id)
}

export function precheckMind(state: GameState, spec: MindSpec): string | null {
  const locked = lockReason(state, 'mind')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!B.PLATFORM_STEPS.includes(spec.step)) return 'Choose how much smarter it is.'
  const iq = platformIQ(state, spec.step)
  const payable = platformPayable(iq, state)
  if (payable && !spendable(state, payable).length) {
    return `A platform of IQ ${iq} has to be paid for in a tier ${B.platformGateTier(iq)} resource that your units make. You have none yet.`
  }
  return null
}

/** Traits in Jev's order of fit, then the rest in list order. */
function rankedTraits(answer: JevAnswer | undefined, list: ComputeTrait[]): ComputeTrait[] {
  const order = answer ? ranked(answer).map(([k]) => k) : []
  return [...order, ...list.map((t) => t.id)]
    .filter((id, i, all) => list.some((t) => t.id === id) && all.indexOf(id) === i)
    .map((id) => computeTrait(id))
}

/** Pairs the best perks with the best drawbacks, never a perk with a drawback of its own family. */
export function pairTraits(answers: Record<string, JevAnswer>): TraitPair[] {
  const drawbacks = rankedTraits(answers.drawback, DRAWBACKS)
  const used = new Set<string>()
  const pairs: TraitPair[] = []
  for (const perk of rankedTraits(answers.perk, PERKS).slice(0, B.TRAIT_OPTIONS)) {
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
  const iq = platformIQ(state, spec.step)
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
      criteria: Object.fromEntries(PERKS.map((t) => [t.id, `${t.name}: ${t.rule}`]))
    },
    drawback: {
      type: 'choice',
      instructions: `Going by its description and hardware, which weakness would this platform most naturally have?`,
      criteria: Object.fromEntries(DRAWBACKS.map((t) => [t.id, `${t.name}: ${t.rule}`]))
    },
    icon: iconQuestion,
    ...payQuestion(state, `the design of ${spec.name}`, platformPayable(iq, state)),
    ...alarmQuestions(state)
  }
  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new intelligence system: one machine that thinks and does research. It replaces the AI’s current one for good.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Hardware: "${hardwareName(spec)}", IQ ${iq} (the current best is IQ ${Math.round(bestIQ(state))}). Software: "${softwareName(spec)}".`
    ]),
    questions,
    'mind'
  )
  const v: MindVerdict = {
    ...baseVerdict('mind', questions, answers, 'feasible', []),
    kind: 'mind',
    spec,
    options: pairTraits(answers),
    choice: 0
  }
  gate(v, 'Jev doesn’t think the AI could build this mind', {
    key: 'same_as',
    names: Object.fromEntries(state.minds.map((m) => [m.id, m.name]))
  })
  return v
}

/**
 * A platform's design: its IQ is a flat step over your best, its traits are the pair the player
 * picked, and its cost grows steeply with the IQ. A mind can always work on its own successor.
 */
export function draftMind(state: GameState, v: MindVerdict): { mind: Mind; minIQ: number; cost: Cost } {
  const read = reader(v)
  const iq = platformIQ(state, v.spec.step)
  const pair = v.options[v.choice] ?? v.options[0]
  const mind = newMind({
    id: makeId(state, v.spec.name),
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    // A risky design cuts corners, and gets more out of the same hardware.
    hardware: { name: hardwareName(v.spec), iq: iq + (v.risk ? B.RISK_IQ_BONUS : 0) },
    software: { name: softwareName(v.spec), iq: 0, upgraded: false },
    traits: pair ? [pair.perk, pair.drawback] : [],
    plausibility: v.plausibility
  })
  return {
    mind,
    minIQ: floorIQ(bestIQ(state)),
    cost: costFor(state, v, B.mindDesignCost(iq), platformPayable(iq, state))
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
