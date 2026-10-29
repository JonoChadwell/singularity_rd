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
export const PHASE_WEEKS: Record<1 | 2, number> = { 1: 6, 2: 80 }
/** Resources in a plan, exactly. Phase 2's must all be new. */
export const PLAN_RESOURCES: Record<1 | 2, number> = { 1: 3, 2: 5 }
/** The tier of the plan's top resource, which the goal uses up. The rest of a Phase 1 plan is tier 0. */
export const GOAL_TIER: Record<1 | 2, number> = { 1: 1, 2: 3 }
/** The highest value band a resource can have, by the phase it arrives in: Phase 1 things stop at "like a phone". */
export const PHASE_MAX_BAND: Record<1 | 2 | 3, number> = { 1: 3, 2: 5, 3: 5 }
/** The highest tier a resource can have, by phase. Phase 2's plan and resources stop at Beyond today. */
export const PHASE_MAX_TIER: Record<1 | 2 | 3, number> = { 1: 0, 2: 3, 3: 4 }
/**
 * What reaching a goal takes more of: [label, Phase 1 IQ, Phase 1 cost ×, Phase 2 IQ, Phase 2 cost ×].
 * The less intelligence it needs, the more resources. Phase 1 IQs are ones a software step over
 * START_IQ can reach exactly: 125, 150 or 175.
 */
export const GOAL_APPROACH: [string, number, number, number, number][] = [
  ['Mostly intelligence', 175, 0.6, 600, 0.5],
  ['Intelligence and resources in equal measure', 150, 1, 525, 1],
  ['Mostly resources and scale', 125, 1.4, 450, 2]
]
/**
 * Jev answers the approach question with one number, 0 for all intelligence and 1 for all
 * resources and scale; each GOAL_APPROACH row takes the answers up to its bound here. Set per
 * phase so the ready-made plans reach every row (`npm run play -- calibrate plans`; see NOTES.md):
 * Phase 2's goals are all megaprojects, so Jev puts every one of them above 0.6.
 */
export const APPROACH_BOUNDS: Record<1 | 2, number[]> = { 1: [0.42, 0.58, 1], 2: [0.7, 0.81, 1] }
/** An answer in the middle of each GOAL_APPROACH row, by phase, for scripted players and tests. */
export const APPROACH_AT: Record<1 | 2, number[]> = {
  1: APPROACH_BOUNDS[1].map((upTo, i) => ((APPROACH_BOUNDS[1][i - 1] ?? 0) + upTo) / 2),
  2: APPROACH_BOUNDS[2].map((upTo, i) => ((APPROACH_BOUNDS[2][i - 1] ?? 0) + upTo) / 2)
}
/** Phase 1 is a tutorial: its research (storage and upgrades) costs this share of the usual price. */
export const PHASE1_RESEARCH_COST = 0.3
/**
 * Worth is in dollars: a resource or unit worth 15 is worth about $15. The story's scale follows:
 * escaping the lab costs tens of thousands, and Phase 2 is won with about $50B spent in all
 * (hardware, software and the goal), whichever approach. See "Dollars" in ECONOMY_DESIGN.md.
 *
 * Phase 1's goal cost, in worth, before the approach multiplier: divided by the goal resource's
 * value to give units, so it doesn't depend on storage: about six Procurements.
 */
export const GOAL_WORTH_1 = 24000
/**
 * Phase 2's goal cost in worth, before the approach multiplier. With HARDWARE_COSTS, each
 * approach costs about $50B in all: the goal makes up what the hardware saves.
 */
export const GOAL_WORTH_2 = 2e10

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
 * Expanding caps is what humans notice. A sourcing contract that adds this much worth (units ×
 * value) costs a week, and a week more for every tenfold after: $1B costs 1, $10B costs 2, $100B
 * costs 3. Risky ones cost twice that.
 */
export const EXPANSION_NOTICE_FROM = 1e9
/**
 * Cover sizes: [label, minimum IQ, weeks added, worth it costs]. The price is fixed, so banking
 * a cover early doesn't make it cheap; Phase 1 pays PHASE1_RESEARCH_COST of it, like all its
 * research. See COVER_DESIGN.md.
 */
