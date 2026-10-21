# Singularity R&D

A turn-based game about growing a fledgling AI into a singularity, where an AI judges your
ideas. Very meta. The design is in [MASTER_PLAN.md](MASTER_PLAN.md); the history and playtest
data behind it are in [NOTES.md](NOTES.md).

## How to play

You start as one unattended AI server in a research lab, with nothing at all: no resources, no
Money. Nothing is pre-made: every resource, income, unit, strategy and intelligence system is
something you propose and [Jev](https://openrouter.ai/docs/guides/community/typesafe-sdk)
judges. There is no way to win yet; that comes back later.

- **A turn is a week.** Plan as long as you like (propose, research, create units, assign, set
  build targets), then press **Next week**. Settings persist, so a quiet week is one click.
  Alerts above the button list anything that would waste the week. The simulation is
  deterministic: the preview shows exactly what next week will do.
- **Start with a passive income.** Propose a resource (say Money), then a passive income that
  yields it (say Freelance coding). It's research; once done it adds a fixed amount every week
  with no units. More income takes a new proposal.
- **One research proposal a week.** Accepting a strategy, passive income, upgrade, unit or
  intelligence system uses it; resources are free to propose. Doing research already on the
  list has no weekly limit: it's instant, and needs only a **minimum IQ**, never below 100, that
  your smartest mind must reach, and a **cost in resources**: Jev picks which of the stocks you
  have it uses up, and the value model sets how much. With nothing to spend, it's free.
- **Intelligence systems** are single machines: a hardware platform with an IQ, running
  software. They have no count, upkeep or strategies. A new one must be smarter than your best,
  and becomes the next compute tier.
- **Industry units** are anything you own many of. Every unit is research first, even one that
  exists today. Once designed, you **create** them from their parts, as many as you can afford;
  there are no caps. A builder unit or a Self-replicating one can also build them with a build
  strategy. Each has upkeep and up to three **traits** from a fixed list of 16; perks make it
  dearer to make and drawbacks cheaper. Split a type across its strategies by count; the
  strategy marked **rest** takes every unit not counted elsewhere.
- **Upgrade** any unit or mind: Jev offers its three most natural improvements (better software,
  new hardware, less upkeep or parts, a perk, a better strategy…). Pick one and it becomes
  research.
- **Resources** are stocks (keep) or flows (made and used within a week; lost unless something
  Stores them). When demand outstrips supply, every user gets the same share.
- **The leap rule.** Designing a mind needs a mind with about half its target IQ, and software
  can raise IQ to 1.5× the hardware's and no further.
- **Pushback.** When a unit's recipe is too thin for what it claims, Jev names the missing kinds
  of part (an advanced component, a special power source, …) and you supply or invent them.
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

The game saves to your browser's local storage (`singularity-rd/save/v8`) after every change,
including Jev's answers, so the same proposal always gets the same verdict.

### Run logs

While the dev server is running, every game is logged to `logs/runs/<runId>/` (gitignored), one
JSON-lines file per stream, one event per line:

- `game.jsonl`: `game_start`, `week` (the week's report, log lines, alerts left unanswered and a
  state snapshot), `proposal`, `upgrade_offer`, `accept`, `pushback`, `action` (creating units,
  assigning, build targets, research), `game_end` or `game_abandoned`.
- `jev.jsonl`: raw Jev traffic as `jev` events (`purpose`, request, response and latency). The API
  key is never logged.
- `ui.jsonl`: dialogs opening and closing, verdicts shown, tab changes, notices and errors shown.
- `errors.jsonl`: crashes (Vue, uncaught, unhandled promises) and store actions that threw, with
  stack traces.

### Command-line harness

`npm run play -- <command>` plays the game without the browser: same engine, the real Jev
(using the key in `.env.local`), and the same run log. The game is saved in
`logs/harness/<slot>.json` between commands (`--slot <name>`, default `claude`).

```sh
npm run play -- new
npm run play -- propose resource '{"name":"Money","description":"Dollars in anonymous accounts."}'
npm run play -- accept
npm run play -- propose income '{"name":"Freelance coding","description":"","outputId":"money"}'
npm run play -- accept                         # becomes research
npm run play -- research freelance-coding
npm run play -- upgrade mind starting-server   # Jev's three options
npm run play -- choose 2                       # becomes research
npm run play -- next 10     # up to 10 weeks, stopping when something happens
npm run play -- status
```

`npm run play -- help` lists every command: proposals and their verdicts (pick, trait,
pushback, accept), upgrades, research, creating units, assigning, build targets, and the week.

## Code map

| Path | What |
| --- | --- |
| `src/ai/jev.ts` | Jev client, `Judge` interface, typed readers, torn-answer detection, `CachedJudge` |
| `src/engine/types.ts` | `GameState` (v8) and everything in it |
| `src/engine/balance.ts` | Every tuning number, in one place |
| `src/engine/traits.ts` | The 16 traits |
| `src/engine/model.ts` | Lookups, formatting, IQ, labour, creating units, task allocation, costs |
| `src/engine/economy.ts` | The week: rationing, upkeep, crew, builds, minds' earnings, trait rules |
| `src/engine/research.ts` | Research costs, strategy rates, applying upgrades, finishing research, repeat costs |
| `src/engine/cycle.ts` | `runWeek`: one turn, plus milestones |
| `src/engine/actions.ts` | Planning actions: create units, assign, build targets, overclock, research |
| `src/engine/alerts.ts` | Alerts and wall prompts above the Next week button |
| `src/engine/proposals.ts` | Shared verdict machinery and costs; resource and strategy proposals |
| `src/engine/unitProposal.ts` | Industry unit proposals, traits, pushback |
| `src/engine/mindProposal.ts` | Intelligence system proposals and the leap rule |
| `src/engine/incomeProposal.ts` | Passive income proposals |
| `src/engine/upgrade.ts` | Upgrades: the candidate list, Jev's three options, applying one |
| `src/engine/stateText.ts` | The world description Jev reads |
| `src/stores/game.ts` | Pinia store: persistence, preview, Jev, actions, telemetry |
| `src/components/` | UI: Next week, panels, unit and mind cards, proposal and upgrade dialogs, verdicts |
| `server/` | Vite plugins: Jev proxy and run logs |
| `harness/` | Command-line harness: `play.mjs` loads `cli.ts` through Vite |
| `old/` | The original transformers.js prototype, archived and not built |

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run test:unit` · `npm run type-check` · `npm run lint`

Tests use a fake `Judge`, so they don't need a key. `src/engine/__tests__/balance.spec.ts`
checks some balance targets with scripted play. Weeks never call Jev; only proposals and
upgrades do.
