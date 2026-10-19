import { choked } from './economy'
import {
  findResource,
  findUnit,
  fmt,
  fmtCount,
  layerSize,
  MONEY_ID,
  unitLimit
} from './model'
import { bestEffectiveIQ } from './research'
import type { GameState, WeekReport } from './types'

/** Where a wall's prompt leads: straight into the right proposal. */
export type Prompt =
  | { kind: 'make-resource'; resourceId: string }
  | { kind: 'own-layer'; unitId: string }
  | { kind: 'design-mind'; iq: number }
  | { kind: 'assign'; unitId: string }

export interface Alert {
  key: string
  tone: 'bad' | 'warn' | 'info'
  text: string
  prompt?: { label: string; to: Prompt }
}

const HOW = 'How will you get this?'

/**
 * Everything that might waste the week, listed above the Next week button. Built from the
 * preview, so it describes the week about to happen.
 */
export function alertsFor(state: GameState, preview: WeekReport): Alert[] {
  if (state.status !== 'playing') return []
  const alerts: Alert[] = []
  const add = (a: Alert) => alerts.push(a)

  // Idle machines.
  for (const u of state.units) {
    const w = preview.units[u.id]
    if (!w) continue
    if (w.unassigned > 0 && u.mind) {
      add({
        key: `idle-${u.id}`,
        tone: 'bad',
        text: `${fmtCount(w.unassigned)} ${u.name} ${w.unassigned === 1 ? 'has' : 'have'} nothing to do.`,
        // The very first prompt: what could the Starting Server do to earn money?
        prompt: state.strategies.length
          ? { label: 'Assign', to: { kind: 'assign', unitId: u.id } }
          : { label: 'What could it do to earn money?', to: { kind: 'make-resource', resourceId: MONEY_ID } }
      })
    } else if (w.unassigned > 0) {
      add({
        key: `idle-${u.id}`,
        tone: 'warn',
        text: `${fmtCount(w.unassigned)} ${u.name} have no strategy to run.`,
        prompt: { label: 'Assign', to: { kind: 'assign', unitId: u.id } }
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
    if (w.choked || choked(state, u)) {
      add({
        key: `choked-${u.id}`,
        tone: 'bad',
        text: `${u.name} have stopped: their waste has piled up.`,
        prompt: u.waste ? { label: 'Use up the waste', to: { kind: 'make-resource', resourceId: u.waste } } : undefined
      })
    }
    if (w.done > 0) {
      add({
        key: `done-${u.id}`,
        tone: 'info',
        text: `${fmtCount(w.done)} ${u.name} are idle: their build target is reached.`
      })
    }
    const market = layerSize(u, 'market')
    if (market && u.bought >= market && !u.layers.own && !u.starting) {
      add({
        key: `soldout-${u.id}`,
        tone: 'warn',
        text: `Humanity has no more ${u.name} to sell. How will you make your own?`,
        prompt: { label: 'Make your own', to: { kind: 'own-layer', unitId: u.id } }
      })
    } else if (u.count > 0 && u.count >= unitLimit(u) && !u.starting && !u.layers.earth) {
      add({
        key: `full-${u.id}`,
        tone: 'info',
        text: `${u.name} are at the top of their supply. A breakthrough could open the next layer.`,
        prompt: { label: 'Break through', to: { kind: 'own-layer', unitId: u.id } }
      })
    }
  }

  // Research that can't progress.
  const best = bestEffectiveIQ(state)
  for (const p of state.projects) {
    const groups = preview.groups[p.id] ?? []
    for (const g of groups.filter((g) => !g.clears)) {
      const u = findUnit(state, g.unitId)
      add({
        key: `bar-${p.id}-${g.unitId}`,
        tone: 'bad',
        text: `${fmtCount(g.machines)} ${u?.name ?? '?'} can’t help with ${p.name}: effective IQ ${Math.floor(g.effectiveIQ)}, bar ${p.bar}.`,
        prompt:
          best < p.bar
            ? { label: 'Nothing you own is smart enough. Design something that is?', to: { kind: 'design-mind', iq: p.bar } }
            : undefined
      })
    }
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
      prompt: made && id !== MONEY_ID ? undefined : { label: HOW, to: { kind: 'make-resource', resourceId: id } }
    })
  }

  // Stockpiles nothing uses.
  for (const r of state.resources) {
    if (r.kind !== 'stock' || r.id === MONEY_ID || r.amount <= 0) continue
    const flows = preview.flows[r.id] ?? []
    const used = flows.some((f) => f.amount < 0)
    const neededForParts = state.units.some((u) => u.parts.some((p) => p.resourceId === r.id))
    if (!used && !neededForParts && flows.some((f) => f.amount > 0)) {
      add({ key: `pile-${r.id}`, tone: 'info', text: `${fmt(r.amount)} ${r.name} piling up: nothing uses it.` })
    }
  }

  const order = { bad: 0, warn: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone])
}
