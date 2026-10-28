import * as B from './balance'
import { previewWeek } from './economy'
import { bestIQ, capOf, contractsFor, findUnit, industryScalar, iqFor, isLoss, openSlots, owned, partsFor } from './model'
import type { GameState, WeekReport } from './types'

// What an action is worth, worked out from the game state: what it adds at once, and what it
// changes each week after. Everything is in worth (amount × value), so a unit's or resource's
// value cancels out. It never asks Jev and never plays more than the one-week preview, so it is
// as cheap and deterministic as the preview. See ECONOMY_DESIGN.md, "Action values".

/** Weeks an action's effect is followed for. */
export const HORIZON = 40

/** How often the AI is assumed to Procure, for what more IQ is worth to Procurements: every other week. */
export const PROCURE_RATE = 0.5

export type ActionKind =
  | 'procure'
  | 'units'
  | 'contract'
  | 'strategy'
  | 'design'
  | 'upgrade'
  | 'software'
  | 'platform'
  | 'storage'
  | 'cover'
  | 'goal'
  | 'none'

export interface ActionValue {
  kind: ActionKind
  label: string
  /** Change in net worth at once: what it adds, less what it uses up. Units count at their value. */
  now: number
  /** Worth paid now (inputs, parts, research), for the report. */
  cost: number
  /** Change in net worth each week after, week by week, for HORIZON weeks. */
  weekly: number[]
  /** Weeks it moves the clock by: negative is time lost. */
  clock: number
  /** What it makes possible that no worth captures: a tier, the goal's IQ. */
  unlocks: string[]
}

/** Net worth of what you hold, worth by worth: stocks (what fits in storage) and units owned. */
export function worthOf(state: GameState): { stock: number; fleet: number; net: number; byTier: number[] } {
  let stock = 0
  for (const r of state.resources) stock += Math.min(r.amount, capOf(state, r)) * r.value
  const byTier = [0, 0, 0, 0, 0]
  for (const u of state.units) byTier[Math.min(4, u.tier)]! += owned(u) * u.value
  const fleet = byTier.reduce((a, b) => a + b, 0)
  return { stock, fleet, net: stock + fleet, byTier }
}

/** Labels of a week's rows that are Procurement deliveries, not running. */
const deliveryNames = (state: GameState) => new Set(state.deliveries.map((d) => d.name))

/**
 * What a week of running does to net worth, deliveries left out: everything made, less
 * everything used, lost or overflowed. Stock already over its cap is lost at once, so it isn't
 * counted against the running.
 */
export function runningNet(state: GameState, report: WeekReport = previewWeek(state)): number {
  const value = new Map(state.resources.map((r) => [r.id, r.value]))
  const delivered = deliveryNames(state)
  let net = 0
  for (const [id, rows] of Object.entries(report.flows)) {
    for (const row of rows) if (!delivered.has(row.label)) net += row.amount * (value.get(id) ?? 0)
  }
  for (const r of state.resources) net += Math.max(0, r.amount - capOf(state, r)) * r.value
  return net
}

/** Worth made in a week: everything made or delivered, at value. Nothing used is taken off. */
export function grossIncome(state: GameState, report: WeekReport = previewWeek(state)): number {
  const value = new Map(state.resources.map((r) => [r.id, r.value]))
  let made = 0
  for (const [id, rows] of Object.entries(report.flows)) {
    for (const row of rows) if (row.amount > 0 && !isLoss(row.label)) made += row.amount * (value.get(id) ?? 0)
  }
  return made
}

/** Worth Procurements still deliver, week by week, for HORIZON weeks. Units delivered count at their value. */
export function deliveryStream(state: GameState): number[] {
  const out = new Array<number>(HORIZON).fill(0)
  for (const d of state.deliveries) {
    const value =
      d.target.kind === 'resource'
        ? (state.resources.find((r) => r.id === d.target.id)?.value ?? 0)
        : (findUnit(state, d.target.id)?.value ?? 0)
    const weeks = d.weeks ?? HORIZON
    for (let t = d.delay; t < Math.min(HORIZON, d.delay + weeks); t++) out[t]! += d.amount * value
  }
  return out
}

/** The clock's deadline, or 0 with no clock. */
const deadline = (state: GameState) => state.phase.deadline ?? 0

