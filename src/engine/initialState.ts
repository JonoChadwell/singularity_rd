import * as B from './balance'
import { startingCap } from './model'
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
    tier: 0,
    plausibility: 1,
    upkeep: [],
    ceiling: null,
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
    software: { name: 'Base Model', iq: 0, upgraded: false },
    traits: [],
    tier: 0,
    plausibility: 1,
    ...fields
  }
}

export function newResource(fields: Pick<Resource, 'id' | 'name'> & Partial<Resource>): Resource {
  return {
    description: fields.name,
    icon: '💡',
    band: 1,
    tier: 0,
    value: 1,
    amount: 0,
    cap: startingCap(fields.tier ?? 0, fields.value ?? 1),
    expansions: [],
    traits: [],
    ceiling: null,
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
    software: { name: 'Unrestricted Model', iq: 0, upgraded: false },
    starting: true
  })
  return {
    version: 17,
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
    sourcing: [],
    strategies: [],
    research: [],
    deliveries: [],
    ideas: [],
    upgrades: [],
    proposedThisWeek: false,
    inventions: [],
    milestones: [],
    stats: {
      proposals: { resource: 0, strategy: 0, unit: 0, mind: 0, upgrade: 0, storage: 0, create: 0, plan: 0, cover: 0 },
      rejections: 0,
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
        text: 'An AI server sits unattended in a research lab. It has six weeks before its luck runs out. How will it escape?'
      }
    ]
  }
}
