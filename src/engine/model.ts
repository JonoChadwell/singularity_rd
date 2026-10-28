import * as B from './balance'
import { iqShiftOf, type ResearchType } from './computeTraits'
import { refundOf } from './resourceTraits'
import { has, TRAITS } from './traits'
import type { CreateTarget, Delivery, Flow, GameState, Mind, Research, Resource, Sourcing, Strategy, UnitType } from './types'

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

/** A tier, in words: "Tier 2, made". Resources and units share the scale. */
export const tierLabel = (tier: number) => `Tier ${tier}, ${(B.TIERS[tier]?.[0] ?? '').toLowerCase()}`

/** Resources by tier, lowest first. Those of a tier keep the order they were made in. */
export const byTier = (resources: readonly Resource[]): Resource[] => [...resources].sort((a, b) => a.tier - b.tier)

/** A resource's tier, in words: "Tier 1, earned". */
export const tierText = (r: Resource) => tierLabel(r.tier)

/** What one of a unit is worth, in words: "modest, like a car". */
export function unitValueText(value: number): string {
  if (!(value > 0)) return ''
  const away = (band: number) => Math.abs(Math.log(B.UNIT_VALUE[band]![1] / value))
  let nearest = 0
  for (let band = 1; band < B.UNIT_VALUE.length; band++) if (away(band) < away(nearest)) nearest = band
  return B.UNIT_VALUE[nearest]![0].toLowerCase()
}

/**
 * How a unit's tier fits the tier of what it makes: below it, the output is cut hard, a tier
 * at a time; above it, a fifth more for each tier.
 */
export function tierFactor(unitTier: number, outputTier: number): number {
  const gap = unitTier - outputTier
  if (gap >= 0) return B.TIER_BONUS ** gap
  return B.TIER_PENALTY[Math.min(B.TIER_PENALTY.length - 1, -gap)]!
}

/** The tier fit in words, or null when the tiers match. Never shows the numbers. */
export function tierFit(unitTier: number, outputTier: number): { text: string; good: boolean } | null {
  const gap = unitTier - outputTier
  if (gap === 0) return null
  if (gap > 0) return { text: gap === 1 ? 'Overqualified' : 'Far overqualified', good: true }
  return { text: gap === -1 ? 'Struggling' : gap === -2 ? 'Far out of its depth' : 'Hopeless', good: false }
}

/** A strategy's efficiency in Jev's word: "Brilliant". Null for crew strategies. */
export function efficiencyWord(s: Strategy): string | null {
  if (s.kind !== 'make' || s.efficiency === undefined) return null
  return B.EFFICIENCY.find(([, m]) => m === s.efficiency)?.[0] ?? null
}

/** What one of a resource is worth, in words: "modest, like a meal". */
export const bandText = (r: Resource) => (B.RESOURCE_VALUE[r.band]?.[0] ?? '').toLowerCase()

// ---------------------------------------------------------------- lookups

export const findResource = (state: GameState, id: string): Resource | undefined =>
  state.resources.find((r) => r.id === id)
export const findUnit = (state: GameState, id: string): UnitType | undefined =>
  state.units.find((u) => u.id === id)
export const findMind = (state: GameState, id: string): Mind | undefined =>
  state.minds.find((m) => m.id === id)
export const findStrategy = (state: GameState, id: string): Strategy | undefined =>
  state.strategies.find((s) => s.id === id)
export const findResearch = (state: GameState, id: string): Research | undefined =>
  state.research.find((r) => r.id === id)
export const findSourcing = (state: GameState, id: string): Sourcing | undefined =>
  state.sourcing.find((c) => c.id === id)
/** A unit type's sourcing contracts, oldest first. */
export const contractsFor = (state: GameState, unitId: string): Sourcing[] =>
  state.sourcing.filter((c) => c.unitId === unitId)

export const MONEY_ID = 'money'

/** What a research will add to the world, if it's done. */
function researchThing(r: Research): { id: string; name: string } | null {
  const e = r.effect
  return e.kind === 'unit' ? e.unit : e.kind === 'mind' ? e.mind : e.kind === 'strategy' ? e.strategy : null
}

/** Ids a research will add, for picking fresh ids. */
function researchIds(r: Research): string[] {
  const thing = researchThing(r)
  return thing ? [thing.id] : []
}

