import { simulateWeek } from './economy'
import { bestIQ, costShortfall, findResearch, findResource } from './model'
import { weeksLeft } from './phase'
import type { GameState, Research } from './types'

/** The phase's goal research, while it's waiting. */
export function goalOf(state: GameState): Research | undefined {
  return state.phase.goalId ? findResearch(state, state.phase.goalId) : undefined
}

/** The projection in words. */
export function projectionText(state: GameState, p: Projection): string {
  const iq = p.iqOk ? '' : ` You also need IQ ${p.goal.minIQ}.`
  if (p.week === state.week) return `You have what it uses up now.${iq}`
  if (p.week !== null) return `At today’s rates you’ll have what it uses up in week ${p.week}.${iq}`
  const by = state.week + p.horizon - 1
  return `At today’s rates you’d have ${Math.floor(p.share * 100)}% of what it uses up by week ${by}.${iq}`
}

export interface Projection {
  goal: Research
  /** Your best mind clears the goal's bar. */
  iqOk: boolean
  /** The first week you'd have the goal's cost if nothing changes, or null if not before the clock runs out. */
  week: number | null
  /** How far it looked. */
  horizon: number
  /** The share of the goal's cost you'd have by the end of the horizon (1 when `week` is set). */
  share: number
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
  // Week by week up to the last one you can play, when the goal can still be researched.
  for (let k = 0; k < horizon; k++) {
    if (!costShortfall(s, goal.cost)) return { goal, iqOk, week: state.week + k, horizon, share: 1 }
    if (k === horizon - 1) break
    if (k === 0) s = structuredClone(state)
    simulateWeek(s)
  }
  const share = Math.min(
    1,
    ...goal.cost.map((c) => (findResource(s, c.resourceId)?.amount ?? 0) / Math.max(1e-9, c.amount))
  )
  return { goal, iqOk, week: null, horizon, share }
}
