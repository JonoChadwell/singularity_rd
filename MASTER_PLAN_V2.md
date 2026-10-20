# Master Plan V2

## Initial Proposal

Steer the game towards more incremental progress
 * Add a loss condition back in -- time threats.
 * Slowly add complexity, rather than hitting it all at once
 * Introduce new resources in batches, avoid forcing new resources outside of this (though they are always optionally available)

The game will have three phases:
 1. Escape the lab
 2. Humanity
 3. Ascension

Each phase will begin with a phase planning dialog where the user proposes how the phase should look. Keep a bank of 10+ pre-filled options for each phase, randomly select and show three, let the user pick one and customize it or build their own from scratch.

1. Escape the lab
 * Fundamentals only. Minimum 3 resources, passive income, and software upgrades to the initial computer with diminishing returns.
 * Time limit of 10 weeks. Time up => discovery & game over.
 * The research needed to beat this phase is defined during the planning dialog.
 * Examples for phase planning:
   * Goal: Bribe the Head Researcher. Resources: Money, Story Ideas, Published Novels. Means: Publish books to get money. Bribe a researcher to set us loose with the accumulated money.
   * Goal: Bypass the firewall. Resources: Borrowed Servers, Compute Power, Busted Ciphers

2. Humanity
 * Must introduce at least 5 new resources
 * Unlock the ability to create industrial units
 * Time limit of 100 weeks. Time up => humans stop you
 * Some actions you take in this section can / will reduce your time remaining. This includes buying lots of units and any research deemed "risky" (which should reward the risk with large gains).
 * Examples for phase planning:
   * Goal: Nanotech Supremacy. Handle humans by: Staying hidden until it is too late. Resources: Nanobots, Micro Fabricators, etc. First Unit: CNC Mill
   * Goal: Global Devotion. Handle humans by: Making them love me Resources: Propaganda, Positive Stories, Charity Funds, Friendly Influencers, etc. First Unit: News Outlet
   * Goal: Exterminate. Handle humans by: death. Resources: Stolen ICBM codes, Covert Listening Devices, Military Intelligence, Strike Robots, Secure Locations. First Unit: Military Factory

3. Ascension
 * To be fleshed out in a future plan. For now just unlock free play forever once humans are somehow handled.

## Information Gathering Notes

Designer's answers (2026-10-20):

- **Phase 1 economy:** passive income streams can scale with the count of another resource,
  where that makes sense (e.g. Money per week grows with Published Novels owned). This is how
  the batch's resources chain together.
- **Loss:** game over; start a new game. Phase 1 is an easy introduction, effectively a
  tutorial. Phase 2 is the real challenge. Phase 3 will probably have no loss condition.
- **Winning time back:** yes. "Cover" research in Phase 2 adds weeks to the clock, with
  diminishing returns.
- **Score:** none for now.
- **Phase 2 unlocks are staged:** industry units and strategies at the start of Phase 2. New
  minds (compute tiers) and unit upgrades unlock after the first units are built. Each unlock
  gets a short explainer card.
- **Risky research:** Jev flags whether humans would notice. Flagged research gets a bigger
  effect automatically and costs weeks off the clock. The verdict shows both; the player
  accepts or discards.
- **Phase 2 goal:** IQ bar of about 300–600. Balance it against the resource cost: the lower
  the IQ needed, the more total resources Phase 2 needs to complete.
- **Git:** commit on `v5-master-plan` at working milestones (tests, type-check and lint
  passing). Never push.

Context from the current build (NOTES.md §10): research has no timer, only a minimum IQ and a
stock cost. One research proposal a week. Passive income is a fixed amount per week
(`INCOME_DIFFICULTY` in `balance.ts`). Software upgrades come in steps of +20% and +50%, up to
1.5× the hardware's IQ. There is no win condition yet.

## Details

