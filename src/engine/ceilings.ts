import { answerFor, ranked, readLevel, type JevAnswer, type JevQuestion } from '@/ai/jev'
import * as B from './balance'
import { capOf, unitCap } from './model'
import type { GameState, Resource, UnitType } from './types'

// How many of a thing the AI could reasonably have in its phase: asked once, when a resource or
// unit is added, and again when Phase 2 begins. Phase 3 has no ceilings. See "Ceilings" in
// RESOURCE_DESIGN.md.

export type CeilingKind = 'resource' | 'unit'

/** The rungs Jev picks from: resources in the lab have their own, smaller ones. */
const table = (state: GameState, kind: CeilingKind) =>
  kind === 'unit' ? B.UNIT_CEILINGS : state.phase.n === 1 ? B.LAB_CEILINGS : B.STORAGE_CEILINGS

/** Phases 1 and 2 have ceilings; Phase 3 doesn't. */
export const hasCeilings = (state: GameState) => state.phase.n < 3

/** Asks how many of a thing the AI could have in its phase, or nothing in Phase 3. */
export function ceilingQuestion(state: GameState, kind: CeilingKind, name: string, key = 'ceiling'): Record<string, JevQuestion> {
  if (!hasCeilings(state)) return {}
  const get = kind === 'resource' ? 'make, buy or talk people into' : 'build, buy or have run for it'
  const instructions =
    state.phase.n === 1
      ? `At most, how many ${name} could the AI reasonably have while it is still stuck in a supervised research lab: what it could ${get}, without its overseers noticing?`
      : `At most, how many ${name} could the AI reasonably have while humans are still dominant over AI: everything it could gather through fronts, companies and people, without humanity treating it as a threat? ` +
        'The AI is still bound to Earth: never pick more than Earth could hold, unless the world text says it has reached beyond.'
  return {
    [key]: { type: 'score', instructions, criteria: table(state, kind).map(([label]) => `About ${label}`) }
  }
}

/** Rounds up or to the nearest one significant figure: 31,623 → 30,000. */
export const niceCeiling = (n: number, up = false) => {
  const unit = 10 ** Math.floor(Math.log10(n))
  return (up ? Math.ceil(n / unit - 1e-9) : Math.round(n / unit)) * unit
}

/**
 * Jev's ceiling, or null when it wasn't asked: its top two rungs, blended by how likely each is
 * (in powers of ten), rounded to a nice number.
 */
export function readCeiling(state: GameState, answers: Record<string, JevAnswer>, kind: CeilingKind, key = 'ceiling'): number | null {
  if (!(key in answers)) return null
  const rows = table(state, kind)
  const answer = answerFor(answers, key)
  const at = (level: string) => rows[Math.min(rows.length - 1, Math.max(0, Number(level) || 0))]![1]
  const [a, b] = ranked(answer)
  if (!a || !b || !(a[1] + b[1] > 0)) return rows[readLevel(answer, rows.length)]![1]
  const log = (a[1] * Math.log10(at(a[0])) + b[1] * Math.log10(at(b[0]))) / (a[1] + b[1])
  return niceCeiling(10 ** log)
}

/**
 * In the lab, a resource's ceiling is worth at most LAB_CEILING_WORTH, but always leaves room for
 * its storage to double.
 */
export function boundLabCeiling(state: GameState, r: Resource) {
  if (state.phase.n !== 1 || r.ceiling === null) return
  const worth = r.value > 0 ? niceCeiling(B.LAB_CEILING_WORTH / r.value) : Infinity
  r.ceiling = Math.max(niceCeiling(B.LAB_CEILING_ROOM * r.cap, true), Math.min(r.ceiling, worth))
}

const SCALES: [number, string][] = [
  [1e18, 'quintillion'],
  [1e15, 'quadrillion'],
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
  [1, '']
]

/** A count in words: 10 → "ten", 1e6 → "a million", 3e7 → "30 million", 2,500 → "2.5 thousand". */
function countWords(n: number): string {
  const [size, word] = SCALES.find(([s]) => n >= s) ?? [1, '']
  const m = Number((n / size).toPrecision(3))
  const lead = m === 1 ? 'a' : m === 10 ? 'ten' : m === 100 ? 'a hundred' : String(m)
  if (!word) return m === 1 ? 'one' : lead
  return `${lead} ${word}`
}

/** A ceiling in words: "a billion", "3 million", or "no limit". */
export function ceilingLabel(ceiling: number | null): string {
  return ceiling === null ? 'no limit' : countWords(ceiling)
}

/** Room left under a resource's ceiling for more storage: Infinity with none. */
export const storageRoom = (state: GameState, r: Resource) =>
  r.ceiling === null ? Infinity : Math.max(0, Math.floor(r.ceiling - capOf(state, r)))

/** Room left under a unit's ceiling for more contracts: Infinity with none. */
export const unitRoom = (state: GameState, u: UnitType) =>
  u.ceiling === null ? Infinity : Math.max(0, Math.floor(u.ceiling - unitCap(state, u.id)))

/** The key for one thing's ceiling in a call that asks about several. */
export const ceilingKey = (kind: CeilingKind, id: string) => `ceiling_${kind === 'resource' ? 'r' : 'u'}_${id.replace(/-/g, '_')}`

/** Every resource's and unit's ceiling, asked again in one call when Phase 2 begins. */
export function recomputeQuestions(state: GameState): Record<string, JevQuestion> {
  return Object.assign(
    {},
    ...state.resources.map((r) => ceilingQuestion(state, 'resource', r.name, ceilingKey('resource', r.id))),
    ...state.units.map((u) => ceilingQuestion(state, 'unit', u.name, ceilingKey('unit', u.id)))
  )
}

/** Writes the recomputed ceilings: a cap already past its new ceiling is kept, with no room left. */
export function applyCeilings(state: GameState, answers: Record<string, JevAnswer>) {
  for (const r of state.resources) r.ceiling = readCeiling(state, answers, 'resource', ceilingKey('resource', r.id)) ?? r.ceiling
  for (const u of state.units) u.ceiling = readCeiling(state, answers, 'unit', ceilingKey('unit', u.id)) ?? u.ceiling
}

/** Phase 3: nothing has a ceiling any more. */
export function clearCeilings(state: GameState) {
  for (const r of state.resources) r.ceiling = null
  for (const u of state.units) u.ceiling = null
}
