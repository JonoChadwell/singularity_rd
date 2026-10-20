import { currentIQ, describeFlows, findUnit, softwareLabel } from './model'
import { TRAITS } from './traits'
import type { GameState } from './types'

/**
 * Plain-text description of the world, sent to Jev as `state`. It leaves out amounts and the
 * week, so the same proposal in the same world is the same request (and hits the cache).
 */
export function describeState(state: GameState): string {
  const unitLine = (u: GameState['units'][number]) => {
    const bits = [
      u.mind
        ? `intelligence system, IQ ${Math.round(currentIQ(u))}: ${u.hardware.name} hardware running ${softwareLabel(u)}`
        : 'industry'
    ]
    if (u.upkeep.length) bits.push(`runs on ${describeFlows(state, u.upkeep)} a week`)
    if (u.traits.length) bits.push(u.traits.map((t) => TRAITS[t].name).join(', '))
    return `- ${u.name} (${bits.join('; ')}): ${u.description}`
  }
  return [
    'A game. An AI that began as one unattended research server is inventing its way to the singularity. The player proposes resources, units, strategies and breakthroughs, and you judge them. Be generous and playful: odd paths work if they hang together.',
    '',
    'Resources:',
    ...state.resources.map((r) => `- ${r.name} (${r.kind}): ${r.description}`),
    '',
    'Units:',
    ...state.units.map(unitLine),
    '',
    'Strategies:',
    ...state.strategies
      .filter((s) => s.kind === 'make')
      .map(
        (s) =>
          `- ${s.name}, run by ${findUnit(state, s.unitId)?.name ?? '?'}: ${describeFlows(state, s.inputs)} → ${state.resources.find((r) => r.id === s.outputId)?.name ?? '?'}`
      )
  ].join('\n')
}

export function proposalText(state: GameState, lines: string[]): string {
  return [describeState(state), '', ...lines].join('\n')
}