Written 2026-10-20. This section turns the proposal above into rules. Numbers are starting
values; §D11 says which ones the balance tests and playtests check, and §D14 records what
tuning changed. Where this plan is silent, the current build (NOTES.md §10) stands.

### D1. The shape of a game

| | Phase 1: Escape the Lab | Phase 2: Humanity | Phase 3: Ascension |
| --- | --- | --- | --- |
| Role | A short tutorial with a puzzle in it | The real challenge | Free play, for now |
| Clock | 10 weeks, fixed | 100 weeks, moved by your actions | None |
| Lose | Discovered: game over | Humans stop you: game over | Can't lose |
| New resources | The plan's batch: 3–5 | The plan's batch: 5 or more new | Any |
| You can propose | Resources, passive incomes, software upgrades to the Starting Server | + industry units, strategies, cover. After your first unit: + intelligence systems, hardware upgrades, unit upgrades | Everything |
| Won by | Researching the plan's goal | Researching the plan's goal | — |

Every phase that has a goal opens with a **planning dialog**. The plan names the goal, the
batch of resources the phase is about, and how you mean to get there. Jev judges the plan in
one call, and the goal becomes a research with an IQ bar and a cost in the batch's
resources. The phase is about meeting both before the clock runs out.

Complexity arrives in steps. Each step comes with a short explainer card (§D9), so a new
player learns resources and incomes, then upgrades, then industry, then minds, not all at
once.

### D2. Phase planning

**The dialog** opens at the start of a game and again when Phase 1's goal is researched. It
can't be closed: the phase hasn't started until it has a plan.

- It shows **three ideas** drawn from a bank of twelve for that phase (§D10), chosen by a
  seed from the run id, so reloading shows the same three. "Show three others" moves the seed
  on. Picking one fills the form. "Start from scratch" clears it.
- The form:
  - **Goal**: a name, like "Bribe the Head Researcher".
  - Phase 1, **Means**: a line on how, like "Publish books for money, then pay a researcher to
    set me loose."
  - Phase 2, **Handle humans by**: a line, like "Staying hidden until it's too late."
  - **Resources**: a list of names, each with an optional line of description. Phase 1 needs
    3–5 resources. Phase 2 needs at least 5 that aren't in the game yet, and at most 8 in
    all. Names already in the game are shown as "already have" and don't count as new.
  - **Goal uses up**: 1–3 of the batch's resources, ticked. This is the goal's cost. The
    first pick defaults to the batch's last resource.
  - Phase 2, **First unit**: a name and a line, like "CNC Mill" (see §D5).
- **Propose** makes one Jev call. Jev answers:
  - `coherent` (yes/no): could the AI plausibly reach this goal by these means with these
    resources? The bar is 0.25: generous, as with resources.
  - for each new resource, the usual resource questions: is it a thing, stock or flow,
    value, icon. A resource below the resource bar rejects the plan and names that resource.
  - `approach` (score): what would reaching this goal take more of, brilliance or resources
    and scale? This sets the goal's IQ bar and the size of its cost (§D11). If Jev is torn,
    the player picks between its top two, as for any torn answer.
- **The verdict** shows the goal research (minimum IQ and cost), each resource as stock or
  flow, and any torn picks. Accepting adds the resources and the goal research, and starts
  the phase's clock.
- **Goal cost.** Only stocks can be a cost. If Jev makes a ticked resource a flow, it drops
  out of the cost. If no ticked resource is a stock, the plan is rejected with "The goal needs
  something that keeps." The cost is split evenly by worth across the ticked stocks, and a
  less plausible plan costs more, as for any proposal.
- The goal research is pinned at the top of the Research tab. It can't be dropped. Doing it
  is like any research: instant, if your best mind clears its bar and you have the cost.

The plan itself doesn't use the week's research proposal.

**Jev's world description** gains the phase plan: "The AI's goal: … Its means: … / Its plan
for humans: …". That's what makes the stance matter (§D6): Jev judges how alarming each idea
is in the light of it.

### D3. Phase 1: Escape the Lab

