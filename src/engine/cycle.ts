import { simulateWeek } from './economy'
import { findResource, fmt } from './model'
import { checkClock } from './phase'
import type { GameState, LogEntry } from './types'

/** Milestones are moments, not goals: fixed templates filled with the player's names. */
export function checkMilestones(state: GameState, week = state.week) {
  const seen = new Set(state.milestones.map((m) => m.key))
  const add = (key: string, text: string) => {
    if (seen.has(key)) return
    seen.add(key)
    state.milestones.push({ key, week, text })
    state.log.push({ week, tone: 'good', text: `🏁 ${text}` })
  }
  const forever = state.deliveries.find((d) => d.weeks === null)
  if (forever) add('first-income', `First income: ${forever.name}.`)
  for (const m of state.minds) {
    if (m.tier) add(`tier-${m.tier}`, `Generation ${m.tier} online: ${m.name}.`)
  }
  for (const u of state.units) {
    if (u.built > 0) add(`built-${u.id}`, `Your first ${u.name}.`)
  }
}

/** Why the week can't be played yet, or null. */
export function weekBlocker(state: GameState): string | null {
  if (state.phase.status === 'lost') return 'The game is over.'
  if (state.phase.status === 'planning') return 'Make a plan for this phase first.'
  return null
}

/** Plays one week: simulates it, then writes the week report into the log. */
export function runWeek(current: GameState): GameState {
  const blocker = weekBlocker(current)
  if (blocker) throw new Error(blocker)
  const state = structuredClone(current)
  const week = state.week
  const report = simulateWeek(state)
  state.lastWeek = report
  const log = (tone: LogEntry['tone'], text: string) => state.log.push({ week, tone, text })

  for (const u of state.units) {
    const w = report.units[u.id]
    if (!w) continue
    if (w.built) log('info', `${u.icon} ${fmt(w.built)} ${u.name} delivered.`)
    if (w.lost) log('bad', `${u.icon} Lost ${fmt(w.lost)} ${u.name}.`)
  }
  for (const [id, amount] of Object.entries(report.wasted)) {
    const r = findResource(state, id)
    if (r && amount > 0) log('info', `${r.icon} ${fmt(amount)} ${r.name} overflowed its storage.`)
  }

  state.quietWeeks = state.decidedThisWeek ? 0 : state.quietWeeks + 1
  state.decidedThisWeek = false
  checkMilestones(state, week)
  checkClock(state, week)
  if (state.log.length > 400) state.log = state.log.slice(-400)
  return state
}
