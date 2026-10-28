# Economy

Status: **built** (2026-10-24, save version 14; the Procure action was named Convert until save
version 15, then Create; sourcing became part of Procure, and upkeep moved a tier down, in save
version 17, 2026-10-27; values became dollars in version 18, 2026-10-28). It replaces the unbounded economy of version 13,
where the best strategy was to design two units, loop resources through both, and create as many
as you could afford every week for 20 to 30 weeks. Where this file and the code disagree, the code
wins. All numbers live in [src/engine/balance.ts](src/engine/balance.ts). Phase 1 has been tuned
with the scripted bots. **Phase 2 is not tuned yet** on the dollar scale: see "Balance bots"
below for the tuning loop and where it stands. The old Phase 2 targets in balance.spec.ts stay
skipped until it is.

## Pillars

1. **One action a week.** Either propose a research (a unit, strategy, platform, upgrade,
   storage expansion or cover) or Procure (for a unit, that includes sourcing contracts). Proposing a resource, doing
   research already on the list, creating units and assigning them are all free.
2. **Everything is bounded.** Each unit type can only be owned up to the size of its sourcing
   contracts, and a new design has room for none. Each resource can only be held up to its
   storage cap, and anything made past the cap is lost. Neither grows past how many Jev says can
   exist (see "Ceilings" in [RESOURCE_DESIGN.md](RESOURCE_DESIGN.md)), until Phase 3.
3. **Expanding is risky.** In Phase 2, the main thing humans notice is caps growing: every
   sourcing contract and storage expansion costs clock weeks by how much it adds.
4. **IQ makes new actions better, never old ones.** A smarter mind gets better contracts and
   expansions, and bigger Procurements. What you already own doesn't change.

## Resources and storage

There are no flows any more: every resource keeps from week to week. Users of a scarce resource
share what's on hand plus what's made that week. Each resource's traits can change its cap,
its costs, what's made and used of it, and what it loses or grows each week: see
[RESOURCE_DESIGN.md](RESOURCE_DESIGN.md).

- **Starting cap:** `STORAGE_WORTH[tier]` divided by the resource's value. That is 5,000 Money's
  worth at tier 0, rising to 250,000 at tier 4.
- **Overflow:** at the end of each week, anything past the cap is lost and shown as overflow.
- **Stores trait:** each unit with it adds `STORE_WEEKS` weeks of its labour's worth of storage
  for one resource.
- **Storage research:** the player writes how they'd hold more. Jev says how much the AI could
  build and how much of that the player's way captures, up to the resource's ceiling; the game
  offers three expansions with one-off costs only. See "Storage limits" in [RESOURCE_DESIGN.md](RESOURCE_DESIGN.md).

## Units

- **Upkeep:** a unit of tier X pays its upkeep in a resource of tier X−1, picked by Jev, so a
  tier 0 unit runs on nothing. A tier with no resource one below it can't be designed; tier 0
  still needs a tier 0 resource to be made from.
- **Ceiling:** how many of a unit can exist is asked when it's designed (`UNIT_CEILINGS`, from
  ten to ten billion), asked again when Phase 2 begins, and gone in Phase 3. A unit's contracts,
  units now included, never add up to more.
- **The plan's first unit:** is designed free (tier 0, so no upkeep), but with room for none,
  like any new design.
- **Removed:** build strategies, and the Builder and Self-replicating traits. There are 14 unit
  traits now. Sourcing used to be its own proposal; it's now part of Procure.

## Sourcing contracts

A contract is a lease on `total` of a unit, each created later from its parts. They come from
Procuring a unit (below).

- **Size:** Jev says how big a supply could realistically be had the player's way, in dollars
  (`SOURCING_LIMITS`, from tens of thousands up to billions), and what each would take to make.
  The contract holds that worth ÷ one unit's value, at least one, so ten cheap units and one dear
  one make the same contract.
- **Three takes:**
  - **Jev's take.**
  - **Quiet:** one limit band smaller, with no alarm.
  - **Cut corners:** risky, with ten times the units and half the parts, but twice the clock
    weeks.
- **Parts:** each contract uses a different mix of parts where there's a choice, with more kinds
  of part at higher tiers (`PARTS_BY_TIER`).
- **No research:** a contract takes effect as soon as you pick it, with no IQ gate or fee. It
  still uses the week's action, and its risk weeks come off the clock at once. Its only cost is
  the parts, paid per unit created.
