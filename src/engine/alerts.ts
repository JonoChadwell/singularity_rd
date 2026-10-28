import { researchBlocker } from './actions'
import * as B from './balance'
import { affordable, bestIQ, bestMind, contractsFor, currentIQ, findResource, fmt, fmtCount, openSlots, researchIQ } from './model'
import { lossOf } from './losses'
import { lockReason, weeksLeft } from './phase'
import { goalOf } from './projection'
import type { GameState, WeekReport } from './types'
import { mindUpgradeBlocker } from './upgrade'

const bestMindId = (state: GameState) => bestMind(state)?.id ?? ''

/** Where a wall's prompt leads: straight into the right proposal. */
export type Prompt =
  | { kind: 'make-resource'; resourceId: string }
  | { kind: 'upgrade'; unitId: string }
  | { kind: 'upgrade-mind'; mindId: string }
  | { kind: 'design-mind'; iq: number }
  | { kind: 'assign'; unitId: string }
  | { kind: 'create' }
  | { kind: 'source'; unitId: string }
  | { kind: 'storage'; resourceId: string }
  | { kind: 'research' }
  | { kind: 'first-unit' }

export interface Alert {
  key: string
  tone: 'bad' | 'warn' | 'info'
  text: string
  prompt?: { label: string; to: Prompt }
  /** One-click fixes: put idle machines on a task they already know. */
  tasks?: { label: string; unitId: string; taskId: string }[]
}

const HOW = 'How will you get this?'

/**
 * Everything that might waste the week, listed above the Next week button. Built from the
 * preview, so it describes the week about to happen.
 */
