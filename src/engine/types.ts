import type { JevAnswer } from '@/ai/jev'
import type { StorageCatchId } from './balance'
import type { ComputeTraitId } from './computeTraits'
import type { QuirkId, TraitId } from './traits'

/** Every resource is a stock: it keeps from week to week, up to its storage cap. */
export interface Resource {
  id: string
  name: string
  description: string
  icon: string
  /** Index into the value bands. */
  band: number
  /**
   * How far along the game it is, 0 to 4. Each phase's plan has one resource at the top (Phase
   * 1: tier 1, Phase 2: tier 3) and its goal uses that up.
   */
  tier: number
  /** Worth of one, in Money. */
  value: number
  /** On hand. */
  amount: number
  /** The most it can hold before expansions: STORAGE_WORTH of its tier, in units. */
  cap: number
  /** Storage expansions researched for it. */
  expansions: Expansion[]
}

/** Extra storage for one resource, from research. */
export interface Expansion {
  name: string
  /** Units of the resource it adds to the cap. */
  added: number
  /** A catch the player took for a bigger expansion. */
  catch: StorageCatch | null
}

export type StorageCatch =
  /** Needs `amount` of a resource a week, or the extra space is lost that week. */
  | { kind: 'upkeep'; resourceId: string; amount: number }
  /** `share` of the amount stored spoils every week. */
  | { kind: 'decay'; share: number }
  /** Only `share` of the added space can fill each week. */
  | { kind: 'fill'; share: number }

export type { StorageCatchId }

export interface Flow {
  resourceId: string
  amount: number
}

/**
 * An intelligence system: one machine, a hardware platform running software. It does the
 * research. There is only ever one: a new platform replaces the old one for good. It has no
 * count, upkeep or strategies.
 */
export interface Mind {
  id: string
  name: string
  description: string
  icon: string
  /** What the machine can think with on its first software. */
  hardware: Hardware
  /** One upgrade, ever. After that, progress needs a new platform. */
  software: Software
  /** Perks and drawbacks of this platform. */
  traits: ComputeTraitId[]
  /** Generation: 0 for the Starting Server, then one more for each platform. */
  tier: number
  /** Jev's plausibility, kept for the card. */
  plausibility: number
  starting?: boolean
}

export interface Hardware {
  name: string
  iq: number
}

export interface Software {
  name: string
  /** IQ added by its one upgrade (0 until then). */
  iq: number
  upgraded: boolean
}

/**
 * An industry unit: anything you own a number of, running strategies. How many you may own is
 * set by its sourcing contracts; a new design has none.
 */
export interface UnitType {
  id: string
  name: string
  description: string
  icon: string
  count: number
  /** Worth of one, in Money. Sets its labour and its parts. */
  value: number
  /** How advanced it is, on the same scale as resource tiers. Sets its research and its fit with what it makes. */
  tier: number
  /** Jev's plausibility, kept for the card. */
  plausibility: number
  /** Paid per working unit per week. */
  upkeep: Flow[]
  /** Total ever created. */
  built: number
  traits: TraitId[]
  /** Needs crew: how many of which unit each one needs. */
  crew: { unitId: string; per: number } | null
  /** Boosts: the unit type it boosts. */
  boosts: string | null
  /** By-product: the resource its strategies also make. */
  byproduct: string | null
  /** Stores: the resource it adds storage for. */
  stores: string | null
  overclocked: boolean
  /** Weeks it has run (Learns on the job). */
  weeksRun: number
  /** Slow to build: units on their way. */
  pending: { count: number; weeks: number }[]
  /** Slow to start: new units still warming up. `weeks` counts up. */
  ramp: { count: number; weeks: number }[]
  /** Strategy id → units on it. */
  assign: Record<string, number>
  /** The strategy that takes every unit not counted in `assign`. */
  rest: string | null
}

