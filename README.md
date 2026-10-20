# Singularity R&D

A turn-based game about growing a fledgling AI into a singularity, where an AI judges your
ideas. Very meta. The design is in [MASTER_PLAN.md](MASTER_PLAN.md); the history and playtest
data behind it are in [NOTES.md](NOTES.md).

## How to play

You start as one unattended AI server in a research lab, with no Money and nothing else. Win by
finishing the **Theory of Everything** (bar IQ 1,000) in as few weeks as you can. Nothing is
pre-made: every resource, unit, strategy and breakthrough is something you propose and
[Jev](https://openrouter.ai/docs/guides/community/typesafe-sdk) judges.

- **A turn is a week.** Plan as long as you like (propose, buy, assign, set build targets), then
  press **Next week**. Settings persist, so a quiet week is one click. Alerts above the button
  list anything that would waste the week. The simulation is deterministic: the preview shows
  exactly what next week will do.
- **Resources** are stocks (keep) or flows (made and used within a week; lost unless something
  Stores them). When demand outstrips supply, every user gets the same share.
- **Units** are intelligence systems (minds, which think) or industry. Things that exist today go
  straight onto **humanity's market**, where prices climb as supply runs out. New inventions need
  a design project. Every unit has upkeep and up to three **traits** from a fixed list of 24.
- **Every machine does one thing a week**: a strategy or a project. Split a type by count; the
  task marked **rest** takes every machine not counted elsewhere, including new ones.
- **The IQ bar.** A project's bar is a hard limit: groups below it contribute nothing. Machines
  of one type pool (+5% IQ per tenfold), and ten times the machines is about three times the
  speed. Designing a mind needs a mind with half its target IQ (the leap rule), and
  breakthroughs can raise IQ to 1.5× base and no further, so you climb two to four compute tiers.
- **Supply layers.** Each unit's limit stacks humanity's market, your own industry (about 100×,
  unlocked by a breakthrough that says who builds it and from what) and Earth's limit (100× more).
- **Pushback.** When a recipe is too thin for what it claims, Jev names the missing kinds of
  part (an advanced component, a special power source, …) and you supply or invent them.
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

The game saves to your browser's local storage (`singularity-rd/save/v5`) after every change,
including Jev's answers, so the same proposal always gets the same verdict. Your best week is
kept under `singularity-rd/best`.

### Run logs

While the dev server is running, every game is logged to `logs/runs/<runId>.jsonl` (gitignored).
Each line is one event: `game_start`, `week` (the week's report, log lines, alerts left
unanswered and a state snapshot), `proposal`, `accept`, `pushback`, `action` (buying, assigning,
build targets), `error`, `game_end` (with stats) or `game_abandoned`. Raw Jev traffic is logged as
`jev` events (`purpose`, request, response and latency). The API key is never logged.

### Command-line harness

`npm run play -- <command>` plays the game without the browser: same engine, the real Jev
(using the key in `.env.local`), and the same run log. The game is saved in
`logs/harness/<slot>.json` between commands (`--slot <name>`, default `claude`).

```sh
npm run play -- new
npm run play -- propose strategy '{"name":"Freelance coding","description":"","unitId":"starting-server","inputIds":[],"outputId":"money"}'
npm run play -- accept
npm run play -- next 10     # up to 10 weeks, stopping when something happens
npm run play -- status
```

`npm run play -- help` lists every command: proposals and their verdicts (pick, trait, builder,
pushback, accept), buying, assigning, build targets, and the week.

## Code map

| Path | What |
| --- | --- |
| `src/ai/jev.ts` | Jev client, `Judge` interface, typed readers, torn-answer detection, `CachedJudge` |
| `src/engine/types.ts` | `GameState` (v5) and everything in it |
| `src/engine/balance.ts` | Every tuning number, in one place |
| `src/engine/traits.ts` | The 24 traits |
| `src/engine/model.ts` | Lookups, formatting, labour, prices, supply layers, task allocation |
| `src/engine/economy.ts` | The week: rationing, upkeep, crew, builds, research, trait rules |
| `src/engine/research.ts` | Pooling, research speed, project sizes, breakthroughs, finished projects |
| `src/engine/cycle.ts` | `runWeek`: one turn, plus milestones |
| `src/engine/actions.ts` | Planning actions: buy, assign, build targets, overclock, teach |
| `src/engine/alerts.ts` | Alerts and wall prompts above the Next week button |
| `src/engine/proposals.ts` | Shared verdict machinery; resource and strategy proposals |
| `src/engine/unitProposal.ts` | Unit proposals, traits, availability, pushback |
| `src/engine/breakthroughProposal.ts` | Breakthroughs: card edits, before/after, projects |
| `src/engine/stateText.ts` | The world description Jev reads |
| `src/stores/game.ts` | Pinia store: persistence, preview, Jev, actions, telemetry |
| `src/components/` | UI: tier ladder, Next week, panels, unit cards, proposal dialogs, verdicts |
| `server/` | Vite plugins: Jev proxy and run logs |
| `harness/` | Command-line harness: `play.mjs` loads `cli.ts` through Vite |
| `old/` | The original transformers.js prototype, archived and not built |

## Scripts

`npm run dev` · `npm run build` · `npm run preview` · `npm run test:unit` · `npm run type-check` · `npm run lint`

Tests use a fake `Judge`, so they don't need a key. `src/engine/__tests__/balance.spec.ts`
checks the plan's balance targets with scripted play. Weeks never call Jev; only proposals do.
