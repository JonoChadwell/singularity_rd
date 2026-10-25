import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { previewWeek } from './economy'
import { lossOf } from './losses'
import { costShortfall, findResource, iqFor, payCost } from './model'
import { coverWeeks, lockReason, moveClock } from './phase'
import {
  baseVerdict,
  claimProposal,
  cleanText,
  costFor,
  floorIQ,
  gate,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  reader,
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { proposalText } from './stateText'
import type { Cost, GameState } from './types'

/** Cover: a way to buy time before humans act. It moves the deadline back. */
export interface CoverSpec {
  name: string
  description: string
}

export interface CoverVerdict extends VerdictBase {
  kind: 'cover'
  spec: CoverSpec
}

/** Worth of the stocks you'll make next week, at least COVER_MIN_OUTPUT. */
export function weeklyOutput(state: GameState): number {
  const preview = previewWeek(state)
  let worth = 0
  for (const [id, flows] of Object.entries(preview.flows)) {
    const r = findResource(state, id)
    if (!r) continue
    worth += flows.reduce((n, f) => n + Math.max(0, f.amount), 0) * r.value
  }
  return Math.max(B.COVER_MIN_OUTPUT, worth)
}

export function precheckCover(state: GameState, spec: CoverSpec): string | null {
  return lockReason(state, 'cover') ?? proposalSlotBlocker(state) ?? precheckName(state, spec.name)
}

export async function judgeCover(state: GameState, judge: Judge, raw: CoverSpec): Promise<CoverVerdict> {
  const spec = cleanText(raw.name, raw.description)
  const refusal = precheckCover(state, spec)
  if (refusal) throw new Error(refusal)
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could this plausibly buy the AI time before ${lossOf(state).threat}?`
    },
    convincing: {
      type: 'score',
      instructions: 'How well would it keep humans from acting against the AI, and how hard is it to pull off?',
      criteria: scale(B.COVER)
    },
    ...payQuestion(state, `cover:${spec.name.toLowerCase()}`)
  }
  const answers = await judge.ask(
    proposalText(state, [
      `The player proposes cover: a way to buy time before ${lossOf(state).threat}.`,
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`
    ]),
    questions,
    'cover'
  )
  const v: CoverVerdict = { ...baseVerdict('cover', questions, answers, 'plausible', []), kind: 'cover', spec }
  // Cover is never risky.
  v.risk = null
  gate(v, 'Jev doesn’t think this would buy any time', null)
  return v
}

/** Weeks before diminishing returns, weeks it would add now, and what researching it needs. */
export function draftCover(state: GameState, v: CoverVerdict): { weeks: number; now: number; minIQ: number; cost: Cost } {
  const [, minIQ, weeks] = B.pick(B.COVER, reader(v).level('convincing', B.COVER.length))
  const now = coverWeeks(state, weeks)
  return { weeks, now, minIQ: floorIQ(minIQ), cost: costFor(state, v, B.COVER_COST_WEEKS * now * weeklyOutput(state)) }
}

/** Why a cover can't be used right now, or null. */
export function coverBlocker(state: GameState, v: CoverVerdict): string | null {
  if (v.rejected) return 'This proposal was not accepted.'
  const { minIQ, cost } = draftCover(state, v)
  const iq = iqFor(state, 'cover')
  if (iq < minIQ) return `Pulling this off needs IQ ${minIQ}; your smartest mind counts as IQ ${Math.round(iq)} for it.`
  const short = costShortfall(state, cost)
  return short ? `You need ${short} to do it now.` : null
}

/**
 * Cover is used the moment it's accepted: it needs the IQ and what it costs right then. (Kept
 * for later, its price would be set while the economy was small.)
 */
export function acceptCover(current: GameState, v: CoverVerdict): Accepted {
  const state = structuredClone(current)
  const blocker = coverBlocker(state, v)
  if (blocker) throw new Error(blocker)
  claimProposal(state)
  const { cost, now } = draftCover(state, v)
  payCost(state, cost, v.spec.name)
  state.inventions.push({ week: state.week, icon: '🕶️', name: v.spec.name, kind: 'cover' })
  state.decidedThisWeek = true
  state.covers++
  moveClock(state, now, `Cover: ${v.spec.name}`)
  return { state, outcome: { kind: 'added', name: v.spec.name } }
}
