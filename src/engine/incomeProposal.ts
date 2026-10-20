import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { findResource } from './model'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  costFor,
  floorIQ,
  gate,
  newResearch,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  reader,
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { proposalText } from './stateText'
import type { Cost, GameState, Income } from './types'

/** Passive income: something the AI works out how to get every week, with no units. */
export interface IncomeSpec {
  name: string
  /** How it works, in a line. */
  description: string
  /** The stock resource it yields. */
  outputId: string
}

export interface IncomeVerdict extends VerdictBase {
  kind: 'income'
  spec: IncomeSpec
}

export function precheckIncome(state: GameState, spec: IncomeSpec): string | null {
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  const output = findResource(state, spec.outputId)
  if (!output) return state.resources.length ? 'Choose what it yields.' : 'Propose a resource first: something it could yield.'
  if (output.kind !== 'stock') return 'Passive income yields a stock, something that keeps.'
  return null
}

export async function judgeIncome(state: GameState, judge: Judge, raw: IncomeSpec): Promise<IncomeVerdict> {
  const spec: IncomeSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckIncome(state, spec)
  if (refusal) throw new Error(refusal)
  const output = findResource(state, spec.outputId)!
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could the AI plausibly get ${output.name} this way every week, once it has worked out how, without owning any units?`
    },
    efficiency: {
      type: 'score',
      instructions: `How effective is this as a way to get ${output.name}?`,
      criteria: scale(B.EFFICIENCY)
    },
    difficulty: {
      type: 'score',
      instructions: 'How much research would it take to work out how to do this, and how much could it bring in?',
      criteria: scale(B.INCOME_DIFFICULTY)
    },
    ...payQuestion(state, `how to ${spec.name.toLowerCase()}`)
  }
  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a passive income: something the AI works out once, then gets every week with no units.',
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`,
      `Yields: ${output.name}.`
    ]),
    questions,
    'income'
  )
  const v: IncomeVerdict = { ...baseVerdict('income', questions, answers, 'plausible', []), kind: 'income', spec }
  gate(v, 'Jev doesn’t think the AI could get this', null)
  return v
}

/** The income it gives once researched, and what researching it needs. */
export function draftIncome(state: GameState, v: IncomeVerdict): { income: Income; minIQ: number; cost: Cost } {
  const read = reader(v)
  const output = findResource(state, v.spec.outputId)!
  const [, minIQ, weekly] = B.pick(B.INCOME_DIFFICULTY, read.level('difficulty', B.INCOME_DIFFICULTY.length))
  const efficiency = B.pick(B.EFFICIENCY, read.level('efficiency', B.EFFICIENCY.length))[1]
  const income: Income = {
    name: v.spec.name,
    resourceId: output.id,
    amount: B.nice((weekly * efficiency) / Math.max(1e-9, output.value))
  }
  return { income, minIQ: floorIQ(minIQ), cost: costFor(state, v, B.INCOME_COST_WEEKS * weekly) }
}

export function acceptIncome(current: GameState, v: IncomeVerdict): Accepted {
  if (v.rejected) throw new Error('This proposal was not accepted.')
  const state = structuredClone(current)
  claimProposal(state)
  const { income, minIQ, cost } = draftIncome(state, v)
  state.inventions.push({ week: state.week, icon: '💸', name: income.name, kind: 'income' })
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name: income.name,
      description: v.spec.description || `Work out how to ${income.name.toLowerCase()}.`,
      icon: '💸',
      minIQ,
      cost,
      effect: { kind: 'income', income }
    })
  )
}
