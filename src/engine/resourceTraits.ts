import * as B from './balance'
import { seedOf } from './planPresets'

/**
 * Resource traits: a fixed list, like the unit and compute traits, but every one mixes an upside
 * with a downside, so no resource is simply better than another. Each resource has one or two.
 * "Costs" are research costs and unit parts, set when the research or contract is priced.
 */

export const RESOURCE_TRAIT_IDS = [
  'energetic',
  'catalytic',
  'staple',
  'recyclable',
  'speculative',
  'crude',
  'compounding',
  'self-replicating',
  'renewable',
  'perishable',
  'volatile',
  'liquid',
  'seasonal',
  'cryogenic',
  'exotic',
  'mundane',
  'prestigious',
  'hazardous',
  'untraceable',
  'contraband'
] as const
export type ResourceTraitId = (typeof RESOURCE_TRAIT_IDS)[number]

/** What a resource's tier is read for. A tier trait moves only one of these. */
export type TierPurpose = 'make' | 'reach' | 'platform'

/** Each trait's effects, as numbers. Anything left out is neutral. */
export interface ResourceEffects {
  /** Research costs and unit parts in it (set when priced). */
  cost?: number
  /** Research costs only. */
  researchCost?: number
  /** What strategies and upkeep use of it each week. */
  use?: number
  /** What units make of it each week; a pair alternates by week (even, odd). */
  make?: number | [number, number]
  /** Its storage cap, starting and expansions. */
  cap?: number
  /** Depots for it: how many each holds. */
  expansion?: number
  /** Designing depots for it: clock weeks. */
  clock?: number
  /** Share of the stock gained each week, up to the cap. */
  growth?: number
  /** Procurements with no resource input, and strategies with none, make this many times as much. */
  fromNothing?: number
  /** Share of what's left lost at the end of each week. */
  loss?: number
  /** Share of what's spent on costs that comes back next week. */
  refund?: number
  /** Procurements of it pay this many times as much. */
  createOutput?: number
  /** As a Procurement input, it counts this many times its worth. */
  createInput?: number
  /** Tiers added when its tier is read for one purpose. */
  tier?: Partial<Record<TierPurpose, number>>
  /** Speculative: new costs in it carry the week's factor. */
  speculative?: boolean
}

export interface ResourceTrait {
  id: ResourceTraitId
  name: string
  icon: string
  upside: string
  downside: string
  /** A resource's two traits never share a family. */
  family: 'spend' | 'growth' | 'loss' | 'making' | 'create' | 'clock'
  effects: ResourceEffects
}

const t = (trait: ResourceTrait) => trait

