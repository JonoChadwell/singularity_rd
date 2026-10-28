# Resource traits

Status: **built** (2026-10-24, save version 16). Before this, resources were interchangeable: a
name, a value, a tier and a cap, and every one stored, spent and was made the same way. Now each
resource has a nature. Where this file and the code disagree, the code wins. All numbers live in
[src/engine/resourceTraits.ts](src/engine/resourceTraits.ts) and
[src/engine/balance.ts](src/engine/balance.ts). None has been playtested.

Items marked **(Claude's default)** were left to Claude and can be changed.

## Pillars

1. **Every trait mixes an upside with a downside.** Unit and compute traits are perks or
   drawbacks; resource traits are both at once, so no resource is simply better than another,
   only different.
2. **One or two traits each, never none.** Jev picks its best fit, and a second from another
   family when it liked that one at least `RESOURCE_SECOND_TRAIT` (60%) as much as the first.
3. **A plan picks for you; a resource added by hand lets you choose.** A phase plan's resources
   get Jev's pick automatically. The **+ Resource** dialog offers three choices: Jev's pick, then
   its next two best fits on their own.

## Terms

- **Costs** are research costs and unit parts. A trait that changes costs applies when the
  research or contract is **priced**, so the number shown is the number paid. Procurement inputs and a
  phase goal's cost are never changed by these traits **(Claude's default)**: the goal stays the
  size the phase was tuned for, and a Procurement always gives back more than it uses.
- **Phase 1 goal cost follows income.** Procurements are Phase 1's only income, so the goal's cost in
  its resource is scaled by what Procurements make of it (Untraceable halves the goal, Staple and
  Prestigious cut it 25%, Exotic's +50% scales it up) and by the weekly loss (a 50% loss
  makes the goal 50% smaller). Phase 2 goals are not scaled by traits. No goal depends on the
  resource's storage cap.
- **"Needs a tier less / more"** moves the tier read for one purpose only. The resource keeps its
  real tier everywhere else. The purposes are:
  - **units making it:** a unit making something above its own tier is penalised, and below its
    tier gets a bonus.
  - **Procurement reach:** a target above your IQ's tier is penalised.
  - **platform payment:** the smartest platforms must be paid in a resource of a high enough tier.
- **Weekly effects** happen at the end of the week, in this order: losses, then overflow past the
  cap, then growth into the room that's left. Each has its own row in the resource's breakdown
  ("Lost to its nature", "Grew on its own").

## The traits

| Trait | Upside | Downside | Family |
| --- | --- | --- | --- |
| ⚡ Energetic | Costs in it are 50% less | Loses 50% of what's left each week | spend |
| 🧪 Catalytic | Strategies and upkeep use 50% less of it | Costs in it are doubled | spend |
| 🧱 Staple | Research costs in it are 25% less | Procurements make 25% less of it | spend |
| 🔁 Recyclable | 50% of what's spent on costs comes back next week | Costs in it are 25% more | spend |
| 🎰 Speculative | Some weeks, new costs in it are as little as ×0.25 | Other weeks, up to ×2 | spend |
| ⛏️ Crude | Units making it need a tier less | Research costs in it are 25% more | making |
| 🌾 Seasonal | Units make 2× of it in odd weeks | 0.5× in even weeks | making |
| ❄️ Cryogenic | Storage expansions for it hold twice as much | Units making it need a tier more | making |
| 📈 Compounding | Stock grows 3% a week, up to its cap | Research costs in it are 50% more | growth |
| 🐇 Self-replicating | Stock grows 10% a week, up to its cap | Every use needs 25% more: costs, parts, strategies, upkeep | growth |
| 🌱 Renewable | Making it from nothing (a Procurement or a strategy with no resource inputs) gives 25% more | Cap 25% smaller | making |
| 🍋 Perishable | Units make 50% more of it | 10% of what's left spoils each week | loss |
| 🌋 Volatile | Units make twice as much of it | 25% of what's left is lost each week | loss |
| 💧 Liquid | Cap ×1.5 | 5% of what's left leaks each week | loss |
| 🔬 Exotic | Procurements make 50% more of it | Units make 50% less of it | create |
| 📦 Mundane | Procurements of it need a tier less | Procurements of it pay 25% less | create |
| 👑 Prestigious | Pays for platforms as if a tier higher | Procurements make 25% less of it | create |
| 🚨 Hazardous | Counts 1.5× its worth as a Procurement input | Storage expansions for it cost double the clock weeks | clock |
| 🕶️ Untraceable | Storage expansions for it cost no clock weeks | Procurements make half as much of it | clock |
| 🔒 Contraband | Storage expansions for it hold twice as much | They cost triple the clock weeks | clock |

