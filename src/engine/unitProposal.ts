import { ranked, type JevAnswer, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { byTier, findResource, findUnit, makeId, traitPriceFactor } from './model'
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
import type { Cost, Flow, GameState, Resource, UnitType } from './types'
import { newUnit } from './initialState'

export interface UnitSpec {
  name: string
  description: string
  /** A unit that can also build it, with a build strategy. null = only created from parts. */
  builderId: string | null
  /** Phase 2's first unit, from the plan: free, and designed at once. */
  first?: boolean
}


export interface TraitOdds {
  trait: TraitId
  p: number
  param: string | null
}

/**
 * One way Jev could see the unit: how advanced it is, how much one is worth (a value band), and
 * what it is made from and runs on, which are never above its own tier.
 */
export interface UnitOption {
  tier: number
  band: number
  /** The stocks one is made from: more of them for a higher tier (PARTS_BY_TIER). */
  partsIds: string[]
  /** What it runs on each week: a stock or a flow. */
  upkeepId: string
  /** Its traits: part of the take, so a near-the-line trait is on in one take and off in another. */
  traits: TraitId[]
}

export interface UnitVerdict extends VerdictBase {
  kind: 'unit'
  spec: UnitSpec
  /**
   * Jev's takes on tier, value, resources and traits, best first, and never two alike in what
   * they are made from and run on. The player picks one.
   */
  options: UnitOption[]
  /** Which option the player picked. */
  choice: number
  /** What Jev thought of each trait, kept for the traits' parameters (a crew unit, a by-product). */
  traitOdds: TraitOdds[]
}

/** Question keys use underscores. */
const key = (id: string) => id.replace(/-/g, '_')

/** A blank form: Jev chooses what a unit is made from and runs on. */
export const guessUnitSpec = (): UnitSpec => ({ name: '', description: '', builderId: null })

/** The stocks a unit of this tier may be made from: its own tier and below, lowest first. */
export const partPool = (state: GameState, tier: number): Resource[] =>
  byTier(state.resources).filter((r) => r.kind === 'stock' && r.tier <= tier)

/** What a unit of this tier may run on, a stock or a flow: its own tier and below, lowest first. */
export const runPool = (state: GameState, tier: number): Resource[] =>
  byTier(state.resources).filter((r) => r.tier <= tier)

export function precheckUnit(state: GameState, spec: UnitSpec): string | null {
  const locked = lockReason(state, 'unit')
  if (locked) return locked
  if (spec.first && !state.phase.firstUnit) return 'Your first unit is already designed.'
  const slot = spec.first ? null : proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!state.resources.some((r) => r.kind === 'stock')) return 'Propose a resource first: a unit is made from one.'
  // The first unit is tier 0, so it needs something at tier 0 to be made from.
  if (spec.first && !partPool(state, 0).length) return 'You need a tier 0 stock to make your first unit from.'
  if (spec.builderId && !findUnit(state, spec.builderId)) return 'Unknown builder.'
  return null
}

function paramOptions(state: GameState, param: NonNullable<(typeof TRAITS)[TraitId]['param']>): Record<string, string> {
  switch (param) {
    case 'unit':
      return options(state.units)
    case 'resource':
      return options(state.resources)
    case 'flow':
      return options(state.resources.filter((r) => r.kind === 'flow'))
  }
}

