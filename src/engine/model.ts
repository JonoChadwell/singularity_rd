import * as B from './balance'
import { has, TRAITS } from './traits'
import { LAYERS } from './types'
import type { Flow, GameState, Layer, Project, Resource, Strategy, UnitType } from './types'

// ---------------------------------------------------------------- formatting

/** [shown from, divided by, suffix]. Thousands only get a suffix from 10k. */
const SUFFIXES: [number, number, string][] = [
  [1e15, 1e15, 'Q'],
  [1e12, 1e12, 'T'],
  [1e9, 1e9, 'B'],
  [1e6, 1e6, 'M'],
  [1e4, 1e3, 'k']
]

/** Short, readable numbers: 950, 12.4k, 3.1M, 2.0B. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1e18) return `${sign}${a.toExponential(1).replace('e+', 'e')}`
  for (const [from, size, suffix] of SUFFIXES) {
    if (a >= from) return `${sign}${(a / size).toFixed(a / size >= 100 ? 0 : 1)}${suffix}`
  }
  if (a >= 100) return `${sign}${Math.round(a).toLocaleString('en-US')}`
  if (a >= 10) return `${sign}${a.toFixed(1).replace(/\.0$/, '')}`
  if (a === 0) return '0'
  if (a < 0.01) return `${sign}<0.01`
  return `${sign}${a.toFixed(2).replace(/\.?0+$/, '')}`
}

/** Whole machine counts. */
export const fmtCount = (n: number) => fmt(Math.floor(n + 1e-9))

// ---------------------------------------------------------------- lookups

export const findResource = (state: GameState, id: string): Resource | undefined =>
  state.resources.find((r) => r.id === id)
export const findUnit = (state: GameState, id: string): UnitType | undefined =>
  state.units.find((u) => u.id === id)
export const findStrategy = (state: GameState, id: string): Strategy | undefined =>
  state.strategies.find((s) => s.id === id)
export const findProject = (state: GameState, id: string): Project | undefined =>
  state.projects.find((p) => p.id === id)

export const MONEY_ID = 'money'

