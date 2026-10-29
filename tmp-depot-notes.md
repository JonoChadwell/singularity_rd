# Depots, contracts and playtest 2: notes

Written 2026-10-29. These notes cover the changes made after playtest 1 (run `mvsq03lu`, won in
Phase 2 week 84). They also cover the harness playtest (`pt2`) that checked them. Save version 19.

## What changed

### Quick fixes (1df8399)
- **Exact repeats are caught in code.** A Procurement or strategy with the same name (ignoring
  case and punctuation) for the same target is a repeat, whatever Jev says. In playtest 1, Jev
  called "Hide it in plain sight" new on about 25 uses. The penalty is still one efficiency step.
- **Discreet pays out once a run.** After that it's never offered or asked about. Its weeks are
  recorded in `state.claimed`.
- **No cost asks for more than can exist.** A research cost takes at most `COST_CEILING_SHARE`
  (half) of a payer's ceiling, and the rest moves to another payer. This fixed the week-66
  software upgrade, which asked for 160M Unsupervised Minutes when only 90M could exist.

### Contracts (4b98a79, then f74bf00)
- **Final rule:** the biggest contract on offer is Jev's realism limit or `CONTRACT_SCALE` (10) ×
  what you own (stock you can hold plus units, at value), whichever is smaller. It's never less
  than `CONTRACT_FLOOR` ($100k). You pick that size or a 1-2-5 step below it (at most 6 sizes).
- **No penalty for repeats:** reloading a unit gets the same size each time.
- **Quiet contracts** are a tenth of the size and raise no alarm.
- **Tried first and dropped:** making signing build the first quarter of a contract from its parts.
  At the start of Phase 2 you rarely hold the parts Jev picks, and you only learn which from its
  answer, so the bots could only sign one-unit contracts.

### Storage: depots (fb34640, 0ecfe28, 88c8bd3, 6b8deeb, ac32da6)
- **Phase 1:** there is no "+ Store". The starting caps hold what the lab needs.
- **Phase 2 and later:** "+ Store" designs a depot for one resource. A depot is a unit with
  `holds: { resourceId, amount }`. Its rules:
  - Jev judges the fit (`plausible`), and the wrong kind of place fails, as a warehouse did for
    fusion reactors.
  - **How much a depot holds is a ratio.** Jev's `ratio` question asks whether the depot is dear or
    cheap next to its contents (`DEPOT_RATIO`, from 0.1 to 1e6). A depot holds its own worth times
    that.
    - Asking for a count failed: Jev put ten thousand Scrap Steel, worth $5k, in a $35k yard.
    - Asking for dollars gave $1M in an $8M yard, but that yard's parts (20M steel) could never fit
      in steel storage (400k).
  - **The takes are the same depot at the sizes Jev weighed,** each holding the same multiple of
    its worth. A small one can be built from stock that a big one's parts wouldn't fit in.
  - **The target is worked out, not typed:** the dearest waiting cost in that resource, else 4
    weeks of what you make, else 10× the room you have.
  - **The design is research** priced by tier, and a depot's tier is capped at its resource's tier
    (Jev rated a reactor hangar tier 4).
  - **A design is never paid in the resource it stores,** nor past what a payer can hold.
    - The magnet depot asked for 3,200 magnets when magnet storage held 2.7.
  - **A depot is never built from the resource it stores.** A reactor hangar's parts had included
    reactors.
  - **Building is free of actions:** a design comes with a "Build <depot>" contract and an
    "enough" button on its card.
  - **Depots only hold:** no strategies, upkeep or traits, never idle, can't be Procured, and
    don't count towards Industry.
- **Removed:**
  - `storageProposal.ts`;
  - the `STORAGE_*` reach, capture, size and tech tables, plus `HOLDERS`;
  - `Resource.expansions` and the `storage` research effect.

