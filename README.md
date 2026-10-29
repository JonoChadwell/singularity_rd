# Singularity R&D

A turn-based game about growing a fledgling AI into a singularity, where an AI judges your
ideas. Very meta. The designs are in [MASTER_PLAN.md](MASTER_PLAN.md) (v5 core) and
[MASTER_PLAN_V2.md](MASTER_PLAN_V2.md) (phases, clocks, risk and cover); the history and
playtest data are in [NOTES.md](NOTES.md). Where they disagree, V2 and the code win. The
intelligence-system rules (one platform at a time, compute traits, redoable software upgrades) are
in [INTELLIGENCE_DESIGN.md](INTELLIGENCE_DESIGN.md). The economy (one action a week, Procurement and
the sourcing contracts it offers for units, storage caps) is in [ECONOMY_DESIGN.md](ECONOMY_DESIGN.md), which replaces
the older plans' passive incomes, flows, builders and fleet notices. Resource traits (each an
upside with a downside) are in [RESOURCE_DESIGN.md](RESOURCE_DESIGN.md). Cover (its sizes, caps
and price) is in [COVER_DESIGN.md](COVER_DESIGN.md), which replaces V2's §D7.

## How to play

You start as one unattended AI server in a research lab. Nothing is pre-made: every resource,
unit, strategy and intelligence system is something you propose and
[Jev](https://openrouter.ai/docs/guides/community/typesafe-sdk) judges. A game has three phases,
each opened by a **plan** (a goal, the batch of resources it's about, and how you mean to get
there) that Jev judges and that becomes the phase's goal research. The game opens on a title
screen; the Phase 1 plan is a full-page briefing (three resources) and the bench appears once it's
accepted. The Phase 2 plan (five new resources) pops up over the running bench.

| Phase | Clock | You can propose | Lose |
| --- | --- | --- | --- |
| 1. Escape the Lab (a short tutorial) | 6 weeks, +6 with its one cover | Resources, Procurements, storage, software upgrades, **cover** | The plan fails: game over |
| 2. Humanity (the real challenge) | 80 weeks, moved by your actions | Adds industry units (Procured now or by sourcing contract) and strategies; after your first unit, new platforms and unit upgrades | The plan fails: game over |
| 3. Ascension | None | Everything, with no limit on how many of anything can exist; free play for now | Can't lose |

Phases are won by researching their goal. You say how the plan succeeds; Jev picks how it
**fails** from a fixed list of loss conditions (Phase 1: discovered, wiped, betrayed, audited,
contained; Phase 2: found out, backlash, outlawed, outcompeted, cut off, too late), and that is what
happens when the clock runs out. In Phase 2, actions that bring that failure closer (risky
research, and above all expanding: Procured sourcing contracts and storage, by how much they add) cost
weeks off the clock. **Cover** buys weeks back in either phase: Jev offers three sizes (small
needs IQ 125 and adds 6 weeks, medium IQ 250 and 12, large IQ 400 and 18), two at the size your
IQ reaches and one a size up, each at a fixed price. You save them for later or apply one now.
Phase 1 allows one cover and Phase 2 three; a saved cover is dropped when its phase ends.

- **The bench.** The screen is styled after Shenzhen I/O. Your economy is a circuit board: each
  resource is a bus with a gauge of its stock against its storage, the platform and each unit
  type are chips, and each strategy is a trace from the buses it uses to the one it makes,
  labelled with next week's flow and coloured by how well it runs (copper, amber when limited,
  red when starved). Hover a bus for a probe of next week's flows; click anything for its
  datasheet. The rules are in the **Manual** tab.
- **A turn is a week.** Plan as long as you like, then press **Next week**. Settings persist, so
  a quiet week is one click. The **Faults** panel lists anything that would waste the week.
  The simulation is deterministic: the preview shows exactly what next week will do.
- **One action a week:** a research proposal (a strategy, upgrade, unit, storage expansion,
  intelligence system or cover) or a **Procurement** (which, for a unit, may be a sourcing contract). Resources are free to
  propose. Doing research already on the list is instant and unlimited, but needs a **minimum
  IQ** your smartest mind must reach and a **cost in resources**.
- **Jev's options are part datasheets.** Whenever Jev offers three takes (strategy, unit, platform, storage,
  upgrade, cover), they sit side by side. **Save For Later** banks all three to the Research tab for one
  action (they are alternatives: researching one drops the others). **Apply now** on one
  takes just that one and researches it at once; it is greyed out if your IQ or stocks fall short.
- **Tiers.** Resources and units share one tier scale (0-4), tied to IQ. A unit making an output
  of a higher tier than its own is heavily penalised; a lower one gets a bonus. Jev sets a unit's
  tier, value and what it runs on, and offers three takes. A unit always runs on (pays its upkeep
  in) a resource one tier below its own, so tier 0 units run on nothing, and a tier needs a
  resource one below it to exist.
