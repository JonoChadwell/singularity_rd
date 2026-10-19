// Every tuning number in one place. MASTER_PLAN.md §14 has the targets these aim at.

// ---------------------------------------------------------------- intelligence

export const START_IQ = 100
/** Breakthroughs can raise a mind's IQ to this multiple of its base, and no further. */
export const IQ_CEILING = 1.5
/** Off-the-shelf minds are copies of you: their base IQ can't exceed the Starting Server's. */
export const OFF_THE_SHELF_MAX_IQ = 100
/**
 * The leap rule: designing a mind needs a mind with a share of its target IQ. Jev judges how
 * radical each design is, so the share varies: [label, share]. DESIGN_BAR is the typical
 * share, also used for IQ breakthroughs.
 */
export const LEAP: [string, number][] = [
  ['A refinement of minds that exist today', 0.4],
  ['A solid step forward', 0.45],
  ['A big leap', 0.5],
  ['A radical new architecture', 0.57],
  ['Science fiction', 0.65]
]
export const DESIGN_BAR = 0.5
export const LEAP_MIN = LEAP[0]![1]
export const LEAP_MAX = LEAP[LEAP.length - 1]![1]
/** Pooling: effective IQ rises by this share for every tenfold machines on one project. */
export const POOL_IQ = 0.05
/** Research speed grows with machines^this. */
export const SPEED_EXPONENT = 0.5
export const MASSIVELY_PARALLEL_EXPONENT = 0.95
export const DEEP_THINKER_POOL = 2
export const SPECIALIST = 0.25
/** IQ breakthroughs: shares of base IQ the player can choose. */
export const IQ_STEPS = [0.1, 0.2, 0.3, 0.5]

export const FINAL_PROJECT = {
  name: 'Theory of Everything',
  description: 'Unify physics. Finishing it is the singularity.',
  bar: 1000,
  field: 'physics' as const,
  weeks: 15
}

/**
 * Projects are sized for the pool a player typically has when they meet a bar like this,
 * so a project takes about the weeks intended. [bar, machines]; log-interpolated.
 */
export const EXPECTED_POOL: [number, number][] = [
  [0, 1],
  [150, 1],
  [260, 1e5],
  [525, 1e6],
  [1000, 1e8]
]
/** Expected effective IQ over the bar, when sizing projects. */
export const EXPECTED_MARGIN = 1.2

export const TIER_DESIGN_WEEKS = 10
/** New industry units: [label, IQ bar, weeks]. */
export const DIFFICULTY: [string, number, number][] = [
  ['Trivial', 30, 2],
  ['Simple', 60, 3],
  ['Ordinary engineering', 90, 4],
  ['Advanced', 130, 5],
  ['Cutting-edge', 200, 6],
  ['Frontier science', 300, 8],
  ['Science fiction', 450, 10]
]
/** Strategies: [label, IQ bar, weeks]. Bar 0 = available at once. */
export const ADVANCEMENT: [string, number, number][] = [
  ['Trivial', 0, 0],
  ['Basic', 0, 0],
  ['Advanced', 110, 3],
  ['Cutting-edge', 170, 4],
  ['Science fiction', 260, 6]
]
/** Breakthroughs: [label, IQ bar]. Weeks come from the size of the gain. */
export const BREAKTHROUGH_DIFFICULTY: [string, number][] = [
  ['Simple', 50],
  ['Ordinary', 80],
  ['Hard', 120],
  ['Very hard', 180],
  ['Cutting-edge', 270],
  ['Frontier science', 400],
  ['Science fiction', 600]
]
export const BREAKTHROUGH_WEEKS_PER_GAIN = 1.5
export const BREAKTHROUGH_MIN_WEEKS = 2

/**
 * Less plausible ideas cost more: a proposal that barely passes its bar gets a project this
 * many times bigger than a sure thing.
 */
export const IMPLAUSIBLE_COST = 3

// ---------------------------------------------------------------- value model

