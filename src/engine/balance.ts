// Every tuning number in one place.

// ---------------------------------------------------------------- intelligence

export const START_IQ = 100
/**
 * IQ comes in flat steps over your best mind, not multipliers. A new platform (which replaces
 * the old one for good) adds one of these; so does a platform's one software upgrade. The
 * biggest step is the cap: two new platforms, each with its software upgrade at full size, take
 * 100 to 500.
 */
export const PLATFORM_STEPS = [25, 50, 75, 100]
export const SOFTWARE_STEPS = [25, 50, 75, 100]
export const MAX_IQ_STEP = 100
/** Software that also changes a trait costs this many times as much. */
export const TRAIT_SOFTWARE_COST = 1.5
/**
 * Platforms this smart (or more) have to be paid for with a resource that units make, of at
 * least the tier shown: [minimum IQ of the platform, minimum tier of the resource].
 */
export const PLATFORM_GATES: [number, number][] = [
  [300, 1],
  [450, 2]
]
/** The tier of unit-made resource a platform of this IQ must be paid in, or null for anything. */
export const platformGateTier = (iq: number): number | null => {
  let tier: number | null = null
  for (const [from, t] of PLATFORM_GATES) if (iq >= from) tier = t
  return tier
}

// Compute traits: perks and drawbacks of a hardware platform.
export const COMPUTE_COST_PERK = 0.8
export const COMPUTE_COST_DRAWBACK = 1.3
/** Weeks a clock trait moves the Phase 2 clock by, once, when it arrives. */
export const COMPUTE_CLOCK = 6
/** Share of the richest stock a draining trait burns each week. */
export const COMPUTE_DRAIN = 0.05
/** IQ a trait adds to (or takes from) one type of research. */
export const COMPUTE_IQ_SHIFT = 50
/** Jev offers this many perk-and-drawback pairs when a platform is proposed. */
export const TRAIT_OPTIONS = 3

// Resource traits: each mixes an upside with a downside. See RESOURCE_DESIGN.md.
/** A resource gets a second trait when Jev likes it at least this much of its first. */
export const RESOURCE_SECOND_TRAIT = 0.6
/** The added resource dialog offers this many trait choices. */
export const RESOURCE_TRAIT_OPTIONS = 3
/** Speculative: the week's factor on new costs is drawn (log-evenly) from this range. */
export const SPECULATIVE_RANGE: [number, number] = [0.25, 2]

// ---------------------------------------------------------------- phases

/** How long each phase's clock runs, by phase. Phase 3 has none. */
export const PHASE_WEEKS: Record<1 | 2, number> = { 1: 10, 2: 100 }
/** Resources in a plan: [fewest, most]. Phase 2 needs this many new ones. */
export const PLAN_RESOURCES: Record<1 | 2, [number, number]> = { 1: [3, 5], 2: [5, 8] }
/** The tier of the plan's top resource, which the goal uses up. The rest of a Phase 1 plan is tier 0. */
export const GOAL_TIER: Record<1 | 2, number> = { 1: 1, 2: 3 }
/** The highest value band a resource can have, by the phase it arrives in: Phase 1 things are cheap. */
export const PHASE_MAX_BAND: Record<1 | 2 | 3, number> = { 1: 2, 2: 5, 3: 5 }
/** The highest tier a resource can have, by phase. Phase 2's plan and resources stop at Beyond today. */
export const PHASE_MAX_TIER: Record<1 | 2 | 3, number> = { 1: 0, 2: 3, 3: 4 }
/**
 * What reaching a goal takes more of: [label, Phase 1 IQ, Phase 1 cost ×, Phase 2 IQ, Phase 2 cost ×].
 * The less brilliance it needs, the more resources. Phase 1 IQs are ones a software step over
 * START_IQ can reach exactly: 125, 150 or 175.
 */
