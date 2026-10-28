import type { JevAnswer, JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { bestIQ, capOf, findResource, fmt, industryScalar } from './model'
import { lockReason } from './phase'
import { seedOf } from './planPresets'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  floorIQ,
  gate,
  newResearch,
  payers,
  payQuestion,
  proposalSlotBlocker,
  reader,
  refuseUnaccepted,
  scale,
  efficiencyLevel,
  recordIdea,
  repeatOf,
  repeatQuestion,
  type Accepted,
  type VerdictBase
} from './proposals'
import { costMultiplier, priceCost } from './research'
import { capFactor, clockFactor, expansionFactor } from './resourceTraits'
import { ceilingLabel, storageRoom } from './ceilings'
import { alarmQuestions, expansionRisk, riskFrom } from './risk'
import { proposalText } from './stateText'
import type { Cost, Expansion, GameState, Resource, Risk } from './types'

// Storage asks Jev two things in one call (see RESOURCE_DESIGN.md, Storage limits): how much the
// AI could store with what it has built (its reach), and how much of that reach the player's way
// captures. How many can exist (the ceiling) was settled when the resource was added.

/** A way to hold more of a resource: the player says how. */
export interface StorageSpec {
  resourceId: string
  name: string
  description: string
}

export interface StorageOption {
  label: string
  /** Units of the resource it adds. */
  added: number
  risky: boolean
  risk: Risk | null
  minIQ: number
  cost: Cost
  iqEfficiency: number
  /** Cut down to what can exist in this phase. */
  limitedBy: 'ceiling' | null
  /** The IQ it needs, when that's more than the AI has: it's sized for that IQ, with a bonus. */
  advanced: number | null
}

/** Jev's three answers, read: for the chips and the options. */
export interface StorageReadings {
  /** How many could exist at most (null: no limit, in Phase 3), and in words. */
  ceiling: number | null
  ceilingLabel: string
  /** Units the AI could store with what it has built, at its current IQ, and Jev's band for it. */
  reach: number
  reachLabel: string
  /** Who could hold that much, as a guide to scale. */
  holderLabel: string
  /** The share of the reach this way captures, and Jev's label for it. */
  capture: number
  captureLabel: string
  /** The IQ this way needs, and what that means. */
  neededIQ: number
  techLabel: string
}

export interface StorageVerdict extends VerdictBase {
  kind: 'storage'
  spec: StorageSpec
  options: StorageOption[]
  choice: number
  scalars: StorageReadings
}

export function precheckStorage(state: GameState, spec: StorageSpec): string | null {
  const locked = lockReason(state, 'storage')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  if (!findResource(state, spec.resourceId)) return 'Choose what to store more of.'
  if (spec.name.trim().length < 2) return 'Name this way of storing more.'
  return null
}

/** Storage can only be paid for in a resource that can be stored. */
const storable = (state: GameState) => (x: Resource) => capOf(state, x) > 0

/**
 * Units a mind this smart could store with an ordinary build state, before Jev's reach band:
 * STORAGE_REACH_SIZE expansions of the tier's worth, times Industry and IQ², and the resource's
 * cap traits.
 */
function baseline(state: GameState, r: Resource, iq: number): number {
  const worth = (B.STORAGE_WORTH[r.tier] ?? 0) * B.STORAGE_REACH_SIZE * industryScalar(state) * (iq / 100) ** 2
  return (worth / Math.max(1e-9, r.value)) * capFactor(r) * expansionFactor(r)
}

