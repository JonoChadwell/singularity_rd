import type { JevAnswer } from '@/ai/jev'
import type { QuirkId, TraitId } from './traits'

export interface Resource {
  id: string
  name: string
  description: string
  icon: string
  /** Stocks keep from week to week. Flows are made and used within a week. */
  kind: 'stock' | 'flow'
  /** Index into the value bands. */
  band: number
  /** Worth of one, in Money. */
  value: number
  /** On hand (stocks only). */
  amount: number
  /** Flow held over from last week by units that Store it. */
  stored: number
}

export interface Flow {
  resourceId: string
  amount: number
}

/**
 * An intelligence system: one machine, a hardware platform running software. Minds do the
 * research. They have no count, upkeep or strategies.
 */
export interface Mind {
  id: string
  name: string
  description: string
  icon: string
  /** Its IQ is what the machine can think with on its first software. Hard to change. */
  hardware: Hardware
  /** Upgrades add IQ, up to the software ceiling. */
  software: Software
  /** Compute tier number, or 0 for the Starting Server. */
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
  /** Share of the hardware's IQ added by software upgrades, up to the software ceiling. */
  bonus: number
}

/** An industry unit: anything you own a number of, running strategies. */
export interface UnitType {
  id: string
  name: string
  description: string
  icon: string
  count: number
  /** Worth of one, in Money. Sets its labour and its parts. */
  value: number
  /** Jev's plausibility, kept for the card. */
  plausibility: number
  /** What creating or building one uses. */
  parts: Flow[]
  /** Paid per working unit per week. */
  upkeep: Flow[]
  /** A unit that can also build these, with a build strategy. */
  builderId: string | null
  /** Total ever created or built. */
  built: number
  traits: TraitId[]
  /** Needs crew: how many of which unit each one needs. */
  crew: { unitId: string; per: number } | null
  /** Boosts: the unit type it boosts. */
  boosts: string | null
  /** By-product: the resource its strategies also make. */
  byproduct: string | null
  /** Stores: the flow it holds over. */
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

export interface Strategy {
  id: string
  name: string
  description: string
  unitId: string
  /**
   * make: turns inputs into a resource.
   * build: turns parts into units of `outputId`, up to `target`.
   * crew: crews units of `outputId`.
   */
  kind: 'make' | 'build' | 'crew'
  inputs: Flow[]
  /** A resource id for make, a unit id for build and crew. */
  outputId: string
  /** Made per running unit per week (units built, or units crewed). */
  amount: number
  /** Build only: stop when you own this many. */
  target?: number
  /** Build only: a part-built unit carried into next week. */
  carry?: number
  /** A catch the player accepted for a better result. */
  quirk?: QuirkId
  /** Weeks it has run (Slow to start). */
  weeksRun?: number
}

/** A passive income: so much of a stock resource every week, with no units needed. */
export interface Income {
  name: string
  resourceId: string
  amount: number
}

/** One change an upgrade makes. */
export type Change =
  | { kind: 'software'; share: number }
  /** New hardware: IQ × (1 + share). */
  | { kind: 'hardware'; name: string; share: number }
  | { kind: 'upkeep'; resourceId: string; factor: number }
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
  /** Passive income: once researched, adds `income.amount` every week. */
  | { kind: 'income'; income: Income }

/** What a research uses up: amounts of stock resources. */
export type Cost = Flow[]

/** Research is instant: a mind at least `minIQ` smart, the cost, and the week's research slot. */
export interface Research {
  id: string
  name: string
  description: string
  icon: string
  minIQ: number
  cost: Cost
  effect: ResearchEffect
  proposedWeek: number
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
  kind: 'resource' | 'strategy' | 'unit' | 'mind' | 'upgrade' | 'income'
}

export interface Stats {
  proposals: Record<Invention['kind'], number>
  rejections: number
  pushbacks: number
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
  wasted: Record<string, number>
}

export interface UnitWeek {
  /** Units with no task. */
  unassigned: number
  /** Units that couldn't pay their upkeep (in unit-equivalents). */
  unpaid: number
  /** Upkeep resource that ran short, if any. */
  unpaidFor: string | null
  /** Builders with nothing to build, because the target is reached. */
  done: number
  /** Not working this week (Intermittent). */
  resting: boolean
  built: number
  lost: number
}

export interface GameState {
  version: 9
  runId: string
  week: number
  resources: Resource[]
  minds: Mind[]
  units: UnitType[]
  strategies: Strategy[]
  research: Research[]
  /** Passive incomes from research: each adds its amount every week. */
  incomes: Income[]
  /** Names of finished upgrades, for the log and the end of a run. */
  upgrades: { name: string; targetId: string; week: number }[]
  /** One research proposal a week: accepting a strategy, unit, mind, upgrade or income uses it. */
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