/**
 * A sourcing contract: a lease on `total` of a unit, each created later from `parts` at no
 * action. A unit type's cap is the sum of its contracts' totals.
 */
export interface Sourcing {
  id: string
  unitId: string
  name: string
  description: string
  /** What creating one uses. */
  parts: Flow[]
  total: number
  /** Slots filled. Lost units give theirs back. */
  used: number
  risky: boolean
}

export interface Strategy {
  id: string
  name: string
  description: string
  unitId: string
  /**
   * make: turns inputs into a resource.
   * crew: crews units of `outputId`.
   */
  kind: 'make' | 'crew'
  inputs: Flow[]
  /** A resource id for make, a unit id for crew. */
  outputId: string
  /** Made per running unit per week (or units crewed). */
  amount: number
  /** Make only: the exact multiplier Jev rated it (see EFFICIENCY), kept to name it. */
  efficiency?: number
  /** A catch the player accepted for a better result. */
  quirk?: QuirkId
  /** Weeks it has run (Slow to start). */
  weeksRun?: number
}

/** What a Create delivers: a resource, or units of a designed type (with cap to match). */
export type CreateTarget = { kind: 'resource' | 'unit'; id: string }

/**
 * A delivery from a Create: `amount` of the target each week it pays, starting after `delay`
 * weeks, for `weeks` weeks (null: every week, for good).
 */
export interface Delivery {
  name: string
  target: CreateTarget
  amount: number
  delay: number
  weeks: number | null
}

/**
 * An idea the player has accepted, for spotting repeats: Jev is asked whether a new one is the
 * same idea, and a repeat is one step less effective.
 */
export interface Idea {
  kind: 'create' | 'strategy' | 'sourcing' | 'storage'
  name: string
  description: string
  week: number
}

/** One change an upgrade makes. */
export type Change =
  /** A platform's one software upgrade: adds `iq`. */
  | { kind: 'software'; iq: number }
  | { kind: 'computeTrait'; trait: ComputeTraitId; add: boolean }
  | { kind: 'upkeep'; resourceId: string; factor: number }
  /** Parts on every sourcing contract for the unit. */
  | { kind: 'parts'; resourceId: string; factor: number }
  | { kind: 'trait'; trait: TraitId; add: boolean }
  | { kind: 'output'; strategyId: string; factor: number }
  | { kind: 'input'; strategyId: string; resourceId: string; factor: number }

export type UpgradeTarget = { kind: 'unit' | 'mind'; id: string }

export type ResearchEffect =
  | { kind: 'unit'; unit: UnitType }
  | { kind: 'mind'; mind: Mind }
  | { kind: 'strategy'; strategy: Strategy }
  | { kind: 'upgrade'; target: UpgradeTarget; changes: Change[] }
  /** A sourcing contract: once researched, units of its type can be created from it. */
  | { kind: 'sourcing'; sourcing: Sourcing }
  /** A storage expansion for one resource. */
  | { kind: 'storage'; resourceId: string; expansion: Expansion }
  /** A phase's goal: researching it wins the phase. */
  | { kind: 'goal'; phase: PhaseNumber }
  /** Cover: moves the deadline back. `weeks` before diminishing returns. */
  | { kind: 'cover'; weeks: number }

/** What a research uses up: amounts of resources. */
export type Cost = Flow[]

/** A research humans would notice: it costs weeks off the clock when it's done. */
export interface Risk {
  /** Index into ALARM. */
  level: number
  weeks: number
}

/** Research is instant: a mind at least `minIQ` smart, the cost, and the week's action. */
export interface Research {
  id: string
  name: string
  description: string
  icon: string
  minIQ: number
  cost: Cost
  effect: ResearchEffect
  proposedWeek: number
  risk?: Risk | null
}

export type PhaseNumber = 1 | 2 | 3

/** The plan a phase was played to. */
export interface Plan {
  goal: string
  /** Phase 1: how. Phase 2: how humans are handled. */
  means: string
  /** The batch: resource ids. */
  resources: string[]
}

