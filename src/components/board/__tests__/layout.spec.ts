import { describe, expect, it } from 'vitest'
import { previewWeek } from '@/engine/economy'
import { createInitialState, newResource, newUnit } from '@/engine/initialState'
import { byTier } from '@/engine/model'
import type { GameState } from '@/engine/types'
import { boardLayout, LANE } from '../layout'

/** A board with four buses, two units, three strategies and a Procurement payout. */
function busy(): GameState {
  const s = createInitialState()
  s.resources.push(
    newResource({ id: 'chips', name: 'Chips', tier: 2 }),
    newResource({ id: 'money', name: 'Money', tier: 0, amount: 500 }),
    newResource({ id: 'power', name: 'Power', tier: 1, amount: 100 }),
    newResource({ id: 'sand', name: 'Sand', tier: 0 })
  )
  s.units.push(
    newUnit({ id: 'fab', name: 'Fab', count: 2, upkeep: [{ resourceId: 'power', amount: 1 }], rest: 'etch' }),
    newUnit({ id: 'bot', name: 'Bot', count: 3, rest: 'sell' })
  )
  const make = (id: string, unitId: string, outputId: string, inputs: string[]) =>
    s.strategies.push({
      id,
      name: id,
      description: '',
      unitId,
      kind: 'make',
      inputs: inputs.map((resourceId) => ({ resourceId, amount: 1 })),
      outputId,
      amount: 2
    })
  make('etch', 'fab', 'chips', ['sand', 'power'])
  make('sell', 'bot', 'money', [])
  make('dig', 'bot', 'sand', ['power'])
  s.deliveries.push({ name: 'Coding', target: { kind: 'resource', id: 'money' }, amount: 10, delay: 0, weeks: null })
  return s
}

describe('boardLayout', () => {
  it('is the same every time', () => {
    const s = busy()
    expect(boardLayout(s, previewWeek(s))).toEqual(boardLayout(s, previewWeek(s)))
  })

  it('stacks the buses by tier', () => {
    const s = busy()
    const layout = boardLayout(s, previewWeek(s))
    expect(layout.buses.map((b) => b.id)).toEqual(byTier(s.resources).map((r) => r.id))
    const ys = layout.buses.map((b) => b.y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
  })

  it('gives every lane its own x, inside its chip, and taps only buses that exist', () => {
    const s = busy()
    const layout = boardLayout(s, previewWeek(s))
    const lanes = layout.cols.flatMap((c) => c.lanes.map((l) => ({ ...l, col: c })))
    const xs = lanes.map((l) => l.x)
    expect(new Set(xs).size).toBe(xs.length)
    for (const l of lanes) {
      expect(l.x).toBeGreaterThan(l.col.x)
      expect(l.x).toBeLessThan(l.col.x + l.col.w)
      for (const t of l.taps) expect(layout.buses.some((b) => b.id === t.busId)).toBe(true)
    }
    for (let i = 1; i < xs.length; i++) if (lanes[i]!.col === lanes[i - 1]!.col) expect(xs[i]! - xs[i - 1]!).toBe(LANE)
  })

  it('wires each strategy from its inputs to its output, plus upkeep and Procurement payouts', () => {
    const s = busy()
    const layout = boardLayout(s, previewWeek(s))
    const fab = layout.cols.find((c) => c.id === 'fab')!
    expect(fab.lanes.map((l) => l.kind)).toEqual(['vcc', 'make'])
    expect(fab.lanes[1]!.taps).toEqual([
      { busId: 'sand', dir: 'in', limiting: expect.any(Boolean) },
      { busId: 'power', dir: 'in', limiting: expect.any(Boolean) },
      { busId: 'chips', dir: 'out' }
    ])
    const cpu = layout.cols[0]!
    expect(cpu.kind).toBe('cpu')
    expect(cpu.lanes).toMatchObject([{ kind: 'cap', taps: [{ busId: 'money', dir: 'out' }], label: '+10/WK ∞' }])
    expect(layout.cols.map((c) => c.kind)).toEqual(['cpu', 'unit', 'unit', 'socket'])
  })

  it('colours a lane by how well it runs', () => {
    const s = busy()
    const layout = boardLayout(s, previewWeek(s))
    const lane = (id: string) => layout.cols.flatMap((c) => c.lanes).find((l) => l.id === id)!
    // Nothing in stock, so the fab is starved of sand; the bots sell freely.
    expect(lane('etch').tone).toBe('bad')
    expect(lane('sell').tone).not.toBe('bad')
  })
})
