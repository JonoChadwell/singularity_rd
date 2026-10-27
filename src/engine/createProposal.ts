import { ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { deliverUnits } from './economy'
import { bestIQ, capOf, findResource, findUnit, fmt, industryScalar, iqFor, iqScalar, targetLabel, traitPriceFactor } from './model'
import { lockReason, moveClock } from './phase'
import {
  baseVerdict,
  claimProposal,
  cleanText,
  gate,
  logProposal,
  options,
  proposalSlotBlocker,
  refuseUnaccepted,
  scale,
  efficiencyLevel,
  recordIdea,
  repeatOf,
  repeatQuestion,
  type Accepted,
  type VerdictBase
} from './proposals'
import { spendable } from './research'
import { createInputFactor, createOutputFactor, effectiveTier, type TierPurpose } from './resourceTraits'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import type { CreateTarget, Flow, GameState } from './types'

/**
 * Procurement: the mind gets something directly, from what you have or from nothing. It's an action,
 * not research: no IQ gate, but reaching above your IQ's tier costs output.
 */
export interface CreateSpec {
  target: CreateTarget
  name: string
  description: string
}

/** The four factors on every option, shown as chips. */
export interface CreateScalars {
  industry: number
  iq: number
  efficiency: number
  /** Reaching above your IQ's tier: 1 when you don't. */
  reach: number
  /** How many tiers short your IQ is (0 when it isn't). */
  short: number
}

export interface CreateOption {
  timing: B.CreateTiming
  /** What it uses up now. */
  inputs: Flow[]
  /** Worth of the inputs. */
  inputWorth: number
  /** Total worth it delivers over its timing (per week, for every-week ones). */
  outputWorth: number
  /** Amount of the target per delivery: resources, or whole units. */
  amount: number
}

export interface CreateVerdict extends VerdictBase {
  kind: 'create'
  spec: CreateSpec
  options: CreateOption[]
  choice: number
  scalars: CreateScalars
}

/** The target's tier, as read for its reach or its payout: a resource's traits may move it. */
function targetTier(state: GameState, t: CreateTarget, purpose: TierPurpose): number {
  if (t.kind === 'unit') return findUnit(state, t.id)?.tier ?? 0
  const r = findResource(state, t.id)
  return r ? effectiveTier(r, purpose) : 0
}

/** What Procurements of the target pay, as a factor: some resource traits make less. */
function targetOutput(state: GameState, t: CreateTarget): number {
  const r = t.kind === 'resource' ? findResource(state, t.id) : undefined
  return r ? createOutputFactor(r) : 1
}

export function precheckCreate(state: GameState, spec: CreateSpec): string | null {
  const locked = lockReason(state, 'create')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const thing = spec.target.kind === 'unit' ? findUnit(state, spec.target.id) : findResource(state, spec.target.id)
  if (!thing) return state.resources.length ? 'Choose what to make.' : 'Propose a resource first: something to make.'
  if (spec.name.trim().length < 2) return 'Say what you’re doing, in a few words.'
  return null
}

/** The reach penalty for a target of this tier, at your IQ: continuous, not banded. */
export function reachOf(state: GameState, tier: number): { reach: number; short: number } {
  const short = Math.max(0, tier - B.iqTier(iqFor(state, 'create')))
  return { reach: B.reachFactor(short), short }
}

/** The resources an option may use up: ones you have, never the target itself. */
const inputPool = (state: GameState, t: CreateTarget) =>
  spendable(state, (r) => r.amount > 0 && !(t.kind === 'resource' && r.id === t.id))

export async function judgeCreate(state: GameState, judge: Judge, raw: CreateSpec): Promise<CreateVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckCreate(state, spec)
  if (refusal) throw new Error(refusal)
  const what = targetLabel(state, spec.target)
  const pool = inputPool(state, spec.target)
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could the AI plausibly get ${what} this way?`
    },
    efficiency: {
      type: 'score',
      instructions: `How effective is this as a way to get ${what}?`,
      criteria: scale(B.EFFICIENCY)
    },
    timing: {
      type: 'choice',
      instructions: 'How would this most naturally pay out?',
      criteria: Object.fromEntries(B.CREATE_TIMINGS.map(([id, label]) => [id, label]))
    },
    ...(pool.length
      ? {
          inputs: {
            type: 'choice',
            instructions: `Which of the AI's resources would this most naturally use up?`,
            criteria: options(pool)
          } satisfies JevQuestion
        }
      : {}),
    ...alarmQuestions(state),
    ...repeatQuestion(state, 'create')
  }
  const answers = await judge.ask(
    proposalText(state, [
      `The player has the AI make ${what} directly, this once.`,
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`
    ]),
    questions,
    'create'
  )
  const base = { ...baseVerdict('create', questions, answers, 'plausible', []), repeatOf: repeatOf(state, answers) }
  const efficiency = B.pick(B.EFFICIENCY, efficiencyLevel(base))[1]
  const v: CreateVerdict = {
    ...base,
    kind: 'create',
    spec,
    options: [],
    choice: 0,
    scalars: { industry: industryScalar(state), iq: iqScalar(state), efficiency, ...reachOf(state, targetTier(state, spec.target, 'reach')) }
  }
  v.options = createOptions(state, v)
  gate(v, `Jev doesn’t think the AI could get ${what} this way`, null)
  return v
}

/**
 * Three offers, each using a different resource (or nothing) and paying out a different way, in
 * Jev's order. When the target is easy for your IQ, one is always free and immediate.
 */
export function createOptions(state: GameState, v: Pick<CreateVerdict, 'answers' | 'spec' | 'scalars' | 'risk'>): CreateOption[] {
  const pool = inputPool(state, v.spec.target)
  const named = v.answers.inputs ? ranked(v.answers.inputs).map(([id]) => id) : []
  const inputIds: (string | null)[] = [...new Set([...named, ...pool.map((r) => r.id)])].filter((id) => pool.some((r) => r.id === id))
  const ids = Array.from({ length: B.CREATE_OPTIONS }, (_, i) => inputIds[i] ?? null)
  const timingOrder = [...new Set([...(v.answers.timing ? ranked(v.answers.timing).map(([id]) => id) : []), ...B.CREATE_TIMINGS.map(([id]) => id)])] as B.CreateTiming[]
  const picks = ids.map((id, i) => ({ id, timing: timingOrder[i % timingOrder.length]! }))
  const tier = targetTier(state, v.spec.target, 'reach')
  const easy = B.techIQ(tier) <= bestIQ(state) * B.CREATE_EASY
  if (easy && !picks.some((p) => p.id === null && p.timing === 'now')) picks[picks.length - 1] = { id: null, timing: 'now' }
  return picks.map((p) => priceOption(state, v, p.id, p.timing))
}

function priceOption(
  state: GameState,
  v: Pick<CreateVerdict, 'spec' | 'scalars' | 'risk'>,
  inputId: string | null,
  timing: B.CreateTiming
): CreateOption {
  const { industry, iq, efficiency, reach } = v.scalars
  const base = B.CREATE_WORTH * industry * iq
  // The input is paid in full now, whatever the timing: it's worth what the mind would make
  // (before timing), so Efficiency and Reach shrink it too. Never more than you hold.
  const input = inputId ? findResource(state, inputId) : undefined
  const wanted = input ? B.nice((base * B.CREATE_INPUT_SHARE * efficiency * reach) / input.value) : 0
  const amount = input ? Math.min(wanted, input.amount) : 0
  // Hazardous inputs count for more than their worth.
  const inputWorth = input ? amount * input.value * createInputFactor(input) : 0
  const inputs = input && amount > 0 ? [{ resourceId: input.id, amount }] : []
  const [, , mult, weeks] = B.CREATE_TIMINGS.find(([id]) => id === timing)!
  const risky = v.risk ? B.RISK_OUTPUT : 1
  const outputWorth =
    (inputWorth * B.CREATE_INPUT_RETURN + base) * efficiency * reach * mult * risky * targetOutput(state, v.spec.target)
  const perDelivery = timing === 'spread' || timing === 'weekly' ? outputWorth / weeks : outputWorth
  return { timing, inputs, inputWorth, outputWorth, amount: amountOf(state, v.spec.target, perDelivery) }
}

/** How much of the target a worth buys: resources at their value, units at a premium over sourcing. */
function amountOf(state: GameState, t: CreateTarget, worth: number): number {
  if (t.kind === 'resource') return B.nice(worth / Math.max(1e-9, findResource(state, t.id)?.value ?? 1))
  const u = findUnit(state, t.id)
  if (!u) return 0
  return Math.floor(worth / (u.value * traitPriceFactor(u.traits) * B.CREATE_UNIT_PREMIUM) + 1e-9)
}

/** An option's payout in words: "+300 💰 Money now", "+40 🤖 Robots a week for 4 weeks". */
export function describeOption(state: GameState, v: Pick<CreateVerdict, 'spec'>, o: CreateOption): string {
  const what = `+${fmt(o.amount)} ${targetLabel(state, v.spec.target)}`
  switch (o.timing) {
    case 'now':
      return `${what} now`
    case 'spread':
      return `${what} a week for 4 weeks`
    case 'later':
      return `${what} in 4 weeks`
    case 'weekly':
      return `${what} a week for 20 weeks`
  }
}

/** How much of an option's first payout won't fit in storage (resources only), or 0. */
export function overflowOf(state: GameState, v: Pick<CreateVerdict, 'spec'>, o: CreateOption): number {
  if (v.spec.target.kind !== 'resource') return 0
  const r = findResource(state, v.spec.target.id)
  if (!r) return 0
  const used = o.inputs.find((f) => f.resourceId === r.id)?.amount ?? 0
  return Math.max(0, r.amount - used + o.amount - capOf(state, r))
}

/** Why an option can't be taken, or null. */
export function optionBlocker(state: GameState, o: CreateOption): string | null {
  if (o.amount <= 0) return 'Too little to make even one.'
  for (const f of o.inputs) {
    const r = findResource(state, f.resourceId)
    if (!r || r.amount < f.amount - 1e-9) return `You need ${fmt(f.amount - (r?.amount ?? 0))} more ${r?.name ?? '?'}.`
  }
  return null
}

export function acceptCreate(current: GameState, v: CreateVerdict): Accepted {
  refuseUnaccepted(v)
  const option = v.options[v.choice]
  if (!option) throw new Error('Choose one of the options.')
  const blocked = optionBlocker(current, option)
  if (blocked) throw new Error(blocked)
  const state = structuredClone(current)
  claimProposal(state)
  for (const f of option.inputs) findResource(state, f.resourceId)!.amount -= f.amount
  const t = v.spec.target
  const name = v.spec.name
  if (option.timing === 'now') {
    if (t.kind === 'resource') findResource(state, t.id)!.amount += option.amount
    else deliverUnits(state, findUnit(state, t.id)!, option.amount)
  } else {
    const [, , , weeks] = B.CREATE_TIMINGS.find(([id]) => id === option.timing)!
    state.deliveries.push({
      name,
      target: { ...t },
      amount: option.amount,
      delay: option.timing === 'later' ? weeks - 1 : 0,
      weeks: option.timing === 'later' ? 1 : weeks
    })
  }
  if (v.risk) moveClock(state, -v.risk.weeks, `${name} alarmed humans`)
  state.inventions.push({ week: state.week, icon: '⚗️', name, kind: 'create' })
  recordIdea(state, 'create', name, `${v.spec.description} (makes ${targetLabel(state, t)})`)
  state.decidedThisWeek = true
  logProposal(state, 'good', `⚗️ ${name}: ${describeOption(state, v, option)}.`)
  return { state, outcome: { kind: 'added', name } }
}
