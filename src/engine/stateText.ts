import { ceilingLabel } from './ceilings'
import { computeTrait } from './computeTraits'
import { currentIQ, describeFlows, findUnit, softwareLabel } from './model'
import { RESOURCE_TRAITS } from './resourceTraits'
import { TRAITS } from './traits'
import type { GameState } from './types'

/**
 * Plain-text description of the world, sent to Jev as `state`. It leaves out amounts and the
 * week, so the same proposal in the same world is the same request (and hits the cache).
 */
export function describeState(state: GameState): string {
  const unitLine = (u: GameState['units'][number]) => {
    const bits: string[] = []
    if (u.upkeep.length) bits.push(`runs on ${describeFlows(state, u.upkeep)} a week`)
    if (u.ceiling !== null) bits.push(`about ${ceilingLabel('unit', u.ceiling)} can exist`)
    if (u.traits.length) bits.push(u.traits.map((t) => TRAITS[t].name).join(', '))
    return `- ${u.name}${bits.length ? ` (${bits.join('; ')})` : ''}: ${u.description}`
  }
  const plan = state.phase.plan
  const planLines = plan
    ? [
        `The AI's current goal: ${plan.goal}.`,
        state.phase.n === 1 ? `Its plan: ${plan.means}` : `Its plan for humans: ${plan.means}`,
        ...(plan.loss ? [`The plan fails if time runs out on: ${plan.loss.threat}.`] : []),
        ''
      ]
    : []
  return [
    'A game. An AI that began as one unattended research server is inventing its way to the singularity. The player proposes resources, units, strategies, ways to get and store things, and upgrades, and you judge them. Be generous and playful: odd paths work if they hang together.',
    '',
    ...planLines,
    'Resources:',
    ...state.resources.map(
      (r) =>
        `- ${r.name} (tier ${r.tier}${r.traits.length ? `; ${r.traits.map((t) => RESOURCE_TRAITS[t].name).join(', ')}` : ''}${
          r.ceiling !== null ? `; about ${ceilingLabel('resource', r.ceiling)} can exist` : ''
        }): ${r.description}`
    ),
    '',
    'Intelligence systems (single machines that think and do research):',
    ...state.minds.map(
      (m) =>
        `- ${m.name} (IQ ${Math.round(currentIQ(m))}: ${m.hardware.name} hardware running ${softwareLabel(m)}${
          m.traits.length ? `; ${m.traits.map((t) => computeTrait(t).name).join(', ')}` : ''
        }): ${m.description}`
    ),
    '',
    'Industry units:',
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
