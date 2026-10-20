import { simulateWeek } from './economy'
import { findResource, fmt } from './model'
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
  const first = state.incomes[0]
  if (first) add('first-income', `First income: ${first.name}.`)
  for (const m of state.minds) {
    if (m.tier) add(`tier-${m.tier}`, `Tier ${m.tier} online: ${m.name}.`)
  }
  for (const u of state.units) {
    if (u.built > 0) add(`built-${u.id}`, `Your first ${u.name}.`)
  }
}

/** Plays one week: simulates it, then writes the week report into the log. */
export function runWeek(current: GameState): GameState {
  const state = structuredClone(current)
  const week = state.week
  const report = simulateWeek(state)
  state.lastWeek = report
  const log = (tone: LogEntry['tone'], text: string) => state.log.push({ week, tone, text })

  for (const u of state.units) {
    const w = report.units[u.id]
    if (!w) continue
    if (w.built) log('info', `${u.icon} Built ${fmt(w.built)} ${u.name}.`)
    if (w.lost) log('bad', `${u.icon} Lost ${fmt(w.lost)} ${u.name}.`)
  }
  for (const [id, amount] of Object.entries(report.wasted)) {
    const r = findResource(state, id)
    if (r && amount > 0) log('info', `${r.icon} ${fmt(amount)} ${r.name} went unused.`)
  }

  state.quietWeeks = state.decidedThisWeek ? 0 : state.quietWeeks + 1
  state.decidedThisWeek = false
  checkMilestones(state, week)
  if (state.log.length > 400) state.log = state.log.slice(-400)
  return state
}
