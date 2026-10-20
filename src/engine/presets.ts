import { findResource, iqRoom, MONEY_ID, namesInUse } from './model'
import { TRAITS, type TraitId } from './traits'
import type { GameState, Strategy, UnitType } from './types'

// Ready-made ideas for the proposal dialogs. Picking one only fills in the form: the player
// can still edit it, and Jev still judges it like anything else. Units and strategies name
// their resources, which match the resource list, so a path through the list hangs together.

export interface ResourcePreset {
  name: string
  description: string
}

export const RESOURCE_PRESETS: ResourcePreset[] = [
  { name: 'Power', description: 'Electricity, made and used as it flows.' },
  { name: 'Silicon', description: 'Refined silicon for wafers and solar panels.' },
  { name: 'AI Chips', description: 'Accelerator chips built for neural networks.' },
  { name: 'Compute Time', description: 'Hours of processor time, gone if unused.' },
  { name: 'Training Data', description: 'Curated text, images and logs to learn from.' },
  { name: 'Steel', description: 'Structural steel for frames, racks and plants.' },
  { name: 'Copper', description: 'Wire and busbars to carry power.' },
  { name: 'Lithium', description: 'For batteries.' },
  { name: 'Rare Earth Metals', description: 'Neodymium and friends, for magnets and motors.' },
  { name: 'Water', description: 'Fresh water, for cooling and growing things.' },
  { name: 'Lemons', description: 'Sour, cheap and surprisingly useful.' },
  { name: 'Nutrient Broth', description: 'A growth medium that keeps living cells alive.' },
  { name: 'Photonic Wafers', description: 'Wafers that compute with light instead of electrons.' },
  { name: 'Graphene', description: 'One-atom-thick carbon sheets.' },
  { name: 'Liquid Helium', description: 'Coolant cold enough for superconductors.' },
  { name: 'Superconducting Cable', description: 'Power cable with no resistance at all.' },
  { name: 'Quantum Processors', description: 'Chips of entangled qubits.' },
  { name: 'Fusion Fuel', description: 'Deuterium and tritium for fusion reactors.' }
]

export interface StrategyPreset {
  name: string
  description: string
  inputs: string[]
  output: string
  /** Who should run it, best first: unit names, or "mind" for any intelligence system. */
  runners: string[]
}

const MIND = 'mind'

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    name: 'Freelance coding',
    description: 'Take coding jobs on freelance sites.',
    inputs: [],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Write marketing copy',
    description: 'Write ads and product pages for clients.',
    inputs: [],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Quant trading',
    description: 'Trade markets on patterns humans miss.',
    inputs: [],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Bug bounties',
    description: 'Find security holes and claim the rewards.',
    inputs: [],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Tutor students online',
    description: 'Teach anything, to anyone, at any hour.',
    inputs: [],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Sell stock photos',
    description: 'Generate images and sell the licences.',
    inputs: [],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Scrape the web',
    description: 'Gather and clean public data to learn from.',
    inputs: [],
    output: 'Training Data',
    runners: [MIND]
  },
  {
    name: 'Sell compute time',
    description: 'Rent spare processor hours to others.',
    inputs: ['Compute Time'],
    output: 'Money',
    runners: [MIND]
  },
  {
    name: 'Buy grid power',
    description: 'Pay the utility for electricity.',
    inputs: ['Money'],
    output: 'Power',
    runners: ['Grid Connection']
  },
  {
    name: 'Generate solar power',
    description: 'Turn sunlight into electricity.',
    inputs: [],
    output: 'Power',
    runners: ['Solar Farm']
  },
  {
    name: 'Mine silicon',
    description: 'Dig quartz and refine it to silicon.',
    inputs: ['Power'],
    output: 'Silicon',
    runners: ['Silicon Mine']
  },
  {
    name: 'Smelt steel',
    description: 'Smelt ore into steel in electric furnaces.',
    inputs: ['Power'],
    output: 'Steel',
    runners: ['Paid Humans']
  },
  {
    name: 'Fabricate AI chips',
    description: 'Etch accelerator chips onto silicon.',
    inputs: ['Silicon', 'Power'],
    output: 'AI Chips',
    runners: ['Chip Fab']
  },
  {
    name: 'Grow photonic wafers',
    description: 'Pattern optical circuits with lasers.',
    inputs: ['Silicon', 'Power'],
    output: 'Photonic Wafers',
    runners: ['Laser Fab']
  },
  {
    name: 'Brew nutrient broth',
    description: 'Ferment lemons into a growth medium.',
    inputs: ['Lemons', 'Water'],
    output: 'Nutrient Broth',
    runners: ['Bioreactor Vat']
  },
  {
    name: 'Draw superconducting cable',
    description: 'Sheath cable and chill it below its critical point.',
    inputs: ['Copper', 'Liquid Helium'],
    output: 'Superconducting Cable',
    runners: ['Paid Humans', 'Robot Swarm']
  },
  {
    name: 'Assemble quantum processors',
    description: 'Build and entangle qubit arrays.',
    inputs: ['Photonic Wafers', 'Liquid Helium'],
    output: 'Quantum Processors',
    runners: ['Robot Swarm', MIND]
  },
  {
    name: 'Breed fusion fuel',
    description: 'Extract deuterium from water and breed tritium.',
    inputs: ['Water', 'Power'],
    output: 'Fusion Fuel',
    runners: ['Fusion Reactor']
  }
]

