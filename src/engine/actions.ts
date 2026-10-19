import * as B from './balance'
import { checkMilestones } from './cycle'
import { addUnits } from './economy'
import {
  findResource,
  findStrategy,
  findUnit,
  labour,
  makeId,
  marketCost,
  marketLeft,
  MONEY_ID,
  runsOn,
  tasksFor
} from './model'
import type { GameState } from './types'

// Planning actions. They take no time: each returns a new state, or throws a reason.

function draft(current: GameState): GameState {
  if (current.status !== 'playing') throw new Error('The game is over.')
  const state = structuredClone(current)
  state.decidedThisWeek = true
  return state
}

/** Buys units from humanity's market. They work this week, unless Slow to build. */
export function buyUnits(current: GameState, unitId: string, n: number): GameState {
  const state = draft(current)
  const u = findUnit(state, unitId)
  const money = findResource(state, MONEY_ID)!
  n = Math.floor(n)
  if (!u || n <= 0) throw new Error('Nothing to buy.')
  if (n > marketLeft(u)) throw new Error(`Humanity has only ${marketLeft(u)} left to sell.`)
  const cost = marketCost(u, n)
  if (cost > money.amount + 1e-9) throw new Error('Not enough Money.')
  money.amount -= cost
  u.bought += n
  addUnits(u, n, true)
  checkMilestones(state)
  return state
}

/** Buys a batch of a stock, up to what humanity sells each week. */
export function buyResource(current: GameState, resourceId: string, n: number): GameState {
  const state = draft(current)
  const r = findResource(state, resourceId)
  const money = findResource(state, MONEY_ID)!
  if (!r || r.kind !== 'stock' || !r.market || r.id === MONEY_ID) throw new Error('Not for sale.')
  const left = r.market - r.boughtThisWeek
  if (n <= 0) throw new Error('Nothing to buy.')
  if (n > left + 1e-9) throw new Error(`Humanity sells only ${left} more this week.`)
  const cost = n * r.value
  if (cost > money.amount + 1e-9) throw new Error('Not enough Money.')
  money.amount -= cost
  r.amount += n
  r.boughtThisWeek += n
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

/**
 * Teaches another mind a strategy a mind already runs. Minds are all copies of you, so this
 * needs no proposal; the amounts follow the new mind's labour.
 */
export function teachStrategy(current: GameState, strategyId: string, unitId: string): GameState {
  const state = draft(current)
  const s = findStrategy(state, strategyId)
  const from = s && findUnit(state, s.unitId)
  const to = findUnit(state, unitId)
  if (!s || !from || !to || s.kind !== 'make' || !from.mind || !to.mind) {
    throw new Error('Only minds can teach each other strategies.')
  }
  if (runsOn(to, s.outputId)) {
    throw new Error(`${to.name} runs on what this makes.`)
  }
  if (state.strategies.some((x) => x.unitId === to.id && x.name === s.name)) {
    throw new Error(`${to.name} already knows ${s.name}.`)
  }
  const factor = labour(to) / (s.scale ?? labour(from))
  const taught = {
    ...structuredClone(s),
    id: makeId(state, `${s.name}-${to.name}`),
    unitId: to.id,
    scale: labour(to),
    inputs: s.inputs.map((f) => ({ ...f, amount: B.nice(f.amount * factor) })),
    amount: B.nice(s.amount * factor)
  }
  state.strategies.push(taught)
  if (!to.rest && Object.keys(to.assign).length === 0) to.rest = taught.id
  return state
}
