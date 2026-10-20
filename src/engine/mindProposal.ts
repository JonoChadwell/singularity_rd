import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
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
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { lockReason } from './phase'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import type { Cost, GameState, Mind } from './types'

/** A new intelligence system: a hardware platform with an IQ, running software. */
export interface MindSpec {
  name: string
  description: string
  /** The IQ of its hardware, running its first software. */
  iq: number
  /** The hardware platform's name. Blank means named after the mind. */
  hardware?: string
  /** The software's name. Blank means "Base Model". */
  software?: string
}

export interface MindVerdict extends VerdictBase {
  kind: 'mind'
  spec: MindSpec
}

export const DEFAULT_SOFTWARE = 'Base Model'
const hardwareName = (spec: MindSpec) => spec.hardware?.trim() || spec.name.trim()
const softwareName = (spec: MindSpec) => spec.software?.trim() || DEFAULT_SOFTWARE

/** A starting IQ for the form: the most a typical design could reach from here. */
export const guessIQ = (state: GameState) => Math.max(10, Math.floor(bestIQ(state) / B.DESIGN_BAR / 10) * 10)

export function precheckMind(state: GameState, spec: MindSpec): string | null {
  const locked = lockReason(state, 'mind')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!(spec.iq >= 10 && spec.iq <= 10000)) return 'Set its IQ.'
  const best = Math.round(bestIQ(state))
  if (spec.iq <= best) return `A new intelligence system must be smarter than your best, IQ ${best}.`
  return null
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
    leap: {
      type: 'score',
      instructions: `The smartest mind the AI has is IQ ${Math.round(bestIQ(state))}; this design targets IQ ${spec.iq}. Judging by its description and hardware, how radical a design is it?`,
      criteria: scale(B.LEAP)
    },
    icon: iconQuestion,
    ...payQuestion(state, `the design of ${spec.name}`),
    ...alarmQuestions(state)
  }
  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new intelligence system: one machine that thinks and does research.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Hardware: "${hardwareName(spec)}", IQ ${spec.iq}. Software: "${softwareName(spec)}".`
    ]),
    questions,
    'mind'
  )
  const v: MindVerdict = { ...baseVerdict('mind', questions, answers, 'feasible', []), kind: 'mind', spec }
  gate(v, 'Jev doesn’t think the AI could build this mind', {
    key: 'same_as',
    names: Object.fromEntries(state.minds.map((m) => [m.id, m.name]))
  })
  return v
}

/**
 * The leap rule sets the minimum IQ: designing a mind needs one with a share of its IQ, more
 * for a radical design. The cost grows steeply with the IQ.
 */
export function draftMind(state: GameState, v: MindVerdict): { mind: Mind; minIQ: number; cost: Cost } {
  const read = reader(v)
  const share = B.pick(B.LEAP, read.level('leap', B.LEAP.length))[1]
  const mind = newMind({
    id: makeId(state, v.spec.name),
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    // A risky design cuts corners, and gets more out of the same hardware.
    hardware: { name: hardwareName(v.spec), iq: Math.round(v.spec.iq * (v.risk ? B.RISK_IQ : 1)) },
    software: { name: softwareName(v.spec), bonus: 0 },
    plausibility: v.plausibility
  })
  return { mind, minIQ: floorIQ(v.spec.iq * share), cost: costFor(state, v, B.mindDesignCost(v.spec.iq)) }
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
      description: `Design ${mind.hardware.name} hardware with IQ ${mind.hardware.iq}, running ${mind.software.name}.`,
      icon: mind.icon,
      minIQ,
      cost,
      effect: { kind: 'mind', mind },
      risk: v.risk
    })
  )
}
