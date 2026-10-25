import { ranked, type JevAnswer, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { byTier, findResource, findUnit, makeId } from './model'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  costFor,
  floorIQ,
  gate,
  iconQuestion,
  logProposal,
  newResearch,
  options,
  payerPerTake,
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
import { addUnit, crewPer } from './research'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import { ALL_TRAITS, TRAITS, type TraitId } from './traits'
import { costFactor } from './resourceTraits'
import type { Cost, Flow, GameState, Resource, UnitType } from './types'
import { newUnit } from './initialState'

export interface UnitSpec {
  name: string
  description: string
  /** Phase 2's first unit, from the plan: free, designed at once, with a small contract. */
  first?: boolean
}

export interface TraitOdds {
  trait: TraitId
  p: number
  param: string | null
}

/**
 * One way Jev could see the unit: how advanced it is, how much one is worth (a value band), and
 * what it runs on, which is never above its own tier. What it's made from is a matter for each
 * sourcing contract.
 */
export interface UnitOption {
  tier: number
  band: number
  /** What it runs on each week. */
  upkeepId: string
  /** Its traits: part of the take, so a near-the-line trait is on in one take and off in another. */
  traits: TraitId[]
  /** The stock its design research uses up: one of Jev's favourites, a different one for each take when it can. */
  pay?: string
}

export interface UnitVerdict extends VerdictBase {
  kind: 'unit'
  spec: UnitSpec
  /** Jev's takes on tier, value, upkeep and traits, best first, never two alike. The player picks one. */
  options: UnitOption[]
  /** Which option the player picked. */
  choice: number
  /** What Jev thought of each trait, kept for the traits' parameters (a crew unit, a by-product). */
  traitOdds: TraitOdds[]
}

/** Question keys use underscores. */
const key = (id: string) => id.replace(/-/g, '_')

/** A blank form. */
export const guessUnitSpec = (): UnitSpec => ({ name: '', description: '' })

/** The resources a unit of this tier may be made from: its own tier and below, lowest first. */
export const partPool = (state: GameState, tier: number): Resource[] =>
  byTier(state.resources).filter((r) => r.tier <= tier)

/** What a unit of this tier may run on: its own tier and below, lowest first. */
export const runPool = partPool

export function precheckUnit(state: GameState, spec: UnitSpec): string | null {
  const locked = lockReason(state, 'unit')
  if (locked) return locked
  if (spec.first && !state.phase.firstUnit) return 'Your first unit is already designed.'
  const slot = spec.first ? null : proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!state.resources.length) return 'Propose a resource first: a unit runs on one.'
  // The first unit is tier 0, so it needs something at tier 0 to be made from and run on.
  if (spec.first && !partPool(state, 0).length) return 'You need a tier 0 resource to make your first unit from.'
  return null
}

function paramOptions(state: GameState, param: NonNullable<(typeof TRAITS)[TraitId]['param']>): Record<string, string> {
  return param === 'unit' ? options(state.units) : options(state.resources)
}