A resource's two traits never share a family, so one lever is never doubled up or cancelled out.
Several weekly losses compound (Perishable and Liquid together lose 14.5%, not 15%).

### Details (Claude's default)

- **Speculative.** The week's factor is drawn from a hash of the run, the week and the resource
  (log-evenly from 0.25 to 2), so the preview and every reload agree. A cost is multiplied by the
  factor of the week it was priced in and keeps it. The resource's hover card says the current
  factor. Procurement inputs are left alone, as for every cost trait.
- **Recyclable.** The refund is a one-week delivery, listed under "Still to come" on the resource.
  It covers research, unit parts and cover. It is half of what was actually paid.
- **Renewable.** "From nothing" means a Procurement that ends up using no resource (none offered,
  or none held), or a strategy with no resource inputs (upkeep doesn't count). A by-product is not
  made from nothing.
- **Cap traits** (Renewable, Liquid) scale the starting cap and every storage expansion.
  Expansion traits (Cryogenic, Contraband) scale expansions only. Neither scales the Stores unit
  trait.
- **Clock traits** scale all of an expansion's clock weeks, alarm included, rounded. They only
  matter in Phase 2, where there is a clock.
- **Making traits** scale what strategies make of the resource each week, including a By-product.
  A strategy's listed rate is before them. The tier traits change the rate a strategy is priced
  at when it's accepted, and its fit tag.
- **Jev** is asked one choice question per resource ("which trait fits it most naturally?"), and
  the world text it reads lists each resource's traits.
- **Tests** answer that question with Cryogenic by default, the trait that touches the scripted
  bots least, so the balance specs measure the economy, not a random trait.

# Storage limits

Status: **built** (2026-10-24). Code: [src/engine/storageProposal.ts](src/engine/storageProposal.ts);
numbers: the `STORAGE_*` tables in [src/engine/balance.ts](src/engine/balance.ts). Not playtested.

Caps are there for realism and storytelling. They stop paths that pass realistic limits (100
billion hired humans in Phase 2), and they push the player toward a blend of resources instead of
one or two.

## Ceilings: how many can exist

Status: **built** (2026-10-27, save version 17). Code: [src/engine/ceilings.ts](src/engine/ceilings.ts).

Every resource and unit has a `ceiling`: how many could exist in the AI's world, made or owned
by anyone. It is not asked on every proposal. It is settled at three points:

- **When the thing is added.** A resource (from the + Resource dialog or a plan) and a unit (when
  it's designed) are asked in their own Jev call. Resources pick a rung on `STORAGE_CEILINGS`,
  one per two powers of ten from a thousand to ten quintillion (nine rungs; the Jev API allows at
  most 10 criteria). Units pick a rung on `UNIT_CEILINGS`, one per power of ten from ten to ten
  billion **(Claude's default)**. Phases 1 and 2 are bound to Earth unless the world text says
  otherwise.
- **When Phase 2 begins.** The Phase 2 plan's Jev call asks again for every resource and unit
  already in the game (`ceiling_r_<id>`, `ceiling_u_<id>`), and accepting the plan writes the
  answers **(Claude's default: folded into the plan call, so no extra call)**. A cap already past
  its new ceiling is kept; it just has no room left.
- **When Phase 2 is won.** Every ceiling is cleared, and nothing added in Phase 3 is asked:
  Phase 3 has no ceilings. Storage caps and contract slots still apply.

Storage room = ceiling − current cap, and a unit's room = ceiling − the sum of its contracts.
With no room left, a storage expansion or a Procurement of the unit is refused. The world text
Jev reads lists each ceiling, so later answers stay consistent with it. Resource and unit
datasheets show it as "Can exist".

## Two questions, one Jev call

**Expand Storage** asks Jev two questions in a single `storage` call. Neither depends on the
other's answer. How many can exist is the resource's stored ceiling, above.

1. **How much could the AI build now?** (`reach`) This is judged from its holdings, units,
   platforms and industry, not from the proposal. The baseline is the old formula:
   `STORAGE_WORTH[tier]` × `STORAGE_REACH_SIZE` (10) × Industry × (IQ/100)² ÷ value × the
   resource's cap and expansion traits. Jev's band on `STORAGE_REACH` scales it by ×0.25 to ×8.
   The old ownership ladder (`HOLDERS`: an individual at IQ 100 up to the whole Earth at 500) is
   now only a guide in this prompt. Nothing is gated on it.
2. **How good is the player's way?** Jev answers several questions about it:
   - `plausible`: a no rejects the proposal.
   - `efficiency`: Wasteful to Brilliant on `STORAGE_CAPTURE`, which gives 0.15 to 1. That is the
     share of the reach this way captures, so it never goes past the reach.
   - `techLevel`: the IQ the way needs, from 100 to 600 (`STORAGE_TECH_LEVELS`), judged against
     what the AI's IQ means.
   - `pay`, `alarm` (Phase 2) and `repeat`, as for other proposals.

**Yield** = reach × capture.

## Three options

The three options are the same way, pushed further each time. Every one takes the week's action
and costs only once. **There are no ongoing costs:** no upkeep, decay or slow fill.

| Option | Adds | Cost factor | Clock |
| --- | --- | --- | --- |
| Careful | 0.25 × yield | ×0.25 | none |
| Pushed | 0.6 × yield | ×1 | half of Jev's alarm, plus size weeks |
| All in | 1 × yield | ×1.25 | risky: Jev's alarm, at least "makes the news", doubled size weeks |

- **Cost** = `STORAGE_COST_SHARE` (0.2) × `STORAGE_WORTH[tier]` × 10 × share × cost factor × IQ
  efficiency × plausibility. Industry, IQ² and capture make an option bigger, not dearer.
- **Ceiling.** An option is cut to the room left and flagged. Cutting happens after pricing, so
  overreaching costs more for what it gives **(Claude's default)**. When a bigger option is cut to
  the size of the one below, it is labelled "at the ceiling" and costs what that one costs.
- **An advanced way.** When `techLevel` is above the AI's best IQ, Pushed or All in (drawn from a
  run, week and resource seed) is sized for that IQ: the baseline at the needed IQ, × 1.25
  (`STORAGE_ADVANCED_BONUS`). It needs that IQ to research, and its IQ efficiency is read at that
  IQ **(Claude's default)**. The other two options are unchanged.
- **Payers.** Payers are taken from Jev's ranking and shuffled across the options by seed. A clear
  favourite pays for two options and the second favourite for one. "Clear" means the second
  scores under `RESOURCE_SECOND_TRAIT` (60%) of the first **(Claude's default)**. Otherwise the
  top three pay for one option each. A resource with no storage is never asked about or charged.
  No cost is more than its payer's cap.

## What the player sees

- **Chips:**
  - **Can exist:** the resource's ceiling rung, or "No limit" in Phase 3.
  - **You could build:** the reach in units, with Jev's band and the IQ guide in the tooltip.
  - **This way:** the capture label.
- **Cards** show:
  - the room added and the new total;
  - the research cost and needed IQ, or for the advanced option, "Ahead of you: needs IQ N (…),
    +25% for thinking ahead";
  - the clock;
  - "Capped: no more than ~N can exist yet" when the option was cut.
- **Refusals** say why: Jev doesn't think the way could work, or only about N can exist and the
  player already has room for that.
