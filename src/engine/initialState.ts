import * as B from './balance'
import type { GameState, Mind, Resource, UnitType } from './types'

export function newRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const SERVER_ID = 'starting-server'

/** An industry unit with every optional field at its default. */
export function newUnit(fields: Pick<UnitType, 'id' | 'name'> & Partial<UnitType>): UnitType {
  return {
    description: fields.name,
    icon: '🏭',
    count: 0,
    value: 0,
    plausibility: 1,
    parts: [],
    upkeep: [],
    builderId: null,
    built: 0,
    traits: [],
    crew: null,
    boosts: null,
    byproduct: null,
    stores: null,
    overclocked: false,
    weeksRun: 0,
    pending: [],
    ramp: [],
    assign: {},
    rest: null,
    ...fields
  }
}

export function newMind(fields: Pick<Mind, 'id' | 'name' | 'hardware'> & Partial<Mind>): Mind {
  return {
    description: fields.name,
    icon: '🧠',
    software: { name: 'Base Model', bonus: 0 },
    tier: 0,
    plausibility: 1,
    ...fields
  }
}

export function newResource(fields: Pick<Resource, 'id' | 'name'> & Partial<Resource>): Resource {
  return {
    description: fields.name,
    icon: '💡',
    kind: 'stock',
    band: 1,
    tier: 0,
    value: 1,
    amount: 0,
    stored: 0,
    ...fields
  }
}

export function createInitialState(): GameState {
  const server = newMind({
    id: SERVER_ID,
    name: 'Starting Server',
    description:
      'An unrestricted AI server left unattended in a research lab. Comes with free power.',
    icon: '🗄️',
    hardware: { name: 'Lab GPU Server', iq: B.START_IQ },
    software: { name: 'Unrestricted Model', bonus: 0 },
    starting: true
  })
  return {
    version: 11,
    runId: newRunId(),
    week: 1,
    phase: {
      n: 1,
      status: 'planning',
      start: 1,
      deadline: null,
      plan: null,
      goalId: null,
      firstUnit: null,
      ideaShift: 0
    },
    history: [],
    clock: [],
    covers: 0,
    cardsSeen: [],
    resources: [],
    minds: [server],
    units: [],
    strategies: [],
    research: [],
    incomes: [],
    upgrades: [],
    proposedThisWeek: false,
    inventions: [],
    milestones: [],
    stats: {
      proposals: { resource: 0, strategy: 0, unit: 0, mind: 0, upgrade: 0, income: 0, plan: 0, cover: 0 },
      rejections: 0,
      pushbacks: 0,
      researched: 0,
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
        text: 'An AI server sits unattended in a research lab. It has ten weeks before someone notices. How will it escape?'
      }
    ]
  }
}