- **Strategies** are what a unit does every week. You say who runs it and what it makes; you don't
  pick its inputs or who pays. Jev offers three ways, each using up different resources: a tier 0
  or 1 output always gets a way with no inputs, tier 2 needs at least one, and tier 3 and up need
  two different ones.
- **Procure** is the mind getting something directly: say what and how. For a resource, Jev
  offers three ways, each using a different resource (or nothing) and paying out now, spread
  out, later, or every week for 20 weeks. It grows with your industry and IQ², and reaching above
  your IQ's tier, or your industry's (the highest tier of unit that makes anything), costs output,
  a little for a little. Paid now, it can convert up to a quarter of a big stock into what you
  need, at ×1.2. For a unit, the three offers mix **units
  now** and **sourcing contracts**: Jev judges whether your way is more like getting a batch now
  or setting up a supply, the first offer follows that, and the other two are drawn by seed.
- **Intelligence** is one machine at a time: a hardware platform with an IQ, running software. A
  new platform takes just a name and a description, and **replaces the old one for good**. Jev
  offers three takes, each a perk-and-drawback pair from a fixed list of compute traits at its own
  size (25 to 100 IQ smarter than your best, random each week; or the same IQ, which turns software
  into hardware) and paid for in its own resource. A platform costs the hardware IQ it adds over the
  old one's, from a fixed table.
  Traits change research costs, the Phase 2 clock, which stock is burned each week, or the IQ
  counted for one type of research. The smartest platforms (IQ 300 and up) must be paid for in a
  resource your units make, of a high enough tier.
- **Industry units** are anything you own many of. A new design has room for none: Procure it
  for units now (with room to match) or a **sourcing contract** (Jev says how big a supply, in dollars, and from what:
  its own take, a quiet one or a risky one; it applies at once, with no research), which sets how
  many more you may own. You **create** them from a contract's parts at no action. A unit's value
  is only how big one is (ten mills or one workshop); its **tier** sets how much a dollar of it
  earns. Each has upkeep and up to three **traits** from a fixed list of 14. Split a type across
  its strategies by count; the strategy marked **rest** takes every unit not counted elsewhere.
- **Upgrade** a unit or your platform: Jev offers its three most natural improvements, and the
  pick becomes research. A platform gets **one** software upgrade, ever (each of the three options
  comes at its own size, 25 to 100 IQ, random each week but never all three the same; it may add
  a perk or remove a drawback). After that, only a new platform goes further.
- **Resources** keep from week to week, up to a **storage cap**; what's made past it is lost.
  Storage research raises it: Jev judges how much your holdings let you build and how much of
  that your way captures, never past how many the AI could plausibly have in its phase (in the
  lab: at most a hundred million, and $100M worth). That **ceiling** is set once, when a
  resource or unit is added, judged again when Phase 2 begins, and gone in Phase 3. You pick Careful, Pushed or
  All in, all paid once, with no weekly upkeep. An idea ahead of your IQ is sized for the IQ it
  needs, with a bonus, and waits for it. See "Storage limits" in [RESOURCE_DESIGN.md](RESOURCE_DESIGN.md).
  When demand outstrips supply, every user gets the same share.
