import { describeCost, describeFlows, findMind, findResource, findUnit, fmt } from '@/engine/model'
import { coverWeeks } from '@/engine/phase'
import type { GameState, Research } from '@/engine/types'
import { describeChange } from '@/engine/upgrade'

/** A stable, made-up part number for a datasheet's header, e.g. "RES-417". */
export function partNo(prefix: string, id: string): string {
  let h = 7
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997
  return `${prefix}-${String(h).padStart(3, '0')}`
}

/** One line on what a research does once researched. */
export function effectText(state: GameState, r: Research): string {
  const e = r.effect
  switch (e.kind) {
    case 'goal':
      return 'Researching it wins the phase.'
    case 'sourcing':
      return `Room for ${fmt(e.sourcing.total)} ${findUnit(state, e.sourcing.unitId)?.name ?? ''}, each made from ${describeFlows(state, e.sourcing.parts)}.`
    case 'storage':
      return `Room for ${fmt(e.expansion.added)} more ${findResource(state, e.resourceId)?.name ?? ''}.`
    case 'cover':
      return `Adds ${coverWeeks(state, e.weeks)} weeks to the clock, once researched.`
    case 'unit':
      return `A new industry unit: ${e.unit.name}.`
    case 'mind':
      return `A new platform at IQ ${e.mind.hardware.iq}. It replaces ${state.minds[0]?.name ?? 'yours'} for good.`
    case 'strategy': {
      const out = findResource(state, e.strategy.outputId)
      const ins = e.strategy.inputs.length ? `${describeFlows(state, e.strategy.inputs)} → ` : ''
      return `${findUnit(state, e.strategy.unitId)?.name ?? '?'}: ${ins}${fmt(e.strategy.amount)} ${out?.icon ?? ''} ${out?.name ?? ''} each a week.`
    }
    case 'upgrade': {
      const name = e.target.kind === 'mind' ? findMind(state, e.target.id)?.name : findUnit(state, e.target.id)?.name
      return `${name ?? '?'}: ${e.changes.map((c) => describeChange(state, e.target, c)).join('; ')}`
    }
  }
}

/** A cost in words, or "nothing". */
export const costText = (state: GameState, cost: Research['cost']) => (cost.length ? describeCost(state, cost) : 'nothing')