export const RESOURCE_TRAITS: Record<ResourceTraitId, ResourceTrait> = {
  energetic: t({
    id: 'energetic',
    name: 'Energetic',
    icon: '⚡',
    upside: 'Research costs and unit parts in it are 50% less.',
    downside: 'Loses 50% of what’s left at the end of each week.',
    family: 'spend',
    effects: { cost: 0.5, loss: 0.5 }
  }),
  catalytic: t({
    id: 'catalytic',
    name: 'Catalytic',
    icon: '🧪',
    upside: 'Strategies and upkeep use 50% less of it.',
    downside: 'Research costs and unit parts in it are doubled.',
    family: 'spend',
    effects: { use: 0.5, cost: 2 }
  }),
  staple: t({
    id: 'staple',
    name: 'Staple',
    icon: '🧱',
    upside: 'Research costs in it are 25% less.',
    downside: 'Procurements make 25% less of it.',
    family: 'spend',
    effects: { researchCost: 0.75, createOutput: 0.75 }
  }),
  recyclable: t({
    id: 'recyclable',
    name: 'Recyclable',
    icon: '🔁',
    upside: '50% of what you spend on research and unit parts comes back next week.',
    downside: 'Research costs and unit parts in it are 25% more.',
    family: 'spend',
    effects: { refund: 0.5, cost: 1.25 }
  }),
  speculative: t({
    id: 'speculative',
    name: 'Speculative',
    icon: '🎰',
    upside: 'Some weeks, new costs in it are as little as a quarter.',
    downside: 'Other weeks, they are up to double.',
    family: 'spend',
    effects: { speculative: true }
  }),
  crude: t({
    id: 'crude',
    name: 'Crude',
    icon: '⛏️',
    upside: 'Units making it need a tier less.',
    downside: 'Research costs in it are 25% more.',
    family: 'making',
    effects: { tier: { make: -1 }, researchCost: 1.25 }
  }),
  compounding: t({
    id: 'compounding',
    name: 'Compounding',
    icon: '📈',
    upside: 'The stock grows 3% a week, up to its cap.',
    downside: 'Research costs in it are 50% more.',
    family: 'growth',
    effects: { growth: 0.03, researchCost: 1.5 }
  }),
  'self-replicating': t({
    id: 'self-replicating',
    name: 'Self-replicating',
    icon: '🐇',
    upside: 'The stock grows 10% a week, up to its cap.',
    downside: 'Every use of it needs 25% more: costs, parts, strategies and upkeep.',
    family: 'growth',
    effects: { growth: 0.1, cost: 1.25, use: 1.25 }
  }),
  renewable: t({
    id: 'renewable',
    name: 'Renewable',
    icon: '🌱',
    upside: 'Making it from nothing, with a Procurement or a strategy that uses no resources, gives 25% more.',
    downside: 'Its storage cap is 25% smaller.',
    family: 'making',
    effects: { fromNothing: 1.25, cap: 0.75 }
  }),
  perishable: t({
    id: 'perishable',
    name: 'Perishable',
    icon: '🍋',
    upside: 'Units make 50% more of it.',
    downside: '10% of what’s left spoils each week.',
    family: 'loss',
    effects: { make: 1.5, loss: 0.1 }
  }),
  volatile: t({
    id: 'volatile',
    name: 'Volatile',
    icon: '🌋',
    upside: 'Units make twice as much of it.',
    downside: '25% of what’s left is lost each week.',
    family: 'loss',
    effects: { make: 2, loss: 0.25 }
  }),
  liquid: t({
    id: 'liquid',
    name: 'Liquid',
    icon: '💧',
    upside: 'Its storage cap is half as big again.',
    downside: '5% of what’s left leaks away each week.',
    family: 'loss',
    effects: { cap: 1.5, loss: 0.05 }
  }),
  seasonal: t({
    id: 'seasonal',
    name: 'Seasonal',
    icon: '🌾',
    upside: 'Units make twice as much of it in odd weeks.',
    downside: 'They make half as much in even weeks.',
    family: 'making',
    effects: { make: [0.5, 2] }
  }),
  cryogenic: t({
    id: 'cryogenic',
    name: 'Cryogenic',
    icon: '❄️',
    upside: 'Depots for it hold twice as much.',
    downside: 'Units making it need a tier more.',
    family: 'making',
    effects: { expansion: 2, tier: { make: 1 } }
  }),
  exotic: t({
    id: 'exotic',
    name: 'Exotic',
    icon: '🔬',
    upside: 'Procurements make 50% more of it.',
    downside: 'Units make 50% less of it.',
    family: 'create',
    effects: { createOutput: 1.5, make: 0.5 }
  }),
  mundane: t({
    id: 'mundane',
    name: 'Mundane',
    icon: '📦',
    upside: 'Procurements of it need a tier less.',
    downside: 'Procurements of it pay 25% less.',
    family: 'create',
    effects: { tier: { reach: -1 }, createOutput: 0.75 }
  }),
  prestigious: t({
    id: 'prestigious',
    name: 'Prestigious',
    icon: '👑',
    upside: 'Pays for platforms as if it were a tier higher.',
    downside: 'Procurements make 25% less of it.',
    family: 'create',
    effects: { tier: { platform: 1 }, createOutput: 0.75 }
  }),
  hazardous: t({
    id: 'hazardous',
    name: 'Hazardous',
    icon: '🚨',
    upside: 'As a Procurement input, it counts 1.5× its worth.',
    downside: 'Designing depots for it costs double the clock weeks.',
    family: 'clock',
    effects: { createInput: 1.5, clock: 2 }
  }),
  untraceable: t({
    id: 'untraceable',
    name: 'Untraceable',
    icon: '🕶️',
    upside: 'Designing depots for it costs no clock weeks.',
    downside: 'Procurements make half as much of it.',
    family: 'clock',
    effects: { clock: 0, createOutput: 0.5 }
  }),
  contraband: t({
    id: 'contraband',
    name: 'Contraband',
    icon: '🔒',
    upside: 'Depots for it hold twice as much.',
    downside: 'Designing them costs triple the clock weeks.',
    family: 'clock',
    effects: { expansion: 2, clock: 3 }
  })
}

export const ALL_RESOURCE_TRAITS: ResourceTrait[] = RESOURCE_TRAIT_IDS.map(
  (id) => RESOURCE_TRAITS[id]
)