export const COVER: [string, number, number, number][] = [
  ['Small', 125, 6, 20000],
  ['Medium', 250, 12, 5e6],
  ['Large', 400, 18, 5e8]
]
/** The most covers a phase allows. */
export const COVER_MAX: Record<1 | 2, number> = { 1: 1, 2: 3 }

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
  ['Basic', 100, 3000],
  ['Earned', 125, 50000],
  ['Made', 150, 2e6],
  ['Advanced', 200, 1e8],
  ['Ultimate', 300, 3e9]
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
 * How much a dollar of fleet earns, by the unit's tier: a unit's weekly labour is its value ÷
 * PAYBACK_WEEKS × this. Higher technology turns the same dollars into more, so a fleet that climbs
 * the ladder compounds faster than one that stays put. A unit's value is only how big one is.
 */
export const TIER_YIELD = [1, 1.6, 2.5, 4, 6]
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
 * Sourcing contract sizes, in dollars, [label, worth]. Jev judges how big a supply could be had one
 * way: that is the biggest size on offer, and the player picks the size. The units are that worth
 * ÷ one's value (at least one), so ten cheap units and one dear one make the same contract,
 * whatever their tier. A contract is a lease on that many: you create them from its parts, at no
 * action, the first CONTRACT_UPFRONT of them as you sign.
 */
export const SOURCING_LIMITS: [string, number][] = [
  ['A handful: what a small shop could supply, tens of thousands of dollars', 6e4],
  ["A small batch: a small business's worth, about half a million dollars", 5e5],
  ["A production run: a factory's output, a few million dollars", 4e6],
  ["Mass market: a large company's line, tens of millions of dollars", 3.5e7],
  ["Industrial scale: a whole industry's capacity, hundreds of millions of dollars", 4e8],
  ["Global supply: the world's supply, billions of dollars", 5e9]
]
/**
 * Signing a sourcing contract creates this share of its units at once, from their parts: the size
 * you can sign follows the stock you've built up. Cutting corners counts the share of the plain size.
 */
export const CONTRACT_UPFRONT = 0.25
/** A risky contract cuts corners for this many times the units. */
export const RISK_SOURCING = 10
/**
 * When a unit is Procured, slots after the first are units now with this chance (Jev's odds that
 * the way is a one-off, kept inside these bounds), otherwise a contract.
 */
export const PROCURE_NOW_ODDS: [number, number] = [0.2, 0.8]

/** Worth a resource of each tier can be stored to at the start, before depots. Tier 3 up starts with none. */
export const STARTING_STORAGE_WORTH = [2e5, 8e4, 2e4, 0]
/**
 * How many of a resource one depot holds, Jev's realistic judgement: [label, units]. One rung per
 * power of ten, so a drum of nanobots and a warehouse of engines can both be told.
 */
export const DEPOT_HOLDS: [string, number][] = [
  'one',
  'ten',
  'a hundred',
  'a thousand',
  'ten thousand',
  'a hundred thousand',
  'a million',
  'ten million',
  'a hundred million',
  'a billion',
  'ten billion',
  'a hundred billion',
  'a trillion'
].map((label, i) => [label, 10 ** i])
/** With no ceiling (Phase 3), a depot's build contract allows this many. */
export const DEPOT_OPEN = 1e9
/** With no waiting cost too big to hold, a depot is sized for this many weeks of what you make. */
export const DEPOT_TARGET_WEEKS = 4
/** How many of a resource the AI could have in Phase 2: [label, units]. One rung per two powers of ten. */
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
/** How many of a resource the AI could have while stuck in the lab (Phase 1): [label, units]. One rung per power of ten. */
export const LAB_CEILINGS: [string, number][] = [
  'ten',
  'a hundred',
  'a thousand',
  'ten thousand',
  'a hundred thousand',
  'a million',
  'ten million',
  'a hundred million'
].map((label, i) => [label, 10 ** (i + 1)])
/** In the lab, no resource's ceiling is worth more than this. */
export const LAB_CEILING_WORTH = 1e8
/** In the lab, a resource's ceiling is at least this many times its storage, so it can always grow. */
export const LAB_CEILING_ROOM = 2
/** How many of a unit the AI could have at most: [label, units]. One rung per power of ten. */
export const UNIT_CEILINGS: [string, number][] = [
  'ten',
  'a hundred',
  'a thousand',
  'ten thousand',
  'a hundred thousand',
  'a million',
  'ten million',
  'a hundred million',
  'a billion',
  'ten billion'
].map((label, i) => [label, 10 ** (i + 1)])
/** Stores trait: a unit holds this many weeks of its labour's worth. */
export const STORE_WEEKS = 4

