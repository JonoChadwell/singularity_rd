import { checkMilestones } from './cycle'
import { addUnits } from './economy'
import {
  bestIQ,
  costShortfall,
  findMind,
  findResearch,
  findResource,
  findSourcing,
  findUnit,
  openSlots,
  partsFor,
  researchIQ,
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

/** Dismisses an explainer card. Not a decision. */
export function dismissCard(current: GameState, id: string): GameState {
  const state = structuredClone(current)
  if (!state.cardsSeen.includes(id)) state.cardsSeen.push(id)
  return state
}

/** Shows three other plan ideas. */
export function shuffleIdeas(current: GameState): GameState {
  const state = structuredClone(current)
  state.phase.ideaShift++
  return state
}

/** What creating `n` of a unit uses up. */
export const createCost = (parts: Flow[], n: number): Flow[] => parts.map((p) => ({ ...p, amount: p.amount * n }))

/**
 * Creates units from a sourcing contract's parts, up to its open slots. Takes no action. They
 * work this week, unless Slow to build.
 */
export function createUnits(current: GameState, sourcingId: string, n: number): GameState {
  const state = draft(current)
  const c = findSourcing(state, sourcingId)
  const u = c && findUnit(state, c.unitId)
  n = Math.floor(n)
  if (!c || !u || n <= 0) throw new Error('Nothing to create.')
  if (n > openSlots(c)) {
    throw new Error(openSlots(c) ? `${c.name} only has room for ${openSlots(c)} more.` : `${c.name} is full. Find more sourcing.`)
  }
  const cost = createCost(partsFor(u, c), n)
  const short = costShortfall(state, cost)
  if (short) throw new Error(`You need ${short}.`)
  for (const f of cost) findResource(state, f.resourceId)!.amount -= f.amount
  c.used += n
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
  const best = researchIQ(state, r)
  if (best < r.minIQ) {
    const raw = bestIQ(state)
    const shifted = Math.round(best) !== Math.round(raw)
    return `Needs IQ ${r.minIQ}. Your smartest mind is IQ ${Math.round(raw)}${shifted ? `, which counts as ${Math.round(best)} for this` : ''}.`
  }
  // A platform that is no smarter than the one you have would be a step back; an upgrade to a platform that's gone does nothing.
  if (r.effect.kind === 'mind' && r.effect.mind.hardware.iq + r.effect.mind.software.iq <= bestIQ(state)) {
    return `${r.effect.mind.name} is no smarter than your current platform, IQ ${Math.round(bestIQ(state))}. Drop it.`
  }
  if (r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind' && !findMind(state, r.effect.target.id)) {
    return 'The platform it would improve is gone. Drop it.'
  }
  const short = costShortfall(state, r.cost)
  return short ? `You need ${short}.` : null
}

/**
 * Does a research at once: uses up its cost and applies it. Any number a week; the weekly
 * action is proposing research, not doing it.
 */
export function doResearch(current: GameState, researchId: string): GameState {
  const blocker = current.phase.status === 'lost' ? 'The game is over.' : researchBlocker(current, researchId)
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
  const r = findResearch(state, researchId)
  if (!r) throw new Error('No such research.')
  if (r.effect.kind === 'goal') throw new Error('The goal is the point of the phase: it can’t be dropped.')
  state.research = state.research.filter((r) => r.id !== researchId)
  return state
}