export const resourceTrait = (id: ResourceTraitId): ResourceTrait => RESOURCE_TRAITS[id]

type HasTraits = { traits?: readonly ResourceTraitId[] }

const effectsOf = (r: HasTraits) => (r.traits ?? []).map((id) => RESOURCE_TRAITS[id]?.effects ?? {})

/** Multiplies one numeric effect across a resource's traits (1 when none has it). */
function product(
  r: HasTraits,
  key:
    | 'cost'
    | 'researchCost'
    | 'use'
    | 'cap'
    | 'expansion'
    | 'clock'
    | 'createOutput'
    | 'createInput'
    | 'fromNothing'
) {
  return effectsOf(r).reduce((f, e) => f * (e[key] ?? 1), 1)
}

/** Adds one share effect across a resource's traits. */
function total(r: HasTraits, key: 'growth' | 'refund') {
  return effectsOf(r).reduce((n, e) => n + (e[key] ?? 0), 0)
}

export const hasResourceTrait = (r: HasTraits, id: ResourceTraitId) => (r.traits ?? []).includes(id)

/**
 * The factor Speculative puts on costs set this week: random, but the same all week for the
 * same resource and game.
 */
export function speculativeFactor(
  state: { runId: string; week: number },
  resourceId: string
): number {
  const [lo, hi] = B.SPECULATIVE_RANGE
  const u = (seedOf(`${state.runId}/${state.week}/${resourceId}/speculative`) % 10007) / 10006
  return lo * Math.pow(hi / lo, u)
}

/**
 * What a new cost in this resource is multiplied by. `research` is true for research costs,
 * false for unit parts.
 */
export function costFactor(
  state: { runId: string; week: number },
  r: HasTraits & { id: string },
  research: boolean
): number {
  let f = product(r, 'cost')
  if (research) f *= product(r, 'researchCost')
  if (effectsOf(r).some((e) => e.speculative)) f *= speculativeFactor(state, r.id)
  return f
}

/** What strategies and upkeep use of it, as a factor. */
export const useFactor = (r: HasTraits) => product(r, 'use')

/** What units make of it this week, as a factor. */
export function makeFactor(r: HasTraits, week: number): number {
  return effectsOf(r).reduce((f, e) => {
    if (e.make === undefined) return f
    return f * (Array.isArray(e.make) ? e.make[week % 2]! : e.make)
  }, 1)
}

export const capFactor = (r: HasTraits) => product(r, 'cap')
export const expansionFactor = (r: HasTraits) => product(r, 'expansion')
export const clockFactor = (r: HasTraits) => product(r, 'clock')
export const createOutputFactor = (r: HasTraits) => product(r, 'createOutput')
export const createInputFactor = (r: HasTraits) => product(r, 'createInput')
export const growthOf = (r: HasTraits) => total(r, 'growth')
/** What Renewable adds when the resource is made with no resource input (1 when none). */
export const fromNothingFactor = (r: HasTraits) => product(r, 'fromNothing')
export const refundOf = (r: HasTraits) => total(r, 'refund')

/** Share of what's left that is lost at the end of each week. Several losses compound. */
export const weeklyLossOf = (r: HasTraits) =>
  1 - effectsOf(r).reduce((keep, e) => keep * (1 - (e.loss ?? 0)), 1)

/**
 * How much easier or harder a resource is to build up in Phase 1, where Procurements are the only
 * income: what Procurements make of it, and the weekly loss (a 50% loss makes the goal 50%
 * smaller). The Phase 1 goal cost is scaled by this.
 */
export function goalIncomeFactor(r: HasTraits): number {
  return createOutputFactor(r) * (1 - weeklyLossOf(r))
}

/** A resource's tier, as read for one purpose: its own, moved by its tier traits, within 0 to 4. */
export function effectiveTier(r: HasTraits & { tier: number }, purpose: TierPurpose): number {
  const shift = effectsOf(r).reduce((n, e) => n + (e.tier?.[purpose] ?? 0), 0)
  return Math.min(4, Math.max(0, r.tier + shift))
}

/** Whether two traits can share a resource. */
export const compatibleTraits = (a: ResourceTraitId, b: ResourceTraitId) =>
  a !== b && RESOURCE_TRAITS[a].family !== RESOURCE_TRAITS[b].family

/** A trait as one line, for Jev and tooltips. */
export const traitLine = (id: ResourceTraitId) => {
  const tr = RESOURCE_TRAITS[id]
  return `${tr.name}: ${tr.upside} But: ${tr.downside}`
}
