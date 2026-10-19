# Singularity R&D: project notes

State of the project as of 2026-10-18: setup, the designer's goals, what is built, and the
issues found in playtesting. These are observations only, not proposed solutions. Quoted
notes are the designer's own words.

---

## 1. Setup

**Machine:** Windows 10, Node 24.20.0 LTS (installed via winget during this session), npm 11.
Python is not installed (only the Microsoft Store stub).

**Stack:** Vue 3, Vite 7, Pinia 3, TypeScript 5.9, Vitest 4, ESLint 9 (flat config), Prettier.
There is no router; the app is a single screen.

**Commands:**

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5173. Includes the Jev proxy and run logging. |
| `npm run test:unit` | Vitest. 27 tests: engine specs plus a server-side render of the whole app through the store. |
| `npm run type-check` | `vue-tsc --build` over `tsconfig.app.json` and `tsconfig.node.json`. |
| `npm run lint` | ESLint. |

Type-check, lint and tests all passed at the time of writing.

**AI provider: Jev** (TypeSafe's "System One" model), reached through OpenRouter.
- Endpoint: `POST https://openrouter.ai/api/v1/systemone`. Model `jev-latest`, which currently
  resolves to `typesafe/jev-1.14-20261014`.
- The browser calls `/api/jev`. A Vite plugin (`server/jevProxy.ts`) adds the key server-side.
  This only works under `vite` dev/preview; a static build has no proxy.
- `GET /api/jev/health` reports whether a key is configured, without spending tokens.
- The key is in `.env.local` as `JEV_API_KEY`. The file is gitignored. The key was pasted into
  chat during the session.
- Optional settings: `JEV_BASE_URL`, `JEV_MODEL`.

**Run logs:**
- Path: `logs/runs/<runId>.jsonl` (gitignored), written by `server/runLog.ts` (`POST /api/log`)
  and by the Jev proxy.
- Game events: `game_start`, `day` (the day's report, events and a full state snapshot),
  `proposal`, `priority`, `error`, `game_end`, `game_abandoned`.
- Jev traffic: `jev` events with purpose, request, response and latency.
- The client side is `src/telemetry.ts`.

**Repository:**
- One commit (`91895d2 Initial commit`). All work from this session is uncommitted (about 37
  changed paths).
- The original prototype was moved with `git mv` to `old/`. It isn't built, linted or tested.
- Its ~860 MB of transformers.js model weights are in `old/public/models/` (gitignored).

**Saves:**
- Browser `localStorage`, key `singularity-rd/save/v4`, with `version: 4` in the state.
- Each redesign bumped the version and reset saves.

**Code map:**

| Path | Contents |
| --- | --- |
| `src/ai/jev.ts` | Jev client: `Judge` interface, `JevJudge`, typed readers (`readNoul`, `readChoice`, `readScore`, `answerFor`) |
| `src/engine/types.ts` | `GameState` (v4), `Resource`, `UnitType`, `Strategy`, `Research`, `DayReport` |
| `src/engine/balance.ts` | All tuning tables, and the research chance formula |
| `src/engine/initialState.ts` | Starting state |
| `src/engine/economy.ts` | Day simulation (`simulateDay`, `previewDay`), `splitEvenly`, `unitCap`, seeded RNG |
| `src/engine/cycle.ts` | `runDay`: wraps `simulateDay` and writes the log summary |
| `src/engine/research.ts` | Research effects: unlocks, repeatable upgrades and improvements |
| `src/engine/proposals.ts` | Jev question sets for resource, unit and strategy proposals; the value model |
| `src/engine/stateText.ts` | The plain-text world description sent to Jev as `state` |
| `src/stores/game.ts` | Pinia: persistence, preview, Jev status, actions, telemetry |
| `src/stores/ui.ts` | Which invent dialog is open, and the notice banner |
| `src/components/` | UI panels and `InventDialog` |
| `src/engine/__tests__/fakeJudge.ts` | Deterministic stand-in for Jev used by the tests |

---

## 2. Goals (from the designer)

Original brief:

> "Make a game where you manage AI to try and achieve a singularity. The core gameplay loop is
> steering the AI that you start with to allocate its resources."

> "Players can propose any arbitrary resource track along the way to achieving the
> singularity. Keep this mechanic."

> "As the game progresses, the player should steer their AI to invent, produce, and make use
> of new 'units' that interact with the unlocked resources."

> "Two different players approaching the game should be able to take very different paths to
> achieve the singularity, depending on what resources and units they unlock along the way."

> "I'm flexible on what the AI provider should be. Jev seems like an interesting option."

Later direction:

- Adding a resource should be "a very low bar … just 'a thing I could get'. It doesn't need to
  mean you can actually get it yet." Units should face "a middling bar".
- Unit creation "is meant to be key to the game".
- Day-to-day allocation should be a "fixed user specification; not AI based".
- "Winning with just the starting unit should not be feasible."
- Arc: "the sweet spot is to have the user create 3 new compute tiers, using each one to
  design and build the next over the arc of one game. This could be 2 if they invest a lot in
  each tier, or 4 if they skip. Any more than that is lots of tedium. Balance around this."
- Limits: "Unit limits should be much higher. Represent the sum of humankind and planet
  earth's resources with stacked caps."
- Late game: "Later game units should have more complicated costs to create, which should
  generally happen after the AI eclipses the readily purchasable resources of humanity. I can
  buy the first 100,000 servers with money. For the next 10,000,000 and/or the 'Quantum
  Supercomputer' nudge Jev to require advanced inputs 'Quantum Processors' and
  'Superconducting Power Cables'."
- Research: "should not be endless or be automatic. New research should come from new ideas.
  Research should be able to change units and strategies arbitrarily at the user's direction,
  not just +25% output."
- UI: "Separate intelligence systems from other units in the UI."
- Shelved: a human-suspicion mechanic ("Maybe something to circle back to later; not
  interesting right now").

---

## 3. Design history (decisions the designer made)

In order:

1. **First rebuild.** Jev decided each turn's attention split across "tracks", based on
   player priorities and written standing orders. Proposals (resources and units) went
   through Jev. Domains, milestones, Capability and Suspicion meters, and personality traits.
2. **Playtest 1** (see §6). The designer found proposals too often rejected and steering too
   abstract. Replaced Jev-driven steering with deterministic **strategies** (fixed inputs and
   outputs, executed by units, assigned with +/−). Milestones removed. Upgrades added.
   Instrumentation added.
3. **Playtest 2.** "I didn't really need to interact with the unit creation system", "units
   feel fake and same-y", "Human suspicion … never went up", and +/− assignment was tedious.
   Decisions:
   - Remove suspicion and Capability.
   - Strategies get priorities (Ignore / Low / Normal / High) with even splitting within a
     level, and previews.
   - Units get upkeep, a research-capable flag (set by the player) and IQ.
   - Single starting unit.
   - Research becomes a separate menu with points and recommended IQ. Chance per assigned unit
     per day is `0.9 / (1 + max(0, (recommended IQ − unit IQ) / 10))`.
   - Starting research: Software Upgrades (5 points, IQ 100, +20 IQ) and Theory of Everything
     (100 points, IQ 1000, wins the game).
   - Resources are **durable** or **ephemeral**, as Jev decides.
   - Software Upgrades should be repeatable with diminishing returns or exponential cost.
4. The designer asked to simplify the allocation solver and accepted a **one-day lag** for
   ephemeral resources.
5. **Unit limits:** "Give all units a fixed upper bound when the unit is first set up. Allow
   other units to be created that increase caps linearly for each created unit."
6. **Starting unit.** "Remove 'buy research server'. You aren't meant to be able to get more
   of those." Renamed to "Starting Server", described as "An unrestricted AI server left
   unattended in a research lab. Comes with free power." Other servers should cost power.
   Invent UIs became pop-up dialogs opened from inline buttons.

---

## 4. Current implementation (as built)

**Starting state:**
- One **Starting Server**: IQ 100, research-capable, no upkeep, limit 1, no way to get more.
- Resources: **Money** (durable, 0) and **Power** (ephemeral, 0). No strategies.
- Research: **Software Upgrades** (repeatable: 5 points, IQ 100, +20 IQ; points double and
  recommended IQ rises by 20 each level) and **Theory of Everything** (100 points, IQ 1000,
  Ignore by default).

**A day** (`simulateDay`), from the morning's stock:
1. **Assign units by tier.** For High, then Normal, then Low:
   - Each unit type is split between that tier's strategies, plus research items for
     research-capable types, using `splitEvenly`.
   - Each claimant is capped by what the unreserved stock could support.
   - Research claimants are capped at enough units to cover the remaining points on average.
   - Each tier then rations its resources proportionally, releases units it can't feed,
     reserves the stock it uses, and retries up to 4 rounds before spare units fall through to
     the next tier.
2. **Run** all assignments at once. Over-demanded resources are rationed proportionally.
   Strategy runs can be fractional; builds and research rolls are whole.
3. **End of day.**
   - Unused ephemeral stock vanishes, then outputs arrive. Ephemeral output is usable the
     next day only.
   - Units built during the day are added.
   - Research progress is applied: one roll per assigned unit per day, using the seeded RNG
     stored in state.
   - Completed research applies its effect.

**Previews:** the same simulation runs on a clone in "expected" mode, so research shows
expected points. The preview is recomputed on every state change. A day with 100,000 units
measured about 0.1 ms.

**Upkeep:**
- Paid per unit per working day, as part of each run's needs.
- Units whose upkeep can't be covered are not assigned, and are reported as idle-for-upkeep.

**Unit limits:**
- `unitCap = base cap + Σ (count × amount)` over units that expand that type.
- "Get X" build strategies stop at the limit.
- Jev scores the base cap on `[3, 10, 25, 60, 150]` and the per-unit expansion on
  `[1, 2, 5, 10, 25]`.

**Proposals (Jev):**

| Kind | Jev questions | Result |
| --- | --- | --- |
| Resource | Is it a thing (accept above 0.15), exact duplicate, durable or ephemeral, icon (from a fixed palette), value tier | Added instantly |
| Unit | The player chooses research-capable and, optionally, a unit type it expands. Jev: feasible (accept above 0.35), duplicate, capability tier, builder unit, cost resource (durable, prefers already-produced), build cost, upkeep resource and size, cap, expand amount, IQ (`[70, 100, 140, 200, 350, 600]`) | A research item; unlocking adds the unit plus a "Get X" build strategy at Normal |
| Strategy | The player chooses name, unit, up to 2 inputs and 1 output. Jev: plausible (accept above 0.3), efficiency, tier, size of each input | Quantities from the value model. Tiers 1–2 are instant; tiers 3–5 need research. Each strategy also gets a repeatable "Improve X" research (+25% output per level) |

- Value model: output = (unit labour value + input value) × efficiency ÷ output's value,
  rounded to 2 significant figures. The tables are in `balance.ts`.
- Researcher units also get a repeatable "Upgrade X" research (+20 IQ per level).

**UI:**
- Three columns: Resources and Units | tabs (Strategies / Research) | Log.
- Theory of Everything progress bar at the top.
- Buttons: Run day, Run 10 days, New game.
- Hovering a resource shows tomorrow's breakdown by source.
- Invent dialogs open from "+ Resource", "+ Unit", "+ Strategy", "+ strategy" (per unit type),
  "+ make this" (per unproduced resource) and "+ expand" (per unit at its limit).

**Not verified:** the invent dialogs have not been exercised in a real browser (no browser
tool was available). The tests cover SSR rendering and pre-filled values only.

---

## 5. Jev: observed behaviour

- **Answer types only.** Jev answers `noul` (probability), `choice` (one key from a given set)
  and `score` (position on a labelled scale, with a per-level probability distribution and a
  confidence). It does not generate text, so it cannot name new things such as "Quantum
  Processors". All names come from the player or from fixed option lists.
- **Speed and cost.** About 190–320 ms per call, around $0.00002–0.00006 per proposal. Run 1
  of the v4 game: 26 calls, about $0.0015 in total.
- **Averaged scores can mislead.** Score answers are expected values, so a split distribution
  averages to something nobody chose. Observed: "Paid Humans" asked "how technologically
  advanced" came back 34% Basic and 34% Science fiction with confidence 0, averaging to 2.29
  ("Advanced"). Rewording the question to "how capable" produced sensible answers.
- **Context leaks between questions.** Once, Jev chose "Lemons" as the cost of "Paid Humans",
  apparently because the Lemons description mentioned paid humans.
- **Sensible results, live:**
  - Electricity and Compute Time are ephemeral; Lemons are durable.
  - "Cash" is a duplicate of Money.
  - GPU Server: Power upkeep 38/day. Paid Humans: Money upkeep 6.3/day.
  - Data Center expanding servers: cap 10, +5 each, costs 1,200 Money.
  - Dyson Sphere accepted at a high research cost.
- **Rejection seen in v4:** "Purchase Diesel" with no input was rejected (27% plausible); with
  Money as an input it was accepted.

---

## 6. Playtest data

Logs from all runs are in `logs/runs/`.

| Run | Version | Length | Outcome | Notes |
| --- | --- | --- | --- | --- |
| `mvelzwjf-wq2th` | v2: strategies with +/−, Capability, suspicion | 29.6 min, 109 cycles | Won | 2 proposals. Starter kit alone sufficed. Suspicion 0 until cycle 80, peaked at 39. Money piled to ~7,900 unused. Capability stuck at 5 from cycle 3 to ~62. |
| `mverl4wu-tx9yz` | v4 | 2.4 min, 91 days | Abandoned | Early test. |
| `mvero9jk-41gsw` | v4 | 46.1 min, 1,230 days | Won (Theory of Everything at day 1230) | See below. |
| `mvetbm28-llkbc` | v4 | 19.4 min, 414 days | Gave up | See below. |

**Run `mvero9jk-41gsw`, final state:**
- Starting Server IQ 160.
- Overclocked AI Server ×10, IQ 260.
- **Large AI Data Center ×60, IQ 400**, limit raised by 25 "Large plots of land" (+2 each).
- Solar Panels, Nuclear Power Plant and Server Racks all have **Power** upkeep.
- Diesel Generator and Trucks have Diesel upkeep.
- Money 50,532 unused at the end.
- Theory of Everything (recommended IQ 1000) was completed with IQ-400 units.

**Interaction counts, v4 runs:**

| | Run `mvero9jk` | Run `mvetbm28` |
| --- | --- | --- |
| Priority changes | 125 | 78 |
| …on "Get X" build strategies | 51 | 27 |
| …on repeatable upgrades and improvements | 29 | 10 |
| …on new discoveries | 14 | 18 |
| …on Theory | 5 | — |
| …on other strategies | 26 | 23 |
| Priority changes reversed within 30 s | 49 | 32 |
| Day-advance clicks | ~252 for 1,230 days | ~116 for 414 days |
| Proposals | 26 | 18 |

- Long waits in run `mvero9jk` included 67, 56, 122, 150, 141 and 107 consecutive days.
- Typical pattern on build strategies: set "Get X" to High for a day or two to buy units, then
  back to Ignore.
- Another frequent pattern: set new research to High, then to Ignore or Low after it completes
  or to free the Starting Server.

**Run `mvetbm28`, end state:**
- Research "Lemon Juicer" sat at 4/5 points from about day 353 to day 414. Its priority was
  flipped Low → Normal → High repeatedly.
- 10 Bioengineering Facilities (IQ 140) and 2 Smart Lemons (IQ 200) were idle because they
  couldn't pay upkeep (Power was 0, with all strategies set to Ignore).
- Money 36,440 and Lemons 30,770 unused.

**Simulation observations (scripted, no Jev):**
- Before unit limits, "one money strategy + keep buying the starting research server" grew
  exponentially (440 servers by day 100, 10¹⁸ by day 600) and won around day 123.
- With limits, the same plan reached 39/100 Theory points after 1,000 days.

---

## 7. Issues identified

### Designer's notes after the latest runs (verbatim)

> Finished one run. Giving up on the second. The UI is very tedious to use.

> - Things that generate power consuming power to run is a pain in the ass
> - Let me buy units directly. Don't go through a strategy for it.
> - I want to direct what individual machines research rather than lumping them all together.
>   Setting a research to "high" would steal the starting server even when I wanted it to go
>   do other stuff.
> - A research stuck at the end of the second run
> - The end of the first run felt like I brute forced it.
> - Research to improve stuff should not be endless or be automatic. New research should come
>   from new ideas. Research should be able to change units and strategies arbitrarily at the
>   user's direction, not just +25% output.
> - Unit limits should be much higher. Represent the sum of humankind and planet earth's
>   resources with stacked caps.
> - I shouldn't have been able to brute force the IQ 1000 research with IQ 300 servers. My
>   scaling law was bad. We'll need to change this.
>     - In general, I think the sweet spot is to have the user create 3 new compute tiers,
>       using each one to design and build the next over the arc of one game. This could be 2
>       if they invest a lot in each tier, or 4 if they skip. Any more than that is lots of
>       tedium. Balance around this.
>     - Separate intelligence systems from other units in the UI.
> - Later game units should have more complicated costs to create, which should generally
>   happen after the AI eclipses the readily purchasable resources of humanity. I can buy the
>   first 100,000 servers with money. For the next 10,000,000 and/or the "Quantum
>   Supercomputer" nudge Jev to require advanced inputs "Quantum Processors" and
>   "Superconducting Power Cables".

### Earlier designer notes still relevant

> - I didn't really need to interact with the unit creation system. This is meant to be key to
>   the game.
> - The units feel fake and same-y.
> - Clicking +1 / -1 on strategies felt very tedious.

### Observations from logs, simulation and code

**Tedium:**
- Interaction is dominated by priority toggling and day-advance clicking (counts in §6).
  Buying units requires turning a build strategy on, then off, to control spending.
- Repeatable research ("Upgrade X", "Improve X") never ends, so it has to be switched off by
  hand.

**Starvation (fixed after run `mvetbm28`):** `splitEvenly` gave a leftover unit to the
claimant with the largest cap, so with fewer units than claimants in a tier, the
smaller-capped claimant got nothing indefinitely. Leftovers now rotate by day, with a
regression test. This bug is the likely cause of the stuck "Lemon Juicer".

**Silent idle units:** units idle for lack of upkeep are shown only as small text on each unit
row and a log line. In run `mvetbm28`, 12 research-capable units sat idle unnoticed.

**Research brute force:**
- The chance formula falls off slowly (IQ 400 against 1000 gives 1.5% per unit per day), and
  attempts scale linearly with units assigned. Many lower-IQ units can complete
  high-recommended-IQ research.
- Researcher IQ for new units comes from Jev's score on a fixed scale up to 600. The
  recommended IQ for unlock research comes from a separate tier score.

**Power circularity:** Jev is told that machines need Power. As a result, power generators
(Solar Panels, Nuclear Power Plant) were given Power upkeep. Combined with the one-day lag on
ephemeral resources, generators need power from the previous day before they can run.

**Economy:** Money and other durables accumulate without use late in runs.

**Starting position:** the Starting Server has a limit of 1. Power exists as a starting
resource with nothing producing it.

**Unit limits and expansion:** expanders raise limits linearly per unit owned. Base caps top
out at 150 on Jev's scale, which is far below the designer's "100,000 servers" framing.

**Proposals:**
- Unit proposals require a durable resource to price them. Cost options prefer resources some
  strategy already produces, otherwise any durable resource.
- Duplicate checks rely on Jev's `same_as` choice. The same unit was proposed twice in a row
  as a duplicate ("Rented Computer Server" vs "Computer Server").

**Changes reset saves:** each mechanics change bumped the save version, discarding the
player's in-progress game.

**Engineering:**
- The preview recomputes via a JSON round-trip of the full state on every reactive change.
- The `old/` prototype and its model weights remain in the tree.
- `npm install` warns about install scripts not yet approved for cypress, esbuild,
  onnxruntime-node, protobufjs and sharp (some are no longer dependencies).
