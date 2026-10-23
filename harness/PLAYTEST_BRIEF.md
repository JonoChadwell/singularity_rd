# Playtest brief: playing Singularity R&D through the harness

You're playtesting a game by playing one complete game through its command-line harness, the
way a player would, and then reporting what happened. Your report goes to the developer, who
uses it to tune the game.

## Learn the game first

Read these, in this order, before your first command:

1. `MASTER_PLAN_V2.md`, section **Details** (D1 to D11): the phases, plans, clocks, risk,
   cover and the targets. This is the current design.
2. `NOTES.md` §10: the base mechanics (research has a minimum IQ and a cost in resources, one
   research proposal a week, passive incomes, upgrades, minds, industry).

Don't read the engine source (`src/`) to work out the best numbers. A player doesn't see it.
The harness prints everything a player sees on screen, and the rules docs are fair game.

## Playing

All commands run from the repository root, in Git Bash:

```
npm run play --silent -- <command> --slot <your-slot>
```

- `npm run play --silent -- help` lists every command and the JSON each proposal takes.
- Always pass your own `--slot`, so your game doesn't collide with anyone else's.
- Put JSON in single quotes: `propose income '{"name":"Freelance coding","description":"Take coding jobs.","outputId":"money"}'`.
- Start with `new`, then `plans` to see the three plan ideas, then `propose plan '<json>'` and
  `accept`. `status` shows everything; read it often.
- A proposal prints Jev's verdict. Settle it with `pick`, `trait`, `pushback`, then `accept`
  or `discard`. Upgrades: `upgrade mind <id>`, then `choose <n> [size]`. A platform gets one
  software upgrade, ever, and a new platform (`propose mind`, with a `step` of 25 to 100 IQ)
  replaces it for good; `option <n>` picks its perk-and-drawback pair.
- `research <id>` does a research now. `next [n]` plays up to n weeks, stopping early when
  something happens. Use it to skip quiet weeks, but make a real decision whenever one is
  there to make.
- Jev is a real model and each proposal costs a call. Don't reword the same idea over and
  over to fish for a better verdict; if you do it once or twice, say so in your notes.

Play until you win Phase 2, or lose. If you reach Phase 3 (Ascension), play three more weeks
and stop. Never edit code, saves or logs by hand.

## Keep notes as you go

Write running notes to `logs/playtests/<your-slot>.md` (create the folder if needed). For each
phase: the plan you chose and why; the week of each key decision; every verdict that surprised
you (plausibility, torn answers, risky or not and how many weeks); every change to the clock;
anything confusing, broken or dull. Notes are for the final report, so keep them short.

## Report

End with a report in this shape:

1. **Result.** For each phase: plan, outcome, week reached (and weeks into the phase).
2. **Numbers.** Proposals by kind; rejections and duplicates; pushback rounds; risky verdicts
   (how many, at which levels, how many you accepted); weeks lost to risk and to notices;
   weeks gained from cover; the longest run of weeks with no decision; Jev calls (from
   `status`).
3. **Bugs.** Anything that looked wrong, with the command that showed it.
4. **Friction.** Confusing output, rules you couldn't find, steps that felt like chores.
5. **Balance.** Was each phase's difficulty right? Which choices mattered? Was risk a real
   choice? Did cover matter?
6. **Fun** (if your brief asks for it):
   - **Scores, 1 to 5,** each with one line of why: Phase 1 fun; Phase 2 fun; how well the
     game engaged with your ideas; difficulty (1 too easy, 3 right, 5 too hard) for each
     phase; clarity.
   - **Ideas.** Did your inventions change how the game played, or were they names on the
     same numbers? Did Jev's verdicts feel like a response to what you wrote? Quote examples.
   - **Tension.** Did the clock ever worry you? Did risk and cover feel like choices?
   - **Best three moments and worst three moments,** with the week.
   - **Dull stretches:** which weeks, and why.
   - **The one change** you'd make first to make it more fun.

Keep your notes short and use `next n` through quiet weeks: these games are long.
