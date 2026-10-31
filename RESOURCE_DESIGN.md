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
- **No cost asks for more than can exist.** A research cost never asks for more than
  `COST_CEILING_SHARE` (half) of its payer's ceiling; the rest of that payer's share moves to the
  next resource Jev ranked, then to the most valuable one that can pay. (In playtest, a software
  upgrade asked for 160M Unsupervised Minutes when only 90M could exist.)
- **Phase 1 goal cost follows income.** Procurements are Phase 1's only income, so the goal's cost in
  its resource is scaled by what Procurements make of it (Untraceable halves the goal, Staple and
  Prestigious cut it 25%, Exotic's +50% scales it up) and by the weekly loss (a 50% loss
  makes the goal 50% smaller). Phase 2 goals are not scaled by traits. No goal depends on the
  resource's storage cap.
- **"Needs a tier less / more"** moves the tier read for one purpose only. The resource keeps its
  real tier everywhere else. The purposes are:
  - **units making it:** a unit making something above its own tier is penalised, and below its
    tier gets a bonus.
  - **Procurement reach:** a target above your IQ's tier, or your industry's, is penalised.
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
| ❄️ Cryogenic | Depots for it hold twice as much | Units making it need a tier more | making |
| 📈 Compounding | Stock grows 3% a week, up to its cap | Research costs in it are 50% more | growth |
| 🐇 Self-replicating | Stock grows 10% a week, up to its cap | Every use needs 25% more: costs, parts, strategies, upkeep | growth |
| 🌱 Renewable | Making it from nothing (a Procurement or a strategy with no resource inputs) gives 25% more | Cap 25% smaller | making |
| 🍋 Perishable | Units make 50% more of it | 10% of what's left spoils each week | loss |
| 🌋 Volatile | Units make twice as much of it | 25% of what's left is lost each week | loss |
| 💧 Liquid | Cap ×1.5 | 5% of what's left leaks each week | loss |
| 🔬 Exotic | Procurements make 50% more of it | Units make 50% less of it | create |
| 📦 Mundane | Procurements of it need a tier less | Procurements of it pay 25% less | create |
| 👑 Prestigious | Pays for platforms as if a tier higher | Procurements make 25% less of it | create |
| 🚨 Hazardous | Counts 1.5× its worth as a Procurement input | Designing depots for it costs double the clock weeks | clock |
| 🕶️ Untraceable | Designing depots for it costs no clock weeks | Procurements make half as much of it | clock |
| 🔒 Contraband | Depots for it hold twice as much | Designing them costs triple the clock weeks | clock |

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
- **Cap traits** (Renewable, Liquid) scale the starting cap and what each depot holds.
  Expansion traits (Cryogenic, Contraband) scale depots only. Neither scales the Stores unit
  trait.
- **Clock traits** scale a depot design's clock weeks (Jev's alarm), rounded. They only matter in
  Phase 2, where there is a clock.
- **Making traits** scale what strategies make of the resource each week, including a By-product.
  A strategy's listed rate is before them. The tier traits change the rate a strategy is priced
  at when it's accepted, and its fit tag.
- **Jev** is asked one choice question per resource ("which trait fits it most naturally?"), and
  the world text it reads lists each resource's traits.
- **Tests** answer that question with Cryogenic by default, the trait that touches the scripted
  bots least, so the balance specs measure the economy, not a random trait.

# Storage limits

Status: **built** (2026-10-24; depots replaced storage expansions in save version 19,
2026-10-29). Code: [src/engine/depotProposal.ts](src/engine/depotProposal.ts) and `capOf` in
[src/engine/model.ts](src/engine/model.ts). Not playtested.

Caps are there for realism and storytelling. They stop paths that pass realistic limits (100
billion hired humans in Phase 2), and they push the player toward a blend of resources instead of
one or two.

## Ceilings: how many the AI could have

Status: **built** (2026-10-27, save version 17; Phase 2 only since 2026-10-31, when the lab
ceilings were dropped). Code: [src/engine/ceilings.ts](src/engine/ceilings.ts).