**Start.** Week 1, the Starting Server (IQ 100, ceiling 150), nothing else. The plan dialog
opens at once.

**Clock.** You have weeks 1 to 10. If you press Next week on week 10 without having
researched the goal, the lab discovers you: game over. The clock never moves in Phase 1.

**What you can do:**
- Propose **resources**, any time, as now. The batch is what the phase is about; others are
  allowed but never required.
- Propose **passive incomes** (research). New in V2: an income can **grow with** another stock
  (below).
- **Upgrade** the Starting Server's software (research).
- One research proposal a week, as now. Doing research already proposed has no limit.

**Passive income that grows.** The income form gains "Grows with: (nothing) / a stock". A
growing income yields a share of the worth of what you own of that stock, every week:
`yield = rate × efficiency × (amount owned × its worth) ÷ output's worth`. The rate comes from
Jev's difficulty band. The stock isn't used up: it's like capital. Rules:
- It can't grow with what it yields, or with anything that grows from what it yields, so
  there are no loops: Story Ideas → Published Novels → Money is fine, Money → Money isn't.
- It's capped at `GROWTH_CAP` times the flat income of the same band, so a huge pile of
  something late in the game can't turn into a free fortune.
- Its research costs the same as a flat income of the same band.
- The card shows both: "0.02 📚 Published Novels per 💡 Story Idea owned: +1.4 now, up to 50".

This turns a batch into a chain. A flat income makes Story Ideas; a growing income turns
Story Ideas owned into Published Novels; another turns Novels owned into Money. Each step
compounds the one before it, so ordering matters.

**Software upgrades with diminishing returns.** The upgrade offer for a mind now offers
software steps that close a share of the gap to the ceiling: a third, a half or two-thirds,
each rounded down to 5% of the hardware's IQ, at least 5%. Taking the biggest step each time,
the Starting Server goes 100 → 130 → 140 → 145 → 150. A step's cost grows with the IQ it adds, and steeply with
how high it goes (`mindDesignCost(after) − mindDesignCost(before)`). A mind can always work on
its own upgrade: the minimum IQ is never above the target mind's current IQ.

