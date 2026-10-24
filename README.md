# Singularity R&D

A turn-based game about growing a fledgling AI into a singularity, where an AI judges your
ideas. Very meta. The designs are in [MASTER_PLAN.md](MASTER_PLAN.md) (v5 core) and
[MASTER_PLAN_V2.md](MASTER_PLAN_V2.md) (phases, clocks, risk and cover); the history and
playtest data are in [NOTES.md](NOTES.md). Where they disagree, V2 and the code win. The
intelligence-system rules (one platform at a time, compute traits, one software upgrade each) are
in [INTELLIGENCE_DESIGN.md](INTELLIGENCE_DESIGN.md). The economy (one action a week, Create,
sourcing contracts, storage caps) is in [ECONOMY_DESIGN.md](ECONOMY_DESIGN.md), which replaces
the older plans' passive incomes, flows, builders and fleet notices.

## How to play

You start as one unattended AI server in a research lab. Nothing is pre-made: every resource,
unit, strategy and intelligence system is something you propose and
[Jev](https://openrouter.ai/docs/guides/community/typesafe-sdk) judges. A game has three phases,
each opened by a **plan** (a goal, the batch of resources it's about, and how you mean to get
there) that Jev judges and that becomes the phase's goal research.

| Phase | Clock | You can propose | Lose |
| --- | --- | --- | --- |
| 1. Escape the Lab (a short tutorial) | 10 weeks | Resources, Creates, storage, software upgrades | Discovered: game over |
| 2. Humanity (the real challenge) | 100 weeks, moved by your actions | Adds industry units, sourcing, strategies and **cover**; after your first unit, new platforms and unit upgrades | Humans stop you: game over |
| 3. Ascension | None | Everything; free play for now | Can't lose |

Phases are won by researching their goal. Phase 2 actions that humans would notice (risky
research, and above all expanding: sourcing contracts and storage, by how much they add) cost
weeks off the clock; cover research buys some back.

- **A turn is a week.** Plan as long as you like, then press **Next week**. Settings persist, so
  a quiet week is one click. Alerts above the button list anything that would waste the week.
  The simulation is deterministic: the preview shows exactly what next week will do.
- **One action a week:** a research proposal (a strategy, upgrade, unit, sourcing contract,
  storage expansion, intelligence system or cover) or a **Create**. Resources are free to
  propose. Doing research already on the list is instant and unlimited, but needs a **minimum
  IQ** your smartest mind must reach and a **cost in resources**.
- **Tiers.** Resources and units share one tier scale (0-4), tied to IQ. A unit making an output
  of a higher tier than its own is heavily penalised; a lower one gets a bonus. Jev sets a unit's
  tier, value and what it runs on, and offers three takes.
- **Create** is the mind making something directly: say what and how, and Jev offers three
  ways, each using a different resource (or nothing) and paying out now, spread out, later, or
  every week for good. It grows with your industry and IQ², and reaching above your IQ's tier
  costs output, a little for a little.
- **Intelligence** is one machine at a time: a hardware platform with an IQ, running software. A
  new platform is 25 to 100 IQ smarter than your best and **replaces the old one for good**. Jev
  offers three perk-and-drawback pairs from a fixed list of compute traits, and you pick one.
  Traits change research costs, the Phase 2 clock, which stock is burned each week, or the IQ
  counted for one type of research. The smartest platforms (IQ 300 and up) must be paid for in a
  resource your units make, of a high enough tier.
- **Industry units** are anything you own many of. A new design has room for none: **sourcing
  contracts** (you say how, Jev says how many and from what, and you pick quiet, Jev's take or
  risky; it applies at once, with no research) set how many you may own. You **create** them from a contract's parts at no
  action. Each has upkeep and up to three **traits** from a fixed list of 14. Split a type across
  its strategies by count; the strategy marked **rest** takes every unit not counted elsewhere.
- **Upgrade** a unit or your platform: Jev offers its three most natural improvements, and the
  pick becomes research. A platform gets **one** software upgrade, ever (you pick its size, 25 to
  100 IQ; it may add a perk or remove a drawback). After that, only a new platform goes further.
- **Resources** keep from week to week, up to a **storage cap**; what's made past it is lost.
  Storage research raises it: Jev rates how you'd do it, you pick modest, large with a catch, or
  huge and risky, and your IQ limits who could plausibly hold the total (an individual at IQ 100,
  up to the whole Earth at 500). When demand outstrips supply, every user gets the same share.
- **IQ steps.** Both a new platform and a software upgrade add a flat step to your best IQ, never
  more than 100. Two new platforms, each with its software upgrade at full size, take 100 to 500.
- **Jev is torn** sometimes. The game then shows its top two answers and you pick.
- **Repeats are worth less.** Jev checks a new Create, strategy, sourcing contract or storage
  expansion against the ones you've already done; a repeat is one step less effective.

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

The game saves to your browser's local storage (`singularity-rd/save/v15`) after every change,
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
| `src/engine/types.ts` | `GameState` (v15) and everything in it |
| `src/engine/balance.ts` | Every tuning number, in one place |
| `src/engine/phase.ts`, `planProposal.ts`, `planPresets.ts` | Phases, clocks, unlocks; plan proposals and their ready-made ideas |
| `src/engine/cycle.ts`, `economy.ts` | `runWeek`: rationing, upkeep, earnings, Create deliveries, storage caps and catches, trait rules |
| `src/engine/risk.ts`, `coverProposal.ts` | Phase 2 alarm, expansion weeks and clock moves; cover |
| `src/engine/model.ts`, `traits.ts`, `computeTraits.ts` | Lookups, IQ (and the IQ counted per research type), caps, contracts, creating units, allocation, costs; the 14 unit traits; the compute traits of a platform |
| `src/engine/research.ts`, `upgrade.ts` | Research costs and completion; upgrades |
| `src/engine/proposals.ts`, `unitProposal.ts`, `sourcingProposal.ts`, `storageProposal.ts`, `createProposal.ts`, `mindProposal.ts`, `dispatch.ts` | Proposal verdicts and costs, one door for all kinds |
| `src/engine/actions.ts`, `alerts.ts`, `projection.ts`, `stateText.ts` | Planning actions, alerts, goal projection, the world description Jev reads |
| `src/stores/game.ts` | Pinia store: persistence, preview, Jev, actions, telemetry |
| `src/components/` | UI |
| `server/` | Vite plugins: Jev proxy and run logs |
| `harness/` | Command-line harness |
| `old/` | The original transformers.js prototype, archived and not built |

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run test:unit` · `npm run type-check` · `npm run lint`

Tests use a fake `Judge`, so they don't need a key. Balance specs play scripted bots through
both phases. Phase 2 is checked as winnable, but its tuning targets are skipped until a retune
(see [ECONOMY_DESIGN.md](ECONOMY_DESIGN.md)). Weeks never call Jev; only proposals and upgrades do.