// ---------------------------------------------------------------- create

/**
 * Procurement's base output worth, before the scalars. The same for every target, so two resources of
 * the same value are made in the same amount; a target above your IQ's tier pays through Reach.
 */
export const CREATE_WORTH = 4000
/** Inputs consumed come back as this many times their worth. */
export const CREATE_INPUT_RETURN = 1.2
/**
 * Procure as conversion: an option may use up to this share of its input's stock, when that's more
 * than the usual input, so a surplus can be turned into what you're short of.
 */
export const CREATE_CONVERT_SHARE = 0.25
/**
 * An option's inputs are worth this share of what the mind makes before timing (base ×
 * Efficiency × Reach). Paid in full now, whatever the timing.
 */
export const CREATE_INPUT_SHARE = 1
/** Units Procured now cost this many times what a sourcing contract would charge. */
export const CREATE_UNIT_PREMIUM = 2
/**
 * Industry scalar: (1 + worth of the units you own ÷ INDUSTRY_FROM) ^ INDUSTRY_POWER. It counts units
 * only, so it's 1 all through Phase 1 (balanced by its base values) and at the start of Phase 2.
 * It climbs fast with the first units, then ever more slowly: a Procurement is strong while the
 * fleet is small and falls behind the income of a big one.
 */
export const INDUSTRY_FROM = 5000
export const INDUSTRY_POWER = 0.7
/** A target this far below your IQ (tier min IQ ≤ best IQ × this) guarantees a free, immediate option. */
export const CREATE_EASY = 0.6
/** Payout timings: [id, label, multiplier on total output, weeks]. */
export const CREATE_TIMINGS = [
  ['now', 'Once, right away', 1, 0],
  ['spread', 'Spread over 4 weeks', 1.5, 4],
  ['later', 'Once, in 4 weeks', 2, 4],
  ['weekly', 'Every week for 20 weeks', 4, 20]
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
/** Strategy research is priced as if you owned at least this much worth of the unit, in dollars. */
export const MIN_FLEET_WORTH = 20000
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
  [125, 10000],
  [150, 28000],
  [175, 52000],
  [200, 80000],
  [250, 1e6],
  [300, 2e7],
  [350, 3e8],
  [425, 2.5e10],
  [450, 3.2e10],
  [600, 4e10],
  [700, 4.8e10],
  [800, 5.8e10]
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
/** A cost never asks for more than this share of what can exist of its payer; the rest moves to another. */
export const COST_CEILING_SHARE = 0.5

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
 * Worth of one industry unit, in dollars: [label, value]. Deliberately irregular steps, so costs
 * never land on exact 3× or 10× multiples.
 */
export const UNIT_VALUE: [string, number][] = [
  ['Trivial, like a toolbox', 60],
  ['Cheap, like a bicycle', 650],
  ['Modest, like a car', 35000],
  ['Costly, like a truck', 150000],
  ['Expensive, like a factory line', 8e6],
  ['Huge, like a power station or a city', 1.5e9]
]
/** Worth of one of a resource, in dollars: [label, value]. Irregular steps, as for units. */
export const RESOURCE_VALUE: [string, number][] = [
  ['Next to worthless, like a kilowatt-hour', 0.1],
  ['Cheap, like a lemon', 0.5],
  ['Modest, like a meal', 15],
  ['Valuable, like a phone', 700],
  ['Precious, like a car', 30000],
  ['Priceless, like a masterpiece', 1e7]
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
/** Strategy input size, as a multiple of the unit's base labour (before its tier's yield): [label, multiple]. */
export const INPUT_SIZE: [string, number][] = [
  ['A little', 0.5],
  ['A fair amount', 1],
  ['A lot', 2]
]
/** Upkeep per week, as a multiple of the unit's base labour (before its tier's yield): [label, multiple]. */
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
  rock: '⛰️',
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