export async function judgeUnit(state: GameState, judge: Judge, raw: UnitSpec): Promise<UnitVerdict> {
  const spec: UnitSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckUnit(state, spec)
  if (refusal) throw new Error(refusal)
  const tiers = unitTiers(state, !!spec.first)
  const pools = poolQuestions(state, spec.name, tiers)

  const questions: Record<string, JevQuestion> = {
    feasible: {
      type: 'noul',
      instructions: `Could the AI plausibly come to own these, perhaps after designing them? Advanced ideas can still pass; they just cost more research.`
    },
    same_as: {
      type: 'choice',
      instructions: 'Is it exactly the same as a unit that already exists, just renamed?',
      criteria: { none: 'It is a different unit', ...options(state.units) }
    },
    // Jev decides what it runs on, from nothing above its own tier.
    ...pools,
    icon: iconQuestion,
    value: {
      type: 'score',
      instructions: 'How much is a single one worth?',
      criteria: scale(B.UNIT_VALUE.slice(0, spec.first ? B.FIRST_UNIT_MAX_BAND + 1 : undefined))
    },
    // The plan's first unit is always basic, so there's nothing to ask.
    ...(spec.first
      ? {}
      : {
          tier: {
            type: 'score',
            instructions:
              'How advanced is it? A basic unit works today with ordinary parts; the higher tiers are later in the AI’s journey and take a chain of other things to make. A unit’s price says nothing about this: a cheap unit can be very advanced, and an expensive one basic.',
            criteria: B.UNIT_TIERS.slice(0, B.MAX_UNIT_TIER + 1)
          } satisfies JevQuestion
        }),
    ...payQuestion(state, `the design of ${spec.name}`),
    // The plan's first unit is part of the plan, so it's never risky.
    ...(spec.first ? {} : alarmQuestions(state))
  }
  questions.upkeep_0 = {
    type: 'score',
    instructions: 'How much of what it runs on does one need each week, compared with the work it does?',
    criteria: scale(B.UPKEEP_SIZE)
  }
  const traitList = ALL_TRAITS.filter((t) => !t.param || Object.keys(paramOptions(state, t.param)).length)
  for (const t of traitList) {
    questions[`trait_${key(t.id)}`] = { type: 'noul', instructions: `${t.question} (Trait: ${t.name}. ${t.rule})` }
    if (t.param) {
      questions[`param_${key(t.id)}`] = {
        type: 'choice',
        instructions:
          t.param === 'unit'
            ? t.id === 'needs-crew'
              ? 'If it needs operators, which unit would operate it?'
              : 'If it makes another unit work better, which one?'
            : t.id === 'stores'
              ? 'If it stores something, which resource?'
              : 'If it makes a by-product, which resource?',
        criteria: paramOptions(state, t.param)
      }
    }
  }

  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new industry unit: something the AI can own many of.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`
    ]),
    questions,
    'unit'
  )

  const read = reader({ answers, picks: {} })
  const traitOdds: TraitOdds[] = traitList
    .map((t) => ({
      trait: t.id,
      p: read.noul(`trait_${key(t.id)}`),
      param: t.param ? read.choice(`param_${key(t.id)}`, Object.keys(paramOptions(state, t.param))) : null
    }))
    .filter((t) => t.p >= B.TRAIT_NEAR)
    .sort((a, b) => b.p - a.p)

  // Jev sets a unit's costs, not the player: no trade-offs to settle, only which take to go with.
  const base = baseVerdict('unit', questions, answers, 'feasible', [])
  const v: UnitVerdict = {
    ...base,
    kind: 'unit',
    spec,
    options: unitOptions(state, answers, tiers, pools, !!spec.first, traitOdds),
    choice: 0,
    traitOdds
  }
  gate(v, 'Jev doesn’t think the AI could come to own these', {
    key: 'same_as',
    names: Object.fromEntries(state.units.map((u) => [u.id, u.name]))
  })
  return v
}

/**
 * The tiers a unit may be. The plan's first unit is tier 0; any other can be as low as there is
 * a resource for it to run on, up to the top.
 */
function unitTiers(state: GameState, first: boolean): number[] {
  if (first) return [0]
  return Array.from({ length: B.MAX_UNIT_TIER + 1 }, (_, t) => t).filter((t) => runPool(state, t).length > 0)
}

/** The question that settles what a unit of this tier runs on, keyed `runs_t<tier>`. */
const runsKey = (tier: number, questions: Record<string, JevQuestion>) => {
  for (let t = tier; t >= 0; t--) if (questions[`runs_t${t}`]) return `runs_t${t}`
  return `runs_t${tier}`
}

/**
 * Questions asking Jev what a unit runs on, once for each distinct set of resources its tier
 * allows (nothing above its own tier), so tiers that allow the same share one.
 */
function poolQuestions(state: GameState, name: string, tiers: number[]): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {}
  const asked = new Set<string>()
  for (const tier of tiers) {
    const things = runPool(state, tier)
    const set = things.map((r) => r.id).join(',')
    if (asked.has(set)) continue
    asked.add(set)
    questions[`runs_t${tier}`] = {
      type: 'choice',
      instructions: `Which one resource would one ${name} most naturally run on each week, to operate and maintain it?`,
      criteria: options(things)
    }
  }
  return questions
}

/**
 * Every resource in a pool, Jev's picks first and most likely first. Those it didn't name follow
 * in the pool's own order (lowest tier first).
 */
export function rankedIds(answers: Record<string, JevAnswer>, question: string, pool: Resource[]): string[] {
  const answer = answers[question]
  const ids = pool.map((r) => r.id)
  const named = answer ? ranked(answer).map(([id]) => id).filter((id) => ids.includes(id)) : []
  return [...new Set([...named, ...ids])]
}

/**
 * The levels Jev weighed on a score question, most likely first, kept inside the scale. Padded
 * with neighbours of its top level, so there are always enough to choose between.
 */
export function levelsByOdds(answer: JevAnswer | undefined, levels: number): number[] {
  const out: number[] = []
  const add = (n: number) => {
    const level = Math.min(levels - 1, Math.max(0, n))
    if (!out.includes(level)) out.push(level)
  }
  if (answer) for (const [level] of ranked(answer)) add(Math.round(Number(level)))
  const top = out[0] ?? 0
  for (let step = 1; step < levels; step++) {
    add(top + step)
    add(top - step)
  }
  return out
}

/** The traits Jev would give it: the sure ones, and those above the keep line, up to the most allowed. */
function defaultTraits(odds: TraitOdds[]): TraitOdds[] {
  return odds.filter((t) => t.p >= B.TRAIT_KEEP).slice(0, B.MAX_TRAITS)
}

/**
 * The trait sets the takes can have, the default first. Each other flips one trait Jev was unsure
 * of (near the line), the closest call first: on in one take, off in another. A perk makes the
 * unit dearer to source and a drawback cheaper, so the takes differ in price as well as in what they do.
 */
export function traitVariants(odds: TraitOdds[]): TraitOdds[][] {
  const base = defaultTraits(odds)
  const sameSet = (a: TraitOdds[], b: TraitOdds[]) => a.length === b.length && a.every((t) => b.some((u) => u.trait === t.trait))
  const variants = [base]
  const unsure = odds.filter((t) => t.p < B.TRAIT_SURE).sort((a, b) => Math.abs(a.p - B.TRAIT_KEEP) - Math.abs(b.p - B.TRAIT_KEEP))
  for (const t of unsure) {
    const on = base.some((b) => b.trait === t.trait)
    const next = on ? base.filter((b) => b.trait !== t.trait) : [...base, t].sort((a, b) => b.p - a.p).slice(0, B.MAX_TRAITS)
    if (!variants.some((v) => sameSet(v, next))) variants.push(next)
  }
  return variants
}

/** A take as a key: two takes with the same key are alike. */
const takeKey = (o: Pick<UnitOption, 'tier' | 'band' | 'upkeepId'>) => `${o.tier}|${o.band}|${o.upkeepId}`

/**
 * Up to three takes on a unit, Jev's own first, never two alike. They are never all worth the
 * same, and when more than one tier is possible, never all in one tier. The plan's first unit is
 * always tier 0. Each take runs on a resource at or below its own tier, and carries a trait set.
 */
export function unitOptions(
  state: GameState,
  answers: Record<string, JevAnswer>,
  tiers: number[],
  questions: Record<string, JevQuestion>,
  first: boolean,
  traitOdds: TraitOdds[]
): UnitOption[] {
  const tierLevels = first ? [0] : levelsByOdds(answers.tier, B.MAX_UNIT_TIER + 1).filter((t) => tiers.includes(t))
  const bands = levelsByOdds(answers.value, first ? B.FIRST_UNIT_MAX_BAND + 1 : B.UNIT_VALUE.length)
  const candidates = tierLevels
    .flatMap((tier, t) =>
      rankedIds(answers, runsKey(tier, questions), runPool(state, tier)).flatMap((upkeepId, rank) =>
        bands.map((band, b) => ({ tier, band, upkeepId, score: t + b + rank, t, b, rank }))
      )
    )
    .sort((x, y) => x.score - y.score || x.b - y.b || x.t - y.t || x.rank - y.rank)
  const chosen: typeof candidates = []
  for (const c of candidates) {
    if (chosen.length >= B.UNIT_OPTIONS) break
    if (!chosen.some((o) => takeKey(o) === takeKey(c))) chosen.push(c)
  }
  // Takes that are all in one tier (when more than one was possible) or all worth the same
  // aren't a choice. Swap one for the best take that fixes it, the last first.
  const allSame = (set: typeof candidates, of: 'tier' | 'band') => set.every((o) => o[of] === set[0]![of])
  const fine = (set: typeof candidates) =>
    new Set(set.map(takeKey)).size === set.length &&
    !(set.length === B.UNIT_OPTIONS && tierLevels.length > 1 && allSame(set, 'tier')) &&
    !(set.length > 1 && bands.length > 1 && allSame(set, 'band'))
  for (let i = chosen.length - 1; i >= 1 && !fine(chosen); i--) {
    for (const c of candidates) {
      const trial = chosen.map((o, j) => (j === i ? c : o))
      if (!chosen.includes(c) && fine(trial)) {
        chosen[i] = c
        break
      }
    }
  }
  const variants = traitVariants(traitOdds)
  const pay = payerPerTake(answers, chosen.length)
  return chosen.map(({ tier, band, upkeepId }, i) => ({
    tier,
    band,
    upkeepId,
    traits: variants[i % variants.length]!.map((t) => t.trait),
    pay: pay[i]
  }))
}

/** Splits a value across parts so that making one uses parts worth about that value. */
export function priceParts(state: GameState, ids: string[], value: number): Flow[] {
  return ids.map((id) => {
    const r = findResource(state, id)
    // Resource traits (Energetic, Catalytic...) make parts in them cheaper or dearer.
    const f = r ? costFactor(state, r, false) : 1
    return { resourceId: id, amount: B.nice((value / ids.length / Math.max(1e-9, r?.value ?? 1)) * f) }
  })
}

export interface UnitDraft {
  unit: UnitType
  minIQ: number
  cost: Cost
}

export function draftUnit(state: GameState, v: UnitVerdict): UnitDraft {
  const read = reader(v)
  const spec = v.spec
  const { tier, band, upkeepId, traits: ids, pay } = v.options[v.choice] ?? v.options[0]!
  const param = (id: TraitId) => v.traitOdds.find((t) => t.trait === id)?.param ?? null
  const value = B.pick(B.UNIT_VALUE, band)[1]
  const work = value / B.PAYBACK_WEEKS
  const upkeep: Flow[] = [
    {
      resourceId: upkeepId,
      amount: B.nice(
        (work * B.pick(B.UPKEEP_SIZE, read.level('upkeep_0', B.UPKEEP_SIZE.length))[1]) /
          Math.max(1e-9, findResource(state, upkeepId)!.value)
      )
    }
  ]

  const unit = newUnit({
    id: makeId(state, spec.name),
    name: spec.name,
    description: spec.description || spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    value,
    tier,
    plausibility: v.plausibility,
    upkeep,
    traits: ids,
    boosts: param('boosts'),
    byproduct: param('by-product'),
    stores: param('stores')
  })
  const crewUnit = param('needs-crew') ? findUnit(state, param('needs-crew')!) : undefined
  if (crewUnit) unit.crew = { unitId: crewUnit.id, per: crewPer(unit, crewUnit) }
  else unit.traits = unit.traits.filter((t) => t !== 'needs-crew')

  // Research is priced by tier, not by what one costs: a cheap unit can be very advanced.
  const [, minIQ, worth] = B.pick(B.TIERS, tier)
  return { unit, minIQ: floorIQ(minIQ), cost: costFor(state, v, worth, undefined, pay) }
}

export function acceptUnit(current: GameState, v: UnitVerdict): Accepted {
  refuseUnaccepted(v)
  const state = structuredClone(current)
  if (v.spec.first) {
    const refusal = precheckUnit(state, v.spec)
    if (refusal) throw new Error(refusal)
  } else {
    claimProposal(state)
  }
  const { unit, minIQ, cost } = draftUnit(state, v)
  state.inventions.push({ week: state.week, icon: unit.icon, name: unit.name, kind: 'unit' })
  state.decidedThisWeek = true
  if (v.spec.first) {
    // The plan's first unit comes designed: no research, no week's action.
    state.phase.firstUnit = null
    addUnit(state, unit)
    logProposal(
      state,
      'good',
      `${unit.icon} ${unit.name} is designed. Find sourcing for it on its card, then create some and give them a strategy.`
    )
    return { state, outcome: { kind: 'added', name: unit.name } }
  }
  return addResearch(
    state,
    newResearch(state, {
      name: `Design ${unit.name}`,
      description: `Design ${unit.name}.`,
      icon: unit.icon,
      minIQ,
      cost,
      effect: { kind: 'unit', unit },
      risk: v.risk
    })
  )
}
