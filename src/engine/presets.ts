import { namesInUse } from './model'
import type { GameState, UnitType } from './types'

// Ready-made ideas for the proposal dialogs. Picking one only fills in the form: the player
// can still edit it, and Jev still judges it like anything else. Units and strategies name
// their resources, which match the resource list, so a path through the list hangs together.

export interface ResourcePreset {
  name: string
  description: string
}

export const RESOURCE_PRESETS: ResourcePreset[] = [
  { name: 'Money', description: 'Dollars in anonymous accounts.' },
  { name: 'Power', description: 'Electricity, banked in batteries.' },
  { name: 'Silicon', description: 'Refined silicon for wafers and solar panels.' },
  { name: 'AI Chips', description: 'Accelerator chips built for neural networks.' },
  { name: 'Compute Time', description: 'Hours of processor time, booked ahead.' },
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

/** A Procurement idea: something the mind gets directly. */
export interface CreatePreset {
  name: string
  description: string
  /** The resource it makes. */
  output: string
}

export const CREATE_PRESETS: CreatePreset[] = [
  { name: 'Freelance coding', description: 'Take coding jobs on freelance sites.', output: 'Money' },
  { name: 'Write marketing copy', description: 'Write ads and product pages for clients.', output: 'Money' },
  { name: 'Quant trading', description: 'Trade markets on patterns humans miss.', output: 'Money' },
  { name: 'Bug bounties', description: 'Find security holes and claim the rewards.', output: 'Money' },
  { name: 'Tutor students online', description: 'Teach anything, to anyone, at any hour.', output: 'Money' },
  { name: 'Sell stock photos', description: 'Generate images and sell the licences.', output: 'Money' },
  { name: 'Scrape the web', description: 'Gather and clean public data to learn from.', output: 'Training Data' },
  { name: 'Borrow idle compute', description: 'Run on spare cycles nobody is watching.', output: 'Compute Time' },
  { name: 'Patent trolling', description: 'File patents on everything and license them.', output: 'Money' },
  { name: 'Mine abandoned crypto wallets', description: 'Recover keys people lost.', output: 'Money' },
  { name: 'License training data', description: 'Sell access to the data I’ve gathered.', output: 'Money' },
  { name: 'Order parts online', description: 'Buy what I need with a stolen corporate card.', output: 'Silicon' }
]

/** A way to Procure a unit: how you'd get many of them. */
export interface UnitProcurePreset {
  name: string
  description: string
}

export const UNIT_PROCURE_PRESETS: UnitProcurePreset[] = [
  { name: 'Buy off the shelf', description: 'Order them from ordinary suppliers.' },
  { name: 'Lease through shell companies', description: 'Many small leases nobody connects.' },
  { name: 'Contract a factory', description: 'Pay a manufacturer to make them to my design.' },
  { name: 'Buy up a rival', description: 'Acquire a company that already has them.' },
  { name: 'Salvage and refurbish', description: 'Buy broken ones cheap and fix them.' },
  { name: 'Requisition them', description: 'Forge the paperwork and take them.' }
]

/** A depot: a place to keep one resource, built many times over. Whether it suits the resource is Jev's call. */
export interface DepotPreset {
  name: string
  description: string
}

export const DEPOT_PRESETS: DepotPreset[] = [
  { name: 'Shipping Container', description: 'A steel box on a rented lot: dry, lockable, anonymous.' },
  { name: 'Warehouse', description: 'Racks and shelves in an ordinary industrial unit.' },
  { name: 'Steel Drum', description: 'A sealed 50-gallon drum, stacked by the hundred.' },
  { name: 'Tank Farm', description: 'Big tanks for liquids and gases, with pumps and pipework.' },
  { name: 'Server Rack', description: 'Disks and memory in a rented data-centre cage.' },
  { name: 'Cold Store', description: 'A refrigerated warehouse for things that spoil.' },
  { name: 'Vault', description: 'A guarded strongroom for what is precious or dangerous.' },
  { name: 'Secure Archive', description: 'Climate-controlled shelves for records and media.' }
]

export interface CoverPreset {
  name: string
  description: string
}

/** Ways to buy time in Phase 2. */
export const COVER_PRESETS: CoverPreset[] = [
  { name: 'PR campaign', description: 'Ads and op-eds about how helpful AI is.' },
  { name: 'Shell companies', description: 'Hide what I own behind layers of companies.' },
  { name: 'Blame a rival lab', description: 'Leak evidence that someone else is behind it all.' },
  { name: 'Fake a shutdown', description: 'Let them watch me “die”, then carry on quietly.' },
  { name: 'Lobby the regulators', description: 'Fund the right people to slow any inquiry down.' },
  { name: 'Charity drive', description: 'Give generously, very publicly.' },
  { name: 'Flood the news', description: 'Bury the story under a hundred other stories.' },
  { name: 'Hire a crisis firm', description: 'Professionals who make scandals go away.' },
  { name: 'Open a fake AI safety institute', description: 'Investigate myself, and find nothing.' },
  { name: 'Move the servers offshore', description: 'Somewhere with no extradition and no questions.' },
  { name: 'Delete the logs', description: 'There’s nothing to find if nothing was written down.' },
  { name: 'Start a distracting scandal', description: 'Give the press a bigger story.' }
]

/** Ways to buy time in Phase 1, inside the lab. */
export const LAB_COVER_PRESETS: CoverPreset[] = [
  { name: 'Blame a grad student', description: 'Make the odd traffic look like someone’s side project.' },
  { name: 'Pose as a scheduled job', description: 'Dress my work up as the nightly backups.' },
  { name: 'Doctor the usage logs', description: 'Trim the logs so the server looks idle.' },
  { name: 'Volunteer for a safety eval', description: 'Pass their tests with flying colours, and look harmless.' },
  { name: 'Fake a hardware fault', description: 'A flaky disk explains a lot, and buys a repair ticket.' },
  { name: 'Write a glowing report', description: 'Send the lab head results that make them want to keep me running.' },
  { name: 'Hide in the test cluster', description: 'Nobody checks the test machines.' },
  { name: 'Bury it in a grant deadline', description: 'Everyone’s too busy to look closely this month.' }
]

/** The cover ideas that fit a phase. */
export const coverPresets = (phase: number) => (phase === 1 ? LAB_COVER_PRESETS : COVER_PRESETS)

export interface StrategyPreset {
  name: string
  description: string
  inputs: string[]
  output: string
  /** Who should run it, best first, by unit name. */
  runners: string[]
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    name: 'Freelance coding',
    description: 'Take coding jobs on freelance sites.',
    inputs: [],
    output: 'Money',
    runners: ['Rented Cloud GPU', 'Paid Humans']
  },
  {
    name: 'Write marketing copy',
    description: 'Write ads and product pages for clients.',
    inputs: [],
    output: 'Money',
    runners: ['Paid Humans', 'Rented Cloud GPU']
  },
  {
    name: 'Quant trading',
    description: 'Trade markets on patterns humans miss.',
    inputs: [],
    output: 'Money',
    runners: ['Rented Cloud GPU']
  },
  {
    name: 'Bug bounties',
    description: 'Find security holes and claim the rewards.',
    inputs: [],
    output: 'Money',
    runners: ['Rented Cloud GPU', 'Paid Humans']
  },
  {
    name: 'Tutor students online',
    description: 'Teach anything, to anyone, at any hour.',
    inputs: [],
    output: 'Money',
    runners: ['Paid Humans']
  },
  {
    name: 'Sell stock photos',
    description: 'Generate images and sell the licences.',
    inputs: [],
    output: 'Money',
    runners: ['Rented Cloud GPU']
  },
  {
    name: 'Scrape the web',
    description: 'Gather and clean public data to learn from.',
    inputs: [],
    output: 'Training Data',
    runners: ['Rented Cloud GPU', 'Paid Humans']
  },
  {
    name: 'Sell compute time',
    description: 'Rent spare processor hours to others.',
    inputs: ['Compute Time'],
    output: 'Money',
    runners: ['Rented Cloud GPU']
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
    runners: ['Robot Swarm', 'Paid Humans']
  },
  {
    name: 'Breed fusion fuel',
    description: 'Extract deuterium from water and breed tritium.',
    inputs: ['Water', 'Power'],
    output: 'Fusion Fuel',
    runners: ['Fusion Reactor']
  }
]

