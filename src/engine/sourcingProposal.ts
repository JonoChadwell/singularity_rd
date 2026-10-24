import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { findUnit, fmt, iqFor, makeId, traitPriceFactor } from './model'
import { lockReason, moveClock } from './phase'
import {
  baseVerdict,
  claimProposal,
  cleanText,
  gate,
  logProposal,
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
import { alarmQuestions, expansionRisk, riskFrom } from './risk'
import { proposalText } from './stateText'
import type { Flow, GameState, Risk, Sourcing } from './types'
import { partPool, priceParts, rankedIds } from './unitProposal'

/** A way to get more of a unit: the player says how; Jev says how many, and from what. */
export interface SourcingSpec {
  unitId: string
  name: string
  description: string
}

export interface SourcingOption {
  label: string
  /** Units the contract allows. */
  total: number
  /** What creating one uses. */
  parts: Flow[]
  risky: boolean
  risk: Risk | null
  /** IQ efficiency baked into its prices: below 1 is a discount. */
  iqEfficiency: number
}

export interface SourcingVerdict extends VerdictBase {
  kind: 'sourcing'
  spec: SourcingSpec
  options: SourcingOption[]
  choice: number
}

export function precheckSourcing(state: GameState, spec: SourcingSpec): string | null {
  const locked = lockReason(state, 'sourcing')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const unit = findUnit(state, spec.unitId)
  if (!unit) return 'Choose which unit to source.'
  if (spec.name.trim().length < 2) return 'Name this way of getting them.'
  if (!partPool(state, unit.tier).length) return `You have nothing at tier ${unit.tier} or below to make ${unit.name} from.`
  return null
}

export async function judgeSourcing(state: GameState, judge: Judge, raw: SourcingSpec): Promise<SourcingVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckSourcing(state, spec)
  if (refusal) throw new Error(refusal)
  const unit = findUnit(state, spec.unitId)!
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could the AI plausibly get ${unit.name} this way?`
    },
    limit: {
      type: 'score',
      instructions: `Realistically, how many ${unit.name} could the AI get this way, before it runs out of suppliers, sites, buyers or patience?`,
      criteria: scale(B.SOURCING_LIMITS)
    },
    efficiency: {
      type: 'score',
      instructions: `How cheap is this way of getting ${unit.name}, for what you get?`,
      criteria: scale(B.EFFICIENCY)
    },
    parts: {
      type: 'choice',
      instructions: `Got this way, which resource would each ${unit.name} most naturally take to make or buy? Advanced things take several kinds, so how likely each is matters too.`,
      criteria: Object.fromEntries(partPool(state, unit.tier).map((r) => [r.id, `${r.name}: ${r.description}`]))
    },
    ...alarmQuestions(state),
    ...repeatQuestion(state, 'sourcing')
  }
  const answers = await judge.ask(
    proposalText(state, [
      `The player proposes a way to get more ${unit.name}: ${unit.description}`,
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`
    ]),
    questions,
    'sourcing'
  )
  const base = baseVerdict('sourcing', questions, answers, 'plausible', [])
  const v: SourcingVerdict = { ...base, kind: 'sourcing', spec, options: [], choice: 0, repeatOf: repeatOf(state, answers) }
  v.options = sourcingOptions(state, v)
  gate(v, `Jev doesn’t think the AI could get ${unit.name} this way`, null)
  return v
}

/**
 * Three contracts, never all quiet and never all risky: a quiet one for fewer units, Jev's own
 * take, and a risky one that cuts corners for many more. Each is made from a different mix of
 * parts where there's a choice.
 */
export function sourcingOptions(state: GameState, v: Pick<SourcingVerdict, 'answers' | 'picks' | 'spec' | 'plausibility' | 'bar' | 'repeatOf'>): SourcingOption[] {
  const read = reader(v)
  const unit = findUnit(state, v.spec.unitId)!
  const limit = read.level('limit', B.SOURCING_LIMITS.length)
  const efficiency = B.pick(B.EFFICIENCY, efficiencyLevel(v))[1]
  const parts = rankedIds(v.answers, 'parts', partPool(state, unit.tier))
  const count = Math.min(parts.length, B.PARTS_BY_TIER[unit.tier] ?? 1)
  const mix = (i: number) => {
    const swap = Math.min(i, parts.length - count)
    return [...parts.slice(0, count - 1), parts[count - 1 + swap]!]
  }
  const alarm = riskFrom(v.answers)
  const tierIQ = B.techIQ(unit.tier)
  const iqEfficiency = B.iqEfficiency(tierIQ, iqFor(state, 'unit'))
  const takes: { label: string; band: number; mult: number; risky: boolean; quiet: boolean }[] = [
    { label: 'Quiet', band: Math.max(0, limit - 1), mult: 1, risky: false, quiet: true },
    { label: 'Jev’s take', band: limit, mult: 1, risky: false, quiet: false },
    { label: 'Cut corners', band: limit, mult: B.RISK_SOURCING, risky: true, quiet: false }
  ]
  return takes.map((t, i) => {
    const total = B.pick(B.SOURCING_LIMITS, t.band)[1] * t.mult
    const each = (unit.value * traitPriceFactor(unit.traits) * iqEfficiency * (t.risky ? B.RISK_PARTS : 1)) / efficiency
    const risk = expansionRisk(state, t.quiet ? null : alarm, total * unit.value, t.risky)
    return {
      label: t.label,
      total,
      parts: priceParts(state, mix(i), each),
      risky: t.risky,
      risk,
      iqEfficiency
    }
  })
}

export function acceptSourcing(current: GameState, v: SourcingVerdict): Accepted {
  refuseUnaccepted(v)
  const option = v.options[v.choice]
  if (!option) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  const unit = findUnit(state, v.spec.unitId)
  if (!unit) throw new Error('That unit is gone.')
  const sourcing: Sourcing = {
    id: makeId(state, `${unit.name} ${v.spec.name}`),
    unitId: unit.id,
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    parts: option.parts,
    total: option.total,
    used: 0,
    risky: option.risky
  }
  state.inventions.push({ week: state.week, icon: unit.icon, name: v.spec.name, kind: 'sourcing' })
  recordIdea(state, 'sourcing', `${unit.name}: ${v.spec.name}`, v.spec.description)
  state.decidedThisWeek = true
  // A contract takes effect at once: no research, and its parts are paid per unit created.
  state.sourcing.push(sourcing)
  if (option.risk?.weeks) moveClock(state, -option.risk.weeks, `${unit.name}: ${v.spec.name} alarmed humans`)
  logProposal(state, 'good', `📦 ${v.spec.name}: up to ${fmt(option.total)} more ${unit.name}. Create them on its card.`)
  return { state, outcome: { kind: 'added', name: v.spec.name } }
}

/** The IQ efficiency as a tag: "IQ: efficient −20%", or null at the usual price. */
export function iqTag(efficiency: number): string | null {
  const off = Math.round((1 - efficiency) * 100)
  return off > 0 ? `IQ: efficient −${off}%` : null
}