export const GOAL_APPROACH: [string, number, number, number, number][] = [
  ['Mostly brilliance', 175, 0.6, 600, 0.3],
  ['Brilliance and resources in equal measure', 150, 1, 525, 1],
  ['Mostly resources and scale', 125, 1.4, 450, 4]
]
/** Phase 1 is a tutorial: its research (storage and upgrades) costs this share of the usual price. */
export const PHASE1_RESEARCH_COST = 0.3
/**
 * What a balanced goal uses up, as a multiple of its resource's starting storage cap, by phase.
 * Above 1, you have to expand storage to hold enough: the goal is a breadth requirement, not a sum.
 */
export const GOAL_CAPS: Record<1 | 2, number> = { 1: 0.35, 2: 8 }
/**
 * Phase 1's goal cost, in worth, before the approach multiplier: divided by the goal resource's
 * value to give units, so it doesn't depend on storage. It is 0.35 of a tier 1 resource's
 * STORAGE_WORTH, scaled to CREATE_WORTH, so the goal stays the same number of Procurements as before.
 */
export const GOAL_WORTH_1 = 2400
/**
 * Phase 2's goal cost in worth, before the approach multiplier: 8 of a tier 3 resource's
 * STORAGE_WORTH, scaled by CREATE_WORTH over the 6000 a tier 3 Procurement used to pay (400 / 6000).
 */
export const GOAL_WORTH_2 = 53000

// ---------------------------------------------------------------- risk and cover

/**
 * How far an action brings the plan's loss condition closer: [label, weeks off the clock].
 * Risky from the first with weeks.
 */
export const ALARM: [string, number][] = [
  ['No closer: it looks like ordinary business or research', 0],
  ['A little closer: a bit shady or pushy, soon forgotten', 0],
  ['Noticeably closer: a scandal, or plainly out of the ordinary', 2],
  ['Much closer: illegal, dangerous, or bound to draw a strong response', 4],
  ['Right to the edge: on its own, nearly enough to end the plan', 8]
]
/** Risky research costs this share as much… */
export const RISK_COST = 0.5
/** …and does more. */
export const RISK_OUTPUT = 1.5
export const RISK_PARTS = 0.5
/**
 * Expanding caps is what humans notice. A sourcing contract or storage expansion that adds this
 * much worth (units × value, or extra storage × value) costs a week, and a week more for every
 * tenfold after: 100k costs 1, 1M costs 2, 10M costs 3. Risky expansions cost twice that.
 */
export const EXPANSION_NOTICE_FROM = 1e5
/** Cover: [label, minimum IQ, weeks added]. */
export const COVER: [string, number, number][] = [
  ['A flimsy excuse', 100, 3],
  ['A decent cover story', 125, 6],
  ['A convincing deception', 150, 9],
  ['A masterstroke of misdirection', 250, 15]
]
/** Each cover already done shrinks the next by this factor. */
export const COVER_DECAY = 0.7
/** Cover costs this many weeks of your weekly output for each week it adds. */
export const COVER_COST_WEEKS = 0.25
/** Weekly output is counted as at least this much, so early cover isn't free. */
export const COVER_MIN_OUTPUT = 300

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
  ['Basic', 100, 300],
  ['Earned', 125, 1200],
  ['Made', 150, 5000],
  ['Advanced', 200, 18000],
  ['Ultimate', 300, 60000]
]
/**
 * Best IQ as a fractional tier: interpolated between the tiers' minimum IQs (IQ 170 is tier 2.5,
 * between 140 and 200). Past the top tier, one more tier for every 200 IQ.
 */
export function iqTier(iq: number): number {
  if (iq <= TIERS[0]![1]) return 0
  for (let t = 1; t < TIERS.length; t++) {
    const lo = TIERS[t - 1]![1]
    const hi = TIERS[t]![1]
    if (iq < hi) return t - 1 + (iq - lo) / (hi - lo)
  }
  return TIERS.length - 1 + (iq - TIERS[TIERS.length - 1]![1]) / 200
}
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
 * A reach penalty for interpolating: the multiplier at each whole number of tiers short. Read
 * log-linearly between them, so 25 IQ short is always gentler than 125 IQ short.
 */
