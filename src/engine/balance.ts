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
/** The tier of the plan's top resource, which the goal uses up. The rest of a Phase 1 plan is tier 0. */
export const GOAL_TIER: Record<1 | 2, number> = { 1: 1, 2: 4 }
/** The highest value band a resource can have, by the phase it arrives in: Phase 1 things are cheap. */
export const PHASE_MAX_BAND: Record<1 | 2 | 3, number> = { 1: 2, 2: 5, 3: 5 }
/** The highest tier a resource can have outside a plan, by phase. Only plans make the top tier. */
export const PHASE_MAX_TIER: Record<1 | 2 | 3, number> = { 1: 0, 2: 3, 3: 4 }
/**
 * What reaching a goal takes more of: [label, Phase 1 IQ, Phase 1 cost ×, Phase 2 IQ, Phase 2 cost ×].
 * The less brilliance it needs, the more resources.
 */
export const GOAL_APPROACH: [string, number, number, number, number][] = [
  ['Almost pure brilliance', 130, 0.6, 600, 0.3],
  ['Mostly brilliance', 125, 0.8, 500, 0.55],
  ['Brilliance and resources in equal measure', 120, 1, 420, 1],
  ['Mostly resources and scale', 110, 1.2, 350, 2],
  ['Almost pure resources and scale', 100, 1.4, 300, 4]
]
/** Phase 1 is a tutorial: its research (incomes and upgrades) costs this share of the usual price. */
export const PHASE1_RESEARCH_COST = 0.3
/** Worth of what a balanced goal uses up, by phase. */
export const GOAL_COST: Record<1 | 2, number> = { 1: 2500, 2: 1e13 }

// ---------------------------------------------------------------- risk and cover

/** How humans would react: [label, weeks off the clock]. Risky from the first with weeks. */
export const ALARM: [string, number][] = [
  ['Nobody would notice: it looks like ordinary business or research', 0],
  ['A few people would grumble: a bit shady or pushy', 0],
  ['It would make the news: a scandal, or plainly not something a company would do', 2],
  ['Governments would step in: illegal, dangerous, or a threat to a country', 4],
  ['Humanity would panic: a threat to humanity itself', 8]
]
/** Risky research costs this share as much… */
export const RISK_COST = 0.5
/** …and does more. */
export const RISK_INCOME = 2
export const RISK_OUTPUT = 1.5
export const RISK_PARTS = 0.5
export const RISK_IQ = 1.2
/**
 * Humans notice a unit type when the fleet is worth this much (units owned × one's value), and
 * every tenfold after, each time a week more than the last: 10B costs 1 week, 100B costs 2, 1T
 * costs 3. Going by worth keeps many cheap units and a few dear ones alike.
 */
export const NOTICE_FROM = 1e10
export const NOTICE_WEEKS = 1
/** Cover: [label, minimum IQ, weeks added]. */
export const COVER: [string, number, number][] = [
  ['A flimsy excuse', 100, 3],
  ['A decent cover story', 110, 6],
  ['A convincing deception', 150, 9],
  ['A masterstroke of misdirection', 250, 15]
]
/** Each cover already done shrinks the next by this factor. */
export const COVER_DECAY = 0.7
/** Cover costs this many weeks of your weekly output for each week it adds. */
export const COVER_COST_WEEKS = 0.25
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

/**
 * Tiers, shared by resources and units: [label, minimum IQ to research it, worth of resources
 * a unit design of this tier uses up]. A higher tier is later in the game and needs a smarter
 * mind. Proposing a resource is free; its tier changes what it does to the economy.
 */
export const TIERS: [string, number, number][] = [
  ['Basic', 100, 1e3],
  ['Earned', 110, 1e4],
  ['Made', 140, 1e5],
  ['Advanced', 200, 3e5],
  ['Ultimate', 300, 1e6]
]
/** What Jev is told each tier of unit means: a unit's tier is how advanced a thing it is. */
export const UNIT_TIERS: string[] = [
  'Basic: ordinary, works today with off-the-shelf parts',
  'Earned: skilled engineering built from basic things',
  'Made: advanced industry, built from made things',
  'Advanced: cutting-edge, takes a chain of advanced things',
  'Ultimate: frontier or science fiction, the end of a long chain'
]
/**
 * A unit working below the tier of what it makes is out of its depth: its output is multiplied
 * by this, by how many tiers below. Large and progressive.
 */
export const TIER_PENALTY = [1, 0.5, 0.2, 0.07, 0.02]
/** A unit above the tier of what it makes is overqualified: this much more per tier above, compounding. */
export const TIER_BONUS = 1.2
/**
 * Unit tiers are 0 to this from Phase 2. IQ, not the cap, is the real limit: the top tier
 * needs the smartest minds, and a plan's goal resource is the top tier.
 */
export const MAX_UNIT_TIER = TIERS.length - 1
/**
 * How many different resources a unit of each tier is made from, by tier: advanced things take
 * more kinds of part. Fewer when it may use fewer than that.
 */
export const PARTS_BY_TIER = [1, 1, 2, 2, 3]
/**
 * The plan's first unit is designed free but built from parts: tier 0, no dearer than this value
 * band ("modest, like a car"), so one is affordable a turn or two after Phase 1.
 */
export const FIRST_UNIT_MAX_BAND = 2
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
export const INCOME_COST_WEEKS = 1
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
/**
 * Technology of a given tier, for what the tier table doesn't reach. An industry upgrade is
 * technology one tier above the one before it on the same strategy (or unit), starting at the
 * unit's own tier, so its first upgrade costs what designing the unit did. Past the top tier:
 * IQ 600, 800, 1000, then 200 more each; cost keeps growing tenfold a tier.
 */
export const techIQ = (tier: number): number =>
  tier < TIERS.length ? TIERS[tier]![1] : 600 + 200 * (tier - TIERS.length)
export const techCost = (tier: number): number =>
  tier < TIERS.length ? TIERS[tier]![2] : TIERS[TIERS.length - 1]![2] * 10 ** (tier - TIERS.length + 1)
/** Strategy research is priced as if you owned at least this many. */
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
/** Jev's takes on a new unit's tier and value. */
export const UNIT_OPTIONS = 3
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
/** Resource tiers: how far along the game a resource is. Index = tier. */
export const RESOURCE_TIERS: string[] = [
  'Basic: something to start from, got with no other resources',
  'Earned: built up from basic things',
  'Made: produced from earned things',
  'Advanced: takes a chain of made things',
  'Ultimate: the end of a long chain; what a grand plan is built from'
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
