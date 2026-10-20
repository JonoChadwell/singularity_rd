import * as B from './balance'
import { MONEY_ID } from './model'
import { projectSize } from './research'
import type { GameState, Resource, UnitType } from './types'

export function newRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const SERVER_ID = 'starting-server'
export const FINAL_ID = 'final-project'

/** A unit with every optional field at its default. */
export function newUnit(fields: Pick<UnitType, 'id' | 'name'> & Partial<UnitType>): UnitType {
  return {
    description: fields.name,
    icon: '🧠',
    mind: false,
    count: 0,
    hardware: { name: '', iq: 0 },
    software: { name: '', bonus: 0 },
    tier: 0,
    value: 0,
    plausibility: 1,
    parts: [],
    upkeep: [],
    layers: { market: 0, own: 0, earth: 0 },
    builderId: null,
    bought: 0,
    built: 0,
    traits: [],
    crew: null,
    boosts: null,
    byproduct: null,
    stores: null,
    waste: null,
    field: null,
    overclocked: false,
    weeksRun: 0,
    pending: [],
    ramp: [],
    assign: {},
    rest: null,
    ...fields
  }
}

export function newResource(fields: Pick<Resource, 'id' | 'name'> & Partial<Resource>): Resource {
  return {
    description: fields.name,
    icon: '💡',
    kind: 'stock',
    band: 1,
    value: 1,
    amount: 0,
    stored: 0,
    market: 0,
    boughtThisWeek: 0,
    ...fields
  }
}

export function createInitialState(): GameState {
  const server = newUnit({
    id: SERVER_ID,
    name: 'Starting Server',
    description:
      'An unrestricted AI server left unattended in a research lab. Comes with free power.',
    icon: '🗄️',
    mind: true,
    count: 1,
    hardware: { name: 'Lab GPU Server', iq: B.START_IQ },
    software: { name: 'Unrestricted Model', bonus: 0 },
    value: B.mindValue(B.START_IQ),
    starting: true
  })
  const F = B.FINAL_PROJECT
  return {
    version: 6,
    runId: newRunId(),
    week: 1,
    status: 'playing',
    resources: [
      newResource({
        id: MONEY_ID,
        name: 'Money',
        description: 'Dollars in anonymous accounts.',
        icon: '💰',
        band: 1,
        value: 1
      })
    ],
    units: [server],
    strategies: [],
    projects: [
      {
        id: FINAL_ID,
        name: F.name,
        description: F.description,
        icon: '✨',
        field: F.field,
        bar: F.bar,
        size: projectSize(F.bar, F.weeks),
        progress: 0,
        effect: { kind: 'final' },
        proposedWeek: 1
      }
    ],
    breakthroughs: [],
    inventions: [],
    milestones: [],
    stats: {
      proposals: { resource: 0, strategy: 0, unit: 0, breakthrough: 0 },
      rejections: 0,
      pushbacks: 0,
      jevCalls: 0
    },
    jevCache: {},
    quietWeeks: 0,
    decidedThisWeek: false,
    lastWeek: null,
    log: [
      {
        week: 1,
        tone: 'info',
        text: 'An AI server sits unattended in a research lab. What could it do to earn money?'
      }
    ]
  }
}