export function reachFactor(tiersShort: number): number {
  if (tiersShort <= 0) return 1
  const last = TIER_PENALTY.length - 1
  if (tiersShort >= last) return TIER_PENALTY[last]!
  const lo = Math.floor(tiersShort)
  const t = tiersShort - lo
  return Math.exp(Math.log(TIER_PENALTY[lo]!) * (1 - t) + Math.log(TIER_PENALTY[lo + 1]!) * t)
}
/**
 * How many different resources a unit of each tier is made from, by tier: advanced things take
 * more kinds of part. Fewer when it may use fewer than that.
 */
export const PARTS_BY_TIER = [1, 1, 2, 2, 3]
/**
 * The plan's first unit is designed free: tier 0, no dearer than this value band ("modest, like
 * a car").
 */
export const FIRST_UNIT_MAX_BAND = 2

// ---------------------------------------------------------------- caps

/**
 * Sourcing: how many of a unit Jev thinks could be had one way, [label, units]. A contract is a
 * lease on that many: you create them later, from its parts, at no action.
 */
export const SOURCING_LIMITS: [string, number][] = [
  ['A handful: a few dozen at most', 25],
  ['A small batch: around a hundred', 120],
  ['A production run: several hundred', 600],
  ['Mass market: thousands', 3500],
  ['Industrial scale: tens of thousands', 20000],
  ['Global supply: hundreds of thousands', 150000]
]
/** A risky contract cuts corners for this many times the units. */
export const RISK_SOURCING = 10
/** Sourcing takes Jev offers. */
export const SOURCING_OPTIONS = 3

/** Worth a resource of each tier can be stored to at the start, before expansions. Tier 3 up starts with none. */
export const STARTING_STORAGE_WORTH = [20000, 8000, 2000, 0]
/** The base worth of a storage expansion for each tier, and what it costs. */
export const STORAGE_WORTH = [5000, 12000, 40000, 100000, 250000]
/** Reach, before Jev's band: this many STORAGE_WORTHs, times Industry and IQ². */
export const STORAGE_REACH_SIZE = 10
/**
 * Storage options: [label, share of the yield (reach × capture), cost factor, clock]. The clock is
 * none, half of Jev's alarm, or Jev's full alarm as a risky expansion.
 */
export const STORAGE_SIZES: [string, number, number, 'none' | 'half' | 'full'][] = [
  ['Careful', 0.25, 0.25, 'none'],
  ['Pushed', 0.6, 1, 'half'],
  ['All in', 1, 1.25, 'full']
]
/** An expansion costs this share of its base worth (STORAGE_WORTH × reach size × share, before the scalars). */
export const STORAGE_COST_SHARE = 0.2
/** How many of a resource could exist at most: [label, units]. One rung per power of ten. */
export const STORAGE_CEILINGS: [string, number][] = [
  'a thousand',
  'a hundred thousand',
  'ten million',
  'a billion',
  'a hundred billion',
  'ten trillion',
  'a quadrillion',
  'a hundred quadrillion',
  'ten quintillion'
].map((label, i) => [label, 10 ** (2 * i + 3)])
/** What the AI's holdings, units and platforms let it build, as a multiple of the baseline: [label, factor]. */
export const STORAGE_REACH: [string, number][] = [
  ['Barely anything: it owns almost nothing to build with', 0.25],
  ['Little: a thin base for its size', 0.5],
  ['Ordinary: about what you would expect for its size', 1],
  ['Well equipped: more than its size suggests', 2],
  ['Very well equipped: holdings well suited to storing this', 4],
  ['Exceptionally equipped: almost everything it owns helps', 8]
]
/** How much of the reach a way of storing captures, by Jev's efficiency: the B.EFFICIENCY labels, never past 1. */
export const STORAGE_CAPTURE: [string, number][] = [
  ['Wasteful', 0.15],
  ['Mediocre', 0.3],
  ['Reasonable', 0.5],
  ['Clever', 0.75],
  ['Brilliant', 1]
]
/** What IQ a way of storing needs: [label, IQ]. */
export const STORAGE_TECH_LEVELS: [string, number][] = [
  ['Everyday: what anyone could arrange, like rented space, shelves or tanks', 100],
  ['Professional: what a small firm of engineers could build', 200],
  ['Industrial: what a large corporation could build', 300],
  ['National: a project on the scale of a government programme', 400],
  ['Planetary: engineering that reshapes Earth', 500],
  ['Beyond today’s science', 600]
]
/** An option that needs more IQ than the AI has holds this much more, for thinking ahead. */
export const STORAGE_ADVANCED_BONUS = 1.25
/** Stores trait: a unit holds this many weeks of its labour's worth. */
export const STORE_WEEKS = 4
/**
 * Who could plausibly hold so much, [label, best IQ that reaches it]. A guide to scale for Jev's
 * reach question; nothing is gated on it.
 */
