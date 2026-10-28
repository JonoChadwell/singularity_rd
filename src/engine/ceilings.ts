import { answerFor, readLevel, type JevAnswer, type JevQuestion } from '@/ai/jev'
import * as B from './balance'
import { capOf, unitCap } from './model'
import type { GameState, Resource, UnitType } from './types'

// How many of a thing can exist: asked once, when a resource or unit is added, and again when
// Phase 2 begins. Phase 3 has no ceilings. See "Ceilings" in RESOURCE_DESIGN.md.

export type CeilingKind = 'resource' | 'unit'

const table = (kind: CeilingKind) => (kind === 'resource' ? B.STORAGE_CEILINGS : B.UNIT_CEILINGS)

/** Phases 1 and 2 have ceilings; Phase 3 doesn't. */
export const hasCeilings = (state: GameState) => state.phase.n < 3

/** Asks how many of a thing could exist, or nothing in Phase 3. */
export function ceilingQuestion(state: GameState, kind: CeilingKind, name: string, key = 'ceiling'): Record<string, JevQuestion> {
  if (!hasCeilings(state)) return {}
  const made = kind === 'resource' ? 'made by anyone, for any use' : 'owned by anyone, for any use'
  return {
    [key]: {
      type: 'score',
      instructions:
        `At most, how many ${name} could exist in the world the AI is in, ${made}? ` +
        'The AI is still bound to Earth: never pick more than Earth could hold, unless the world text says it has reached beyond.',
      criteria: table(kind).map(([label]) => `About ${label}`)
    }
  }
}

/** Jev's ceiling, or null when it wasn't asked. */
export function readCeiling(answers: Record<string, JevAnswer>, kind: CeilingKind, key = 'ceiling'): number | null {
  if (!(key in answers)) return null
  const rows = table(kind)
  return rows[readLevel(answerFor(answers, key), rows.length)]![1]
}

/** A ceiling in words: "a billion", or "no limit". */
export function ceilingLabel(kind: CeilingKind, ceiling: number | null): string {
  if (ceiling === null) return 'no limit'
  return table(kind).find(([, n]) => n === ceiling)?.[0] ?? String(ceiling)
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
  for (const r of state.resources) r.ceiling = readCeiling(answers, 'resource', ceilingKey('resource', r.id)) ?? r.ceiling
  for (const u of state.units) u.ceiling = readCeiling(answers, 'unit', ceilingKey('unit', u.id)) ?? u.ceiling
}

/** Phase 3: nothing has a ceiling any more. */
export function clearCeilings(state: GameState) {
  for (const r of state.resources) r.ceiling = null
  for (const u of state.units) u.ceiling = null
}