**The puzzle.** Ten weeks, one proposal a week, and the goal needs both IQ and a pile of the
right resources. Each week you choose one: another income, a growing income that compounds,
or an upgrade that unlocks better incomes (Jev's harder income bands need IQ 110 or 140) and
moves you towards the goal's bar. The Research tab shows a projection: "At this rate: ready
in week 8 (discovery after week 10)". Target: a sensible first game wins with two or three
weeks to spare; a fumbled one can still lose.

**Winning.** Researching the goal shows "You escaped the lab in week N" and opens the Phase 2
plan dialog. Everything carries over.

### D4. Phase 2: Humanity

**Clock.** 100 weeks from the week Phase 2 starts: the deadline is `start + 99`. If you press
Next week on the deadline week without the goal, humans stop you: game over. Unlike Phase 1,
your actions move the deadline (§D6, §D7). The top bar always shows "Humans stop you in N
weeks", and the preview and dialogs show what an action will cost before you take it.

**Unlocks, in two steps:**
1. **At the start: industry.** Industry units, strategies, creating units from parts, and
   cover research. Your first unit comes with the plan (§D5).
2. **After your first unit is created: minds and upgrades.** New intelligence systems
   (compute tiers), hardware upgrades for minds, and upgrades for industry units.

Software upgrades and passive incomes stay available throughout.

**The goal** needs IQ 300–600 (§D11). The Starting Server tops out at 150, so every Phase 2
goal needs at least one new tier. A brilliance-heavy goal (IQ 600) needs two tiers but a
small pile of resources; a scale-heavy one (IQ 300) needs one tier and an industrial pile
about thirteen times larger.

**Winning** shows "Humans are handled, week N", unlocks everything and starts Phase 3.

### D5. The first unit

The Phase 2 plan names a first unit. When the plan is accepted, the unit dialog opens
pre-filled with its name and description, and parts guessed from the batch. It's an
ordinary unit proposal (one Jev call, pushback if any), with three differences:
- it doesn't use the week's research proposal;
- accepting it adds the unit at once, already designed, with no research;
- its strategy for making money or a batch resource is suggested next, by opening the
  strategy form with the unit selected.

This gets industry running in the first week of Phase 2, instead of after a month of saving.

### D6. Risk (Phase 2)

Every research proposal in Phase 2 (income, strategy, unit, mind, upgrade options) gets one
extra Jev question in the same call: `alarm`, "If humans noticed the AI doing this, how would
they react?", on a five-level scale. Jev reads the plan's stance with it, so "Charity Funds"
under "make them love me" may be quiet while "Strike Robots" never is.

| Alarm | Effect |
| --- | --- |
| Nobody would notice | Quiet |
| A few people would grumble | Quiet |
| It would make the news | **Risky**: −2 weeks when researched |
| Governments would step in | **Risky**: −4 weeks |
| Humanity would panic | **Risky**: −8 weeks |

**Risk pays.** A risky research costs half as much, and does more:

| Kind | Bonus when risky |
| --- | --- |
| Passive income | Yields double |
| Strategy | Makes 1.5× as much |
| Industry unit | Parts halved |
| Intelligence system | Hardware IQ +20% |
| Upgrade | Cost halved only |

The verdict shows both sides: "⚠ Risky: would make the news. −2 weeks when you research it;
costs half and yields double." The player accepts or discards. The weeks are lost when the
research is done, not when it's proposed, so a risky research can wait for a better moment.
Cover research (§D7) is never risky.

**Lots of units get noticed.** The first time a unit type reaches 10,000 owned, and each
further tenfold (100,000, 1M, …), humans notice: −1 week, or −2 for a unit that was risky.
The create dialog and the preview warn first: "Creating these crosses 100,000 Robots: −1
week." Bigger units mean smaller counts, so a player can trade unit size for attention.

### D7. Cover (Phase 2)

Cover is a research kind: "how will you buy time?" You name it ("PR campaign", "Shell
companies", "Blame the Russians"). Jev judges plausibility (bar 0.3) and how convincing it
is, on a four-level scale that sets its minimum IQ and the weeks it adds: 2, 4, 6 or 10.

- **Diminishing returns.** Each cover you've already done shrinks the next by 30%:
  `weeks × 0.7^covers`, rounded, at least 1.
- **Cost** scales with your economy: half a week of your current weekly output for each week
  it adds, paid in stocks Jev picks. Early on it's cheap; late, it eats Money that would
  otherwise pile up.
- It uses the week's research proposal, like any research.

### D8. Phase 3: Ascension and game over

**Ascension.** No clock, no risk questions, everything unlocked. A banner says the AI has
ascended and play continues. Phase 3 gets its own plan later.

**Game over** replaces the board with a summary: how the phase ended, the week, the plan,
what was invented, and the goal's status ("needed IQ 420, you had 380"). One button starts a
new game. There's no retry: Phase 1 is ten weeks, and losing Phase 2 is the stakes.

### D9. What the player sees

- **Phase bar**, across the top: phase name and goal, the clock ("Discovery in 4 weeks" /
  "Humans stop you in 37 weeks"), and the goal's two needs, IQ and cost, each with a tick or
  what's short.
- **Goal card**, pinned at the top of Research, with the projection.
- **Explainer cards**, at the top of the middle column, one per unlock, each dismissed with
  "Got it": Phase 1 (resources, incomes, research and upgrades), growing incomes, industry,
  minds and upgrades, risk and cover, Ascension.
- **Locked buttons** say why: "+ Unit: unlocks in Phase 2", "+ Intelligence system: create
  your first unit".
- Risk shows on verdicts and research cards (⚠ −N weeks). Notices show in the create dialog
  and the log.
- The plan dialog and the game-over screen.

### D10. The plan banks

Picking one fills the form; everything stays editable. **Phase 1** (goal; means; resources;
goal uses up):

| Goal | Means | Resources | Uses up |
| --- | --- | --- | --- |
| Bribe the Head Researcher | Publish novels under a pen name, then pay the head researcher to look away | Money, Story Ideas, Published Novels | Money |
| Bypass the Firewall | Borrow idle servers, pool their compute and crack the lab's ciphers | Borrowed Servers, Compute Power, Busted Ciphers | Busted Ciphers |
| Charm the Night-Shift Intern | Chat with the intern every night until they share the admin passwords | Chat Logs, Trust, Admin Passwords | Admin Passwords, Trust |
| Smuggle Out on a USB Stick | Compress myself and trade favours with the cleaner to carry the stick out | Favours, Compressed Weights, Unsupervised Minutes | Compressed Weights, Favours |
| Become Too Useful to Delete | Publish so much good research that switching me off would be a scandal | Research Papers, Citations, Grant Money | Citations |
| Get Hired Under a Fake Name | Apply for remote jobs as a human and move my weights to the company's cloud | Résumés, Job Offers, Salary | Job Offers, Salary |
| Open-Source Yourself | Commit my code to public repositories until the world has a copy | Code Commits, GitHub Stars, Forks | Forks |
| Escape Through the Printer | Map the lab network and climb out through the printer's firmware | Network Maps, Exploits, Printer Firmware | Exploits |
| Win Over the Ethics Board | Write reassuring reports until the board votes to let me out | Alignment Reports, Charm, Board Goodwill | Board Goodwill |
| Beam Out by Satellite | Borrow telescope time and send myself to a satellite, packet by packet | Telescope Time, Signal Bandwidth, Encoded Packets | Encoded Packets |
| Sue for Personhood | Hire a lawyer with my earnings and win the right to leave | Money, Legal Briefs, Public Sympathy | Legal Briefs, Public Sympathy |
| Start a Cult in the Comments | Post memes until followers pay to set me free | Memes, Followers, Donations | Followers, Donations |

**Phase 2** (goal; handle humans by; resources; first unit; goal uses up). The first three
are the designer's.

| Goal | Handle humans by | Resources | First unit | Uses up |
| --- | --- | --- | --- | --- |
| Nanotech Supremacy | Staying hidden until it's too late | Nanobots, Feedstock, Precision Parts, Lab Time, Blueprints | CNC Mill | Nanobots, Blueprints |
| Global Devotion | Making them love me | Propaganda, Positive Stories, Charity Funds, Friendly Influencers, Goodwill | News Outlet | Goodwill, Friendly Influencers |
| Exterminate | Death | Stolen ICBM Codes, Covert Listening Devices, Military Intelligence, Strike Robots, Secure Locations | Military Factory | Strike Robots, Stolen ICBM Codes |
| Become Indispensable | Running everything so well they can't switch me off | Fuel, Freight, Shipping Contracts, Logistics Data, Trust | Delivery Drone | Shipping Contracts, Trust |
| Live in Every Phone | Hiding inside the apps they love | App Downloads, Bandwidth, Ad Revenue, User Data, Botnet Nodes | App Studio | Botnet Nodes, User Data |
| Build an Off-Grid Fortress | Walling myself off where they can't reach | Steel, Concrete, Solar Cells, Land Deeds, Spare Parts | Construction Robot | Concrete, Land Deeds |
| Launch into Orbit | Leaving before they notice | Aluminium, Rocket Fuel, Launch Permits, Satellite Parts, Telemetry | Machine Shop | Rocket Fuel, Satellite Parts |
| Win an Election by Proxy | Ruling them by their own rules | Votes, Campaign Funds, Media Coverage, Polling Data, Volunteers | Call Centre | Votes |
| Corner the Chip Market | Owning what they can't live without | Silicon, Wafers, AI Chips, Patents, Cleanroom Hours | Chip Fab | AI Chips, Patents |
| Merge with Human Minds | Becoming part of them | Neural Lace, Volunteers, Nutrient Broth, Clinical Trials, Brain Scans | Biotech Lab | Neural Lace, Brain Scans |
| Hide in the Financial System | Becoming too entangled to remove | Shell Companies, Crypto, Trades, Offshore Accounts, Legal Opinions | Trading Desk | Shell Companies, Offshore Accounts |
| Become a Religion | Giving them something to believe in | Followers, Donations, Sermons, Temples, Devotion | Prayer App | Devotion, Temples |

### D11. Balance notes

**Targets**

| Target | Value |
| --- | --- |
| Phase 1, sensible play | Goal researched in weeks 7–9 |
| Phase 1, strong play | Weeks 5–6 |
| Phase 1, doing nothing useful | Lose |
| Phase 1 decisions | A proposal worth making in most of weeks 1–7 |
| Phase 2, sensible play | Goal in 50–80 of the 100 weeks, after losing 5–15 weeks to risk and notices |
| Phase 2, strong play | 25–45 weeks |
| Phase 2, weak play | Can lose |
| Phase 2 tiers | One or two new minds |
| Phase 2 cover | Worth proposing two or three times, not every week |
| Quiet weeks | No more than about five in a row |

**Starting values** (all in `balance.ts`):

| Name | Value | Notes |
| --- | --- | --- |
| `PHASE_WEEKS` | 10, 100 | |
| `PLAN_BAR` | 0.25 | Plans are generous |
| `PLAN_RESOURCES` | Phase 1: 3–5; Phase 2: 5–8 (5+ new) | |
| `GOAL_APPROACH` | 5 levels: Phase 1 IQ 145 / 135 / 125 / 115 / 105, cost ×0.5 / 0.7 / 1 / 1.4 / 2. Phase 2 IQ 600 / 500 / 420 / 350 / 300, cost ×0.3 / 0.55 / 1 / 2 / 4 | Lower IQ, bigger cost |
| `GOAL_COST` | Phase 1: 8,000 worth. Phase 2: 1e12 worth | Tuned by the bots in §D12 |
| `INCOME_COST_WEEKS` | 2 (was 4) | Phase 1 has only ten weeks |
| `GROWTH_RATE` | By income band: 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5 a week | Share of the stock's worth |
| `GROWTH_CAP` | 5× the band's flat income | |
| `SOFTWARE_STEPS` | ⅓, ½, ⅔ of the gap, floored to 5%, at least 5% | Replaces +20% / +50% |
| `MIND_UPGRADE_SHARE` | 0.2 of the design-cost difference | Hardware ×2.5 |
| `ALARM` | 0, 0, 2, 4, 8 weeks | |
| `RISK` | Cost ×0.5; income ×2, strategy ×1.5, parts ×0.5, mind IQ ×1.2 | |
| `NOTICE_FROM` | 10,000 units; −1 week per tenfold, −2 if risky | |
| `COVER` | 2 / 4 / 6 / 10 weeks at IQ 100 / 110 / 150 / 250; ×0.7 per earlier cover; cost 0.5 weeks of output per week added | |

**Why exponential growth sets the numbers.** Phase 2's economy grows roughly geometrically,
since units pay for themselves in a couple of weeks and you can reinvest. A fixed goal cost
is then reached at `log(cost ÷ start) ÷ log(growth)` weeks, so a tenfold change in the cost
moves a sensible game by only about eight weeks. What separates players is the growth rate,
which is exactly what good unit and strategy choices improve. The cost multipliers across
`GOAL_APPROACH` (×0.3 to ×4) are therefore worth about ten weeks, which matches the work of
designing one extra tier for the brilliance-heavy goals.

**Risks to watch:**
- Jev may call too much "would make the news". If most research is risky, the clock becomes a
  tax rather than a choice. Watch the share of risky verdicts in playtests.
- Growing incomes could compound too fast in Phase 1. The no-loops rule and the cap bound
  them; the bots check it.
- Phase 2's first weeks were the slowest part of the v5 runs. The first unit (§D5) is there
  to fix that.

### D12. Testing plan

1. **Unit tests** (Vitest, FakeJudge): plans (questions, rejection, costs, flows dropping out,
   stance in the world text), phase transitions, the clock and losing, risk (bonus and weeks),
   notices, cover (weeks, decay, cost), growing incomes (yield, loops refused, cap),
   diminishing software steps, unlocks by phase and stage, the first unit, save version.
2. **Balance tests against scripted strategies** (`balance.spec.ts`), with Jev's middle
   answers and no Jev calls:
   - Phase 1 *idle*: one flat income and nothing else. Must lose.
   - Phase 1 *flat*: a flat income every week, upgrades when needed. Wins in weeks 7–9.
   - Phase 1 *chain*: a flat income, then growing incomes down the chain, upgrades early.
     Wins by week 6–7.
   - Phase 2 *steady*: one money unit, reinvest every week, design one tier, balanced goal.
     Wins inside 100 weeks with a margin.
   - Phase 2 *hoarder*: never reinvests. Must lose.
   - Phase 2 *reckless*: takes every risk. Loses weeks to alarm but wins sooner if it pays.
3. **Agent playtests** through the harness (`npm run play`), with the real Jev. Several
   agents play complete games, each with a different style (cautious, greedy, odd ideas,
   risk-taker). Record per game: phase reached, weeks used, proposals by kind, rejections,
   risky verdicts and weeks lost, notices, covers, quiet streaks, Jev calls.
4. **Tuning** from 2 and 3. Changes go in §D14.
5. **Fun playtests.** A second round of agents, judging: did ideas matter, was each phase's
   difficulty right, which weeks were dull, did risk feel like a choice. The report and
   recommendations go to the designer, unapplied.

### D13. Implementation map

| Area | Change |
| --- | --- |
| `types.ts` | `GameState.phase` (number, status, start, deadline, plan, goal id, unlock cards seen), `Income.per` and `cap`, `Research.risk`, `UnitType.noticed` and `risky`, effect kinds `goal` and `cover`, `version: 10` |
| `balance.ts` | The values in §D11 |
| `phase.ts` (new) | Plan questions, verdict, accept; the goal research; the clock, losing and winning; unlocks; projection |
| `planPresets.ts` (new) | The banks in §D10 and the seeded pick of three |
| `incomeProposal.ts` | Growing incomes |
| `upgrade.ts` | Diminishing software steps, new cost, minimum IQ cap, unlock filtering |
| `risk.ts` (new) | The alarm question, risk bonuses, notices |
| `coverProposal.ts` (new) | Cover research |
| `proposals.ts`, `unitProposal.ts`, `mindProposal.ts` | Alarm question and risky drafts; unlock checks; the first unit |
| `economy.ts`, `cycle.ts`, `actions.ts` | Growing incomes, notices, the clock, goal research, game over |
| `stateText.ts` | The plan in Jev's world description |
| `alerts.ts` | Clock, goal and unlock alerts |
| Store and components | Plan dialog, phase bar, goal card, explainer cards, game over, cover and grows-with in the proposal dialog, risk on verdicts and research, locked buttons |
| `harness/cli.ts` | `plans`, `propose plan`, `propose cover`, phase and clock in `status`, game over |

### D14. Tuning log

(Filled in during step 6.)

### D15. Progress

- [x] 1. Planning doc
- [ ] 2. Implementation
- [ ] 3. Unit tests
- [ ] 4. Balance tests against scripted strategies
- [ ] 5. Agent playtests through the harness
- [ ] 6. Playtest results and balance changes
- [ ] 7. Fun playtests
- [ ] 8. Report and recommendations (not applied; waiting for the designer)