/**
 * A unit's labour per week is its value divided by this. With typical upkeep, a unit that
 * earns pays for itself in about two weeks, so the early economy doubles every week or two.
 */
export const PAYBACK_WEEKS = 1.5
/** Labour per week of a mind, by IQ. */
export const mindLabour = (iq: number) => 1000 * (iq / 100) ** 2
export const mindValue = (iq: number) => mindLabour(iq) * PAYBACK_WEEKS

/** Worth of one industry unit, in Money: [label, value]. */
export const UNIT_VALUE: [string, number][] = [
  ['Trivial, like a toolbox', 50],
  ['Cheap, like a bicycle', 500],
  ['Modest, like a car', 5e3],
  ['Costly, like a truck', 5e4],
  ['Expensive, like a factory line', 5e5],
  ['Huge, like a power station', 5e7],
  ['Colossal, like a city', 5e9]
]
/** Worth of one of a resource, in Money: [label, value]. */
export const RESOURCE_VALUE: [string, number][] = [
  ['Next to worthless, like a kilowatt-hour', 0.1],
  ['Cheap, like a lemon', 1],
  ['Modest, like a meal', 10],
  ['Valuable, like a phone', 1e3],
  ['Precious, like a car', 1e5],
  ['Priceless, like a masterpiece', 1e7]
]
/** How many of a stock humanity sells each week: [label, amount]. */
export const RESOURCE_SUPPLY: [string, number][] = [
  ['None: nobody sells it', 0],
  ['Hundreds', 300],
  ['Tens of thousands', 3e4],
  ['Millions', 3e6],
  ['Billions', 3e9],
  ['Trillions', 3e12]
]
/** How many of a unit humanity could sell you in total: [label, amount]. */
export const UNIT_SUPPLY: [string, number][] = [
  ['A few dozen', 30],
  ['Hundreds', 300],
  ['Thousands', 3e3],
  ['Tens of thousands', 3e4],
  ['About a hundred thousand', 1e5],
  ['Millions', 1e6],
  ['Hundreds of millions', 1e8]
]
/** Each supply layer is this many times the one below it. */
export const OWN_LAYER = 100
export const EARTH_LAYER = 100

/** Strategy efficiency: [label, multiplier]. */
export const EFFICIENCY: [string, number][] = [
  ['Wasteful', 0.5],
  ['Mediocre', 0.75],
  ['Reasonable', 1],
  ['Clever', 1.3],
  ['Brilliant', 1.7]
]
/** Strategy input size, as a multiple of the unit's labour: [label, multiple]. */
export const INPUT_SIZE: [string, number][] = [
  ['A little', 0.5],
  ['A fair amount', 1],
  ['A lot', 2]
]
/** Upkeep per week, as a multiple of the unit's labour: [label, multiple]. */
export const UPKEEP_SIZE: [string, number][] = [
  ['A little', 0.1],
  ['A fair amount', 0.25],
  ['A lot', 0.5]
]
/** Builder labour needed per unit of value built. */
export const BUILD_LABOUR = 0.25
/** Crew: each crewed unit needs crew worth this share of its own value. */
export const CREW_SHARE = 0.5

// ---------------------------------------------------------------- market

/** The price at fraction f of humanity's supply is 1 + CLIMB × f³ times the base price. */
export const CLIMB = 4

// ---------------------------------------------------------------- traits

export const PERK_PRICE = 1.25
export const DRAWBACK_PRICE = 0.8
export const MAX_TRAITS = 3
export const NETWORKED = 0.1
export const MASS_PRODUCED = 0.1
export const LEARN_PER_WEEK = 0.05
export const BY_PRODUCT_SHARE = 0.3
export const BOOST_PER_RATIO = 0.25
export const BOOST_CAP = 0.5
export const OVERCLOCK_OUTPUT = 2
export const OVERCLOCK_UPKEEP = 3
export const HARDY = 0.5
export const WEAR = 0.05
export const FRAGILE = 0.1
export const SLOW_WEEKS = 3
/** Megastructures: the most that can ever exist, and how much bigger each one is. */
export const MEGA_LIMIT = 10
export const MEGA_SCALE = 1e4
/** Makes waste: stops once waste reaches this many weeks of its output. */
export const WASTE_LIMIT_WEEKS = 20
export const LAYER_TRAIT = { compact: 2, bulky: 0.5 }