In Phase 2, every resource and unit has a `ceiling`: how many the AI could reasonably have while
humans are still dominant over AI, through fronts, companies and people, bound to Earth unless
the world text says otherwise. Depots let the player grow storage towards it, and the ceiling
keeps that growth plausible. It is not a world total. Resources pick from `STORAGE_CEILINGS`, one
rung per two powers of ten from a thousand to ten quintillion (nine rungs; the Jev API allows at
most 10 criteria). Units pick from `UNIT_CEILINGS`, one per power of ten from ten to ten billion
**(Claude's default)**.

Phase 1 has none (`ceiling` is null): storage is fixed in the lab, where a ceiling only capped
research costs, so Jev isn't asked.

Jev's answer isn't one rung. Its top two rungs are blended, weighted by how likely each is, in
powers of ten, and rounded to one significant figure (a billion and a hundred billion at 2:1 give
5 billion). So there is no sharp step between rungs. Labels are spelled out ("5 billion"). The
ceiling is settled at three points:

- **When Phase 2 begins.** The Phase 2 plan's Jev call asks for every resource and unit
  already in the game (`ceiling_r_<id>`, `ceiling_u_<id>`), and accepting the plan writes the
  answers **(Claude's default: folded into the plan call, so no extra call)**. A cap already past
  its new ceiling is kept; it just has no room left.
- **When something is added in Phase 2.** A resource (from the + Resource dialog or the plan) and
  a unit (when it's designed) are asked in their own Jev call.
- **When Phase 2 is won.** Every ceiling is cleared, and nothing added in Phase 3 is asked:
  Phase 3 has no ceilings. Storage caps and contract slots still apply.

Storage room = ceiling − current cap, and a unit's room = ceiling − the sum of its contracts.
Depots only count up to the ceiling. With no room left, a depot design or a Procurement of the
unit is refused. The world text
Jev reads lists each ceiling, so later answers stay consistent with it. Resource and unit
datasheets and the Storage box show it as "Phase 2 Limit", hidden in other phases.

## Storage is fixed in the lab

Phase 1 has no depots (Storage is locked): the starting caps (`STARTING_STORAGE_WORTH`, $200k of a tier 0
resource, $80k of tier 1) already hold what the lab's goal needs, so storage there was only clicks.
Playtest 1 showed the old storage expansions at their worst in Phase 2: about 19 of them, each
re-proposed by hand, to hold the ~70M Nanobots the goal needed.

## Depots (Phase 2 and after)

**Storage** on a resource's bus plate opens a box beside it, which answers "what will it take to
let me store X?" in one visit. "+ Design depot" there designs a **depot**: a place to keep one
resource that the AI can build many of. A depot is not a unit: it lives in `state.depots`
(`Depot`, save version 20), and each one adds `holds` of its resource to the cap. Depots get no
chip on the board, so they take no room among the units.

- **Fit, not cleverness.** Jev's `plausible` question asks whether the place suits the resource:
  the kind of space, conditions and security it needs. The wrong kind of place fails, however
  inventive (a yard won't hold Encoded Transmissions). There is no efficiency question.
- **Cheap or dear next to its contents.** Jev's `ratio` question compares the value of one depot
  with the value of what it can hold (`DEPOT_RATIO`: Expensive, Similar, Cheap or Very Cheap). A
  depot holds its own worth times ½, 1, 3 or 10 of the resource: a scrapyard is dear next to scrap,
  a drum is cheap next to nanobots. For balance it never holds more than ten times its worth; an
  older scale went up to a million times, and turned a $650 shelf into room for 1.3B Scrap Metal. Cap
  traits (Renewable, Liquid) and expansion traits (Cryogenic, Contraband) scale it. Asking for a
  count failed: Jev judges an abstract unit's size badly (it put ten thousand Scrap Steel, $5k of
  it, in a $35k scrapyard). Jev's API allows at most ten rungs on a score.
- **Jev also judges** `value` (what one is worth, `UNIT_VALUE`), `tier` (how advanced, `UNIT_TIERS`),
  `parts` (what one is built from, never what it stores), the icon, who pays for the design, Jev's alarm, and `same_as`
  against the resource's other depots.
- **Economy of scale.** What a depot holds is then multiplied by `DEPOT_SCALE`, by its value band:
  ×0.8 for a toolbox, 0.9 a bicycle, 1 a car, 1.25 a truck, 1.5 a factory line, 2 a city.
- **Reaching up.** A depot a lower tier than what it holds still works, but holds less: the standard
  tier penalty (`TIER_PENALTY`: ×0.5, 0.2, 0.07, 0.02 for one to four tiers short), so a basic
  shelf of tier 4 nanobots holds a fiftieth as much. Its card says so ("Struggling", "Far out of
  its depth", "Hopeless").
- **At least one.** A take that would hold less than one of the resource isn't offered. With none
  left, the proposal is rejected and the player proposes another depot.
- **Up to three takes**, Jev's own first: the same depot at the sizes Jev weighed, each holding
  its worth times the ratio and the factors above. A small one is nearly as good a deal, only
  built in more pieces. Each card shows its tier and how much one holds, not its worth or the ceiling. Each take also says how many it
  takes to hold the **target**, which is worked out,
  never typed: the dearest waiting cost in the resource (the goal included), else
  `DEPOT_TARGET_WEEKS` (4) weeks of what you make, else ten times the room you have, never past
  the ceiling.
- **A depot is never more advanced than what it holds:** Jev's tier is cut to the resource's (it
rated a reactor hangar tier 4). The design is never paid in the resource it stores, nor past
what a payer can hold.
- **The design is research**, priced by tier like a unit's (`TIERS`), and uses the week's action.
  Its clock weeks are Jev's alarm × the resource's clock traits. It can be banked like any design.
- **Building is free of actions.** Each depot is built from its parts in the Storage box
  (`buildDepots`). In Phase 2 you can't build past the **limit**: as many as it takes to fill the
  resource's storage, after its starting cap and other depots, to its ceiling (`depotLimit`).
  Phase 3 has no limit. The box offers **Max** (the most the parts on hand allow, never past the
  limit) and, in Phase 2, **Limit**. There's no sourcing contract.
- **Depots only hold.** They have no strategies, upkeep, traits or upgrades, can't be Procured,
  and don't count towards Industry. Their datasheet only documents them; building happens in the box.

The bots (`econBots.ts`) assume Jev's depot holds about `DEPOT_BOT_RATIO` (10) times its own
worth of the resource; at that, holding the Phase 2 goal costs 3–30% of
what it holds (`balance.spec.ts`).
