# Economy

Status: **built** (2026-10-24, save version 14; the Create action was named Convert until save
version 15). It replaces the unbounded economy of version 13,
where the best strategy was to design two units, loop resources through both, and create as many
as you could afford every week for 20 to 30 weeks. Where this file and the code disagree, the code
wins. All numbers live in [src/engine/balance.ts](src/engine/balance.ts). Phase 1 has been tuned
with the scripted bots. **Phase 2 is winnable but not tuned:** a steady scripted player wins the
balanced plan about 28 weeks into the phase. But Creating straight into the goal's resource
beats industry (a player who never reinvests can still win), and brilliant and scale-heavy plans
lose on the clock, so the Phase 2 targets are skipped until a retune.

## Pillars

1. **One action a week.** Either propose a research (a unit, strategy, platform, upgrade,
   sourcing contract, storage expansion or cover) or Create. Proposing a resource, doing
   research already on the list, creating units and assigning them are all free.
2. **Everything is bounded.** Each unit type can only be owned up to the size of its sourcing
   contracts, and a new design has room for none. Each resource can only be held up to its
   storage cap, and anything made past the cap is lost.
3. **Expanding is risky.** In Phase 2, the main thing humans notice is caps growing: every
   sourcing contract and storage expansion costs clock weeks by how much it adds.
4. **IQ makes new actions better, never old ones.** A smarter mind gets better contracts and
   expansions, and bigger Creates. What you already own doesn't change.

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
- **Storage research:** the player writes how they'd hold more. Jev rates the idea's efficiency,
  and can reject it. The game then offers three expansions:

  | Option | Size | Catch |
  | --- | --- | --- |
  | Modest and clean | ×1 | none |
  | Large, with a catch | ×3 | upkeep, decay or slow fill (Jev picks) |
  | Huge and risky | ×10 | twice the clock weeks |

  The room an expansion adds is `STORAGE_WORTH[tier]` × size × Industry × (IQ/100)² × Efficiency.
  It costs 20% of the base worth (`STORAGE_WORTH[tier]` × size, before the scalars), so the scalars
  make it bigger, not dearer. Each option is paid in a different resource.
- **Catches:**
  - **Upkeep:** a resource is needed every week; if it isn't paid, the extra room is lost that
    week.
  - **Decay:** a share of what's stored spoils every week.
  - **Slow fill:** only a share of the extra room can fill each week.
- **Ownership ladder:** Jev is asked who could plausibly hold each new total, and an option
  needing a bigger holder than your IQ allows is blocked.

  | Best IQ | Largest holder |
  | --- | --- |
  | 100 | an individual |
  | 200 | a small corporation |
  | 300 | a large corporation |
  | 400 | a nation |
  | 500 | the whole Earth |
  | 600+ | no limit |

## Sourcing contracts

- **Proposing:** from a unit card. The player says how they'd get the units, and Jev says how
  many could realistically be had that way (`SOURCING_LIMITS`, from a handful up to hundreds of
  thousands) and what each would take to make.
- **Three contracts:**
  - **Quiet:** one limit band smaller, with no alarm.
  - **Jev's take.**
  - **Cut corners:** risky, with ten times the units and half the parts, but twice the clock
    weeks.
- **Parts:** each contract uses a different mix of parts where there's a choice, with more kinds
  of part at higher tiers (`PARTS_BY_TIER`).
- **No research:** a contract takes effect as soon as you pick it, with no IQ gate or fee. It
  still uses the week's action, and its risk weeks come off the clock at once. Its only cost is
  the parts, paid per unit created.
- **Creating units:** this takes no action. You pay the contract's parts, up to its open slots.
  Several contracts can be open for one unit type, and lost units give their slots back.
- **The plan's first unit:** is designed free, but with room for none, like any new design.
- **Removed:** build strategies, and the Builder and Self-replicating traits. There are 14 unit
  traits now.

## Create

The mind makes something directly: a resource, or units of a designed type.

- **Proposing:** the player names the target and says how. Jev rates the idea's efficiency and
  ranks the resources it would naturally use up and how it would pay out. The game offers three
  options, each using a different resource (or nothing) and paying out differently.

  | Payout | Total |
  | --- | --- |
  | Once, now | ×1 |
  | Spread over 4 weeks | ×1.5 |
  | Once, in 4 weeks | ×2 |
  | Every week, for good | ×⅛ a week |

- **Inputs are paid in full when you accept, whatever the timing.** Timing only changes when and
  how the payout arrives. An option's input is worth what the mind makes before timing,
  `CREATE_VALUE[tier] × Industry × IQ × Efficiency × Reach`, but never more than you hold. So
  every timing takes the same input as "now", and a weak or over-reaching offer asks for less.
- **Output:** `(inputs × 1.2 + CREATE_VALUE[tier] × Industry × IQ) × Efficiency × payout ×
  Reach`. Over its lifetime, an input therefore comes back as at least 1.2 × its worth × payout,
  so a Create paid now never returns less than it uses up.
  - **Industry:** 1 to 10, one step per decade of the worth of the units you own.
  - **IQ:** (IQ counted for Creates / 100)².
  - **Reach:** no IQ gate, but a target above your IQ's tier is penalised smoothly. Your IQ is
    read as a fractional tier between the tiers' IQs, and the penalty is log-interpolated, so 25
    IQ short is always gentler than 125 IQ short.
- **Guarantee:** when the target is easy for your IQ, one option is free and immediate.
- **Units:** cost twice what sourcing would, and arrive with cap to match.
- **Passive incomes are gone:** the every-week payout replaces them.

## Repeat ideas

The game remembers every Create, strategy, sourcing contract and storage expansion the player
accepts. When a new one of the same kind is proposed, Jev is shown up to the last 40 and asked
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
- **Goals:** a goal costs `GOAL_CAPS[phase]` times its resource's starting cap, times the
  approach. A Phase 1 goal fits in its starting storage; the Phase 2 goal needs about 8 caps, so
  its resource's storage has to grow.
- **Research costs** that are more than a resource can hold say so ("store more first").
- **Create offers** warn when part of a payout won't fit in storage.
- **Platforms:** cost `1000 × (IQ/100)³`, so a platform is within a few expansions of the
  resource it's paid in. Software upgrades cost 15% of the difference in `softwareCost`.