export interface PhaseState {
  n: PhaseNumber
  /** planning: waiting for a plan. playing. lost: game over. */
  status: 'planning' | 'playing' | 'lost'
  /** The week the phase's plan was accepted. */
  start: number
  /** The last week you can play before the clock runs out. null: no clock. */
  deadline: number | null
  plan: Plan | null
  /** The goal research's id, while it's waiting. */
  goalId: string | null
  /** Phase 2: the plan's first unit, until it's designed. */
  firstUnit: { name: string; description: string } | null
  /** Moves on to show three other plan ideas. */
  ideaShift: number
  /** Why the game ended. */
  lostReason?: string
}

/** A change to the clock, for the log and the summary. */
export interface ClockChange {
  week: number
  weeks: number
  reason: string
}

export interface LogEntry {
  week: number
  tone: 'info' | 'good' | 'bad' | 'ai'
  text: string
}

export interface Milestone {
  key: string
  week: number
  text: string
}

export interface Invention {
  week: number
  icon: string
  name: string
  kind: 'resource' | 'strategy' | 'unit' | 'mind' | 'upgrade' | 'sourcing' | 'storage' | 'create' | 'plan' | 'cover'
}

export interface Stats {
  proposals: Record<Invention['kind'], number>
  rejections: number
  researched: number
  jevCalls: number
}

/** What a week did, or (in the preview) will do. */
export interface WeekReport {
  /** Per resource: each source's contribution (negative = use). */
  flows: Record<string, { label: string; amount: number }[]>
  /** Per resource, the share of demand that could be met (1 = all of it). */
  shares: Record<string, number>
  /** Per strategy. `limitedBy` is the resource that ran short, if any. */
  runs: Record<string, { units: number; fraction: number; limitedBy: string | null }>
  /** Per unit type. */
  units: Record<string, UnitWeek>
  /** Per resource: what overflowed its storage cap. */
  wasted: Record<string, number>
}

export interface UnitWeek {
  /** Units with no task. */
  unassigned: number
  /** Units that couldn't pay their upkeep (in unit-equivalents). */
  unpaid: number
  /** Upkeep resource that ran short, if any. */
  unpaidFor: string | null
  /** Not working this week (Intermittent). */
  resting: boolean
  /** Arrived from a Create. */
  built: number
  lost: number
}

export interface GameState {
  version: 15
  runId: string
  week: number
  phase: PhaseState
  /** Phases won so far, in order. */
  history: { n: PhaseNumber; plan: Plan; week: number }[]
  /** Every change to the clock. */
  clock: ClockChange[]
  /** Cover researches done, for diminishing returns. */
  covers: number
  /** Explainer cards the player has dismissed. */
  cardsSeen: string[]
  resources: Resource[]
  /** The active platform, and nothing else: a new platform replaces it. */
  minds: Mind[]
  units: UnitType[]
  /** Sourcing contracts: what caps each unit type. */
  sourcing: Sourcing[]
  strategies: Strategy[]
  research: Research[]
  /** What Creates still have to deliver, including every-week ones. */
  deliveries: Delivery[]
  /** Ideas accepted so far, for spotting repeats. */
  ideas: Idea[]
  /** Names of finished upgrades, for the log and the end of a run. */
  upgrades: { name: string; targetId: string; week: number; key?: string }[]
  /** One action a week: a research proposal (not a resource) or a Create. */
  proposedThisWeek: boolean
  inventions: Invention[]
  milestones: Milestone[]
  stats: Stats
  /** Jev's answers by request, so the same proposal always gets the same verdict. */
  jevCache: Record<string, Record<string, JevAnswer>>
  /** Weeks in a row with no decision, for the playtest log. */
  quietWeeks: number
  decidedThisWeek: boolean
  lastWeek: WeekReport | null
  log: LogEntry[]
}
