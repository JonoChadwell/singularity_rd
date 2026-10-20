import { checkMilestones } from './cycle'
import { addUnits } from './economy'
import {
  bestIQ,
  costShortfall,
  findResearch,
  findResource,
  findStrategy,
  findUnit,
  partsFor,
  tasksFor
} from './model'
import { completeResearch } from './research'
import type { Flow, GameState } from './types'

// Planning actions. They take no time: each returns a new state, or throws a reason.

function draft(current: GameState): GameState {
  const state = structuredClone(current)
  state.decidedThisWeek = true
  return state
}

/** What creating `n` of a unit uses up. */
export const createCost = (parts: Flow[], n: number): Flow[] => parts.map((p) => ({ ...p, amount: p.amount * n }))

/** Creates units from their parts. They work this week, unless Slow to build. */
export function createUnits(current: GameState, unitId: string, n: number): GameState {
  const state = draft(current)
  const u = findUnit(state, unitId)
  n = Math.floor(n)
  if (!u || n <= 0) throw new Error('Nothing to create.')
  const cost = createCost(partsFor(u), n)
  const short = costShortfall(state, cost)
  if (short) throw new Error(`You need ${short}.`)
  for (const c of cost) findResource(state, c.resourceId)!.amount -= c.amount
  u.built += n
  addUnits(u, n, true)
  checkMilestones(state)
  return state
}

/** Sets how many machines of a type work on a task. */
export function assign(current: GameState, unitId: string, taskId: string, n: number): GameState {
  const state = draft(current)
  const u = findUnit(state, unitId)
  if (!u || !tasksFor(state, u).includes(taskId)) throw new Error('Unknown task.')
  if (u.rest === taskId) u.rest = null
  const count = Math.max(0, Math.floor(n))
  // Re-inserting puts the task last, so the counts set most recently give way first.
  delete u.assign[taskId]
  if (count > 0) u.assign[taskId] = count
  return state
}

/** Gives a task every machine not counted elsewhere, so new machines join it. */
export function assignRest(current: GameState, unitId: string, taskId: string | null): GameState {
  const state = draft(current)
  const u = findUnit(state, unitId)
  if (!u) throw new Error('Unknown unit.')
  if (taskId && !tasksFor(state, u).includes(taskId)) throw new Error('Unknown task.')
  if (taskId) delete u.assign[taskId]
  u.rest = taskId
  return state
}

/** Moves every machine of a type to one task. */
export function assignAll(current: GameState, unitId: string, taskId: string): GameState {
  const state = draft(current)
  const u = findUnit(state, unitId)
  if (!u || !tasksFor(state, u).includes(taskId)) throw new Error('Unknown task.')
  u.assign = {}
  u.rest = taskId
  return state
}

export function setBuildTarget(current: GameState, strategyId: string, target: number): GameState {
  const state = draft(current)
  const s = findStrategy(state, strategyId)
  if (!s || s.kind !== 'build') throw new Error('Not a build strategy.')
  s.target = Math.max(0, Math.floor(target))
  return state
}

export function setOverclock(current: GameState, unitId: string, on: boolean): GameState {
  const state = draft(current)
  const u = findUnit(state, unitId)
  if (!u) throw new Error('Unknown unit.')
  u.overclocked = on
  return state
}

/** Why a research can't be done right now, or null if it can. */
export function researchBlocker(state: GameState, researchId: string): string | null {
  const r = findResearch(state, researchId)
  if (!r) return 'No such research.'
  const best = bestIQ(state)
  if (best < r.minIQ) return `Needs IQ ${r.minIQ}. Your smartest mind is IQ ${Math.round(best)}.`
  const short = costShortfall(state, r.cost)
  return short ? `You need ${short}.` : null
}

/**
 * Does a research at once: uses up its cost and applies it. Any number a week; the weekly
 * limit is on proposing research, not doing it.
 */
export function doResearch(current: GameState, researchId: string): GameState {
  const blocker = researchBlocker(current, researchId)
  if (blocker) throw new Error(blocker)
  const state = draft(current)
  const r = findResearch(state, researchId)!
  for (const c of r.cost) {
    const res = findResource(state, c.resourceId)!
    res.amount = Math.max(0, res.amount - c.amount)
  }
  state.stats.researched++
  state.log.push({ week: state.week, tone: 'good', text: completeResearch(state, r) })
  checkMilestones(state)
  return state
}

/** Drops a research you no longer want. */
export function dropResearch(current: GameState, researchId: string): GameState {
  const state = draft(current)
  if (!findResearch(state, researchId)) throw new Error('No such research.')
  state.research = state.research.filter((r) => r.id !== researchId)
  return state
}