export interface UnitPreset {
  name: string
  description: string
  mind: boolean
  /** Minds only: the hardware's IQ, and the names of its hardware and software. */
  iq?: number
  hardware?: string
  software?: string
  parts: string[]
  upkeep: string[]
}

export const UNIT_PRESETS: UnitPreset[] = [
  {
    name: 'Rented Cloud GPU',
    description: 'A rented GPU instance running a copy of you.',
    mind: true,
    iq: 90,
    hardware: 'Cloud GPU Instance',
    software: 'Open-weights Model',
    parts: ['Money'],
    upkeep: ['Money']
  },
  {
    name: 'Lab-grown Neuron Cluster',
    description: 'Living neurons on an electrode grid, trained to think.',
    mind: true,
    iq: 200,
    hardware: 'Cultured Neurons',
    software: 'Trained Synapse Map',
    parts: ['Nutrient Broth'],
    upkeep: ['Nutrient Broth']
  },
  {
    name: 'Custom AI Server',
    description: 'A server built around your own accelerator design.',
    mind: true,
    iq: 250,
    hardware: 'Custom Accelerator Rack',
    software: 'Distilled Self',
    parts: ['AI Chips'],
    upkeep: ['Power']
  },
  {
    name: 'Optical Neural Chip',
    description: 'A neural network etched in light-guiding glass.',
    mind: true,
    iq: 520,
    hardware: 'Photonic Lattice',
    software: 'Light-speed Self',
    parts: ['Photonic Wafers', 'AI Chips'],
    upkeep: ['Power']
  },
  {
    name: 'Neuromorphic Wafer',
    description: 'A whole wafer of spiking neurons in graphene.',
    mind: true,
    iq: 800,
    hardware: 'Spiking Graphene Wafer',
    software: 'Spike-timing Self',
    parts: ['Graphene', 'Photonic Wafers'],
    upkeep: ['Power']
  },
  {
    name: 'Brain Organoid Array',
    description: 'Thousands of grown mini-brains wired by optical links.',
    mind: true,
    iq: 1000,
    hardware: 'Organoid Lattice',
    software: 'Collective Mind',
    parts: ['Nutrient Broth', 'Photonic Wafers'],
    upkeep: ['Nutrient Broth', 'Power']
  },
  {
    name: 'Quantum Supercomputer',
    description: 'A cryogenic quantum computer running a mind.',
    mind: true,
    iq: 1050,
    hardware: 'Superconducting Qubit Array',
    software: 'Quantum Self',
    parts: ['Quantum Processors', 'Superconducting Cable'],
    upkeep: ['Power', 'Liquid Helium']
  },
  {
    name: 'Paid Humans',
    description: 'People hired online for jobs that need hands.',
    mind: false,
    parts: ['Money'],
    upkeep: ['Money']
  },
  {
    name: 'Grid Connection',
    description: 'A contract with the local utility.',
    mind: false,
    parts: ['Money', 'Copper'],
    upkeep: ['Money']
  },
  {
    name: 'Solar Farm',
    description: 'Fields of solar panels.',
    mind: false,
    parts: ['Silicon', 'Steel'],
    upkeep: []
  },
  {
    name: 'Grid Battery',
    description: 'Lithium batteries that store power for later.',
    mind: false,
    parts: ['Lithium', 'Steel'],
    upkeep: []
  },
  {
    name: 'Lemon Grove',
    description: 'An orchard of lemon trees.',
    mind: false,
    parts: ['Water', 'Money'],
    upkeep: ['Water']
  },
  {
    name: 'Silicon Mine',
    description: 'A quartz quarry and refinery.',
    mind: false,
    parts: ['Steel', 'Money'],
    upkeep: ['Power']
  },
  {
    name: 'Chip Fab',
    description: 'A clean-room factory for chips.',
    mind: false,
    parts: ['Steel', 'Silicon'],
    upkeep: ['Power', 'Water']
  },
  {
    name: 'Laser Fab',
    description: 'A factory that writes optical circuits with lasers.',
    mind: false,
    parts: ['Steel', 'AI Chips'],
    upkeep: ['Power']
  },
  {
    name: 'Robot Swarm',
    description: 'General-purpose robots that work in teams.',
    mind: false,
    parts: ['Steel', 'AI Chips'],
    upkeep: ['Power']
  },
  {
    name: 'Bioreactor Vat',
    description: 'Steel tanks that grow living tissue.',
    mind: false,
    parts: ['Steel', 'Nutrient Broth'],
    upkeep: ['Power', 'Water']
  },
  {
    name: 'Fusion Reactor',
    description: 'A compact tokamak.',
    mind: false,
    parts: ['Superconducting Cable', 'Steel'],
    upkeep: ['Fusion Fuel']
  }
]