/** Worth paid out of stock between two states, resource by resource. */
function paid(before: GameState, after: GameState): number {
  let n = 0
  for (const r of before.resources) {
    const later = after.resources.find((x) => x.id === r.id)
    if (later && later.amount < r.amount) n += (r.amount - later.amount) * r.value
  }
  return n
}

/**
 * What it was worth going from `before` to `after`: an action taken, its research done and
 * any units created. The running change is assumed to last; deliveries pay as they're set.
 */
export function valueChange(before: GameState, after: GameState, kind: ActionKind, label: string): ActionValue {
  const run = runningNet(after) - runningNet(before)
  const d0 = deliveryStream(before)
  const d1 = deliveryStream(after)
  return {
    kind,
    label,
    now: worthOf(after).net - worthOf(before).net,
    cost: paid(before, after),
    weekly: d1.map((x, t) => x - d0[t]! + run),
    clock: deadline(after) - deadline(before),
    unlocks: unlocks(before, after)
  }
}

/** What a step up in IQ opens: a tier of unit or resource, a platform gate, the goal. */
function unlocks(before: GameState, after: GameState): string[] {
  const [a, b] = [bestIQ(before), bestIQ(after)]
  if (b <= a) return []
  const out: string[] = []
  B.TIERS.forEach(([label, iq], tier) => {
    if (a < iq && b >= iq) out.push(`tier ${tier} (${label})`)
  })
  const goal = after.research.find((r) => r.effect.kind === 'goal')
  if (goal && a < goal.minIQ && b >= goal.minIQ) out.push('the goal')
  return out
}

/**
 * Worth more IQ adds to Procurements: the IQ scalar is (IQ / 100)², and the AI Procures about
 * every other week. Only new Procurements gain; what you own doesn't change.
 */
export function iqWorth(before: GameState, after: GameState): number[] {
  const gain = ((iqFor(after, 'create') / 100) ** 2 - (iqFor(before, 'create') / 100) ** 2) * B.CREATE_WORTH * industryScalar(after)
  return new Array<number>(HORIZON).fill(gain * PROCURE_RATE)
}

/**
 * Units a contract's open slots will take, week by week, as spare income pays their parts:
 * the running net worth goes into parts, one unit at a time, until the slots are full. Units
 * pay back what they cost in worth, so this only counts what they make.
 */
export function fillStream(state: GameState, unitId: string, perUnit: number, spare: number): number[] {
  const u = findUnit(state, unitId)
  const out = new Array<number>(HORIZON).fill(0)
  if (!u || perUnit <= 0 || spare <= 0) return out
  let slots = 0
  let price = 0
  for (const c of contractsFor(state, unitId)) {
    if (!c.parts.length || !openSlots(c)) continue
    slots += openSlots(c)
    const value = new Map(state.resources.map((r) => [r.id, r.value]))
    price = Math.max(price, partsFor(u, c).reduce((n, p) => n + p.amount * (value.get(p.resourceId) ?? 0), 0))
  }
  if (!slots || price <= 0) return out
  let filled = 0
  for (let t = 0; t < HORIZON; t++) {
    filled = Math.min(slots, filled + spare / price)
    out[t] = filled * perUnit
  }
  return out
}

/** Worth over the first `weeks` weeks: what it adds at once, and each week's change after. */
export function valueAt(v: Pick<ActionValue, 'now' | 'weekly'>, weeks: number): number {
  let n = v.now
  for (let t = 0; t < Math.min(weeks, v.weekly.length); t++) n += v.weekly[t]!
  return n
}

/**
 * Weeks until what it makes each week has paid back what it cost (0 if it cost nothing), or
 * Infinity if that takes longer than HORIZON.
 */
export function paybackWeeks(v: Pick<ActionValue, 'cost' | 'weekly'>): number {
  if (v.cost <= 0) return 0
  let n = 0
  for (let t = 0; t < v.weekly.length; t++) {
    n += v.weekly[t]!
    if (n >= v.cost) return t + 1
  }
  return Infinity
}

/** Adds two value streams, for an action made of several steps. */
export const addStreams = (a: number[], b: number[]) => a.map((x, t) => x + (b[t] ?? 0))

/** A stream that starts `weeks` later: for the steps of a play that take weeks of actions. */
export const delay = (stream: number[], weeks: number) =>
  stream.map((_, t) => (t >= weeks ? stream[t - weeks]! : 0))