export const HOLDERS: [string, number][] = [
  ['An ordinary individual', 100],
  ['A small corporation', 200],
  ['A large corporation', 300],
  ['A nation', 400],
  ['The whole of planet Earth', 500],
  ['More than Earth could hold', 600]
]
/** The biggest holder a mind this smart may reach, as an index into HOLDERS. */
export const holderReach = (iq: number) => HOLDERS.filter(([, minIQ]) => minIQ <= iq).length - 1

// ---------------------------------------------------------------- create

/**
 * Procurement's base output worth, before the scalars. The same for every target, so two resources of
 * the same value are made in the same amount; a target above your IQ's tier pays through Reach.
 */
export const CREATE_WORTH = 400
/** Inputs consumed come back as this many times their worth. */
export const CREATE_INPUT_RETURN = 1.2
/**
 * An option's inputs are worth this share of what the mind makes before timing (base ×
 * Efficiency × Reach). Paid in full now, whatever the timing.
 */
export const CREATE_INPUT_SHARE = 1
/** Units made by Procurement cost this many times what a sourcing contract would charge. */
export const CREATE_UNIT_PREMIUM = 2
/** Industry scalar: 1 at no units, up to INDUSTRY_MAX, one step per decade of unit worth from INDUSTRY_FROM. */
export const INDUSTRY_FROM = 1e3
export const INDUSTRY_DECADES = 5
export const INDUSTRY_MAX = 10
/** A target this far below your IQ (tier min IQ ≤ best IQ × this) guarantees a free, immediate option. */
export const CREATE_EASY = 0.6
/** Payout timings: [id, label, multiplier on total output, weeks]. */
export const CREATE_TIMINGS = [
  ['now', 'Once, right away', 1, 0],
  ['spread', 'Spread over 4 weeks', 1.5, 4],
  ['later', 'Once, in 4 weeks', 2, 4],
  ['forever', 'Every week, for good', 0.125, 0]
] as const
export type CreateTiming = (typeof CREATE_TIMINGS)[number][0]
export const CREATE_OPTIONS = 3
/** Strategies: [label, minimum IQ, cost in weeks of the runners' work]. IQ 0 = ready at once. */
export const ADVANCEMENT: [string, number, number][] = [
  ['Trivial', 0, 0],
  ['Basic', 0, 0],
  ['Advanced', 125, 3],
  ['Cutting-edge', 175, 6],
  ['Science fiction', 275, 12]
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
/**
 * The worth of resources used up in total to build hardware of a given IQ, from the starting
 * server's: [hardware IQ, cumulative worth]. It grows gently to about IQ 300, climbs steeply to
 * about 450, then flattens: the slope falls but the total only rises.
 * A new platform costs the difference between its hardware and the old platform's; it doesn't
 * matter in how many steps you got there. The goal costs of the Phase 2 approaches (GOAL_APPROACH)
 * are set so that total spending to win is about the same whichever IQ you aim for.
 */
export const HARDWARE_COSTS: [number, number][] = [
  [100, 0],
  [125, 1000],
  [150, 2800],
  [175, 5200],
  [200, 8000],
  [250, 14000],
  [300, 21000],
  [350, 30000],
  [425, 226000],
  [450, 262000],
  [600, 284500],
  [700, 305000],
  [800, 330000]
]
/** Past the table, the cumulative cost keeps growing by this factor every 100 IQ. */
const HARDWARE_COST_GROWTH = 1.3
export function hardwareCost(iq: number): number {
  const t = HARDWARE_COSTS
  const last = t[t.length - 1]!
  if (iq >= last[0]) return last[1] * HARDWARE_COST_GROWTH ** ((iq - last[0]) / 100)
  const i = t.findIndex(([x]) => iq <= x)
  if (i <= 0) return 0
  const [x0, y0] = t[i - 1]!
  const [x1, y1] = t[i]!
  return y0 + ((y1 - y0) * (iq - x0)) / (x1 - x0)
}
/**
 * Worth of the resources used up building a new platform: the main gate on intelligence. Each
 * platform needs bigger storage than the last to pay for it.
 */
export const platformPrice = (oldHardwareIQ: number, newHardwareIQ: number) =>
  Math.max(0, hardwareCost(newHardwareIQ) - hardwareCost(oldHardwareIQ))
/** A software upgrade costs this share of what hardware at the same IQ would. */
export const SOFTWARE_SHARE = 0.2
export const softwarePrice = (hardwareIQ: number, step: number) =>
  SOFTWARE_SHARE * platformPrice(hardwareIQ, hardwareIQ + step)
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

/** A repeat of an idea already accepted is this many steps lower on the EFFICIENCY scale, never below Wasteful. */
export const REPEAT_PENALTY = 1
/** Jev is shown at most this many past ideas of a kind when asked whether a new one repeats them. */
export const REPEAT_LOOKBACK = 40

/** Less plausible ideas cost more: one that barely passes its bar costs this many times more. */
export const IMPLAUSIBLE_COST = 3

// ---------------------------------------------------------------- value model

/**
 * A unit's labour per week is its value divided by this. With typical upkeep, a unit that
 * earns pays for itself in about two weeks, so the early economy doubles every week or two.
 */
export const PAYBACK_WEEKS = 1.5

/**
 * Worth of one industry unit, in Money: [label, value]. Deliberately irregular steps, so costs
 * never land on exact 3× or 10× multiples.
 */
export const UNIT_VALUE: [string, number][] = [
  ['Trivial, like a toolbox', 10],
  ['Cheap, like a bicycle', 50],
  ['Modest, like a car', 200],
  ['Costly, like a truck', 700],
  ['Expensive, like a factory line', 1500],
  ['Huge, like a power station or a city', 4000]
]
/** Worth of one of a resource, in Money: [label, value]. Irregular steps, as for units. */
export const RESOURCE_VALUE: [string, number][] = [
  ['Next to worthless, like a kilowatt-hour', 0.1],
  ['Cheap, like a lemon', 0.4],
  ['Modest, like a meal', 1.5],
  ['Valuable, like a phone', 5],
  ['Precious, like a car', 18],
  ['Priceless, like a masterpiece', 60]
]
/** Resource tiers: how advanced its technology is, next to today's civilization. Index = tier. */
export const RESOURCE_TIERS: string[] = [
  'Everyday: anyone today can get or make it, like timber, steel or electricity',
  'Industrial: needs modern factories or expertise, like microchips, jet fuel or vaccines',
  'Cutting-edge: only the best labs today can make it, if at all, like room-temperature superconductors or fusion fuel pellets',
  'Beyond today: possible in principle but decades or centuries ahead, like general-purpose nanobots or antimatter in bulk',
  'Far future: the edge of what physics allows, like computronium or a Dyson swarm'
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

export const BARS = {
  resource: 0.15,
  strategy: 0.3,
  unit: 0.35,
  mind: 0.35,
  sourcing: 0.3,
  storage: 0.3,
  create: 0.3,
  plan: 0.25,
  cover: 0.3
}
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

/**
 * IQ efficiency of a new action: the share of the usual cost it takes a mind this smart, for
 * something whose tier needs `tierIQ`. Baked in when the action is accepted, never recomputed.
 */
export const iqEfficiency = (tierIQ: number, iq: number) => Math.min(1, Math.max(0.5, Math.sqrt(tierIQ / Math.max(1, iq))))