- **Creating units:** this takes no action. You pay the contract's parts, up to its open slots.
  Several contracts can be open for one unit type, and lost units give their slots back.
- **Ceiling:** a contract is cut to the room left under the unit's ceiling, and flagged.

## Procure

The mind gets something directly: a resource, or units of a designed type.

- **Proposing:** the player names the target and says how. Jev rates the idea's efficiency and
  ranks the resources it would naturally use up and how it would pay out. The game offers three
  options, each using a different resource (or nothing) and paying out differently.

  | Payout | Total |
  | --- | --- |
  | Once, now | ×1 |
  | Spread over 4 weeks | ×1.5 |
  | Once, in 4 weeks | ×2 |
  | Every week for 20 weeks | ×4 (⅕ a week) |

- **Inputs are paid in full when you accept, whatever the timing.** Timing only changes when and
  how the payout arrives. An option's input is worth what the mind makes before timing,
  `CREATE_WORTH × Industry × IQ × Efficiency × Reach`, but never more than you hold. So
  every timing takes the same input as "now", and a weak or over-reaching offer asks for less.
- **Output:** `(inputs × 1.2 + CREATE_WORTH × Industry × IQ) × Efficiency × payout ×
  Reach`. Over its lifetime, an input therefore comes back as at least 1.2 × its worth × payout,
  so a Procurement paid now never returns less than it uses up.
  - **Industry:** 1 to 10, one step per decade of the worth of the units you own.
  - **IQ:** (IQ counted for Procurements / 100)².
  - **Reach:** no IQ gate, but a target above your IQ's tier is penalised smoothly. Your IQ is
    read as a fractional tier between the tiers' IQs, and the penalty is log-interpolated, so 25
    IQ short is always gentler than 125 IQ short. A target above your **industry's tier** (the
    highest tier of unit that makes anything, at least 1) is penalised the same way, and the
    stricter of the two applies: the Phase 2 goal resource takes tier 3 industry to Procure well.
  - **Conversion:** paid now, an option may use up to `CREATE_CONVERT_SHARE` (a quarter) of its
    input's stock, when that's more than the usual input, so a surplus turns into what you're
    short of at ×1.2.
- **Guarantee:** when the target is easy for your IQ, one option is free and immediate.
- **Units:** there are no spread-out, later or every-week payouts. Jev also judges whether the
  player's way is more like getting a batch now or setting up a supply (`mode`), and the three
  offers mix **units now** and **sourcing contracts** so they don't always look alike:
  - The first offer is the kind Jev leans to.
  - Each of the other two is units now with Jev's odds for that, kept between 20% and 80%
    (`PROCURE_NOW_ODDS`); otherwise it's a contract. The draw is seeded by the run, the week and
    the unit, so the preview and every reload agree.
  - Units now are priced as above, cost twice what a contract would (`CREATE_UNIT_PREMIUM`),
    arrive with cap to match, and are cut to the ceiling. Each uses a different input.
  - Contracts are Jev's take first, then Quiet and Cut corners in a seeded order.
  - A unit with nothing at its tier or below to be made from only gets units now.
  - With no room left under the ceiling, the Procurement is refused.
- **Passive incomes are gone:** the every-week payout replaces them.

## Repeat ideas

The game remembers every Procurement (sourcing contracts included), strategy and storage
expansion the player accepts. When a new one of the same kind is proposed, Jev is shown up to the last 40 and asked
whether it's the same idea, perhaps under another name. A repeat is one step lower on the
effectiveness scale (Brilliant becomes Clever, and so on), never below Wasteful. The verdict says
which earlier idea it repeats.

## Risk

- **Expansions:** a contract adds units × value, and storage adds room × value. Either costs a
  week from 100k of worth, and a week more for every tenfold after.
- **Alarm:** Jev's alarm question adds its weeks too, and a risky option is at least "it would
  make the news".
- **Removed:** fleet-worth notices are gone.

## Dollars

Worth is in dollars (status: **built**, save version 18, 2026-10-28). Resource values run from a
kilowatt-hour ($0.10) to a masterpiece ($10M) and unit values from a toolbox ($60) to a power
station ($1.5B). The rule the numbers follow:

