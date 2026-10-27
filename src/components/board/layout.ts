import { byTier, fmt } from '@/engine/model'
import type { GameState, WeekReport } from '@/engine/types'

// The circuit board's geometry, worked out from the game alone so it renders the same everywhere
// (and in tests). Resources are horizontal buses; below them sits one row of chips (the platform,
// then each unit type); each chip owns vertical lanes that rise from its pins to the buses they
// touch. A lane is a strategy (inputs in, output out), an upkeep feed, or a Procurement payout.

/** Height of a bus row. */
export const ROW = 46
/** Space above the first bus, for the board's silkscreen. */
export const TOP = 22
/** Space between the last bus and the chips, where lanes carry their labels. */
export const LEAD = 78
/** Gap between neighbouring lanes. */
export const LANE = 20
/** Space before the first chip, and between chips. */
export const PAD = 28
export const GAP = 30
/** A lane's distance from its chip's left edge. */
const INSET = 22
const MIN_W: Record<Column['kind'], number> = { cpu: 240, unit: 290, socket: 180 }

export type Tone = 'ok' | 'warn' | 'bad' | 'off'

export interface Tap {
  busId: string
  dir: 'in' | 'out'
  /** The resource that ran short and held this lane back. */
  limiting?: boolean
}

export interface Lane {
  /** Strategy id, or `vcc:<unit>:<resource>`, `cap:<n>`, `drain:<mind>`. */
  id: string
  kind: 'make' | 'vcc' | 'cap' | 'drain'
  /** The pin number on its chip, from 1. */
  pin: number
  x: number
  /** The y of the highest bus it reaches. */
  top: number
  taps: Tap[]
  tone: Tone
  /** Printed along the lane, e.g. "+240/WK". */
  label: string
  /** What it's about, for hover and titles. */
  title: string
}

export interface Column {
  id: string
  kind: 'cpu' | 'unit' | 'socket'
  x: number
  w: number
  lanes: Lane[]
}

export interface Bus {
  id: string
  y: number
}

export interface BoardLayout {
  width: number
  /** Height of the bus field, down to the chips' top edge. */
  height: number
  buses: Bus[]
  cols: Column[]
}

const busY = (i: number) => TOP + ROW / 2 + i * ROW

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`

/** The flow a label put into a resource next week. */
function flowOf(preview: WeekReport, resourceId: string, label: string): number {
  return (preview.flows[resourceId] ?? []).filter((f) => f.label === label).reduce((n, f) => n + f.amount, 0)
}

export function boardLayout(state: GameState, preview: WeekReport): BoardLayout {
  const buses: Bus[] = byTier(state.resources).map((r, i) => ({ id: r.id, y: busY(i) }))
  const yOf = new Map(buses.map((b) => [b.id, b.y]))
  const height = TOP + buses.length * ROW + LEAD
  const cols: Column[] = []
  let x = PAD

  /** Lays a column's lanes from its left edge, dropping taps on buses that don't exist. */
  function column(id: string, kind: Column['kind'], lanes: Omit<Lane, 'x' | 'top' | 'pin'>[]) {
    const placed: Lane[] = []
    for (const l of lanes) {
      const taps = l.taps.filter((t) => yOf.has(t.busId))
      if (!taps.length) continue
      const pin = placed.length + 1
      placed.push({
        ...l,
        taps,
        pin,
        x: x + INSET + (pin - 1) * LANE,
        top: Math.min(...taps.map((t) => yOf.get(t.busId)!))
      })
    }
    const w = Math.max(MIN_W[kind], INSET * 2 + Math.max(0, placed.length - 1) * LANE)
    cols.push({ id, kind, x, w, lanes: placed })
    x += w + GAP
  }

  // The platform: Procurement payouts still to come, and any stock it burns.
  for (const mind of state.minds) {
    const lanes: Omit<Lane, 'x' | 'top' | 'pin'>[] = []
    state.deliveries.forEach((d, n) => {
      if (d.target.kind !== 'resource') return
      const every = d.weeks === null ? '/WK ∞' : d.weeks > 1 ? `/WK ×${d.weeks}` : ''
      const when = d.delay > 0 ? ` · ${d.delay}WK` : ''
      lanes.push({
        id: `cap:${n}`,
        kind: 'cap',
        taps: [{ busId: d.target.id, dir: 'out' }],
        tone: d.delay > 0 ? 'off' : 'ok',
        label: `+${fmt(d.amount)}${every}${when}`,
        title: d.name
      })
    })
    for (const r of state.resources) {
      const burned = flowOf(preview, r.id, `${mind.name} burns it`)
      if (burned < 0) {
        lanes.push({
          id: `drain:${mind.id}`,
          kind: 'drain',
          taps: [{ busId: r.id, dir: 'in' }],
          tone: 'warn',
          label: `${signed(burned)}/WK`,
          title: `${mind.name} burns it`
        })
      }
    }
    column(mind.id, 'cpu', lanes)
  }

  for (const u of state.units) {
    const week = preview.units[u.id]
    const lanes: Omit<Lane, 'x' | 'top' | 'pin'>[] = []
    for (const f of u.upkeep) {
      const unpaid = !!week && week.unpaid > 0.5 && week.unpaidFor === f.resourceId
      const used = flowOf(preview, f.resourceId, `${u.name} upkeep`)
      lanes.push({
        id: `vcc:${u.id}:${f.resourceId}`,
        kind: 'vcc',
        taps: [{ busId: f.resourceId, dir: 'in' }],
        tone: unpaid ? 'bad' : used < 0 ? 'ok' : 'off',
        label: used < 0 ? `${signed(used)}/WK` : 'VCC',
        title: `${u.name} upkeep`
      })
    }
    for (const s of state.strategies) {
      if (s.unitId !== u.id || s.kind !== 'make') continue
      const run = preview.runs[s.id]
      const tone: Tone = !run || run.units <= 0 ? 'off' : run.fraction >= 0.999 ? 'ok' : run.fraction <= 0.001 ? 'bad' : 'warn'
      const taps: Tap[] = s.inputs.map((f) => ({ busId: f.resourceId, dir: 'in', limiting: run?.limitedBy === f.resourceId }))
      taps.push({ busId: s.outputId, dir: 'out' })
      if (u.byproduct && u.byproduct !== s.outputId) taps.push({ busId: u.byproduct, dir: 'out' })
      const made = flowOf(preview, s.outputId, s.name)
      const pct = tone === 'warn' ? ` ${Math.round(run!.fraction * 100)}%` : ''
      lanes.push({
        id: s.id,
        kind: 'make',
        taps,
        tone,
        label: tone === 'off' ? 'IDLE' : `${signed(made)}/WK${pct}`,
        title: s.name
      })
    }
    column(u.id, 'unit', lanes)
  }

  column('socket', 'socket', [])
  return { width: x - GAP + PAD, height, buses, cols }
}
