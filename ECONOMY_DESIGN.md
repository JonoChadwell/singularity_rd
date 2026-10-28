# Economy

Status: **built** (2026-10-24, save version 14; the Procure action was named Convert until save
version 15, then Create; sourcing became part of Procure, and upkeep moved a tier down, in save
version 17, 2026-10-27). It replaces the unbounded economy of version 13,
where the best strategy was to design two units, loop resources through both, and create as many
as you could afford every week for 20 to 30 weeks. Where this file and the code disagree, the code
wins. All numbers live in [src/engine/balance.ts](src/engine/balance.ts). Phase 1 has been tuned
with the scripted bots. **Phase 2 is not tuned:** since its clock went from 100 weeks to 80
(see [COVER_DESIGN.md](COVER_DESIGN.md)), a steady scripted player wins the brilliant and
scale-heavy plans but loses the balanced one in week 76. Creating straight into the goal's
resource also beats industry (a player who never reinvests can still win). The Phase 2 targets
are skipped until a retune.

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

- **Size:** Jev says how many could realistically be had the player's way, as a supply
  (`SOURCING_LIMITS`, from a handful up to hundreds of thousands), and what each would take to
  make.
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
    IQ short is always gentler than 125 IQ short.
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

## Costs and values

- **Values:** unit and resource values use irregular steps (units 10, 50, 200, 700, 1,500,
  4,000), so costs never land on exact 3× or 10× multiples.
- **Goals:** a goal costs `GOAL_WORTH_1` or `GOAL_WORTH_2` times the approach, divided by its
  resource's value, so it doesn't depend on storage. Procurement worth is the same for every target
  (`CREATE_WORTH`), so two resources of equal value are made in equal amounts; only reaching
  above your IQ's tier costs output. The Phase 2 goal is much bigger than one cap, so its
  resource's storage has to grow.
- **Research costs** that are more than a resource can hold say so ("store more first").
- **Procurement offers** warn when part of a payout won't fit in storage.
- **Platforms:** cost `1000 × (IQ/100)³`, so a platform is within a few expansions of the
  resource it's paid in. Software upgrades cost 15% of the difference in `softwareCost`.