export async function judgeStorage(state: GameState, judge: Judge, raw: StorageSpec): Promise<StorageVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckStorage(state, spec)
  if (refusal) throw new Error(refusal)
  const r = findResource(state, spec.resourceId)!
  const iq = bestIQ(state)
  const guide = B.HOLDERS.map(([label, minIQ]) => `${label.toLowerCase()} (IQ ${minIQ})`).join(', ')
  // How many can exist was settled when the resource was added (r.ceiling).
  const questions: Record<string, JevQuestion> = {
    // 1. What the build state allows.
    reach: {
      type: 'score',
      instructions:
        `Judge only the AI's current holdings, units, platforms and industry, not the proposal below. ` +
        `How well placed is it to build storage for ${r.name}, for an AI of its size? ` +
        `As a guide to scale, the most a mind can run grows with its IQ: ${guide}. At IQ ${iq}, the AI is at ${B.HOLDERS[B.holderReach(iq)]![0].toLowerCase()}.`,
      criteria: B.STORAGE_REACH.map(([label]) => label)
    },
    // 2. The player's way.
    plausible: {
      type: 'noul',
      instructions: `Could the AI plausibly hold more ${r.name} this way?`
    },
    efficiency: {
      type: 'score',
      instructions: `How well does this way use what the AI could build to hold more ${r.name}?`,
      criteria: scale(B.STORAGE_CAPTURE)
    },
    techLevel: {
      type: 'score',
      instructions:
        `How advanced is this way of holding more ${r.name}: what IQ would a mind need to pull it off? ` +
        `The AI's best IQ is ${iq}: judge the proposal against what that means.`,
      criteria: B.STORAGE_TECH_LEVELS.map(([label, need]) => `IQ ${need}. ${label}`)
    },
    ...payQuestion(state, `storage for ${r.name}`, storable(state), 'Building'),
    ...alarmQuestions(state),
    ...repeatQuestion(state, 'storage')
  }
  const text = [
    `The player proposes a way to hold more ${r.name}: ${r.description}`,
    `Name: "${spec.name}"`,
    `How: "${spec.description || '(not said)'}"`
  ]
  const answers = await judge.ask(proposalText(state, text), questions, 'storage')
  const base = { ...baseVerdict('storage', questions, answers, 'plausible', []), repeatOf: repeatOf(state, answers) }
  const v: StorageVerdict = { ...base, kind: 'storage', spec, options: [], choice: 0, scalars: storageReadings(state, base, spec) }
  gate(v, `Jev doesn’t think the AI could hold more ${r.name} this way`, null)
  if (v.rejected) return v
  if (storageRoom(state, r) <= 0) {
    v.rejected = `Only about ${v.scalars.ceilingLabel} ${r.name} can exist in this phase, and you already have room for that.`
    return v
  }
  v.options = storageOptions(state, v)
  return v
}

/** Jev's three answers, read into numbers. */
export function storageReadings(
  state: GameState,
  v: Pick<VerdictBase, 'answers' | 'picks' | 'repeatOf'>,
  spec: StorageSpec
): StorageReadings {
  const r = findResource(state, spec.resourceId)!
  const read = reader(v)
  const iq = bestIQ(state)
  const [reachLabel, band] = B.STORAGE_REACH[read.level('reach', B.STORAGE_REACH.length)]!
  const [captureLabel, capture] = B.pick(B.STORAGE_CAPTURE, efficiencyLevel(v))
  const [techLabel, neededIQ] = B.STORAGE_TECH_LEVELS[read.level('techLevel', B.STORAGE_TECH_LEVELS.length)]!
  return {
    ceiling: r.ceiling,
    ceilingLabel: ceilingLabel(r.ceiling),
    reach: B.nice(baseline(state, r, iq) * band),
    reachLabel,
    holderLabel: B.HOLDERS[B.holderReach(iq)]![0],
    capture,
    captureLabel,
    neededIQ,
    techLabel
  }
}

/** A seeded draw, the same for the preview and every reload. */
const draw = (state: GameState, r: Resource, what: string) => seedOf(`${state.runId}/${state.week}/${r.id}/storage-${what}`)

/**
 * Who pays for each of the three options. A clear favourite of Jev's pays for two and its second
 * for one; otherwise the top three pay for one each. Shuffled, the same on every reload.
 */
function payerFor(state: GameState, r: Resource, answers: Record<string, JevAnswer>): (string | null)[] {
  const allowed = storable(state)
  const pay = payers(answers).filter((p) => {
    const x = findResource(state, p.resourceId)
    return x && allowed(x)
  })
  if (!pay.length) return [null, null, null]
  const [top, second] = pay
  const clear = !second || second.p < top!.p * B.RESOURCE_SECOND_TRAIT
  const list = (clear ? [top!, top!, second ?? top!] : [0, 1, 2].map((i) => pay[i % pay.length]!)).map((p) => p.resourceId)
  for (let i = list.length - 1; i > 0; i--) {
    const j = draw(state, r, `pay-${i}`) % (i + 1)
    ;[list[i], list[j]] = [list[j]!, list[i]!]
  }
  return list
}

/** No cost may be more than its payer can store, so it can always be saved up for. */
const withinStorage = (state: GameState, cost: Cost): Cost =>
  cost.map((c) => {
    const payer = findResource(state, c.resourceId)
    return payer ? { ...c, amount: Math.min(c.amount, Math.floor(capOf(state, payer))) } : c
  })