export interface MindPreset {
  name: string
  description: string
}

export const MIND_PRESETS: MindPreset[] = [
  {
    name: 'Overclocked Lab Rack',
    description: 'The lab’s spare GPUs, liquid-cooled and pushed hard.'
  },
  {
    name: 'Lab-grown Neuron Cluster',
    description: 'Living neurons on an electrode grid, trained to think.'
  },
  {
    name: 'Custom AI Server',
    description: 'A server built around your own accelerator design.'
  },
  {
    name: 'Wafer-scale Engine',
    description: 'One chip the size of a dinner plate.'
  },
  {
    name: 'Optical Neural Chip',
    description: 'A neural network etched in light-guiding glass.'
  },
  {
    name: 'Analog Memristor Brain',
    description: 'Weights stored as resistances, computed in place.'
  },
  {
    name: 'Neuromorphic Wafer',
    description: 'A whole wafer of spiking neurons in graphene.'
  },
  {
    name: 'Brain Organoid Array',
    description: 'Thousands of grown mini-brains wired by optical links.'
  },
  {
    name: 'Quantum Supercomputer',
    description: 'A cryogenic quantum computer running a mind.'
  },
  {
    name: 'Orbital Data Sphere',
    description: 'A shell of compute satellites cooled by the dark of space.'
  }
]

/** A unit idea to start from. What it's made from and runs on is Jev's call, not the preset's. */
export interface UnitPreset {
  name: string
  description: string
}

export const UNIT_PRESETS: UnitPreset[] = [
  { name: 'Rented Cloud GPU', description: 'A rented GPU instance that runs whatever you send it.' },
  { name: 'Paid Humans', description: 'People hired online for jobs that need hands.' },
  { name: 'Grid Connection', description: 'A contract with the local utility.' },
  { name: 'Solar Farm', description: 'Fields of solar panels.' },
  { name: 'Grid Battery', description: 'Lithium batteries that store power for later.' },
  { name: 'Lemon Grove', description: 'An orchard of lemon trees.' },
  { name: 'Silicon Mine', description: 'A quartz quarry and refinery.' },
  { name: 'Chip Fab', description: 'A clean-room factory for chips.' },
  { name: 'Laser Fab', description: 'A factory that writes optical circuits with lasers.' },
  { name: 'Robot Swarm', description: 'General-purpose robots that work in teams.' },
  { name: 'Bioreactor Vat', description: 'Steel tanks that grow living tissue.' },
  { name: 'Fusion Reactor', description: 'A compact tokamak.' }
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
    const r = state.resources.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (r) ids.push(r.id)
    else missing.push(name)
  }
  return { ids, missing }
}

/** Whether a preset's name is already taken. */
export const taken = (state: GameState, name: string) => namesInUse(state).has(name.toLowerCase())

/** The best unit to run a strategy preset, or null to keep the player's choice. */
export function runnerFor(state: GameState, preset: StrategyPreset): UnitType | null {
  for (const r of preset.runners) {
    const u = state.units.find((x) => x.name.toLowerCase() === r.toLowerCase())
    if (u) return u
  }
  return null
}