### Tooling
- **Balance bots** (4aa8e6c):
  - they design depots and build them up to need;
  - they sign the biggest contract on offer;
  - they record contracts, fill time, depot worth, the largest unit's share and cap-blocked weeks.
- **Charts:** `PLAYER_LOG=... npx vitest run playerecon` turns a run log into the bots' weekly
  series, and `PLAYER=logs/econ/player.json` adds it to the charts as "you".
- **The test Jev now refuses score questions with more than 10 criteria,** as the real Jev does.
  The first depot scale had 13 rungs.
- **The AI Plays harness** works with save version 19 again: depots, contract sizes (`size
  <dollars>`) and current upgrade options.

## Playtest 2 (Claude, harness, real Jev, slot `pt2`)

- **Phase 1:** "Smuggle Out on a USB Stick", won in week 4 (playtest 1: week 5).
- **Phase 2:** "Power Myself Forever", the Balanced approach (IQ 525, 3,900 Compact Fusion
  Reactors ≈ $39B). **Lost in game week 79 (Phase 2 week 76): "Humans found you out."** At the end
  I had IQ 425 and 1,415 of the 3,900 reactors.
- **The chain:**
  - Scrapyard Foundry (tier 0): makes steel and replicates itself.
  - Turbine Machine Shop (tier 1): makes magnets, with 50k steel of upkeep each.
  - Pellet Fab Line (tier 2): 89 magnets in plus 89 upkeep, 400 pellets out.
  - Reactor Assembly Hall (tier 3): 360 pellets plus 15k Generator Parts in, 6.4 reactors ($64M)
    a week out.
- **Income:** about $70M a week at Phase 2 week 37, about 10 weeks ahead of playtest 1. By the
  end, about 30,000 foundries and 6,000 shops, with 542M steel a week overflowing.
- **IQ:** 175 → 250 (platform, week 16) → 350 (software, week 63) → 425 (platform, week 76).

### What lost it
1. **Risk:** −40 weeks to risk, +36 from three covers. Under "Staying hidden", Jev rated every
   fusion step "much closer": −4 to −8 weeks each for the designs, both strategies, the reactor
   depot (doubled because reactors are Hazardous) and the IQ-425 platform.
2. **Chain depth:** about 35 magnet shops feed one pellet line, and every shop eats steel. Most
   turns went on rebalancing unit counts.
3. **Picky:** this catch, the price of a Clever rating, stalls a whole strategy at 0% on any
   shortfall. Unit counts had to be set by hand again and again.
4. **The IQ cost spike:** the platform past IQ 350 cost 1,500 reactors, even at the risky half
   price.

### How the changes felt
- **Depots are good:** one visit answers "what will it take", building is free, and the ratios
  were sensible (a yard ×10, shelving for magnets ×2,000, a reactor hangar ×100, so holding the
  goal costs about 1%).
- **Contracts follow scale early:** the first one was $140k, not $5B. For $8M units, Jev's limit
  can be one unit unless the route is worded for scale ("an industrial gas giant" got $1B).
- **Jev flags almost every reload for the same unit as a repeat.**
- **Units-now Procure dominates late:** one action gave +16,300 foundries or +3,500 shops "for
  nothing", which makes contracts nearly irrelevant. It needs a cap.

## Open questions and next steps
- Jev's alarm under "stay hidden" for fusion work: about 40 weeks in this game.
- Whether Picky should be offered as a catch at all.
- A cap on units-now Procurement of cheap units.
- Chain depth: shops per pellet line, and steel upkeep.
- The IQ cost spike (350 → 450).
- **Bots versus the real game:** the bots win only some approaches and over-build depots (to every
  waiting cost). The scale bot reloads $400M contracts almost every week, and the climber stalls
  at IQ 325. See "Balance bots" in ECONOMY_DESIGN.md.
- The Phase 1 lab ceiling question now does little and could be dropped.
- Playtest notes are in `logs/playtests/pt2.md`, and the harness save is in slot `pt2`.
