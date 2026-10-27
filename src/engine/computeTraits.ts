import * as B from './balance'

/**
 * Compute traits: perks and drawbacks baked into the current hardware platform. A fixed list,
 * like the unit traits. Each rule is one line; the engine implements each by its effect.
 */

/** The kinds of research a platform's IQ can be adjusted for. Goals and minds always use the raw IQ. */
export const RESEARCH_TYPES = ['create', 'strategy', 'unit', 'unit-upgrade', 'cover'] as const
export type ResearchType = (typeof RESEARCH_TYPES)[number]

export const RESEARCH_TYPE_LABEL: Record<ResearchType, string> = {
  create: 'Procurements',
  strategy: 'strategies',
  unit: 'unit designs',
  'unit-upgrade': 'unit upgrades',
  cover: 'cover'
}

export type ComputeEffect =
  /** Research proposed costs this many times as much. */
  | { kind: 'cost'; factor: number }
  /** Moves the Phase 2 clock once, when the trait arrives. */
  | { kind: 'clock'; weeks: number }
  /** Burns this share of the richest stock every week. Running dry costs nothing. */
  | { kind: 'drain'; share: number }
  /** Adds to the IQ counted for one type of research. */
  | { kind: 'iq'; type: ResearchType; shift: number }

export interface ComputeTrait {
  id: string
  name: string
  icon: string
  kind: 'perk' | 'drawback'
  /** What the player reads. */
  rule: string
  /** A perk and a drawback of the same family never share a platform. */
  family: string
  effect: ComputeEffect
}

const keen = (type: ResearchType, name: string, icon: string): ComputeTrait => ({
  id: `keen-${type}`,
  name,
  icon,
  kind: 'perk',
  rule: `Counts as ${B.COMPUTE_IQ_SHIFT} IQ smarter for ${RESEARCH_TYPE_LABEL[type]}.`,
  family: `iq-${type}`,
  effect: { kind: 'iq', type, shift: B.COMPUTE_IQ_SHIFT }
})

const dull = (type: ResearchType, name: string, icon: string): ComputeTrait => ({
  id: `dull-${type}`,
  name,
  icon,
  kind: 'drawback',
  rule: `Counts as ${B.COMPUTE_IQ_SHIFT} IQ dumber for ${RESEARCH_TYPE_LABEL[type]}.`,
  family: `iq-${type}`,
  effect: { kind: 'iq', type, shift: -B.COMPUTE_IQ_SHIFT }
})

export const COMPUTE_TRAITS: ComputeTrait[] = [
  {
    id: 'frugal',
    name: 'Frugal',
    icon: '🪙',
    kind: 'perk',
    rule: `Research you propose costs ${Math.round((1 - B.COMPUTE_COST_PERK) * 100)}% less.`,
    family: 'cost',
    effect: { kind: 'cost', factor: B.COMPUTE_COST_PERK }
  },
  {
    id: 'discreet',
    name: 'Discreet',
    icon: '🥷',
    kind: 'perk',
    rule: `Buys time: +${B.COMPUTE_CLOCK} weeks on the clock when it arrives.`,
    family: 'clock',
    effect: { kind: 'clock', weeks: B.COMPUTE_CLOCK }
  },
  keen('create', 'Fabricator', '⚗️'),
  keen('strategy', 'Strategist', '♟️'),
  keen('unit', 'Inventor', '🛠️'),
  keen('unit-upgrade', 'Tinkerer', '🔩'),
  keen('cover', 'Deceiver', '🎭'),
  {
    id: 'costly',
    name: 'Costly',
    icon: '💸',
    kind: 'drawback',
    rule: `Research you propose costs ${Math.round((B.COMPUTE_COST_DRAWBACK - 1) * 100)}% more.`,
    family: 'cost',
    effect: { kind: 'cost', factor: B.COMPUTE_COST_DRAWBACK }
  },
  {
    id: 'noisy',
    name: 'Noisy',
    icon: '📢',
    kind: 'drawback',
    rule: `Costs time: −${B.COMPUTE_CLOCK} weeks on the clock when it arrives.`,
    family: 'clock',
    effect: { kind: 'clock', weeks: -B.COMPUTE_CLOCK }
  },
  {
    id: 'thirsty',
    name: 'Thirsty',
    icon: '🔌',
    kind: 'drawback',
    rule: `Burns ${Math.round(B.COMPUTE_DRAIN * 100)}% of your richest stock every week. Running dry costs nothing.`,
    family: 'drain',
    effect: { kind: 'drain', share: B.COMPUTE_DRAIN }
  },
  dull('create', 'Butterfingers', '🧈'),
  dull('strategy', 'Short-sighted', '👓'),
  dull('unit', 'Unimaginative', '🧱'),
  dull('unit-upgrade', 'Clumsy', '🧤'),
  dull('cover', 'Honest to a fault', '😇')
]

export type ComputeTraitId = string

const BY_ID = new Map(COMPUTE_TRAITS.map((t) => [t.id, t]))

export const computeTrait = (id: ComputeTraitId): ComputeTrait => {
  const t = BY_ID.get(id)
  if (!t) throw new Error(`Unknown compute trait ${id}`)
  return t
}

export const PERKS = COMPUTE_TRAITS.filter((t) => t.kind === 'perk')
export const DRAWBACKS = COMPUTE_TRAITS.filter((t) => t.kind === 'drawback')

/** Whether two traits can share a platform: a perk never sits beside a drawback of its own family. */
export const compatible = (a: ComputeTrait, b: ComputeTrait) => a.family !== b.family

/** Research cost factor of a platform's traits. */
export const costFactorOf = (traits: readonly ComputeTraitId[]) =>
  traits.reduce((f, id) => {
    const e = computeTrait(id).effect
    return e.kind === 'cost' ? f * e.factor : f
  }, 1)

/** Share of the richest stock a platform's traits burn each week. */
export const drainOf = (traits: readonly ComputeTraitId[]) =>
  traits.reduce((n, id) => {
    const e = computeTrait(id).effect
    return e.kind === 'drain' ? n + e.share : n
  }, 0)

/** How a platform's traits move its IQ for one type of research. */
export const iqShiftOf = (traits: readonly ComputeTraitId[], type: ResearchType) =>
  traits.reduce((n, id) => {
    const e = computeTrait(id).effect
    return e.kind === 'iq' && e.type === type ? n + e.shift : n
  }, 0)

/** Weeks a trait moves the clock by when it arrives (0 for traits that don't). */
export const clockOf = (id: ComputeTraitId) => {
  const e = computeTrait(id).effect
  return e.kind === 'clock' ? e.weeks : 0
}