/** A stable id from a name, so the same world always gives Jev the same request. */
export function makeId(state: GameState, name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'thing'
  const taken = new Set<string>([
    ...state.resources.map((r) => r.id),
    ...state.units.map((u) => u.id),
    ...state.strategies.map((s) => s.id),
    ...state.projects.map((p) => p.id),
    ...state.projects.flatMap((p) =>
      p.effect.kind === 'unit'
        ? [p.effect.unit.id, ...p.effect.strategies.map((s) => s.id)]
        : p.effect.kind === 'strategy'
          ? [p.effect.strategy.id]
          : []
    )
  ])
  let id = base
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`
  return id
}

/**
 * A unit never needs what it makes: a power plant never has Power upkeep. Money is the
 * exception, since units that earn Money can still be paid in it.
 */
export const runsOn = (u: UnitType, resourceId: string) =>
  resourceId !== MONEY_ID && u.upkeep.some((f) => f.resourceId === resourceId)

/** Every name in use, lowercased. */
export function namesInUse(state: GameState): Set<string> {
  return new Set(
    [
      ...state.resources.map((r) => r.name),
      ...state.units.map((u) => u.name),
      ...state.strategies.map((s) => s.name),
      ...state.projects.map((p) => p.name),
      ...state.breakthroughs.map((b) => b.name),
      ...state.projects.flatMap((p) => (p.effect.kind === 'unit' ? [p.effect.unit.name] : []))
    ].map((n) => n.toLowerCase())
  )
}

export function describeFlows(state: GameState, flows: Flow[], multiplier = 1): string {
  if (!flows.length) return 'nothing'
  return flows
    .map((f) => {
      const r = findResource(state, f.resourceId)
      return `${fmt(f.amount * multiplier)} ${r?.icon ?? '?'} ${r?.name ?? '?'}`
    })
    .join(' + ')
}

// ---------------------------------------------------------------- intelligence

export const currentIQ = (u: UnitType) => u.baseIQ * (1 + u.iqBonus)
export const ceilingIQ = (u: UnitType) => u.baseIQ * B.IQ_CEILING
/** The most a breakthrough can still add, as a share of base IQ. */
export const iqRoom = (u: UnitType) => Math.max(0, B.IQ_CEILING - 1 - u.iqBonus)

export const minds = (state: GameState) => state.units.filter((u) => u.mind)
export const industry = (state: GameState) => state.units.filter((u) => !u.mind)

// ---------------------------------------------------------------- value

/** Money-equivalent worth of one week of a unit's work. */
export function labour(u: UnitType): number {
  return u.mind ? B.mindLabour(currentIQ(u)) : u.value / B.PAYBACK_WEEKS
}

/** Perks raise a unit's price and drawbacks lower it. */
export function traitPriceFactor(traits: UnitType['traits']): number {
  return traits.reduce((f, id) => {
    const kind = TRAITS[id].kind
    return f * (kind === 'perk' ? B.PERK_PRICE : kind === 'drawback' ? B.DRAWBACK_PRICE : 1)
  }, 1)
}

/** Base price in Money of one from humanity's market, before prices climb. */
export const basePrice = (u: UnitType) => u.value * traitPriceFactor(u.traits)

/** Parts per unit built, after Mass-produced. */
export function partsFor(u: UnitType): Flow[] {
  if (!has(u, 'mass-produced')) return u.parts
  const factor = (1 - B.MASS_PRODUCED) ** Math.floor(Math.log10(Math.max(1, u.built)))
  return u.parts.map((p) => ({ ...p, amount: p.amount * factor }))
}

// ---------------------------------------------------------------- supply layers

export function layerSize(u: UnitType, layer: Layer): number {
  const base = u.layers[layer]
  if (!base) return 0
  let size = base
  if (has(u, 'compact')) size *= B.LAYER_TRAIT.compact
  if (has(u, 'bulky')) size *= B.LAYER_TRAIT.bulky
  return Math.max(1, Math.floor(size))
}

/** How many of this unit can exist: every unlocked supply layer added up. */
export function unitLimit(u: UnitType): number {
  if (u.starting) return 1
  const total = LAYERS.reduce((sum, l) => sum + layerSize(u, l), 0)
  return has(u, 'megastructure') ? Math.min(total, B.MEGA_LIMIT) : total
}

/** Units owned or on their way. */
export const owned = (u: UnitType) => u.count + u.pending.reduce((n, p) => n + p.count, 0)

/** How many more humanity will sell. */
export function marketLeft(u: UnitType): number {
  const size = layerSize(u, 'market')
  return Math.max(0, Math.min(size - u.bought, unitLimit(u) - owned(u)))
}

/** The layer the next unit comes from. */
export function currentLayer(u: UnitType): Layer | null {
  let total = 0
  for (const l of LAYERS) {
    total += layerSize(u, l)
    if (owned(u) < total) return l
  }
  return null
}

// ---------------------------------------------------------------- market

const climbIntegral = (f: number) => f + (B.CLIMB / 4) * f ** 4

/** Money to buy `n` more from humanity. Prices climb as its supply runs out. */
export function marketCost(u: UnitType, n: number): number {
  const size = layerSize(u, 'market')
  if (n <= 0 || !size) return 0
  const f0 = u.bought / size
  const f1 = Math.min(1, (u.bought + n) / size)
  return basePrice(u) * size * (climbIntegral(f1) - climbIntegral(f0))
}

/** Price of the next one. */
export function marketPrice(u: UnitType): number {
  const size = layerSize(u, 'market')
  const f = size ? u.bought / size : 0
  return basePrice(u) * (1 + B.CLIMB * f ** 3)
}

export const moneyUpkeep = (u: UnitType) => u.upkeep.find((f) => f.resourceId === MONEY_ID)?.amount ?? 0

/**
 * The most you could buy with `money` while keeping `reserve` back, plus a week's Money
 * upkeep for the new units. Upkeep is paid from Money on hand, before the week's earnings
 * arrive, so spending everything would leave the machines idle.
 */
export function affordable(u: UnitType, money: number, reserve = 0): number {
  const budget = money - reserve
  let lo = 0
  let hi = marketLeft(u)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (marketCost(u, mid) + mid * moneyUpkeep(u) <= budget + 1e-9) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Money next week's running will use, from a preview. */
export function moneyUse(report: { flows: Record<string, { amount: number }[]> } | null): number {
  return -(report?.flows[MONEY_ID] ?? []).reduce((n, f) => n + Math.min(0, f.amount), 0)
}

// ---------------------------------------------------------------- tasks

/** Tasks a unit type can be given: its strategies and, for minds, open projects. */
export function tasksFor(state: GameState, u: UnitType): string[] {
  const strategies = state.strategies.filter((s) => s.unitId === u.id).map((s) => s.id)
  return u.mind ? [...strategies, ...state.projects.map((p) => p.id)] : strategies
}

export function taskName(state: GameState, taskId: string): string {
  return findStrategy(state, taskId)?.name ?? findProject(state, taskId)?.name ?? '?'
}

/**
 * Machines on each task this week. Explicit counts come first, in the order they were set;
 * the `rest` task takes everything left over. What remains is unassigned.
 */
export function allocation(state: GameState, u: UnitType): { byTask: Record<string, number>; free: number } {
  const valid = new Set(tasksFor(state, u))
  const byTask: Record<string, number> = {}
  let left = u.count
  for (const [task, n] of Object.entries(u.assign)) {
    if (!valid.has(task) || task === u.rest) continue
    const take = Math.max(0, Math.min(left, Math.floor(n)))
    if (take > 0) byTask[task] = take
    left -= take
  }
  if (u.rest && valid.has(u.rest) && left > 0) {
    byTask[u.rest] = left
    left = 0
  }
  return { byTask, free: left }
}

/** Ensures a single-strategy industry unit runs it with all its units. */
export function defaultTask(state: GameState, u: UnitType) {
  if (u.rest && tasksFor(state, u).includes(u.rest)) return
  const tasks = state.strategies.filter((s) => s.unitId === u.id)
  if (!u.mind && tasks.length === 1) u.rest = tasks[0]!.id
}
