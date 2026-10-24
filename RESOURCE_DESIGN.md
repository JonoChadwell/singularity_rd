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
  research or contract is **priced**, so the number shown is the number paid. Create inputs and a
  phase goal's cost are never changed by these traits **(Claude's default)**: the goal stays the
  size the phase was tuned for, and a Create always gives back more than it uses.
- **Phase 1 goal cost follows income.** Creates are Phase 1's only income, so the goal's cost in
  its resource is scaled by what Creates make of it (Untraceable halves the goal, Staple and
  Prestigious cut it 25%, Exotic's +50% scales it up) and by half the weekly loss (a 50% loss
  makes the goal 25% smaller). Phase 2 goals are not scaled by traits. No goal depends on the
  resource's storage cap.
- **"Needs a tier less / more"** moves the tier read for one purpose only. The resource keeps its
  real tier everywhere else. The purposes are:
  - **units making it:** a unit making something above its own tier is penalised, and below its
    tier gets a bonus.
  - **Create reach:** a target above your IQ's tier is penalised.
  - **platform payment:** the smartest platforms must be paid in a resource of a high enough tier.
- **Weekly effects** happen at the end of the week, in this order: losses, then overflow past the
  cap, then growth into the room that's left. Each has its own row in the resource's breakdown
  ("Lost to its nature", "Grew on its own").

## The traits

| Trait | Upside | Downside | Family |
| --- | --- | --- | --- |
| ⚡ Energetic | Costs in it are 50% less | Loses 50% of what's left each week | spend |
| 🧪 Catalytic | Strategies and upkeep use 50% less of it | Costs in it are doubled | spend |
| 🧱 Staple | Research costs in it are 25% less | Creates make 25% less of it | spend |
| 🔁 Recyclable | 50% of what's spent on costs comes back next week | Costs in it are 25% more | spend |
| 🎰 Speculative | Some weeks, new costs in it are as little as ×0.25 | Other weeks, up to ×2 | spend |
| ⛏️ Crude | Units making it need a tier less | Research costs in it are 25% more | making |
| 🌾 Seasonal | Units make 2× of it in odd weeks | 0.5× in even weeks | making |
| ❄️ Cryogenic | Storage expansions for it hold twice as much | Units making it need a tier more | making |
| 📈 Compounding | Stock grows 3% a week, up to its cap | Research costs in it are 50% more | growth |
| 🐇 Self-replicating | Stock grows 10% a week, up to its cap | Every use needs 25% more: costs, parts, strategies, upkeep | growth |
| 🌱 Renewable | 2% of its cap refills free each week | Cap halved | growth |
| 🍋 Perishable | Units make 50% more of it | 10% of what's left spoils each week | loss |
| 🌋 Volatile | Units make twice as much of it | 25% of what's left is lost each week | loss |
| 💧 Liquid | Cap ×1.5 | 5% of what's left leaks each week | loss |
| 🔬 Exotic | Creates make 50% more of it | Units make 50% less of it | create |
| 📦 Mundane | Creates of it need a tier less | Creates of it pay 25% less | create |
| 👑 Prestigious | Pays for platforms as if a tier higher | Creates make 25% less of it | create |
| 🚨 Hazardous | Counts 1.5× its worth as a Create input | Storage expansions for it cost double the clock weeks | clock |
| 🕶️ Untraceable | Storage expansions for it cost no clock weeks | Creates make half as much of it | clock |
| 🔒 Contraband | Storage expansions for it hold twice as much | They cost triple the clock weeks | clock |

A resource's two traits never share a family, so one lever is never doubled up or cancelled out.
Several weekly losses compound (Perishable and Liquid together lose 14.5%, not 15%).

### Details (Claude's default)

- **Speculative.** The week's factor is drawn from a hash of the run, the week and the resource
  (log-evenly from 0.25 to 2), so the preview and every reload agree. A cost is multiplied by the
  factor of the week it was priced in and keeps it. The resource's hover card says the current
  factor. Create inputs are left alone, as for every cost trait.
- **Recyclable.** The refund is a one-week delivery, listed under "Still to come" on the resource.
  It covers research, unit parts and cover. It is half of what was actually paid.
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
