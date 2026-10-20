import type { JevAnswer } from '@/ai/jev'
import type { QuirkId, TraitId } from './traits'

export const FIELDS = ['computing', 'energy', 'materials', 'biology', 'physics', 'engineering'] as const
export type Field = (typeof FIELDS)[number]

export const LAYERS = ['market', 'own', 'earth'] as const
export type Layer = (typeof LAYERS)[number]

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
  /** How many humanity sells you each week (stocks only). 0 = not for sale. */
  market: number
  boughtThisWeek: number
}

export interface Flow {
  resourceId: string
  amount: number
}

export interface UnitType {
  id: string
  name: string
  description: string
  icon: string
  /** Intelligence systems think and can do research. Everything else is industry. */
  mind: boolean
  count: number
  /**
   * Minds only: the hardware platform it runs on. Its IQ is what the machine can think with
   * its first software. Hardware is hard to change: a big breakthrough, or a new design.
   */
  hardware: Hardware
  /** Minds only: the software it runs. Upgrades add IQ, up to the software ceiling. */
  software: Software
  /** Compute tier number, or 0 if this mind isn't a tier. */
  tier: number
  /** Worth of one, in Money. Sets its labour, its parts and its price. */
  value: number
  /** Jev's plausibility, kept for the card. */
  plausibility: number
  /** What building one in your own industry uses. */
  parts: Flow[]
  /** Paid per working unit per week. */
  upkeep: Flow[]
  /** Size of each supply layer, before traits. 0 = locked. */
  layers: Record<Layer, number>
  /** The unit that builds these in your own industry. */
  builderId: string | null
  /** Totals bought from humanity and built by your own industry. */
  bought: number
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
  /** Makes waste: the waste stock. */
  waste: string | null
  /** Specialist: the field it's good at. */
  field: Field | null
  overclocked: boolean
  /** Weeks it has run (Learns on the job). */
  weeksRun: number
  /** Slow to build: units on their way. */
  pending: { count: number; weeks: number }[]
  /** Slow to start: new units still warming up. `weeks` counts up. */
  ramp: { count: number; weeks: number }[]
  /** Task id (strategy id or project id) → machines on it. */
  assign: Record<string, number>
  /** The task that takes every machine not counted in `assign`. */
  rest: string | null
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
  /** Make only: the runner's labour when the amounts were set. Mind strategies scale with IQ. */
  scale?: number
  /** A catch the player accepted for a better result. */
  quirk?: QuirkId
  /** Weeks it has run (Slow to start). */
  weeksRun?: number
  /** Makes waste: the waste stock. */
  waste?: string
}

export type Change =
  | { kind: 'software'; share: number }
  /** New hardware: IQ × (1 + share), built from `parts`. Upkeep and price grow with it. */
  | { kind: 'hardware'; name: string; share: number; parts: string[] }
  | { kind: 'upkeep'; resourceId: string; factor: number }
  | { kind: 'parts'; resourceId: string; factor: number }
  | { kind: 'trait'; trait: TraitId; add: boolean }
  | { kind: 'layer'; layer: 'own' | 'earth'; builderId: string | null; parts: string[] }
  | { kind: 'output'; factor: number }
  | { kind: 'input'; resourceId: string; factor: number }
  | { kind: 'quirk'; quirk: QuirkId }

export type ProjectEffect =
  | { kind: 'unit'; unit: UnitType; strategies: Strategy[] }
  | { kind: 'strategy'; strategy: Strategy }
  | {
      kind: 'breakthrough'
      target: { kind: 'unit' | 'strategy'; id: string }
      changes: Change[]
      /** Parts for a new own-industry layer, priced when the project was proposed. */
      parts?: Flow[]
      /** Parameters for traits it adds, like which unit a new crew comes from. */
      params?: { trait: TraitId; param: string }[]
    }
  | { kind: 'final' }

export interface Project {
  id: string
  name: string
  description: string
  icon: string
  field: Field
  /** Groups whose effective IQ is below this contribute nothing. */
  bar: number
  size: number
  progress: number
  effect: ProjectEffect
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
  kind: 'resource' | 'strategy' | 'unit' | 'breakthrough'
}

export interface Stats {
  proposals: Record<Invention['kind'], number>
  rejections: number
  pushbacks: number
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
  /** Per project, each group of machines working on it. */
  groups: Record<string, ProjectGroup[]>
  /** Per project: progress this week. */
  progress: Record<string, number>
  /** Per unit type. */
  units: Record<string, UnitWeek>
  wasted: Record<string, number>
  finished: string[]
}

export interface ProjectGroup {
  unitId: string
  machines: number
  effectiveIQ: number
  clears: boolean
  speed: number
}

export interface UnitWeek {
  /** Machines with no task. */
  unassigned: number
  /** Machines that couldn't pay their upkeep (in machine-equivalents). */
  unpaid: number
  /** Upkeep resource that ran short, if any. */
  unpaidFor: string | null
  /** Builders with nothing to build, because the target or limit is reached. */
  done: number
  /** Not working this week (Intermittent). */
  resting: boolean
  built: number
  lost: number
  /** Stopped by waste. */
  choked: boolean
}

export interface GameState {
  version: 6
  runId: string
  week: number
  status: 'playing' | 'won'
  resources: Resource[]
  units: UnitType[]
  strategies: Strategy[]
  projects: Project[]
  /** Names of finished breakthroughs, for duplicate checks. */
  breakthroughs: { name: string; targetId: string; week: number }[]
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
