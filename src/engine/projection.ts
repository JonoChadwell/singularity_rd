import { simulateWeek } from './economy'
import { bestIQ, costShortfall, findResearch } from './model'
import { weeksLeft } from './phase'
import type { GameState, Research } from './types'

/** The phase's goal research, while it's waiting. */
export function goalOf(state: GameState): Research | undefined {
  return state.phase.goalId ? findResearch(state, state.phase.goalId) : undefined
}

export interface Projection {
  goal: Research
  /** Your best mind clears the goal's bar. */
  iqOk: boolean
  /** The first week you'd have the goal's cost if nothing changes, or null if not before the clock runs out. */
  week: number | null
  /** How far it looked. */
  horizon: number
}

/** Most weeks to look ahead without a clock (and at most, with one). */
const HORIZON = 100

/**
 * When the goal would be affordable at today's rates, if you did nothing else. It runs the
 * weeks on a copy, so it's exact for a quiet run of weeks.
 */
export function projectGoal(state: GameState): Projection | null {
  const goal = goalOf(state)
  if (!goal || state.phase.status !== 'playing') return null
  const horizon = Math.min(HORIZON, weeksLeft(state) ?? HORIZON)
  const iqOk = bestIQ(state) >= goal.minIQ
  let s = state
  for (let k = 0; k < horizon; k++) {
    if (!costShortfall(s, goal.cost)) return { goal, iqOk, week: state.week + k, horizon }
    if (k === 0) s = structuredClone(state)
    simulateWeek(s)
  }
  return { goal, iqOk, week: null, horizon }
}