- Phase 1 is unchanged in play: every Phase 1 amount is ten times what it was, the same as a
  meal-valued resource (15, was 1.5). Escaping the lab costs about $24k.
- **Phase 2 is won with about $50B spent in all**, whichever approach: `HARDWARE_COSTS` (IQ 300
  ≈ $20M, 425 ≈ $25B, 600 ≈ $40B) and `GOAL_WORTH_2` ($20B × 0.5 / 1 / 2) trade off so each
  route's hardware, software and goal come to about the same (`balance.spec.ts` checks ±5%).
- The curve it aims at, weekly income by Phase 2 week: about $500 at the start, $500k by week
  20, $100M by week 45, $2–5B by week 70.

## Tiers

A unit's **value is how big one is**, nothing more: ten mills and one workshop are the same
fleet. Everything per unit (parts, labour, upkeep, contracts, strategy research) scales with value,
so it cancels out. A unit's **tier** is how far technology has come, and it sets how well a
dollar of fleet works: weekly labour = value ÷ `PAYBACK_WEEKS` × `TIER_YIELD[tier]` (1, 1.3,
1.7, 2.2, 3). Climbing the ladder is how an economy compounds faster. A tier 0 economy can grow
large, but it earns less per dollar and can't make or Procure the tier 3 goal resource at a
useful rate (×0.07).

## Action values

`src/engine/actionValue.ts` works out what an action is worth from the game state, with no
simulation past the one-week preview: the change in net worth at once (stocks that fit in
storage, units at their value) and the change each week after (from the preview, plus
Procurement deliveries still to come), for 40 weeks. `actionValue.spec.ts` checks each
prediction against a played week. Contracts add the slots that fill from spare income; IQ adds
what it does for Procurements.

## Balance bots

`src/engine/__tests__/econBots.ts` plays Phase 2 through the real engine from a real Phase 1 win
(the bribe plan's three resources and the nanotech plan's five). Jev's answers are held at their
typical values (plausibility 0.7; an action is Reasonable its first three times and Wasteful
after; contracts a band bigger each time and at least four weeks' income; alarm "a little
closer"). Resource, unit and compute traits are out of scope. The roster:

| Bot | Plays |
| --- | --- |
| greedy | builds the ladder, IQ and supply as the climber does, and chooses how to grow by action value |
| climber | the ladder: each tier at its IQ, each fleet upgraded once, IQ as tiers and the goal need |
| brain | IQ first |
| scale | contracts and units first |
| tier0 | never designs above tier 0 |
| no-upgrades | climber without unit upgrades |
| procurer | Procure, IQ and storage only |
| idle | one weekly Procurement |

**The tuning loop:** change `balance.ts`; run `ECON_REPORT=1 npx vitest run econreport` (about 25
seconds); chart it with `node scripts/econCharts.mjs` (`logs/econ/charts.html`: income, worth,
fleet by tier, IQ, clock, goal progress, spend and action mix per bot, by approach).

**Status (2026-10-28): Phase 2 is not balanced yet.** On the dollar scale no bot wins. The tier 0
bot snowballs (a unit that makes its own parts replicates every 1.5 weeks) to tens of billions a
week by week 45–60 and loses only to the clock; the climbing bots grow 10–100× slower and stall
at IQ 300, where the next platform costs about $17B.

## Costs and values

- **Values:** unit and resource values use irregular steps, so costs never land on exact 3× or
  10× multiples.
- **Goals:** a goal costs `GOAL_WORTH_1` or `GOAL_WORTH_2` times the approach, divided by its
  resource's value, so it doesn't depend on storage. Procurement worth is the same for every target
  (`CREATE_WORTH`), so two resources of equal value are made in equal amounts; only reaching
  above your IQ's or your industry's tier costs output. The Phase 2 goal is much bigger than one
  cap, so its resource's storage has to grow.
- **Research costs** that are more than a resource can hold say so ("store more first").
- **Procurement offers** warn when part of a payout won't fit in storage.
- **Platforms:** cost the difference in `HARDWARE_COSTS` between the new hardware and the old.
  Storage reach grows with the fleet, so a platform is within a couple of expansions of the
  resource it's paid in for an economy of the size its IQ usually comes with. Software upgrades
  cost 20% of what the same IQ in hardware would.
- **Strategy research** costs weeks of the runners' labour, for a fleet worth at least
  `MIN_FLEET_WORTH` ($20k).