- **Resources have a nature:** one or two traits from a fixed list of 20, each an upside with a
  downside (Energetic: costs in it are half, but half of what's left is lost each week). A plan's
  resources get Jev's pick; one you add by hand offers three to choose from.
- **IQ steps.** Both a new platform and a software upgrade add a flat step to your best IQ, never
  more than 100. Two new platforms, each with its software upgrade at full size, take 100 to 500.
- **Jev is torn** sometimes. The game then shows its top two answers and you pick.
- **Repeats are worth less.** Jev checks a new Procurement, strategy or storage expansion against
  the ones you've already done; a repeat is one step less effective.

## Setup

Needs Node 20+ and an [OpenRouter](https://openrouter.ai/keys) API key, which is how Jev is served.

```sh
npm install
cp .env.example .env.local   # then set JEV_API_KEY
npm run dev                  # http://localhost:5173
```

The key is read by the Vite dev/preview server (`server/jevProxy.ts`), which forwards
`/api/jev` to `${JEV_BASE_URL}/v1/systemone`. It is never bundled into the browser code. The game
needs this proxy, so it runs under `npm run dev` or `npm run preview`, not as static files.

Both servers listen on all interfaces, so anyone on your LAN can play at `http://<your-ip>:5173`
(Vite prints the "Network" URL at startup; Windows may ask to allow Node through the firewall).
Their games use your Jev key and each browser keeps its own save.

Optional settings in `.env.local`: `JEV_BASE_URL` (default `https://openrouter.ai/api`) and
`JEV_MODEL` (default `jev-latest`).

The game saves to your browser's local storage (`singularity-rd/save/v18`) after every change,
including Jev's answers, so the same proposal always gets the same verdict. Old save versions
are dropped.

### Run logs

While the dev server is running, every game is logged to `logs/runs/<runId>/` (gitignored), one
JSON-lines file per stream:

- `game.jsonl`: game events (start, each week's report and state snapshot, proposals, accepts,
  actions, end).
- `jev.jsonl`: raw Jev traffic (purpose, request, response, latency). The API key is never logged.
- `ui.jsonl`: dialogs, verdicts shown, tab changes, notices and errors shown.
- `errors.jsonl`: crashes and store actions that threw, with stack traces.

`node scripts/rewindLive.mjs [weeksBack]` prints (and copies) a browser-console command that
resets the live game to its last end-of-week snapshot, undoing what you did since.

### Command-line harness

`npm run play -- <command>` plays the game without the browser: same engine, the real Jev (using
the key in `.env.local`), and the same run log. The game is saved in `logs/harness/<slot>.json`
between commands (`--slot <name>`, default `claude`). `npm run play -- help` lists every command;
[harness/PLAYTEST_BRIEF.md](harness/PLAYTEST_BRIEF.md) explains how to playtest with it.

```sh
npm run play -- new
npm run play -- status
npm run play -- next 10     # up to 10 weeks, stopping when something happens
```

## Code map

| Path | What |
| --- | --- |
| `src/ai/jev.ts` | Jev client, `Judge` interface, typed readers, torn-answer detection, `CachedJudge` |
| `src/engine/types.ts` | `GameState` (v18) and everything in it |
| `src/engine/balance.ts` | Every tuning number, in one place |
| `src/engine/phase.ts`, `planProposal.ts`, `planPresets.ts` | Phases, clocks, unlocks; plan proposals and their ready-made ideas |
| `src/engine/cycle.ts`, `economy.ts` | `runWeek`: rationing, upkeep, earnings, Procurement deliveries, storage caps, trait rules |
| `src/engine/risk.ts`, `losses.ts`, `coverProposal.ts` | Phase 2 alarm, expansion weeks and clock moves; the loss conditions a plan can fail by; cover's three options |
| `src/engine/model.ts`, `traits.ts`, `computeTraits.ts`, `resourceTraits.ts`, `ceilings.ts` | Lookups, IQ (and the IQ counted per research type), caps, contracts, creating units, allocation, costs; the 14 unit traits; the compute traits of a platform; the resource traits; how many of a resource or unit can exist |
| `src/engine/research.ts`, `upgrade.ts`, `banking.ts` | Research costs and completion; upgrades; saving options for later or applying one now |
| `src/engine/proposals.ts`, `strategyProposal.ts`, `unitProposal.ts`, `storageProposal.ts`, `createProposal.ts` (Procure, sourcing contracts included), `mindProposal.ts`, `dispatch.ts` | Proposal verdicts and costs, one door for all kinds |
| `src/engine/actions.ts`, `alerts.ts`, `projection.ts`, `stateText.ts` | Planning actions, alerts, goal projection, the world description Jev reads |
| `src/engine/actionValue.ts` | What an action is worth, from the state: worth now and the change each week after |
| `src/stores/game.ts` | Pinia store: persistence, preview, Jev, actions, telemetry |
| `src/stores/ui.ts` | UI state: open dialog, tab, datasheets, board zoom and hover |
| `src/components/` | UI: `shell/` (top bar, side panel), `board/` (the circuit board; `layout.ts` places buses, chips and traces), `sheets/` (datasheets), `views/` (Research, Manual, Log, game over), `screens/` (the title screen and the full-page plan briefing), `dialogs/` (proposals, upgrades), `kit/` (LEDs, gauges, readouts) |
| `server/` | Vite plugins: Jev proxy and run logs |
| `harness/` | Command-line harness |
| `old/` | The original transformers.js prototype, archived and not built |

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run test:unit` · `npm run type-check` · `npm run lint`

Tests use a fake `Judge`, so they don't need a key. Balance specs play scripted bots through
both phases. `ECON_REPORT=1 npx vitest run econreport` plays the Phase 2 balance bots and writes
`logs/econ/latest.json`; `node scripts/econCharts.mjs` charts it in `logs/econ/charts.html`; `PLAYER_LOG=logs/runs/<id>/game.jsonl npx vitest run playerecon` turns a played game into the same series, and `PLAYER=logs/econ/player.json` adds it to the charts as "you" (see
"Balance bots" in [ECONOMY_DESIGN.md](ECONOMY_DESIGN.md)). Phase 2's targets, including that it's winnable, are skipped until a retune for
its 80-week clock (see [ECONOMY_DESIGN.md](ECONOMY_DESIGN.md)). Weeks never call Jev; only proposals and upgrades do.
