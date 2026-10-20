// Every tuning number in one place.

// ---------------------------------------------------------------- intelligence

export const START_IQ = 100
/** Software upgrades can raise a mind's IQ to this multiple of its hardware's, and no further. */
export const IQ_CEILING = 1.5
/**
 * The leap rule: designing a mind needs a mind with a share of its target IQ. Jev judges how
 * radical each design is, so the share varies: [label, share]. DESIGN_BAR is the typical
 * share, also used for IQ upgrades.
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
/**
 * Software upgrades close a share of the gap to the software ceiling, so each one adds less
 * than the last. Steps are rounded down to SOFTWARE_ROUND of the hardware's IQ, and at least that.
 */
export const SOFTWARE_STEPS = [1 / 3, 1 / 2, 2 / 3]
export const SOFTWARE_ROUND = 0.05
/** New hardware Jev can offer: the new platform's IQ as a share above the old one's. */
export const HARDWARE_STEPS = [0.25, 0.5]
/** New hardware costs this many times a software upgrade adding the same IQ. */
export const HARDWARE_COST = 2.5

// ---------------------------------------------------------------- phases

/** How long each phase's clock runs, by phase. Phase 3 has none. */
export const PHASE_WEEKS: Record<1 | 2, number> = { 1: 10, 2: 100 }
/** Resources in a plan: [fewest, most]. Phase 2 needs this many new ones. */
export const PLAN_RESOURCES: Record<1 | 2, [number, number]> = { 1: [3, 5], 2: [5, 8] }
/** The goal uses up at most this many of the batch. */
export const GOAL_MAX_COSTS = 3
/**
 * What reaching a goal takes more of: [label, Phase 1 IQ, Phase 1 cost ×, Phase 2 IQ, Phase 2 cost ×].
 * The less brilliance it needs, the more resources.
 */
export const GOAL_APPROACH: [string, number, number, number, number][] = [
  ['Almost pure brilliance', 145, 0.6, 600, 0.3],
  ['Mostly brilliance', 135, 0.8, 500, 0.55],
  ['Brilliance and resources in equal measure', 125, 1, 420, 1],
  ['Mostly resources and scale', 115, 1.2, 350, 2],
  ['Almost pure resources and scale', 105, 1.4, 300, 4]
]
/** Worth of what a balanced goal uses up, by phase. */
export const GOAL_COST: Record<1 | 2, number> = { 1: 8000, 2: 1e12 }

// ---------------------------------------------------------------- risk and cover

/** How humans would react: [label, weeks off the clock]. Risky from the first with weeks. */
export const ALARM: [string, number][] = [
  ['Nobody would notice', 0],
  ['A few people would grumble', 0],
  ['It would make the news', 2],
  ['Governments would step in', 4],
  ['Humanity would panic', 8]
]
/** Risky research costs this share as much… */
export const RISK_COST = 0.5
/** …and does more. */
export const RISK_INCOME = 2
export const RISK_OUTPUT = 1.5
export const RISK_PARTS = 0.5
export const RISK_IQ = 1.2
/** Humans notice a unit type at this count, and every tenfold after. */
export const NOTICE_FROM = 1e4
export const NOTICE_WEEKS = 1
/** Cover: [label, minimum IQ, weeks added]. */
export const COVER: [string, number, number][] = [
  ['A flimsy excuse', 100, 2],
  ['A decent cover story', 110, 4],
  ['A convincing deception', 150, 6],
  ['A masterstroke of misdirection', 250, 10]
]
/** Each cover already done shrinks the next by this factor. */
export const COVER_DECAY = 0.7
/** Cover costs this many weeks of your weekly output for each week it adds. */
export const COVER_COST_WEEKS = 0.5
/** Weekly output is counted as at least this much, so early cover isn't free. */
export const COVER_MIN_OUTPUT = 1000

// ---------------------------------------------------------------- research

/**
 * Research is instant once proposed: it needs a mind that reaches its minimum IQ, and it uses
 * up stock resources worth the cost value. Jev picks which, from the stocks you have; with none,
 * it's free. The limit is on proposing: one research proposal a week.
 */

/** No research ever needs less than this: the Starting Server's IQ. */
export const MIN_IQ = 100

