# Singularity R&D

A turn-based game about growing a fledgling AI into a singularity, where an AI judges your
ideas. Very meta. The designs are in [MASTER_PLAN.md](MASTER_PLAN.md) (v5 core) and
[MASTER_PLAN_V2.md](MASTER_PLAN_V2.md) (phases, clocks, risk and cover); the history and
playtest data are in [NOTES.md](NOTES.md). Where they disagree, V2 and the code win.

## How to play

You start as one unattended AI server in a research lab. Nothing is pre-made: every resource,
income, unit, strategy and intelligence system is something you propose and
[Jev](https://openrouter.ai/docs/guides/community/typesafe-sdk) judges. A game has three phases,
each opened by a **plan** (a goal, the batch of resources it's about, and how you mean to get
there) that Jev judges and that becomes the phase's goal research.

| Phase | Clock | You can propose | Lose |
| --- | --- | --- | --- |
| 1. Escape the Lab (a short tutorial) | 10 weeks | Resources, passive incomes, software upgrades | Discovered: game over |
| 2. Humanity (the real challenge) | 100 weeks, moved by your actions | Adds industry units, strategies and **cover**; after your first unit, intelligence systems, hardware and unit upgrades | Humans stop you: game over |
| 3. Ascension | None | Everything; free play for now | Can't lose |

Phases are won by researching their goal. Phase 2 actions that humans would notice (risky
research, owning lots of anything) cost weeks off the clock; cover research buys some back.

- **A turn is a week.** Plan as long as you like, then press **Next week**. Settings persist, so
  a quiet week is one click. Alerts above the button list anything that would waste the week.
  The simulation is deterministic: the preview shows exactly what next week will do.
- **One research proposal a week.** Accepting a strategy, passive income, upgrade, unit,
  intelligence system or cover uses it; resources are free to propose. Doing research already on
  the list is instant and unlimited, but needs a **minimum IQ** your smartest mind must reach
  and a **cost in resources**.
- **Tiers.** Resources and units share one tier scale (0-4), tied to IQ. A unit making an output
  of a higher tier than its own is heavily penalised; a lower one gets a bonus. A resource's first
  income is paid only in lower tiers, so tier-0 first incomes are free, and each tier holds one
  resource. Jev sets a unit's tier, value, parts and power, and offers three takes.
- **Passive income** yields a resource with no units, a fixed amount a week (some grow with the
  count of another resource).
- **Intelligence systems** are single machines: a hardware platform with an IQ, running
  software. A new one must be smarter than your best, and becomes the next generation.
- **Industry units** are anything you own many of. Once designed, you **create** them from their
  parts, as many as you can afford. Builder or Self-replicating units can build them with a
  build strategy. Each has upkeep and up to three **traits** from a fixed list of 16. Split a
  type across its strategies by count; the strategy marked **rest** takes every unit not counted
  elsewhere.
- **Upgrade** any unit or mind: Jev offers its three most natural improvements, and the pick
  becomes research. Software can raise IQ to 1.5× the hardware's and no further.
- **Resources** are stocks (keep) or flows (made and used within a week). When demand outstrips
  supply, every user gets the same share.
- **The leap rule.** Designing a mind needs a mind with about half its target IQ.
- **Jev is torn** sometimes. The game then shows its top two answers and you pick.

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

Optional settings in `.env.local`: `JEV_BASE_URL` (default `https://openrouter.ai/api`) and
`JEV_MODEL` (default `jev-latest`).

The game saves to your browser's local storage (`singularity-rd/save/v12`) after every change,
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
| `src/engine/types.ts` | `GameState` (v12) and everything in it |
| `src/engine/balance.ts` | Every tuning number, in one place |
| `src/engine/phase.ts`, `planProposal.ts`, `planPresets.ts` | Phases, clocks, unlocks; plan proposals and their ready-made ideas |
| `src/engine/cycle.ts`, `economy.ts` | `runWeek`: rationing, upkeep, builds, earnings, trait rules |
| `src/engine/risk.ts`, `coverProposal.ts` | Phase 2 alarm and clock moves; cover |
| `src/engine/model.ts`, `traits.ts` | Lookups, IQ, creating units, allocation, costs; the 16 traits |
| `src/engine/research.ts`, `upgrade.ts` | Research costs and completion; upgrades |
| `src/engine/proposals.ts`, `unitProposal.ts`, `mindProposal.ts`, `incomeProposal.ts`, `dispatch.ts` | Proposal verdicts and costs, one door for all kinds |
| `src/engine/actions.ts`, `alerts.ts`, `projection.ts`, `stateText.ts` | Planning actions, alerts, goal projection, the world description Jev reads |
| `src/stores/game.ts` | Pinia store: persistence, preview, Jev, actions, telemetry |
| `src/components/` | UI |
| `server/` | Vite plugins: Jev proxy and run logs |
| `harness/` | Command-line harness |
| `old/` | The original transformers.js prototype, archived and not built |

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run test:unit` · `npm run type-check` · `npm run lint`

Tests use a fake `Judge`, so they don't need a key. Balance specs play scripted bots through
both phases (the Phase 2 bot tests are currently skipped: the bot can't yet make a tier-4 unit's
other parts). Weeks never call Jev; only proposals and upgrades do.