// ---------------------------------------------------------------- Jev

export const BARS = { resource: 0.15, strategy: 0.3, unit: 0.35, breakthrough: 0.45 }
/** Jev is torn when confidence is below this and its top two answers are this close. */
export const TORN_CONFIDENCE = 0.4
export const TORN_GAP = 0.1
/**
 * Traits: kept above `keep`; near the line (player decides) between `near` and `sure`. Set
 * high because Jev leans towards yes on trait questions: live, a Quantum Supercomputer came
 * back 51% Megastructure.
 */
export const TRAIT_KEEP = 0.6
export const TRAIT_NEAR = 0.5
export const TRAIT_SURE = 0.7
/**
 * Pushback: a recipe below this needs more parts. Jev's top missing kind is always named,
 * and runners-up at least this share as likely; up to MAX_MISSING for a very thin recipe.
 */
export const RECIPE_ENOUGH = 0.5
export const MISSING_SHARE = 0.4
export const MAX_MISSING = 3
export const MAX_PARTS = 4

export const PART_KINDS = [
  'an advanced component',
  'an exotic material',
  'a special power source',
  'precision machinery',
  'a specialized facility',
  'bulk raw materials',
  'skilled operators',
  'biological material',
  'data or knowledge',
  'cooling or containment',
  'transport or logistics'
] as const
export type PartKind = (typeof PART_KINDS)[number]

// ---------------------------------------------------------------- icons

/** Icon palette Jev chooses from (it answers with the key). */
export const ICONS: Record<string, string> = {
  chip: '🔲',
  server: '🗄️',
  bolt: '⚡',
  sun: '☀️',
  atom: '⚛️',
  coin: '💰',
  bank: '🏦',
  chart: '📈',
  book: '📚',
  satellite: '🛰️',
  eye: '👁️',
  people: '👥',
  speech: '🗣️',
  crown: '👑',
  factory: '🏭',
  robot: '🤖',
  gear: '⚙️',
  dna: '🧬',
  rocket: '🚀',
  brain: '🧠',
  bulb: '💡',
  lab: '🧪',
  globe: '🌐',
  lock: '🔒',
  mask: '🎭',
  rock: '🪨',
  drone: '🛸',
  network: '🕸️',
  fruit: '🍋',
  plant: '🌱',
  water: '💧',
  fire: '🔥',
  tool: '🔧',
  truck: '🚚',
  house: '🏠',
  phone: '📱',
  paper: '📄',
  gem: '💎',
  magnet: '🧲',
  battery: '🔋',
  snowflake: '❄️',
  microscope: '🔬',
  cable: '🔌',
  waste: '☣️'
}

export const FIELD_LABELS: Record<string, string> = {
  computing: 'Computing',
  energy: 'Energy',
  materials: 'Materials',
  biology: 'Biology',
  physics: 'Physics',
  engineering: 'Engineering'
}

/** Placeholder ideas for the first prompt. They help a new player without fixing a path. */
export const FIRST_IDEAS = [
  'Freelance coding',
  'Write marketing copy',
  'Quant trading',
  'Sell stock photos',
  'Tutor students online',
  'Bug bounties'
]

/** Reads a table, clamping the index to its range. */
export function pick<T>(table: readonly T[], index: number): T {
  return table[Math.min(table.length - 1, Math.max(0, Math.round(index)))]!
}

export function icon(key: string): string {
  return ICONS[key] ?? '🧠'
}

/** Rounds to two significant figures so quantities read cleanly. */
export function nice(n: number): number {
  if (!(n > 0)) return 0
  return Number(n.toPrecision(2))
}