export async function judgeUnit(state: GameState, judge: Judge, raw: UnitSpec): Promise<UnitVerdict> {
  const spec: UnitSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckUnit(state, spec)
  if (refusal) throw new Error(refusal)
  const builder = spec.builderId ? findUnit(state, spec.builderId)! : null
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
    // Jev decides what it's made from and runs on, from nothing above its own tier.
    ...pools.questions,
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
            : t.param === 'flow'
              ? 'If it stores something, which flow?'
              : 'If it makes a by-product, which resource?',
        criteria: paramOptions(state, t.param)
      }
    }
  }

  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new industry unit: something the AI can own many of.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Made by: ${builder ? `the AI's own ${builder.name}, or straight from its parts` : 'the AI, straight from its parts'}.`
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
    options: unitOptions(state, answers, tiers, pools.keys, !!spec.first, traitOdds),
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
 * The tiers a unit may be. The plan's first unit is tier 0; any other can be as low as there is a
 * stock to make it from, up to the top.
 */
function unitTiers(state: GameState, first: boolean): number[] {
  if (first) return [0]
  return Array.from({ length: B.MAX_UNIT_TIER + 1 }, (_, t) => t).filter((t) => partPool(state, t).length > 0)
}

interface PoolKeys {
  /** The question that settles what a unit of this tier is made from. */
  parts: Record<number, string>
  /** The question that settles what it runs on. */
  runs: Record<number, string>
}

/**
 * Questions asking Jev what a unit is made from and runs on, once for each distinct set of
 * resources its tier allows (nothing above its own tier), so tiers that allow the same share one.
 */
function poolQuestions(state: GameState, name: string, tiers: number[]) {
  const questions: Record<string, JevQuestion> = {}
  const keys: PoolKeys = { parts: {}, runs: {} }
  const kinds = [
    {
      pool: partPool,
      keys: keys.parts,
      prefix: 'parts',
      ask: `Which resource is one ${name} most naturally made from? Advanced things are made from several kinds of part, so how likely each is matters too.`
    },
    { pool: runPool, keys: keys.runs, prefix: 'runs', ask: `Which one resource would one ${name} most naturally run on each week, to operate and maintain it?` }
  ]
  for (const { pool, keys: byTierKey, prefix, ask } of kinds) {
    const asked = new Map<string, string>()
    for (const tier of tiers) {
      const things = pool(state, tier)
      const sets = things.map((r) => r.id).join(',')
      if (!asked.has(sets)) {
        asked.set(sets, `${prefix}_t${tier}`)
        questions[`${prefix}_t${tier}`] = { type: 'choice', instructions: ask, criteria: options(things) }
      }
      byTierKey[tier] = asked.get(sets)!
    }
  }
  return { questions, keys }
}

/**
 * Every resource in a pool, Jev's picks first and most likely first. Those it didn't name follow
 * in the pool's own order (lowest tier first).
 */
function rankedIds(answers: Record<string, JevAnswer>, question: string, pool: Resource[]): string[] {
  const answer = answers[question]
  const ids = pool.map((r) => r.id)
  const named = answer ? ranked(answer).map(([id]) => id).filter((id) => ids.includes(id)) : []
  return [...new Set([...named, ...ids])]
}

/**
 * The levels Jev weighed on a score question, most likely first, kept inside the scale. Padded
 * with neighbours of its top level, so there are always enough to choose between.
 */
function levelsByOdds(answer: JevAnswer | undefined, levels: number): number[] {
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
 * unit dearer to make and a drawback cheaper, so the takes differ in price as well as in what they do.
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

/** What a take is made from and runs on, as a key: two takes with the same key are alike. */
const recipeKey = (o: Pick<UnitOption, 'partsIds' | 'upkeepId'>) => `${[...o.partsIds].sort().join('+')}|${o.upkeepId}`

/**
 * Up to three takes on a unit, Jev's own first. No two share what they are made from and run on,
 * so each is a real choice; with only one way to make it there is only one take. They are never
 * all worth the same (two may be). The plan's first unit is always tier 0. Elsewhere, when more
 * than one tier is possible, the three are never all in one tier. Each take is made from and runs
 * on resources at or below its own tier, and carries a trait set.
 */
export function unitOptions(
  state: GameState,
  answers: Record<string, JevAnswer>,
  tiers: number[],
  keys: PoolKeys,
  first: boolean,
  traitOdds: TraitOdds[]
): UnitOption[] {
  const tierLevels = first ? [0] : levelsByOdds(answers.tier, B.MAX_UNIT_TIER + 1).filter((t) => tiers.includes(t))
  const bands = levelsByOdds(answers.value, first ? B.FIRST_UNIT_MAX_BAND + 1 : B.UNIT_VALUE.length)
  // Every way to make a unit of a tier, with how far down Jev's lists it is: the likeliest parts
  // (swapping the last for each next one) and the likeliest thing to run on, then the next.
  const recipesOf = (tier: number) => {
    const count = B.PARTS_BY_TIER[tier] ?? 1
    const parts = rankedIds(answers, keys.parts[tier]!, partPool(state, tier))
    const runs = rankedIds(answers, keys.runs[tier]!, runPool(state, tier))
    const swaps = Math.max(1, parts.length - count + 1)
    return Array.from({ length: swaps }, (_, p) =>
      runs.map((upkeepId, u) => ({
        rank: p + u,
        partsIds: parts.length <= count ? parts : [...parts.slice(0, count - 1), parts[count - 1 + p]!],
        upkeepId
      }))
    ).flat()
  }
  const candidates = tierLevels
    .flatMap((tier, t) =>
      recipesOf(tier).flatMap((recipe) => bands.map((band, b) => ({ tier, band, ...recipe, score: t + b + recipe.rank, t, b })))
    )
    .sort((x, y) => x.score - y.score || x.b - y.b || x.t - y.t || x.rank - y.rank)
  const chosen: typeof candidates = []
  for (const c of candidates) {
    if (chosen.length >= B.UNIT_OPTIONS) break
    if (!chosen.some((o) => recipeKey(o) === recipeKey(c))) chosen.push(c)
  }
  // Takes that are all in one tier (when more than one was possible) or all worth the same
  // aren't a choice. Swap one for the best take that fixes it, the last first.
  const allSame = (set: typeof candidates, of: 'tier' | 'band') => set.every((o) => o[of] === set[0]![of])
  const fine = (set: typeof candidates) =>
    new Set(set.map(recipeKey)).size === set.length &&
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
  return chosen.map(({ tier, band, partsIds, upkeepId }, i) => ({
    tier,
    band,
    partsIds,
    upkeepId,
    traits: variants[i % variants.length]!.map((t) => t.trait)
  }))
}

/** Splits a value across parts so that making one uses parts worth about that value. */
export function priceParts(state: GameState, ids: string[], value: number): Flow[] {
  return ids.map((id) => ({
    resourceId: id,
    amount: B.nice(value / ids.length / Math.max(1e-9, findResource(state, id)?.value ?? 1))
  }))
}

export interface UnitDraft {
  unit: UnitType
  minIQ: number
  cost: Cost
}

export function draftUnit(state: GameState, v: UnitVerdict): UnitDraft {
  const read = reader(v)
  const spec = v.spec
  const { tier, band, partsIds, upkeepId, traits: ids } = v.options[v.choice] ?? v.options[0]!
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
    // Perks make it dearer to make, drawbacks cheaper. Risky designs cut corners.
    parts: priceParts(state, partsIds, value * traitPriceFactor(ids) * (v.risk ? B.RISK_PARTS : 1)),
    risky: !!v.risk,
    upkeep,
    builderId: spec.builderId,
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
  return { unit, minIQ: floorIQ(minIQ), cost: costFor(state, v, worth) }
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
    // The plan's first unit comes designed: no research, no week's proposal. There are no free
    // copies: creating one needs its parts, and creating one unlocks minds and upgrades.
    state.phase.firstUnit = null
    addUnit(state, unit)
    logProposal(
      state,
      'good',
      `${unit.icon} ${unit.name} is designed. Create some from parts on its card, then give them a strategy.`
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

