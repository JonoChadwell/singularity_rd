import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { lossOf } from './losses'
import { iqFor } from './model'
import { lockReason } from './phase'
import {
  baseVerdict,
  cleanText,
  costFor,
  gate,
  payerPerTake,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  type VerdictBase
} from './proposals'
import { proposalText } from './stateText'
import type { Cost, GameState } from './types'

// Cover: a way to buy time before the plan's loss condition. Jev offers three sizes, each a
// research that moves the deadline back once. See COVER_DESIGN.md.

export interface CoverSpec {
  name: string
  description: string
}

export interface CoverOption {
  /** Small, Medium or Large. */
  label: string
  minIQ: number
  /** Weeks it adds to the clock. */
  weeks: number
  cost: Cost
}

export interface CoverVerdict extends VerdictBase {
  kind: 'cover'
  spec: CoverSpec
  options: CoverOption[]
  choice: number
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
  const v: CoverVerdict = { ...baseVerdict('cover', questions, answers, 'plausible', []), kind: 'cover', spec, options: [], choice: 0 }
  // Cover is never risky.
  v.risk = null
  v.options = coverOptions(state, v)
  gate(v, 'Jev doesn’t think this would buy any time', null)
  return v
}

/**
 * The size of cover your IQ for it reaches: the biggest in COVER you meet, or the smallest when
 * you meet none (the Starting Server, before its upgrade).
 */
export function coverSize(state: GameState): number {
  const iq = iqFor(state, 'cover')
  let size = 0
  B.COVER.forEach(([, minIQ], i) => {
    if (iq >= minIQ) size = i
  })
  return size
}

/**
 * Three options, smallest first: two at your size, each paid in a different one of Jev's
 * favourite payers, and one a size up. At the top size, the third is a size down instead, for a
 * cheaper cover. Each size has a fixed price, whenever it's proposed.
 */
export function coverOptions(state: GameState, v: Pick<CoverVerdict, 'answers' | 'plausibility' | 'bar'>): CoverOption[] {
  const size = coverSize(state)
  const top = B.COVER.length - 1
  const odd = size < top ? size + 1 : size - 1
  const [first, second] = payerPerTake(v.answers, 2)
  const takes = [
    { size, payer: first },
    { size, payer: second },
    { size: odd, payer: first }
  ].sort((a, b) => a.size - b.size)
  return takes.map((t) => {
    const [label, minIQ, weeks, worth] = B.COVER[t.size]!
    return { label, minIQ, weeks, cost: costFor(state, { ...v, risk: null }, worth, undefined, t.payer) }
  })
}
