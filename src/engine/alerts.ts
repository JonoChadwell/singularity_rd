import { researchBlocker } from './actions'
import { bestIQ, currentIQ, findResource, fmt, fmtCount } from './model'
import { lockReason, weeksLeft } from './phase'
import { goalOf } from './projection'
import type { GameState, WeekReport } from './types'

const bestMindId = (state: GameState) =>
  [...state.minds].sort((a, b) => currentIQ(b) - currentIQ(a))[0]?.id ?? ''

/** Where a wall's prompt leads: straight into the right proposal. */
export type Prompt =
  | { kind: 'make-resource'; resourceId: string }
  | { kind: 'upgrade'; unitId: string }
  | { kind: 'upgrade-mind'; mindId: string }
  | { kind: 'design-mind'; iq: number }
  | { kind: 'assign'; unitId: string }
  | { kind: 'income' }
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
    if (w.done > 0) {
      add({
        key: `done-${u.id}`,
        tone: 'info',
        text: `${fmtCount(w.done)} ${u.name} are idle: their build target is reached.`
      })
    }
  }

  // The clock.
  const left = weeksLeft(state)
  if (left !== null && left <= 3) {
    const who = state.phase.n === 1 ? 'The lab discovers you' : 'Humans stop you'
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
      text: `Your plan’s first unit, ${state.phase.firstUnit.name}, isn’t designed yet. It’s free.`,
      prompt: { label: 'Design it', to: { kind: 'first-unit' } }
    })
  }

  // The very start, or any time nothing brings anything in.
  if (state.phase.status === 'playing' && !state.incomes.length && !state.units.length) {
    add({
      key: 'start',
      tone: 'warn',
      text: 'Nothing brings anything in yet.',
      prompt: { label: 'What could the Starting Server work out how to earn?', to: { kind: 'income' } }
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

  // Research nothing you own is smart enough for.
  const best = bestIQ(state)
  const smarter = lockReason(state, 'mind')
    ? { label: 'Upgrade the Starting Server?', to: { kind: 'upgrade-mind', mindId: bestMindId(state) } as Prompt }
    : null
  for (const r of state.research.filter((x) => x.minIQ > best)) {
    add({
      key: `iq-${r.id}`,
      tone: 'info',
      text: `${r.name} needs IQ ${r.minIQ}; your smartest mind is IQ ${Math.round(best)}.`,
      prompt: smarter ?? { label: 'Design something smarter?', to: { kind: 'design-mind', iq: r.minIQ } }
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

  // Stockpiles nothing uses.
  for (const r of state.resources) {
    if (r.kind !== 'stock' || r.amount <= 0) continue
    const flows = preview.flows[r.id] ?? []
    const used = flows.some((f) => f.amount < 0)
    const needed =
      state.units.some((u) => u.parts.some((p) => p.resourceId === r.id)) ||
      state.research.some((x) => x.cost.some((c) => c.resourceId === r.id))
    if (!used && !needed && flows.some((f) => f.amount > 0)) {
      add({ key: `pile-${r.id}`, tone: 'info', text: `${fmt(r.amount)} ${r.name} piling up: nothing uses it.` })
    }
  }

  const order = { bad: 0, warn: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone])
}
