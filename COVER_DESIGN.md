# Cover

Cover is how the AI buys time. Each phase's plan fails its own way when the clock runs out
(see `losses.ts`), and cover moves that day further off. This file replaces MASTER_PLAN_V2.md
§D7. All the numbers are in [src/engine/balance.ts](src/engine/balance.ts) (`COVER`,
`COVER_MAX`, `PHASE_WEEKS`).

## Why cover is there

- **Phase 1 (6 weeks).** Cover is the tutorial's lesson about the clock. One cover can turn 6
  weeks into 12, but small cover needs IQ 125, so the server's software upgrade comes first. A
  sharp player can win without it; a typical one will use it.
- **Phase 2 (80 weeks).** Cover is the counterweight to risk and expansion, which take weeks off
  the clock. It's worth using two or three times a game, not every week.
- **Phase 3.** There is no clock, so cover is locked ("Nobody is watching any more").

## How it works

You name a cover and say how it works. Jev judges two things:

- whether it's plausible (bar 0.3, which sets the usual cost multiplier);
- which stock would pay for it.

Jev no longer judges how convincing a cover is: the three options set its size instead.

| Size | Needs IQ | Adds | Costs (worth) |
| --- | --- | --- | --- |
| Small | 125 | 6 weeks | 2,000 |
| Medium | 250 | 12 weeks | 20,000 |
| Large | 400 | 18 weeks | 200,000 |

**Three options, like other research.** The options depend on your IQ for cover (`coverSize`):

- **Two at your size**, which is the biggest size your IQ reaches. One is paid in Jev's
  favourite payer and the other in its second.
- **One a size up**, paid in the favourite.
- **At IQ 100**, before the server's upgrade, no size is in reach, so your size counts as small.
- **At the top size (IQ 400+)**, the third option is one size down instead (two large and one
  medium), for a player who wants the cheaper one.

The IQ for cover is the one research uses, so the Deceiver (+50) and Honest to a fault (−50)
compute traits move the size.

**Save or apply.** Cover goes through the same banking as storage and units
(`banking.ts`):

- **Save For Later** banks all three options for one action. They are alternatives, so doing one
  drops the others.
- **Apply now** takes one option and researches it at once, if your IQ and stocks allow.

Cover is never risky.

**Fixed price.** Each size costs a fixed worth, priced by `priceCost`. So, as with all research,
Phase 1 pays `PHASE1_RESEARCH_COST` (×0.3): small cover costs 600 there. Before this design,
cover was priced on the current week's output. That made banking it early a trick, and was
why cover used to be "used the moment it's accepted".

**Caps instead of decay.** A phase allows **1 cover in Phase 1 and 3 in Phase 2**
(`COVER_MAX`). Saved covers count against the cap, so you can't bank more than you could
use (`coversLeft`).

There is no decay. The old rule shrank each cover by ×0.7 but never below 1 week. Since a
1-week cover cost the week's action and about ¼ of a week's output, a player could hold the
clock still forever. `researchBlocker` refuses cover research once the phase's cap is reached.

**Phase changes.**

- Winning a phase drops any cover still saved in Research and resets the count (`winPhase`).
- A Phase 1 cover dropped this way leaves a memo in Phase 2 (`phase.droppedCover`, card
  `cover-dropped`). Nothing else warns about it.
- From Phase 2 to 3, cover is dropped silently.

## What else moves the clock

- Risky research and actions (the alarm question, Phase 2 only): −2, −4 or −8 weeks.
- Sourcing contracts and storage expansions (Phase 2 only): weeks by how much they add.
- A platform's clock compute traits: ±6 weeks, once, when it arrives. Phase 1 has no new
  platforms, and clock traits are kept out of software upgrades.

So in Phase 1 the clock moves only one way, through cover.

## Wording

Each plan has its own loss condition, so text about the clock stays generic. It says "the plan
fails" or "time runs out", never "you're discovered" or "humans stop you". Name the loss only
through `lossOf(state)`.

## Tuning targets and current results

Bot report (`BOT_REPORT=1`), 2026-10-27:

- **Phase 1:** idle loses at week 6. `flat` and `smart` win in weeks 4–5, `chain` and `chain2`
  in weeks 5–6, and `covered` wins every approach (week 7 when it covers).
  - Bots win sooner than people do, because they never lose plausibility penalties the way a
    real player does keeping Jev happy. So Phase 1 is not made harder to force the cover.
- **Phase 2:** not tuned. At 80 weeks the steady bot wins brilliant and scale-heavy plans
  (weeks 43–48) but loses the balanced one in week 76. Its Phase 2 tests are skipped until a
  retune; the targets there are scaled to 80 weeks (40–64 weeks used).

## Open questions

- Are the cover worths right? Medium (20k) and large (200k) are guesses scaled to IQ and
  industry growth, and need playtests.
- Should Phase 1 cover be limited to small? Deceiver can make medium reachable there
  (IQ 200 + 50).
- Phase 2 needs a retune for the 80-week clock.

## Code

| Where | What |
| --- | --- |
| `src/engine/coverProposal.ts` | Jev's questions, `coverSize`, `coverOptions` |
| `src/engine/banking.ts` | Cover options as research (save or apply) |
| `src/engine/phase.ts` | `lockReason('cover')`, `coversLeft`, `pendingCovers`, dropping at `winPhase`, the memo |
| `src/engine/research.ts` | The cover effect: moves the clock, counts the cover |
| `src/engine/actions.ts` | `researchBlocker`: no cover past the cap |
| `src/engine/presets.ts` | `LAB_COVER_PRESETS` (Phase 1), `COVER_PRESETS` (Phase 2), `coverPresets` |
