import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { bestIQ, findResource } from './model'
import { lockReason } from './phase'
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
  refuseUnaccepted,
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { incomePayers } from './research'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import type { Cost, GameState, Income } from './types'

/** Passive income: something the AI works out how to get every week, with no units. */
export interface IncomeSpec {
  name: string
  /** How it works, in a line. */
  description: string
  /** The stock resource it yields. */
  outputId: string
  /** A stock it grows with: it yields more the more of this you own. */
  perId?: string | null
}

export interface IncomeVerdict extends VerdictBase {
  kind: 'income'
  spec: IncomeSpec
}

/** Every income, done or waiting as research: [grows with, yields]. */
function growthEdges(state: GameState): [string, string][] {
  const incomes = [
    ...state.incomes,
    ...state.research.flatMap((r) => (r.effect.kind === 'income' ? [r.effect.income] : []))
  ]
  return incomes.flatMap((i) => (i.per ? [[i.per, i.resourceId] as [string, string]] : []))
}

/** Every stock that grows, directly or not, from `from`. */
export function growsFrom(state: GameState, from: string): Set<string> {
  const edges = growthEdges(state)
  const seen = new Set<string>()
  const queue = [from]
  while (queue.length) {
    const at = queue.shift()!
    for (const [a, b] of edges) {
      if (a === at && !seen.has(b)) {
        seen.add(b)
        queue.push(b)
      }
    }
  }
  return seen
}

export function precheckIncome(state: GameState, spec: IncomeSpec): string | null {
  const locked = lockReason(state, 'income')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  const output = findResource(state, spec.outputId)
  if (!output) return state.resources.length ? 'Choose what it yields.' : 'Propose a resource first: something it could yield.'
  if (output.kind !== 'stock') return 'Passive income yields a stock, something that keeps.'
  if (spec.perId) {
    const per = findResource(state, spec.perId)
    if (!per) return 'Unknown resource to grow with.'
    if (per.kind !== 'stock') return 'An income can only grow with a stock, something you own a pile of.'
    if (per.id === output.id) return 'It can’t grow with what it yields.'
    if (growsFrom(state, output.id).has(per.id)) {
      return `That would make a loop: ${per.name} already grows from ${output.name}.`
    }
  }
  return null
}

export async function judgeIncome(state: GameState, judge: Judge, raw: IncomeSpec): Promise<IncomeVerdict> {
  const spec: IncomeSpec = { ...raw, ...cleanText(raw.name, raw.description), perId: raw.perId || null }
  const refusal = precheckIncome(state, spec)
  if (refusal) throw new Error(refusal)
  const output = findResource(state, spec.outputId)!
  const per = spec.perId ? findResource(state, spec.perId) : undefined
  const grows = per ? `, getting more the more ${per.name} it owns` : ''
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could the AI plausibly get ${output.name} this way every week${grows}, once it has worked out how, without owning any units?`
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
    ...payQuestion(state, `how to ${spec.name.toLowerCase()}`, incomePayers(state, output.id)),
    ...alarmQuestions(state)
  }
  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a passive income: something the AI works out once, then gets every week with no units.',
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`,
      `Yields: ${output.name}${per ? `, more for every ${per.name} the AI owns (it doesn't use them up)` : ''}.`
    ]),
    questions,
    'income'
  )
  const v: IncomeVerdict = { ...baseVerdict('income', questions, answers, 'plausible', []), kind: 'income', spec }
  gate(v, 'Jev doesn’t think the AI could get this', null)
  return v
}

/**
 * Phase 1 is a tutorial, so every income can be researched now: one Jev rates harder than your
 * best mind can manage yields like the hardest one it can.
 */
function bandCap(state: GameState): number {
  if (state.phase.n !== 1) return B.INCOME_DIFFICULTY.length - 1
  const iq = bestIQ(state)
  return Math.max(0, B.INCOME_DIFFICULTY.filter(([, minIQ]) => minIQ <= iq).length - 1)
}

/** The income it gives once researched, and what researching it needs. */
export function draftIncome(state: GameState, v: IncomeVerdict): { income: Income; minIQ: number; cost: Cost } {
  const read = reader(v)
  const output = findResource(state, v.spec.outputId)!
  const band = Math.min(read.level('difficulty', B.INCOME_DIFFICULTY.length), bandCap(state))
  const [, minIQ, weekly] = B.pick(B.INCOME_DIFFICULTY, band)
  const efficiency = B.pick(B.EFFICIENCY, read.level('efficiency', B.EFFICIENCY.length))[1]
  const boost = v.risk ? B.RISK_INCOME : 1
  const per = v.spec.perId ? findResource(state, v.spec.perId) : undefined
  const income: Income = per
    ? {
        name: v.spec.name,
        resourceId: output.id,
        // A share of the worth of what it grows with, in the output.
        amount: B.nice((B.pick(B.GROWTH_RATE, band) * efficiency * boost * per.value) / Math.max(1e-9, output.value)),
        per: per.id,
        cap: B.nice((B.GROWTH_CAP * weekly * efficiency * boost) / Math.max(1e-9, output.value))
      }
    : {
        name: v.spec.name,
        resourceId: output.id,
        amount: B.nice((weekly * efficiency * boost) / Math.max(1e-9, output.value))
      }
  // The first income for a resource is paid in lower tiers only: free for tier 0.
  const cost = costFor(state, v, B.INCOME_COST_WEEKS * weekly, incomePayers(state, output.id))
  // Getting something of a higher tier takes a smarter mind. Phase 1 is a tutorial, and its goal is tier 1.
  const tierIQ = state.phase.n === 1 ? 0 : (B.TIERS[output.tier]?.[1] ?? 0)
  return { income, minIQ: floorIQ(Math.max(minIQ, tierIQ)), cost }
}

export function acceptIncome(current: GameState, v: IncomeVerdict): Accepted {
  refuseUnaccepted(v)
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
      effect: { kind: 'income', income },
      risk: v.risk
    })
  )
}