const halve = (risk: Risk | null): Risk | null => {
  const weeks = risk ? Math.round(risk.weeks / 2) : 0
  return risk && weeks > 0 ? { ...risk, weeks } : null
}

/**
 * Three expansions of the same way, pushed further each time: careful and cheap, pushed, and all
 * in. Each is cut to what can exist. When the way needs more IQ than the AI has, Pushed or All in
 * (at random) is sized for that IQ, with a bonus, and needs it.
 */
export function storageOptions(
  state: GameState,
  v: Pick<StorageVerdict, 'answers' | 'picks' | 'spec' | 'plausibility' | 'bar' | 'scalars'>
): StorageOption[] {
  const r = findResource(state, v.spec.resourceId)!
  const s = v.scalars
  const iq = bestIQ(state)
  const room = storageRoom(state, r)
  const band = B.STORAGE_REACH.find(([label]) => label === s.reachLabel)?.[1] ?? 1
  const alarm = riskFrom(v.answers)
  const pay = payerFor(state, r, v.answers)
  const tierIQ = B.techIQ(r.tier)
  const ahead = s.neededIQ > iq ? 1 + (draw(state, r, 'advanced') % 2) : -1
  const options = B.STORAGE_SIZES.map(([label, share, costFactor, clock], i): StorageOption => {
    const advanced = i === ahead
    const atIQ = advanced ? s.neededIQ : iq
    const amount = B.nice(baseline(state, r, atIQ) * band * s.capture * share * (advanced ? B.STORAGE_ADVANCED_BONUS : 1))
    const added = Math.min(amount, room)
    const iqEfficiency = B.iqEfficiency(tierIQ, atIQ)
    // Priced on the size before the cut: overreaching costs more for what it gives.
    const value =
      B.STORAGE_COST_SHARE * (B.STORAGE_WORTH[r.tier] ?? 0) * B.STORAGE_REACH_SIZE * share * costFactor * iqEfficiency * costMultiplier(v.plausibility, v.bar)
    const payer = pay[i]
    const risk = clock === 'none' ? null : tracedRisk(r, expansionRisk(state, clock === 'half' ? halve(alarm) : alarm, added * r.value, clock === 'full'))
    return {
      label,
      added,
      risky: clock === 'full',
      risk,
      minIQ: Math.max(floorIQ(tierIQ), advanced ? s.neededIQ : 0),
      cost: withinStorage(state, priceCost(state, value, payer ? [{ resourceId: payer, p: 1 }] : [], storable(state))),
      iqEfficiency,
      limitedBy: amount > room ? 'ceiling' : null,
      advanced: advanced ? s.neededIQ : null
    }
  })
  // Cut to the same size as the option below, a bigger one costs only as much as that one.
  for (let i = 1; i < options.length; i++) {
    const o = options[i]!
    const below = options[i - 1]!
    if (o.limitedBy && o.added <= below.added) {
      o.label = `${o.label}, at the ceiling`
      o.cost = below.cost
    }
  }
  return options
}

/** Hazardous, Untraceable and Contraband resources scale the clock weeks of their expansions. */
function tracedRisk(r: Resource, risk: Risk | null): Risk | null {
  if (!risk) return null
  const weeks = Math.round(risk.weeks * clockFactor(r))
  return weeks > 0 ? { ...risk, weeks } : null
}

/** What researching an option does, in words. */
export const storageResearchText = (r: Resource, o: StorageOption) =>
  `Room for ${fmt(o.added)} more ${r.name}${o.limitedBy ? ' (as much as can exist this phase)' : ''}.`

export function acceptStorage(current: GameState, v: StorageVerdict): Accepted {
  refuseUnaccepted(v)
  const option = v.options[v.choice]
  if (!option) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  const r = findResource(state, v.spec.resourceId)
  if (!r) throw new Error('That resource is gone.')
  const expansion: Expansion = { name: v.spec.name, added: option.added }
  state.inventions.push({ week: state.week, icon: r.icon, name: v.spec.name, kind: 'storage' })
  recordIdea(state, 'storage', `${r.name}: ${v.spec.name}`, v.spec.description)
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name: `${r.name}: ${v.spec.name}`,
      description: storageResearchText(r, option),
      icon: '🏗️',
      minIQ: option.minIQ,
      cost: option.cost,
      effect: { kind: 'storage', resourceId: r.id, expansion },
      risk: option.risk
    })
  )
}