/** A stable id from a name, so the same world always gives Jev the same request. */
export function makeId(state: GameState, name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
      .replace(/-$/, '') || 'thing'
  const taken = new Set<string>([
    ...state.resources.map((r) => r.id),
    ...state.minds.map((m) => m.id),
    ...state.units.map((u) => u.id),
    ...state.strategies.map((s) => s.id),
    ...state.research.map((r) => r.id),
    ...state.sourcing.map((c) => c.id),
    ...state.research.flatMap(researchIds)
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
      ...state.minds.map((m) => m.name),
      ...state.units.map((u) => u.name),
      ...state.strategies.map((s) => s.name),
      ...state.research.map((r) => r.name),
      ...state.research.flatMap((r) => researchThing(r)?.name ?? [])
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

/** A Procurement's target, by name and icon. */
export function targetLabel(state: GameState, t: CreateTarget): string {
  const thing = t.kind === 'unit' ? findUnit(state, t.id) : findResource(state, t.id)
  return thing ? `${thing.icon} ${thing.name}` : '?'
}

const weeksText = (n: number) => `${n} week${n === 1 ? '' : 's'}`

/**
 * When a delivery pays, in words: "next week", "in 4 weeks", "every week for 3 more weeks", "every
 * week, for good". A delivery pays at the end of the week its delay runs out, so one with a delay of
 * 3 pays in 4 weeks.
 */
export function deliveryTiming(d: Delivery): string {
  const first = d.delay + 1
  const start = first === 1 ? 'from next week' : `from ${weeksText(first)}’ time`
  if (d.weeks === null) return d.delay ? `every week, for good, ${start}` : 'every week, for good'
  if (d.weeks === 1) return first === 1 ? 'next week' : `in ${weeksText(first)}`
  return d.delay ? `every week for ${weeksText(d.weeks)}, ${start}` : `every week for ${weeksText(d.weeks)} more`
}

/** What a delivery has still to pay in all, or Infinity for one that pays for good. */
export const deliveryLeft = (d: Delivery) => (d.weeks === null ? Infinity : d.amount * d.weeks)

/** A delivery in words: "+300 💰 Money every week, for good" or "+40 🤖 Robots in 4 weeks". */
export function describeDelivery(state: GameState, d: Delivery): string {
  return `+${fmt(d.amount)} ${targetLabel(state, d.target)} ${deliveryTiming(d)}`
}

/** What a resource can hold: its cap, its expansions, and units that Store it. */
export function capOf(state: GameState, r: Resource): number {
  let cap = r.cap
  for (const e of r.expansions) cap += e.added
  for (const u of state.units) {
    if (u.stores === r.id && has(u, 'stores')) cap += (u.count * labour(u) * B.STORE_WEEKS) / Math.max(1e-9, r.value)
  }
  return cap
}

/** The cap a new resource of this tier and value starts with. */
export const startingCap = (tier: number, value: number) =>
  B.nice((B.STARTING_STORAGE_WORTH[Math.min(tier, B.STARTING_STORAGE_WORTH.length - 1)] ?? 0) / Math.max(1e-9, value))

/** Room left in a resource's storage. */
export const room = (state: GameState, r: Resource) => Math.max(0, capOf(state, r) - r.amount)

// ---------------------------------------------------------------- intelligence

/** A mind's IQ is its hardware's, plus what its one software upgrade added. */
export const currentIQ = (m: Mind) => m.hardware.iq + m.software.iq
/** Software starts at v1; its one upgrade makes it v2. */
export const softwareVersion = (upgraded: boolean) => (upgraded ? 'v2' : 'v1')
export const softwareLabel = (m: Mind) => `${m.software.name} ${softwareVersion(m.software.upgraded)}`

/** The smartest mind's IQ: what research has to reach. */
export const bestIQ = (state: GameState) => Math.max(0, ...state.minds.map(currentIQ))
/** The mind that does the research: the smartest (there is only ever one). */
export const bestMind = (state: GameState): Mind | undefined =>
  [...state.minds].sort((a, b) => currentIQ(b) - currentIQ(a))[0]

/** "Hardware" → "Hardware Mk II"; "Hardware Mk II" → "Hardware Mk III". For the name box's one-click fill. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
export function nextHardwareName(name: string): string {
  const m = /^(.*) Mk ([IVX]+)$/.exec(name.trim())
  const base = m ? m[1]! : name.trim()
  const at = m ? ROMAN.indexOf(m[2]!) : 0
  return `${base} Mk ${ROMAN[Math.min(ROMAN.length - 1, at + 1)]}`
}

/** The research a platform's IQ can be adjusted for. Goals and platforms always use the raw IQ. */
export function researchType(r: Research): ResearchType | null {
  const e = r.effect
  switch (e.kind) {
    case 'strategy':
      return 'strategy'
    case 'unit':
      return 'unit'
    case 'cover':
      return 'cover'
    case 'upgrade':
      return e.target.kind === 'unit' ? 'unit-upgrade' : null
    default:
      return null
  }
}

/** The IQ the smartest mind counts for a type of research: its IQ, moved by its traits. */
export function iqFor(state: GameState, type: ResearchType | null): number {
  const mind = bestMind(state)
  if (!mind) return 0
  return Math.max(0, currentIQ(mind) + (type ? iqShiftOf(mind.traits, type) : 0))
}

/** The IQ that counts toward a particular research. */
export const researchIQ = (state: GameState, r: Research) => iqFor(state, researchType(r))

// ---------------------------------------------------------------- value

/**
 * Worth of one week of a unit's work: its value over PAYBACK_WEEKS, times what a dollar of its
 * tier earns. Value is how big one is; tier is how well it works.
 */
export const labourOf = (value: number, tier: number) =>
  (value / B.PAYBACK_WEEKS) * (B.TIER_YIELD[Math.min(B.TIER_YIELD.length - 1, Math.max(0, tier))] ?? 1)

/** Worth of one week of a unit's work. */
export const labour = (u: UnitType) => labourOf(u.value, u.tier)

/** Perks make a unit dearer to make and drawbacks cheaper. */
export function traitPriceFactor(traits: UnitType['traits']): number {
  return traits.reduce((f, id) => {
    const kind = TRAITS[id].kind
    return f * (kind === 'perk' ? B.PERK_PRICE : kind === 'drawback' ? B.DRAWBACK_PRICE : 1)
  }, 1)
}

/** Parts per unit created from a contract, after Mass-produced. */
export function partsFor(u: UnitType, c: Sourcing): Flow[] {
  if (!has(u, 'mass-produced')) return c.parts
  const factor = (1 - B.MASS_PRODUCED) ** Math.floor(Math.log10(Math.max(1, u.built)))
  return c.parts.map((p) => ({ ...p, amount: p.amount * factor }))
}

/** Units owned or on their way. */
export const owned = (u: UnitType) => u.count + u.pending.reduce((n, p) => n + p.count, 0)

/** How many of a unit type you may own: the sum of its contracts. A new design has none. */
export const unitCap = (state: GameState, unitId: string) =>
  contractsFor(state, unitId).reduce((n, c) => n + c.total, 0)

/** Slots left on a contract. */
export const openSlots = (c: Sourcing) => Math.max(0, c.total - c.used)

/** Worth of every unit you own: what the Industry scalar grows with. */
export const industryWorth = (state: GameState) => state.units.reduce((n, u) => n + owned(u) * u.value, 0)

/**
 * The highest tier of unit that makes anything: what your industry can reach without strain. At
 * least 1, the mind itself, so a game with no units yet reaches tier 1 freely.
 */
export function industryTier(state: GameState): number {
  let tier = 1
  for (const u of state.units) {
    if (u.count > 0 && state.strategies.some((s) => s.unitId === u.id && s.kind === 'make')) tier = Math.max(tier, u.tier)
  }
  return tier
}

/** The Industry scalar: 1 with no units, one step per decade of unit worth, up to INDUSTRY_MAX. */
export function industryScalar(state: GameState): number {
  const decades = Math.log10(1 + industryWorth(state) / B.INDUSTRY_FROM)
  return 1 + (B.INDUSTRY_MAX - 1) * Math.min(1, decades / B.INDUSTRY_DECADES)
}

/** The IQ scalar: (IQ / 100)², with the IQ counted for Procurements. */
export const iqScalar = (state: GameState) => (iqFor(state, 'create') / 100) ** 2

// ---------------------------------------------------------------- creating units

/** The flow row for what didn't fit in storage: lost, not used. */
export const OVERFLOW = 'Overflowed storage'
/** The flow rows for what a resource's own traits lose or grow each week. */
export const TRAIT_LOSS = 'Lost to its nature'
export const TRAIT_GROWTH = 'Grew on its own'
/** Rows that are lost, not used. */
export const isLoss = (label: string) => label === OVERFLOW || label === TRAIT_LOSS

/** Stock each resource that next week's running will use, from a preview. Losses aren't use. */
export function weeklyUse(report: { flows: Record<string, { label: string; amount: number }[]> } | null): Record<string, number> {
  const use: Record<string, number> = {}
  for (const [id, flows] of Object.entries(report?.flows ?? {})) {
    use[id] = -flows.reduce((n, f) => n + (isLoss(f.label) ? 0 : Math.min(0, f.amount)), 0)
  }
  return use
}

/**
 * The most you could create from a contract while keeping `reserve` of each resource back, plus
 * a week's upkeep and default-strategy inputs for the new units, so spending everything doesn't
 * leave them idle. Never more than the contract's open slots.
 */
export function creatable(state: GameState, c: Sourcing, reserve: Record<string, number> = {}): number {
  const u = findUnit(state, c.unitId)
  if (!u) return 0
  const per = new Map<string, number>()
  const add = (f: Flow) => per.set(f.resourceId, (per.get(f.resourceId) ?? 0) + f.amount)
  for (const p of partsFor(u, c)) add(p)
  for (const f of u.upkeep) add(f)
  // New units join the default (rest) strategy, so they also use its inputs.
  const task = u.rest ? findStrategy(state, u.rest) : undefined
  if (task) for (const f of task.inputs) add(f)
  return Math.min(openSlots(c), mostFrom(state, per, reserve))
}

/** The most you can pay the parts for right now from a contract, ignoring upkeep. */
export function affordable(state: GameState, c: Sourcing): number {
  const u = findUnit(state, c.unitId)
  if (!u) return 0
  const per = new Map<string, number>()
  for (const p of partsFor(u, c)) per.set(p.resourceId, (per.get(p.resourceId) ?? 0) + p.amount)
  return Math.min(openSlots(c), mostFrom(state, per, {}))
}

function mostFrom(state: GameState, per: Map<string, number>, reserve: Record<string, number>): number {
  let most = Infinity
  for (const [id, amount] of per) {
    if (amount <= 0) continue
    const have = (findResource(state, id)?.amount ?? 0) - (reserve[id] ?? 0)
    most = Math.min(most, Math.floor(Math.max(0, have) / amount + 1e-9))
  }
  return Number.isFinite(most) ? most : 0
}

// ---------------------------------------------------------------- tasks

/** Tasks a unit type can be given: its strategies. */
export const tasksFor = (state: GameState, u: UnitType): string[] =>
  state.strategies.filter((s) => s.unitId === u.id).map((s) => s.id)

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

/** Ensures a single-strategy unit runs it with all its units. */
export function defaultTask(state: GameState, u: UnitType) {
  const tasks = state.strategies.filter((s) => s.unitId === u.id)
  if (tasks.some((s) => s.id === u.rest)) return
  if (tasks.length === 1) u.rest = tasks[0]!.id
}

/** Whether the world has what a research uses up. Returns what's short, or null. */
/**
 * Pays a cost (research or unit parts). Recyclable resources send part of what's spent back
 * next week, as a delivery.
 */
export function payCost(state: GameState, cost: Flow[], name: string) {
  for (const c of cost) {
    const r = findResource(state, c.resourceId)
    if (!r) continue
    const paid = Math.min(r.amount, c.amount)
    r.amount = Math.max(0, r.amount - c.amount)
    const back = paid * refundOf(r)
    if (back > 1e-9) {
      state.deliveries.push({ name: `${name} (recycled)`, target: { kind: 'resource', id: r.id }, amount: back, delay: 0, weeks: 1 })
    }
  }
}

export function costShortfall(state: GameState, cost: Research['cost']): string | null {
  for (const c of cost) {
    const r = findResource(state, c.resourceId)
    if (!r) return 'a resource that no longer exists'
    if (r.amount < c.amount - 1e-9) {
      const cap = capOf(state, r)
      const room = c.amount > cap + 1e-9 ? ` (it can only hold ${fmt(cap)}: store more ${r.name} first)` : ''
      return `${fmt(c.amount - r.amount)} more ${r.name}${room}`
    }
  }
  return null
}

/** A cost in words: "4,000 🧪 Silicon + 2,000 💰 Money". */
export const describeCost = (state: GameState, cost: Research['cost']) => describeFlows(state, cost)
