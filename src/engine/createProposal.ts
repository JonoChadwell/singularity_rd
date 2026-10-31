import { ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { ceilingLabel, unitRoom } from './ceilings'
import { deliverUnits } from './economy'
import {
  bestIQ,
  capOf,
  findResource,
  findUnit,
  fmt,
  industryScalar,
  industryTier,
  iqFor,
  iqScalar,
  makeId,
  ownedWorth,
  targetLabel,
  traitPriceFactor
} from './model'
import { lockReason, moveClock } from './phase'
import { seedOf } from './planPresets'
import {
  baseVerdict,
  claimProposal,
  cleanText,
  gate,
  ideaKey,
  logProposal,
  options,
  proposalSlotBlocker,
  refuseUnaccepted,
  scale,
  efficiencyLevel,
  reader,
  recordIdea,
  repeatOf,
  repeatQuestion,
  type Accepted,
  type VerdictBase
} from './proposals'
import { spendable } from './research'
import { createInputFactor, createOutputFactor, effectiveTier, fromNothingFactor, type TierPurpose } from './resourceTraits'
import { alarmQuestions, expansionRisk, riskFrom } from './risk'
import { proposalText } from './stateText'
import type { CreateTarget, Flow, GameState, Risk, Sourcing, UnitType } from './types'
import { partPool, priceParts, rankedIds } from './unitProposal'

/**
 * Procurement: the mind gets something directly, from what you have or from nothing. It's an action,
 * not research: no IQ gate, but reaching above your IQ's tier costs output. For a unit, some offers
 * are units now and some are sourcing contracts: room for more, each created later from its parts.
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

/** An offer that pays out the target: now, spread out, later or every week (resources), or now (units). */
export interface PayoutOption {
  timing: B.CreateTiming
  /** What it uses up now. */
  inputs: Flow[]
  /** Worth of the inputs. */
  inputWorth: number
  /** Total worth it delivers over its timing (per week, for every-week ones). */
  outputWorth: number
  /** Amount of the target per delivery: resources, or whole units. */
  amount: number
  /** Units only: cut down to what can exist. */
  limitedBy?: 'ceiling' | null
}

/** A sourcing contract for a unit: room for `total`, each created from `parts`, at no action. */
export interface ContractOption {
  timing: 'contract'
  label: string
  /** Units the contract allows. */
  total: number
  /** What creating one uses. */
  parts: Flow[]
  risky: boolean
  risk: Risk | null
  /** IQ efficiency baked into its prices: below 1 is a discount. */
  iqEfficiency: number
  /** Cut down to what can exist. */
  limitedBy: 'ceiling' | null
}

export type CreateOption = PayoutOption | ContractOption

export const isContract = (o: CreateOption): o is ContractOption => o.timing === 'contract'

export interface CreateVerdict extends VerdictBase {
  kind: 'create'
  spec: CreateSpec
  options: CreateOption[]
  choice: number
  scalars: CreateScalars
  /**
   * Units only: the contract size the player picked, in dollars, and the sizes on offer, biggest
   * first. The biggest is Jev's limit for this way or CONTRACT_SCALE times what you own, whichever
   * is smaller (`sizeLimit` says which).
   */
  size?: number
  sizes?: number[]
  sizeLimit?: 'jev' | 'owned'
}

/** The target's tier, as read for its reach or its payout: a resource's traits may move it. */
function targetTier(state: GameState, t: CreateTarget, purpose: TierPurpose): number {
  if (t.kind === 'unit') return findUnit(state, t.id)?.tier ?? 0
  const r = findResource(state, t.id)
  return r ? effectiveTier(r, purpose) : 0
}

/**
 * What Procurements of the target pay, as a factor: some resource traits make less. Renewable
 * makes more when no resource is used up.
 */
function targetOutput(state: GameState, t: CreateTarget, usesInput: boolean): number {
  const r = t.kind === 'resource' ? findResource(state, t.id) : undefined
  return r ? createOutputFactor(r) * (usesInput ? 1 : fromNothingFactor(r)) : 1
}

export function precheckCreate(state: GameState, spec: CreateSpec): string | null {
  const locked = lockReason(state, 'create')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const thing = spec.target.kind === 'unit' ? findUnit(state, spec.target.id) : findResource(state, spec.target.id)
  if (!thing) return state.resources.length ? 'Choose what to make.' : 'Propose a resource first: something to make.'
  if (spec.name.trim().length < 2) return 'Say what you’re doing, in a few words.'
  if (spec.target.kind === 'unit' && unitRoom(state, thing as UnitType) <= 0) return noRoom(thing as UnitType)
  return null
}

const noRoom = (u: UnitType) =>
  `Only about ${ceilingLabel(u.ceiling)} ${u.name} can exist in this phase, and you already have room for that many.`

/**
 * The reach penalty for a target of this tier: continuous, not banded. Reaching above your IQ's
 * tier costs output, and so does reaching above your industry's (the highest tier of unit that
 * makes anything, at least 1): the stricter of the two applies.
 */
export function reachOf(state: GameState, tier: number): { reach: number; short: number } {
  const short = Math.max(0, tier - B.iqTier(iqFor(state, 'create')), tier - industryTier(state))
  return { reach: B.reachFactor(short), short }
}

/** The resources an option may use up: ones you have, never the target itself. */
const inputPool = (state: GameState, t: CreateTarget) =>
  spendable(state, (r) => r.amount > 0 && !(t.kind === 'resource' && r.id === t.id))

/** What a unit's contracts may be made from: its own tier and below. */
const contractParts = (state: GameState, u: UnitType) => partPool(state, u.tier)

/** Jev's two readings of a way of getting units: a one-off, or a supply to draw on. */
const MODES = {
  now: 'Getting them in one go, right now: buying, building or taking a batch',
  supply: 'Setting up a supply to draw on over time: a deal, a source or a production line'
}

export async function judgeCreate(state: GameState, judge: Judge, raw: CreateSpec): Promise<CreateVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckCreate(state, spec)
  if (refusal) throw new Error(refusal)
  const what = targetLabel(state, spec.target)
  const pool = inputPool(state, spec.target)
  const unit = spec.target.kind === 'unit' ? findUnit(state, spec.target.id)! : null
  const parts = unit ? contractParts(state, unit) : []
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
    ...(unit
      ? {
          mode: {
            type: 'choice',
            instructions: `Is this way of getting ${unit.name} more like getting them in one go, or setting up a supply to draw on over time?`,
            criteria: MODES
          } satisfies JevQuestion,
          limit: {
            type: 'score',
            instructions: `As a supply, realistically how much ${unit.name} could the AI get this way, in dollars, before it runs out of suppliers, sites, buyers or patience? One is worth about ${fmt(unit.value)}.`,
            criteria: scale(B.SOURCING_LIMITS)
          } satisfies JevQuestion,
          ...(parts.length
            ? {
                parts: {
                  type: 'choice',
                  instructions: `Got this way, which resource would each ${unit.name} most naturally take to make or buy? Advanced things take several kinds, so how likely each is matters too.`,
                  criteria: options(parts)
                } satisfies JevQuestion
              }
            : {})
        }
      : {
          timing: {
            type: 'choice',
            instructions: 'How would this most naturally pay out?',
            criteria: Object.fromEntries(B.CREATE_TIMINGS.map(([id, label]) => [id, label]))
          } satisfies JevQuestion
        }),
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
      unit ? `The player has the AI get more ${unit.name}: ${unit.description}` : `The player has the AI make ${what} directly, this once.`,
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`
    ]),
    questions,
    'create'
  )
  const base = { ...baseVerdict('create', questions, answers, 'plausible', []), repeatOf: repeatOf(state, answers, createIdea(spec)) }
  const efficiency = B.pick(B.EFFICIENCY, efficiencyLevel(base))[1]
  const v: CreateVerdict = {
    ...base,
    kind: 'create',
    spec,
    options: [],
    choice: 0,
    scalars: { industry: industryScalar(state), iq: iqScalar(state), efficiency, ...reachOf(state, targetTier(state, spec.target, 'reach')) }
  }
  if (unit) {
    // Suppliers deal on your scale: no bigger than Jev's limit for this way, nor than a multiple of what you own.
    const jev = B.pick(B.SOURCING_LIMITS, reader(v).level('limit', B.SOURCING_LIMITS.length))[1]
    const scale = contractScale(state)
    v.sizes = contractSizes(Math.min(jev, scale))
    v.sizeLimit = jev <= scale ? 'jev' : 'owned'
    v.size = v.sizes[0]
  }
  v.options = createOptions(state, v)
  gate(v, `Jev doesn’t think the AI could get ${what} this way`, null)
  return v
}

/** The biggest contract your scale allows: CONTRACT_SCALE times what you own, never less than CONTRACT_FLOOR. */
export const contractScale = (state: GameState) => Math.max(B.CONTRACT_FLOOR, B.CONTRACT_SCALE * ownedWorth(state))

/** The largest 1-2-5 number below `x`. */
function stepBelow(x: number): number {
  for (let p = 10 ** Math.floor(Math.log10(x)); p >= 1; p /= 10) {
    for (const m of [5, 2, 1]) if (m * p < x - 1e-9) return m * p
  }
  return 0
}

/** The sizes on offer: the biggest (to two figures), then 1-2-5 steps down, CONTRACT_SIZES in all at most. */
export function contractSizes(biggest: number): number[] {
  const p = 10 ** (Math.floor(Math.log10(Math.max(1, biggest))) - 1)
  const out = [Math.max(1, Math.floor(biggest / p) * p)]
  for (let step = stepBelow(out[0]!); out.length < B.CONTRACT_SIZES && step >= 1; step = stepBelow(step)) out.push(step)
  return out
}

/** Sets the contract size (one of those on offer) and redoes the offers. */
export function resizeContracts(state: GameState, v: CreateVerdict, size: number) {
  v.size = v.sizes?.includes(size) ? size : (v.sizes?.[0] ?? size)
  v.options = createOptions(state, v)
}

/** A Procurement's idea key: the same name for the same target is the same idea. */
const createIdea = (spec: CreateSpec) => ({ kind: 'create' as const, key: ideaKey(`${spec.target.kind}:${spec.target.id}`, spec.name) })

type OptionsOf = Pick<CreateVerdict, 'answers' | 'picks' | 'spec' | 'scalars' | 'risk' | 'plausibility' | 'bar' | 'repeatOf' | 'size'>

/**
 * Three offers in Jev's order. A resource's each use a different resource (or nothing) and pay
 * out a different way. A unit's are a mix of units now and sourcing contracts. When the target is
 * easy for your IQ, a payout now is free.
 */
export function createOptions(state: GameState, v: OptionsOf): CreateOption[] {
  if (v.spec.target.kind === 'unit') return unitOptions(state, v)
  const timingOrder = [...new Set([...(v.answers.timing ? ranked(v.answers.timing).map(([id]) => id) : []), ...B.CREATE_TIMINGS.map(([id]) => id)])] as B.CreateTiming[]
  return payouts(state, v, timingOrder.slice(0, B.CREATE_OPTIONS))
}

/** Payout offers at these timings, each using a different input (or nothing), one free when easy. */
function payouts(state: GameState, v: OptionsOf, timings: B.CreateTiming[]): PayoutOption[] {
  const pool = inputPool(state, v.spec.target)
  const named = v.answers.inputs ? ranked(v.answers.inputs).map(([id]) => id) : []
  const inputIds: (string | null)[] = [...new Set([...named, ...pool.map((r) => r.id)])].filter((id) => pool.some((r) => r.id === id))
  const picks = timings.map((timing, i) => ({ id: inputIds[i] ?? null, timing }))
  const tier = targetTier(state, v.spec.target, 'reach')
  const easy = B.techIQ(tier) <= bestIQ(state) * B.CREATE_EASY
  if (easy && picks.length && !picks.some((p) => p.id === null && p.timing === 'now')) picks[picks.length - 1] = { id: null, timing: 'now' }
  return picks.map((p) => priceOption(state, v, p.id, p.timing))
}

/** A seeded draw in [0, 1), the same for the preview and every reload. */
const draw = (state: GameState, unitId: string, what: string) => (seedOf(`${state.runId}/${state.week}/${unitId}/procure-${what}`) % 10000) / 10000

/** The three takes a contract can be: Jev's own, a quiet one a tenth the size, and one that cuts corners. */
const TAKES = [
  { label: 'Jev’s take', share: 1, mult: 1, risky: false, quiet: false },
  { label: 'Quiet', share: B.QUIET_SHARE, mult: 1, risky: false, quiet: true },
  { label: 'Cut corners', share: 1, mult: B.RISK_SOURCING, risky: true, quiet: false }
] as const

/**
 * A unit's three offers. The first is what Jev thinks the way is most like: units now, or a
 * contract. Each of the others is drawn by seed, more often the kind Jev leans to, so the offers
 * vary. Units now each use a different input; contracts are each a different take with its own
 * parts. A unit with nothing to be made from only gets units now.
 */
function unitOptions(state: GameState, v: OptionsOf): CreateOption[] {
  const unit = findUnit(state, v.spec.target.id)!
  const mode: Record<string, number> = v.answers.mode ? Object.fromEntries(ranked(v.answers.mode)) : {}
  const [now, supply] = [mode.now ?? 0, mode.supply ?? 0]
  const pNow = now + supply > 0 ? now / (now + supply) : 0.5
  const canContract = contractParts(state, unit).length > 0
  const [lo, hi] = B.PROCURE_NOW_ODDS
  const odds = Math.min(hi, Math.max(lo, pNow))
  const kinds = Array.from({ length: B.CREATE_OPTIONS }, (_, i) => {
    if (!canContract) return 'now'
    if (i === 0) return pNow >= 0.5 ? 'now' : 'contract'
    return draw(state, unit.id, `kind-${i}`) < odds ? 'now' : 'contract'
  })
  const nows = payouts(state, v, kinds.filter((k) => k === 'now').map(() => 'now' as const))
  // Jev's own take first, the other two in a seeded order.
  const rest = draw(state, unit.id, 'takes') < 0.5 ? [TAKES[1], TAKES[2]] : [TAKES[2], TAKES[1]]
  const contracts = contractOptions(state, v, unit, [TAKES[0], ...rest].slice(0, kinds.filter((k) => k === 'contract').length))
  const room = unitRoom(state, unit)
  return kinds.map((k) => {
    if (k === 'contract') return contracts.shift()!
    const o = nows.shift()!
    return o.amount > room ? { ...o, amount: room, limitedBy: 'ceiling' } : { ...o, limitedBy: null }
  })
}

/**
 * Contracts for these takes at the picked size (Jev's limit when none is set), each from a
 * different mix of parts where there's a choice, cut to what can exist.
 */
function contractOptions(state: GameState, v: OptionsOf, unit: UnitType, takes: (typeof TAKES)[number][]): ContractOption[] {
  const size = v.size ?? B.pick(B.SOURCING_LIMITS, reader(v).level('limit', B.SOURCING_LIMITS.length))[1]
  const efficiency = B.pick(B.EFFICIENCY, efficiencyLevel(v))[1]
  const parts = rankedIds(v.answers, 'parts', contractParts(state, unit))
  const count = Math.min(parts.length, B.PARTS_BY_TIER[unit.tier] ?? 1)
  const mix = (i: number) => {
    const swap = Math.min(i, parts.length - count)
    return [...parts.slice(0, count - 1), parts[count - 1 + swap]!]
  }
  const alarm = riskFrom(v.answers)
  const iqEfficiency = B.iqEfficiency(B.techIQ(unit.tier), iqFor(state, 'unit'))
  const room = unitRoom(state, unit)
  return takes.map((t, i) => {
    // Sized in dollars, so a contract of dear units has fewer of them: never less than one.
    const wanted = Math.max(1, Math.floor((size * t.share * t.mult) / unit.value))
    const total = Math.min(wanted, room)
    const each = (unit.value * traitPriceFactor(unit.traits) * iqEfficiency * (t.risky ? B.RISK_PARTS : 1)) / efficiency
    return {
      timing: 'contract',
      label: t.label,
      total,
      parts: priceParts(state, mix(i), each),
      risky: t.risky,
      risk: expansionRisk(state, t.quiet ? null : alarm, total * unit.value, t.risky),
      iqEfficiency,
      limitedBy: wanted > room ? 'ceiling' : null
    }
  })
}

function priceOption(state: GameState, v: Pick<CreateVerdict, 'spec' | 'scalars' | 'risk'>, inputId: string | null, timing: B.CreateTiming): PayoutOption {
  const { industry, iq, efficiency, reach } = v.scalars
  const base = B.CREATE_WORTH * industry * iq
  // The input is paid in full now, whatever the timing: it's worth what the mind would make
  // (before timing), so Efficiency and Reach shrink it too. Never more than you hold.
  const input = inputId ? findResource(state, inputId) : undefined
  const usual = input ? B.nice((base * B.CREATE_INPUT_SHARE * efficiency * reach) / input.value) : 0
  // Paid now, it can convert a share of a big stock instead: a surplus turned into what you need.
  const convert = input && timing === 'now' ? B.nice(input.amount * B.CREATE_CONVERT_SHARE) : 0
  const amount = input ? Math.min(Math.max(usual, convert), input.amount) : 0
  // Hazardous inputs count for more than their worth.
  const inputWorth = input ? amount * input.value * createInputFactor(input) : 0
  const inputs = input && amount > 0 ? [{ resourceId: input.id, amount }] : []
  const [, , mult, weeks] = B.CREATE_TIMINGS.find(([id]) => id === timing)!
  const risky = v.risk ? B.RISK_OUTPUT : 1
  const outputWorth =
    (inputWorth * B.CREATE_INPUT_RETURN + base) * efficiency * reach * mult * risky * targetOutput(state, v.spec.target, inputs.length > 0)
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

/** An option's payout in words: "+300 💰 Money now", "+40 🤖 Robots a week for 4 weeks", "Room for 600 🤖 Robots". */
export function describeOption(state: GameState, v: Pick<CreateVerdict, 'spec'>, o: CreateOption): string {
  if (isContract(o)) return `Room for ${fmt(o.total)} ${targetLabel(state, v.spec.target)}`
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
  if (v.spec.target.kind !== 'resource' || isContract(o)) return 0
  const r = findResource(state, v.spec.target.id)
  if (!r) return 0
  const used = o.inputs.find((f) => f.resourceId === r.id)?.amount ?? 0
  return Math.max(0, r.amount - used + o.amount - capOf(state, r))
}

/** Why an option can't be taken, or null. */
export function optionBlocker(state: GameState, o: CreateOption): string | null {
  if (isContract(o)) return o.total <= 0 ? 'No room for any more.' : null
  if (o.amount <= 0) return 'Too little to make even one.'
  for (const f of o.inputs) {
    const r = findResource(state, f.resourceId)
    if (!r || r.amount < f.amount - 1e-9) return `You need ${fmt(f.amount - (r?.amount ?? 0))} more ${r?.name ?? '?'}.`
  }
  return null
}

/** The IQ efficiency as a tag: "IQ: efficient −20%", or null at the usual price. */
export function iqTag(efficiency: number): string | null {
  const off = Math.round((1 - efficiency) * 100)
  return off > 0 ? `IQ: efficient −${off}%` : null
}

export function acceptCreate(current: GameState, v: CreateVerdict): Accepted {
  refuseUnaccepted(v)
  const option = v.options[v.choice]
  if (!option) throw new Error('Choose one of the options.')
  const blocked = optionBlocker(current, option)
  if (blocked) throw new Error(blocked)
  const state = structuredClone(current)
  claimProposal(state)
  const t = v.spec.target
  const name = v.spec.name
  recordIdea(state, 'create', name, `${v.spec.description} (makes ${targetLabel(state, t)})`, createIdea(v.spec).key)
  state.decidedThisWeek = true
  if (isContract(option)) {
    // A contract takes effect at once: no research, and its parts are paid per unit created.
    const unit = findUnit(state, t.id)
    if (!unit) throw new Error('That unit is gone.')
    const contract: Sourcing = {
      id: makeId(state, `${unit.name} ${name}`),
      unitId: unit.id,
      name,
      description: v.spec.description || name,
      parts: option.parts,
      total: option.total,
      used: 0,
      risky: option.risky
    }
    state.sourcing.push(contract)
    state.inventions.push({ week: state.week, icon: unit.icon, name, kind: 'create' })
    if (option.risk?.weeks) moveClock(state, -option.risk.weeks, `${unit.name}: ${name} brought failure closer`)
    logProposal(state, 'good', `📦 ${name}: up to ${fmt(option.total)} more ${unit.name}. Create them on its card.`)
    return { state, outcome: { kind: 'added', name } }
  }
  for (const f of option.inputs) findResource(state, f.resourceId)!.amount -= f.amount
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
  if (v.risk) moveClock(state, -v.risk.weeks, `${name} brought failure closer`)
  state.inventions.push({ week: state.week, icon: '⚗️', name, kind: 'create' })
  logProposal(state, 'good', `⚗️ ${name}: ${describeOption(state, v, option)}.`)
  return { state, outcome: { kind: 'added', name } }
}