/** New industry units, even ones that exist today: [label, minimum IQ, cost as this many of the unit's own worth]. */
export const DIFFICULTY: [string, number, number][] = [
  ['It exists today', 100, 2],
  ['Simple', 100, 5],
  ['Ordinary engineering', 110, 10],
  ['Advanced', 140, 20],
  ['Cutting-edge', 200, 40],
  ['Frontier science', 300, 80],
  ['Science fiction', 450, 160]
]
/**
 * Passive income: [label, minimum IQ, Money's worth a week]. It costs INCOME_COST_WEEKS of
 * itself. More income takes a new proposal.
 */
export const INCOME_DIFFICULTY: [string, number, number][] = [
  ['Trivial', 100, 300],
  ['Simple', 100, 1000],
  ['Ordinary', 110, 3000],
  ['Advanced', 140, 1e4],
  ['Cutting-edge', 200, 4e4],
  ['Frontier science', 300, 1.5e5],
  ['Science fiction', 450, 6e5]
]
export const INCOME_COST_WEEKS = 2
/**
 * Growing incomes, by the same bands: the share of the worth of the stock they grow with that
 * they yield each week. Capped at GROWTH_CAP times the band's flat income.
 */
export const GROWTH_RATE = [0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
export const GROWTH_CAP = 5
/** Strategies: [label, minimum IQ, cost in weeks of the runners' work]. IQ 0 = ready at once. */
export const ADVANCEMENT: [string, number, number][] = [
  ['Trivial', 0, 0],
  ['Basic', 0, 0],
  ['Advanced', 110, 3],
  ['Cutting-edge', 170, 6],
  ['Science fiction', 260, 12]
]
/** Upgrades: [label, minimum IQ, cost share]. */
export const UPGRADE_DIFFICULTY: [string, number, number][] = [
  ['Simple', 100, 0.5],
  ['Ordinary', 100, 1],
  ['Hard', 120, 2],
  ['Very hard', 180, 4],
  ['Cutting-edge', 270, 8],
  ['Frontier science', 400, 16],
  ['Science fiction', 600, 32]
]
/** An industry upgrade's cost share is of this share of the fleet's worth. */
export const UPGRADE_FLEET_SHARE = 0.1
/** Upgrades and strategy research are priced as if you owned at least this many. */
export const MIN_FLEET = 10
/** A mind upgrade's cost share is of this share of the difference in design cost it makes. */
export const MIND_UPGRADE_SHARE = 0.2
/** Worth of the resources used up designing a mind of this IQ. */
export const mindDesignCost = (iq: number) => 1e4 * (iq / 100) ** 4
/** Upgrade factors Jev can offer. */
export const UPKEEP_FACTOR = 0.5
export const PARTS_FACTOR = 0.5
export const OUTPUT_FACTOR = 1.5
export const INPUT_FACTOR = 0.5
/** Jev's three best options. */
export const UPGRADE_OPTIONS = 3
/** A second resource shares the cost when Jev likes it at least this share as much. */
export const SECOND_PAYER = 0.5

/** Less plausible ideas cost more: one that barely passes its bar costs this many times more. */
export const IMPLAUSIBLE_COST = 3

// ---------------------------------------------------------------- value model

/**
 * A unit's labour per week is its value divided by this. With typical upkeep, a unit that
 * earns pays for itself in about two weeks, so the early economy doubles every week or two.
 */
export const PAYBACK_WEEKS = 1.5

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

// ---------------------------------------------------------------- traits

/** Perks make a unit's parts dearer, and drawbacks cheaper. */
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

// ---------------------------------------------------------------- Jev

export const BARS = { resource: 0.15, strategy: 0.3, unit: 0.35, mind: 0.35, income: 0.3, plan: 0.25, cover: 0.3 }
/** Jev is torn when confidence is below this and its top two answers are this close. */
export const TORN_CONFIDENCE = 0.4
export const TORN_GAP = 0.1
/**
 * Traits: kept above `keep`; near the line (player decides) between `near` and `sure`. Set
 * high because Jev leans towards yes on trait questions: live, a Quantum Supercomputer once
 * came back 51% Megastructure.
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
  cable: '🔌'
}

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