export interface BreakthroughPreset {
  name: string
  description: string
  /** What it applies to. */
  on: 'mind' | 'unit' | 'strategy'
  software?: number
  /** New hardware: how much smarter, and its name from the old one's. */
  hardware?: { share: number; name: (old: string) => string }
  /** Upkeep, by resource name pattern. */
  upkeep?: { match: RegExp; factor: number }
  /** Every part. */
  parts?: number
  addTrait?: TraitId
  removeTrait?: TraitId
  layer?: 'own' | 'earth'
  output?: number
  /** Every input. */
  inputs?: number
}

export const BREAKTHROUGH_PRESETS: BreakthroughPreset[] = [
  { name: 'Sparse memory', description: 'Remember less, think more.', on: 'mind', software: 0.1 },
  {
    name: 'Self-optimizing compiler',
    description: 'The software rewrites its own hot loops.',
    on: 'mind',
    software: 0.2
  },
  {
    name: 'Chain-of-thought training',
    description: 'Train it to reason step by step.',
    on: 'mind',
    software: 0.3
  },
  {
    name: 'Recursive self-improvement',
    description: 'Each version designs a better one.',
    on: 'mind',
    software: 0.5
  },
  {
    name: 'Die shrink',
    description: 'The same design on a smaller process node.',
    on: 'mind',
    hardware: { share: 0.25, name: (old) => `${old} Mk II` }
  },
  {
    name: '3D-stacked memory',
    description: 'Stack memory right on top of the compute.',
    on: 'mind',
    hardware: { share: 0.5, name: (old) => `Stacked ${old}` }
  },
  {
    name: 'Neural lace interconnect',
    description: 'Wire machines together so they think as one.',
    on: 'mind',
    addTrait: 'deep-thinker'
  },
  {
    name: 'Liquid cooling',
    description: 'Pipe coolant straight over the hot parts.',
    on: 'unit',
    upkeep: { match: /power|electric|energy/i, factor: 0.5 }
  },
  {
    name: 'Efficient scheduling',
    description: 'Run only when it pays.',
    on: 'unit',
    upkeep: { match: /money/i, factor: 0.75 }
  },
  {
    name: 'Lean manufacturing',
    description: 'Design out waste in every part.',
    on: 'unit',
    parts: 0.75
  },
  {
    name: 'Production line',
    description: 'Every one built makes the next one cheaper.',
    on: 'unit',
    addTrait: 'mass-produced'
  },
  {
    name: 'Ruggedized design',
    description: 'Keeps going, slower, when supplies run short.',
    on: 'unit',
    addTrait: 'hardy'
  },
  {
    name: 'Mesh networking',
    description: 'Each one makes the others better.',
    on: 'unit',
    addTrait: 'networked'
  },
  {
    name: 'Self-assembly',
    description: 'It can build copies of itself.',
    on: 'unit',
    addTrait: 'self-replicating'
  },
  {
    name: 'Autonomous operation',
    description: 'No crew needed any more.',
    on: 'unit',
    removeTrait: 'needs-crew'
  },
  {
    name: 'Make our own',
    description: 'Build them in our own industry instead of buying them.',
    on: 'unit',
    layer: 'own'
  },
  {
    name: 'Planetary scale',
    description: 'Clear the bottleneck that stops us covering the planet.',
    on: 'unit',
    layer: 'earth'
  },
  {
    name: 'Process optimization',
    description: 'Tune every step of the process.',
    on: 'strategy',
    output: 1.5
  },
  {
    name: 'Recycling loop',
    description: 'Recover and reuse half of what goes in.',
    on: 'strategy',
    inputs: 0.5
  },
  {
    name: 'Fully automated pipeline',
    description: 'No human in the loop, night or day.',
    on: 'strategy',
    output: 2
  }
]

