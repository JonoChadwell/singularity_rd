import { simulateWeek } from './economy'
import { findResource, fmt, layerSize, marketCost, marketLeft, MONEY_ID, unitLimit } from './model'
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
  const money = findResource(state, MONEY_ID)
  if (money && money.amount > 0) add('first-money', 'First Money earned.')
  for (const u of state.units) {
    if (u.mind && !u.starting && u.count > 0) add('first-copy', `First copy of yourself: ${u.name}.`)
    if (u.tier && u.count > 0) add(`tier-${u.tier}`, `Tier ${u.tier} online: ${u.name}.`)
    const market = layerSize(u, 'market')
    if (market && u.bought >= market) add(`sold-out-${u.id}`, `Humanity sold you its last ${u.name}.`)
    if (u.built > 0) add(`built-${u.id}`, `Your own industry built its first ${u.name}.`)
    if (u.layers.earth && u.count >= unitLimit(u)) add(`earth-${u.id}`, `Earth’s limit reached for ${u.name}.`)
  }
  // Money stops mattering once it could buy everything humanity has left, late in the game.
  const soldOut = state.milestones.some((m) => m.key.startsWith('sold-out-'))
  if (money && soldOut) {
    const everything = state.units.reduce((n, u) => n + marketCost(u, marketLeft(u)), 0)
    if (money.amount >= everything) add('money-stopped', 'Money stopped mattering.')
  }
  if (state.status === 'won') add('singularity', 'The singularity.')
}

/** Plays one week: simulates it, then writes the week report into the log. */
export function runWeek(current: GameState): GameState {
  const state = structuredClone(current)
  const week = state.week
  const report = simulateWeek(state)
  state.lastWeek = report
  const log = (tone: LogEntry['tone'], text: string) => state.log.push({ week, tone, text })

  for (const line of report.finished) log('good', line)
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
  // The score is the week the final project finished.
  if (state.status === 'won') state.week = week
  checkMilestones(state, week)
  if (state.log.length > 400) state.log = state.log.slice(-400)
  return state
}