export function alertsFor(state: GameState, preview: WeekReport): Alert[] {
  const alerts: Alert[] = []
  const add = (a: Alert) => alerts.push(a)

  // Idle units.
  for (const u of state.units) {
    const w = preview.units[u.id]
    if (!w) continue
    const known = state.strategies.filter((s) => s.unitId === u.id).slice(0, 3)
    const tasks = known.map((s) => ({ label: s.name, unitId: u.id, taskId: s.id }))
    if (w.unassigned > 0) {
      add({
        key: `idle-${u.id}`,
        tone: 'warn',
        text: `${fmtCount(w.unassigned)} ${u.name} have no strategy to run.${tasks.length ? ' Put them on:' : ''}`,
        tasks,
        prompt: { label: tasks.length ? 'Something else…' : 'Assign', to: { kind: 'assign', unitId: u.id } }
      })
    }
    if (w.unpaid > 0.5 && w.unpaidFor) {
      const r = findResource(state, w.unpaidFor)
      add({
        key: `unpaid-${u.id}`,
        tone: 'bad',
        text: `${fmtCount(w.unpaid)} ${u.name} can’t pay their ${r?.name ?? ''} upkeep.`,
        prompt: { label: 'Where will its upkeep come from?', to: { kind: 'make-resource', resourceId: w.unpaidFor } }
      })
    }
  }

  // Units you can't own any of yet, and contracts you can't afford to fill.
  for (const u of state.units) {
    const contracts = contractsFor(state, u.id)
    if (!contracts.length) {
      add({
        key: `cap-${u.id}`,
        tone: 'warn',
        text: `${u.icon} ${u.name} is designed, but you can’t own any yet: Procure some.`,
        prompt: { label: 'How will you get them?', to: { kind: 'source', unitId: u.id } }
      })
      continue
    }
    const open = contracts.filter((c) => openSlots(c) > 0 && c.parts.length)
    if (open.length && open.every((c) => affordable(state, c) === 0)) {
      add({
        key: `slots-${u.id}`,
        tone: 'info',
        text: `${u.icon} ${u.name} has room for ${fmtCount(open.reduce((n, c) => n + openSlots(c), 0))} more, but you can’t afford the parts for one.`
      })
    }
  }

  // Storage about to overflow.
  for (const [id, amount] of Object.entries(preview.wasted)) {
    const r = findResource(state, id)
    if (!r || amount <= 0) continue
    add({
      key: `overflow-${id}`,
      tone: 'warn',
      text: `${r.icon} ${fmt(amount)} ${r.name} will overflow its storage next week.`,
      prompt: { label: 'Store more?', to: { kind: 'storage', resourceId: id } }
    })
  }

  // The week's action.
  if (state.phase.status === 'playing' && !state.proposedThisWeek) {
    add({ key: 'action', tone: 'info', text: 'This week’s action is unused: propose a research, or Procure.' })
  }

  // The clock.
  const left = weeksLeft(state)
  if (left !== null && left <= 3) {
    const who = lossOf(state).name
    add({
      key: 'clock',
      tone: 'bad',
      text: left <= 1 ? `${who} at the end of this week, unless you reach the goal.` : `${who} in ${left} weeks.`
    })
  }
  const goal = goalOf(state)
  if (goal && !researchBlocker(state, goal.id)) {
    add({ key: 'goal-ready', tone: 'warn', text: `🎯 ${goal.name} is ready to research: it wins the phase.`, prompt: { label: 'Research', to: { kind: 'research' } } })
  }
  if (state.phase.firstUnit) {
    add({
      key: 'first-unit',
      tone: 'warn',
      text: `Your plan’s first unit, ${state.phase.firstUnit.name}, isn’t designed yet. Designing it is free.`,
      prompt: { label: 'Design it', to: { kind: 'first-unit' } }
    })
  }

  // The very start, or any time nothing brings anything in.
  if (state.phase.status === 'playing' && !state.deliveries.length && !state.units.length && !state.resources.some((r) => r.amount > 0)) {
    add({
      key: 'start',
      tone: 'warn',
      text: 'You have nothing yet.',
      prompt: { label: 'What could the Starting Server make?', to: { kind: 'create' } }
    })
  }

  // Research that's ready to do now.
  const ready = state.research.filter((r) => r.effect.kind !== 'goal' && !researchBlocker(state, r.id))
  if (ready.length) {
    add({
      key: 'research-ready',
      tone: 'info',
      text: `Ready to research: ${ready.map((r) => r.name).slice(0, 3).join(', ')}${ready.length > 3 ? '…' : ''}`,
      prompt: { label: 'Research', to: { kind: 'research' } }
    })
  }

  // Research your platform isn't smart enough for.
  const best = bestIQ(state)
  const mindsLocked = lockReason(state, 'mind')
  const mind = bestMind(state)
  // A (re)done software upgrade is the quickest way up; a new platform is the way after that.
  const softwareLeft = !!mind && !mindUpgradeBlocker(state, mind)
  for (const r of state.research.filter((x) => x.minIQ > researchIQ(state, x))) {
    const have = researchIQ(state, r)
    const shifted = Math.round(have) !== Math.round(best)
    const prompt: Alert['prompt'] =
      softwareLeft && r.minIQ <= have - currentIQ(mind!) + mind!.hardware.iq + B.MAX_IQ_STEP
        ? { label: 'Upgrade your software?', to: { kind: 'upgrade-mind', mindId: bestMindId(state) } }
        : mindsLocked
          ? undefined
          : { label: 'Build a smarter platform?', to: { kind: 'design-mind', iq: r.minIQ } }
    const beyond = !prompt && mindsLocked ? ` Nothing you have can get there: ${mindsLocked.toLowerCase()}` : ''
    add({
      key: `iq-${r.id}`,
      tone: 'info',
      text: `${r.name} needs IQ ${r.minIQ}; your smartest mind is IQ ${Math.round(best)}${shifted ? `, which counts as ${Math.round(have)} for it` : ''}.${beyond}`,
      prompt
    })
  }

  // Shortfalls, and resources something needs but nothing makes.
  for (const [id, share] of Object.entries(preview.shares)) {
    if (share >= 0.999) continue
    const r = findResource(state, id)
    if (!r) continue
    const made = (preview.flows[id] ?? []).some((f) => f.amount > 0)
    add({
      key: `short-${id}`,
      tone: 'warn',
      text: `${r.icon} ${r.name} is short: everyone who needs it runs at ${Math.round(share * 100)}%.`,
      prompt: made ? undefined : { label: HOW, to: { kind: 'make-resource', resourceId: id } }
    })
  }

  const order = { bad: 0, warn: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone])
}