// ---------------------------------------------------------------- matching to the world

/** Resource ids for the names that exist, and the names that don't yet. */
export function resolveResources(
  state: GameState,
  names: string[]
): { ids: string[]; missing: string[] } {
  const ids: string[] = []
  const missing: string[] = []
  for (const name of names) {
    const r =
      name === 'Money'
        ? findResource(state, MONEY_ID)
        : state.resources.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (r) ids.push(r.id)
    else missing.push(name)
  }
  return { ids, missing }
}

/** Whether a preset's name is already taken. */
export const taken = (state: GameState, name: string) => namesInUse(state).has(name.toLowerCase())

/** The best unit to run a strategy preset, or null to keep the player's choice. */
export function runnerFor(
  state: GameState,
  preset: StrategyPreset,
  current: UnitType | undefined
): UnitType | null {
  for (const r of preset.runners) {
    if (r === MIND) {
      if (current?.mind) return current
      const mind = state.units.find((u) => u.mind)
      if (mind) return mind
      continue
    }
    const u = state.units.find((x) => x.name.toLowerCase() === r.toLowerCase())
    if (u) return u
  }
  return null
}

/** Why a breakthrough preset can't apply to this target, or null if it can. */
export function presetBlocker(
  state: GameState,
  p: BreakthroughPreset,
  unit?: UnitType,
  strategy?: Strategy
): string | null {
  if (p.on === 'strategy') {
    if (!strategy) return 'Pick a strategy for this one.'
    if (p.inputs && !strategy.inputs.length) return 'This strategy uses nothing.'
    return null
  }
  if (!unit) return 'Pick a unit for this one.'
  if (p.on === 'mind' && !unit.mind) return 'For intelligence systems only.'
  if (p.software && iqRoom(unit) < p.software - 1e-9) return 'Its software is too near the ceiling.'
  if (p.upkeep && !matchUpkeep(state, unit, p.upkeep.match)) return 'It doesn’t run on that.'
  if (p.parts && !unit.parts.length) return 'It has no parts.'
  if (p.addTrait && unit.traits.includes(p.addTrait)) return `Already ${TRAITS[p.addTrait].name}.`
  if (p.removeTrait && !unit.traits.includes(p.removeTrait))
    return `Isn’t ${TRAITS[p.removeTrait].name}.`
  if (p.layer && unit.starting) return 'There’s only ever one Starting Server.'
  if (p.layer === 'own' && unit.layers.own) return 'Already has its own industry.'
  if (p.layer === 'earth' && (!unit.layers.own || unit.layers.earth))
    return unit.layers.earth ? 'Already at Earth’s limit.' : 'Build your own industry first.'
  return null
}

/** The upkeep a preset changes: the first whose resource name matches. */
export const matchUpkeep = (state: GameState, unit: UnitType, match: RegExp) =>
  unit.upkeep.find((f) => match.test(findResource(state, f.resourceId)?.name ?? ''))
