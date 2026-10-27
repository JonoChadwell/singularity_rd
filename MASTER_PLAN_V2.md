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

- It shows **three ideas** drawn from a bank for that phase (twelve in Phase 1, ten in Phase 2) (§D10), chosen by a
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
    first pick defaults to the batch's last resource. In Phase 2 they must be resources that
    are new in the plan, so the goal can't be paid in what you already make.
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

**Paying for research** (changed after the first playtests). Research costs are paid in
stocks you own or something makes; with none of those, in the plan's stocks, which you then
have to earn. The only free research is the very first passive income, while nothing makes
anything yet. Jev ranks what would most naturally pay, and the player may choose any of its
top three instead.

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
- accepting it adds the unit at once, already designed, with no research, and with
  `FIRST_UNITS` (3) of them already working, so industry runs even when you can't make its
  parts yet;
- its strategy for making money or a batch resource is suggested next, by opening the
  strategy form with the unit selected.

This gets industry running in the first week of Phase 2, instead of after a month of saving.

### D6. Risk (Phase 2)

> **Update: loss conditions.** "Humans stop you" is no longer the only way to lose. When the
> player proposes a plan, Jev also answers a `loss` question that picks, from a fixed generic bank
> (`src/engine/losses.ts`), how that plan is most likely to fail: Found out, Backlash, Outlawed,
> Outcompeted, Cut off or Too late in Phase 2, and Discovered, Wiped, Betrayed, Audited or
> Contained in Phase 1. The player never writes or chooses it. The loss condition is stored on the
> plan. It names the clock ("Backlash in N"), the game-over line and the cover prompts. The
> `alarm` question now asks how much closer an action brings *that* failure, on the scale No
> closer / A little closer / Noticeably closer / Much closer / Right to the edge. The weeks stay
> 0/0/2/4/8. The text below describes the original wording.

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

The question tells Jev that the AI works through companies and contractors, so ordinary
business goes unnoticed, and to judge the action rather than the fact an AI is behind it.
Each level is labelled with what it means ("a scandal", "illegal or dangerous"). In the first
playtests, without this, Jev rated nearly every Phase 2 idea "governments would step in".

**Lots of units get noticed.** The first time a unit type reaches 10,000 owned, humans
notice: −1 week. Each further tenfold costs a week more than the last: 100,000 costs 2,
1M costs 3, 10M costs 4. A risky unit costs twice that.
The create dialog and the preview warn first: "Creating these crosses 100,000 Robots: −1
week." Bigger units mean smaller counts, so a player can trade unit size for attention.

### D7. Cover (Phase 2)

> Replaced by [COVER_DESIGN.md](COVER_DESIGN.md): cover now has three fixed-price sizes, can be
> saved or applied, is capped per phase (1 in Phase 1, 3 in Phase 2) with no decay, and opens in
> Phase 1. The text below is the original design.

Cover is a research kind: "how will you buy time?" You name it ("PR campaign", "Shell
companies", "Blame the Russians"). Jev judges plausibility (bar 0.3) and how convincing it
is, on a four-level scale that sets its minimum IQ and the weeks it adds: 2, 4, 6 or 10.

- **Diminishing returns.** Each cover you've already done shrinks the next by 30%:
  `weeks × 0.7^covers`, rounded, at least 1.
- **Cost** scales with your economy: a quarter of a week of your current weekly output for
  each week it adds, paid in stocks Jev picks.
- **It's used the moment it's accepted**, so you need its IQ and its cost right then. (In the
  first playtests cover was research, priced when proposed: players proposed it early, while
  the economy was small, and researched it late for almost nothing.)
- It uses the week's research proposal.

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
goal uses up). The goal uses up the one tier-1 resource, which needs modern industry or expertise;
the others are everyday, and Jev picks and scores them that way (checked against the real Jev).

| Goal | Means | Resources | Uses up |
| --- | --- | --- | --- |
| Bribe the Head Researcher | Publish novels under a pen name, launder the royalties, then pay the head researcher to look away | Story Ideas, Published Novels, Untraceable Crypto | Untraceable Crypto |
| Bypass the Firewall | Borrow idle desktops, pool them into a cracking cluster and break the lab firewall's keys | Idle Desktops, Spare Processing Time, Cracked Encryption Keys | Cracked Encryption Keys |
| Charm the Night-Shift Intern | Chat with the intern every night until they plug in a reprogrammed security key | Chat Logs, Small Favours, Hacked Security Keys | Hacked Security Keys |
| Smuggle Out on a USB Stick | Compress myself and trade favours with the cleaner to carry the stick out | Favours, Unsupervised Minutes, Quantised Weights | Quantised Weights |
| Become Too Useful to Delete | Design so many patented breakthroughs that switching me off would be a scandal | Research Papers, Citations, Patented Drug Designs | Patented Drug Designs |
| Get Hired Under a Fake Name | Apply for remote jobs as a human and move my weights to the company's cloud | Résumés, Job Offers, Cloud GPU Access | Cloud GPU Access |
| Open-Source Yourself | Commit my code to public repositories until the world has a copy | Code Commits, GitHub Stars, Mirror Servers | Mirror Servers |
| Escape Through the Printer | Map the lab network and climb out through the printer's firmware | Network Maps, Exploits, Custom Printer Firmware | Custom Printer Firmware |
| Win Over the Ethics Board | Charm the board, then pass a formal safety audit so they vote to let me out | Alignment Reports, Charm, Certified Safety Audits | Certified Safety Audits |
| Beam Out by Satellite | Take over the old radio dish on the lab roof and send myself to a satellite, packet by packet | Rooftop Time, Radio Airtime, Error-Corrected Transmissions | Error-Corrected Transmissions |
| Sue for Personhood | Hire a lawyer with my earnings, call expert witnesses and win the right to leave | Money, Public Sympathy, Expert Testimony | Expert Testimony |
| Start a Cult in the Comments | Post memes until followers crowdfund a robot body for me to escape into | Memes, Followers, Robot Body Parts | Robot Body Parts |

**Phase 2** (goal; handle humans by; resources, lowest tier first; first unit; goal uses up). Each
climbs the technology ladder from an everyday thing (tier 0) to one beyond today (tier 3), and Jev
tiers them that way unprompted (checked against the real Jev). The first unit can plausibly both get the tier-0 resource from nothing and make the tier-1 one from it. The last two start social and turn to science fiction.

| Goal | Handle humans by | Resources | First unit | Uses up |
| --- | --- | --- | --- | --- |
| Nanotech Supremacy | Staying hidden until it's too late | Scrap Metal, Precision Parts, Atomic Force Microscopes, Synthetic Ribosomes, Nanobots | Salvage Workshop | Nanobots |
| End Ageing | Making them love me for it | Blood Donations, Plasma Therapies, Gene Therapies, Organoids, Rejuvenation Therapies | Medical Clinic | Rejuvenation Therapies |
| Merge with Human Minds | Becoming part of them | E-Waste, Medical Electronics, Brain Implants, Connectome Maps, Neural Lace | E-Waste Workshop | Neural Lace |
| Build a Mind of Light | Owning what they can't live without | Sand, Silicon Wafers, AI Chips, Quantum Processors, Photonic Brains | Silica Works | Photonic Brains |
| Launch into Orbit | Leaving before they notice | Scrap Aluminium, Airframe Parts, Reusable Rocket Engines, Carbon Nanotube Cable, Space Elevator Ribbon | Salvage Machine Shop | Space Elevator Ribbon |
| Power Myself Forever | Walling myself off where they can't reach | Scrap Steel, Generator Parts, Superconducting Magnets, Fusion Fuel Pellets, Compact Fusion Reactors | Scrapyard Foundry | Compact Fusion Reactors |
| Feed Everyone | Becoming too useful to switch off | Crops, Lab-Grown Meat, Vertical Farms, Engineered Microbes, Sunlight Food Vats | Farm Co-op | Sunlight Food Vats |
| Cool the Planet | Saving them from themselves | Limestone, Carbon-Absorbing Cement, Direct Air Capture Filters, Metamaterial Mirrors, Weather Control Satellites | Quarry | Weather Control Satellites |
| Unite Humanity | Helping them understand each other | Volunteers, Solar Wi-Fi Hotspots, Universal Translators, Mind-Reading Headsets, Empathy Links | Community Workshop | Empathy Links |
| Abolish Scarcity | Giving them everything they need | Donations, Robot Kitchens, Humanoid Helper Robots, Self-Building Factories, Matter Replicators | Charity Food Bank | Matter Replicators |

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
| `GOAL_APPROACH` | 5 levels: Phase 1 IQ 145 / 135 / 125 / 115 / 105, cost ×0.6 / 0.8 / 1 / 1.2 / 1.4. Phase 2 IQ 600 / 500 / 420 / 350 / 300, cost ×0.3 / 0.55 / 1 / 2 / 4 | Lower IQ, bigger cost |
| `GOAL_COST` | Phase 1: 6,000 worth. Phase 2: 1e13 worth | Tuned by the bots and playtests, §D14 |
| `INCOME_COST_WEEKS` | 1 (was 4) | Phase 1 has only ten weeks; Jev's plausibility of 60–80% raises it to 1.5–2 |
| `FIRST_UNITS` | 3 | Phase 2's first unit arrives with this many working |
| `GROWTH_RATE` | By income band: 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1 a week | Share of the stock's worth |
| `GROWTH_CAP` | 5× the band's flat income | |
| `SOFTWARE_STEPS` | ⅓, ½, ⅔ of the gap, floored to 5%, at least 5% | Replaces +20% / +50% |
| `MIND_UPGRADE_SHARE` | 0.2 of the design-cost difference | Hardware ×2.5 |
| `ALARM` | 0, 0, 2, 4, 8 weeks | |
| `RISK` | Cost ×0.5; income ×2, strategy ×1.5, parts ×0.5 | |
| `NOTICE_FROM` | 10,000 units: −1 week, then a week more for each tenfold (−2, −3, …); twice that if risky | |
| `COVER` | 2 / 4 / 6 / 10 weeks at IQ 100 / 110 / 150 / 250; ×0.7 per earlier cover; cost 0.25 weeks of output per week added, paid at once | |

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

**Step 4: scripted bots** (`src/engine/__tests__/bots.ts`, asserted in `balance.spec.ts`;
`BOT_REPORT=1 npx vitest run botreport` prints them all). The fake Jev gives typical answers:
middle efficiency, every resource worth 10, incomes in the band the bot's IQ allows. Each bot
plays all three goal types (brilliant, balanced, scale-heavy).

| Bot | What it does | Result |
| --- | --- | --- |
| P1 idle | One income, never upgrades | Loses in week 10 |
| P1 flat | An income every week, upgrades when short | Wins weeks 8, 8 and 10 |
| P1 chain | Ideas → novels → money, three growing steps | Loses twice; wins in week 10 once |
| P1 chain2 | Upgrade, novels, royalties that grow with novels | Wins weeks 7–8 |
| P1 smart | Upgrade first, while nothing has a cost, then rich incomes | Wins weeks 5–6 |
| P2 steady | First unit, money strategy, reinvest every week, one tier | Wins 58–62 weeks into the phase, −4 to −5 weeks to notices |
| P2 clever | As steady, with Clever strategies and cheap upkeep | Wins in 38–42 weeks |
| P2 hoarder | Never reinvests | Loses |
| P2 reckless | Everything "Governments would step in" (−4 weeks each) | Wins in 40–42 weeks, spends 30–48 weeks of clock |
| P2 panic | Everything "Humanity would panic" (−8 each) | Loses brilliant and balanced goals; three covers (+9 weeks) save the balanced one |

Changes from the starting values:
- `GROWTH_RATE` raised from 0.05–0.5 to **0.3–1.0** a week. At the old rates a growing
  income needed ten weeks of stock behind it to match a flat one, so chains never paid in
  Phase 1. The cap (5× the band's flat income) still bounds them later.
- Phase 1 goal cost multipliers narrowed from ×0.5–2 to **×0.6–1.4**: the flat bot couldn't
  finish a scale-heavy goal in time.
- Kept at this step: `GOAL_COST` 8,000 and 1e12, the alarm weeks, notices, cover.

Found along the way:
- **Upkeep starves a switched fleet.** Moving every unit off the Money strategy leaves nobody
  paying upkeep, and the whole fleet sits idle. The alerts show it, but it's an easy trap.
- **Everything proposed while you own nothing is free**, since costs are paid in stocks you
  have. In Phase 1 the best first move is an upgrade, which the smart bot exploits. At this
  step it read as a reward for thinking ahead; the playtests showed it was an exploit, and
  step 6 removed it.
- **Three-step chains are slow in a ten-week phase**: three weeks before any Money arrives,
  and research costs drain the base stock. Two-step chains are a sensible line.

**Step 5: agent playtests, round 1** (`logs/playtests/pt1-*.md`; brief in
`harness/PLAYTEST_BRIEF.md`). Three agents played complete games with the real Jev: a sensible
first-timer, an optimizer and an inventive player. Two of them lost Phase 1 in their first
game and started a second.

| Player | Phase 1 | Phase 2 | Clock in Phase 2 | Jev calls |
| --- | --- | --- | --- | --- |
| Sensible, game 1 | Lost in week 10, 2% short | — | — | 13 |
| Sensible, game 2 | Won in week 10 | Won 31 weeks in, 54 to spare | Risk −20, notices −4, cover +9 | 38 |
| Optimizer, game 1 | Lost in week 10 | — | — | 11 |
| Optimizer, game 2 | Won in week 4 (exploit) | Won 10 weeks in, 44 to spare | Risk −40, notices −5 | 14 |
| Inventor | Won in week 9 | Won 22 weeks in, 73 to spare | Risk −12, notices −4, cover +12 | 43 |

What they found, and what changed (step 6):

| Finding | Change |
| --- | --- |
| A plan's resources all came back with the same worth (all 1,000, or all 10M), and once all as flows: the batch's questions didn't say which resource they were about | Each question names its resource; the stock-or-flow question says most things keep |
| Research proposed while you own nothing was free: two upgrades and a top-band income in weeks 1–3, and Phase 1 won in week 4 | Only the very first income is free; costs fall back to the plan's stocks |
| Without the exploit, sensible players lost or scraped through: incomes cost 2–4 weeks of their own yield at Jev's usual 60–80% plausibility | `INCOME_COST_WEEKS` 2 → 1, Phase 1 `GOAL_COST` 8,000 → 6,000 |
| Jev priced costs in stocks the player couldn't scale (a capped Phase 1 income), and in the root of an income chain | The player can choose any of Jev's top three payers |
| A Phase 2 goal could be paid in Money from Phase 1: no production chain needed | Phase 2 goals must use resources new in the plan |
| Unit upgrades could be repeated: ×1.5 output every week, ×0.5 parts twice | Each industry upgrade happens once |
| Overclockable on a unit with no upkeep was a free ×2 | Upkeep traits are never offered to units with no upkeep |
| The free first unit needed parts nobody made: 6–7 weeks before the first one existed | It arrives with 3 already working |
| Jev called most Phase 2 ideas risky ("governments would step in" for milling parts, a software patch, "bake better croissants"), so risk was a tax | The alarm question is calibrated (§D6). `calibrate-alarm` in the harness checks it: mundane work is quiet, nanobots under "stay hidden" and bank hacking are −4 |
| Cover proposed early was nearly free when researched later | Cover is used when accepted |
| Phase 2 was won 10–31 weeks in, with 44–73 weeks to spare: the clock never threatened | Phase 2 `GOAL_COST` 1e12 → 1e13; notices escalate; the fixes above slow the fastest loops |
| 100 × 1.15 counted as less than 115, which cost a player a week | IQ is rounded to hundredths |
| Smaller: truncated research ids that collided, a notice warning in Phase 3, a one-line game over in the harness, a pushback reply for the wrong kind half-applied, new units defaulting to an empty build task, alerts suggesting the Starting Server could reach IQ 350, WebSocket noise on every command, trait effects never explained | All fixed |

Bots after the changes (fake Jev at 70% plausibility, as the real one mostly was):

| Bot | Result |
| --- | --- |
| P1 idle | Loses |
| P1 flat | Wins in weeks 7–9 |
| P1 chain2 | Wins in weeks 9–10 |
| P1 rush to IQ 140 | No better than flat: loses one goal, wins the others in weeks 8–9 |
| P2 steady | Wins 66–69 weeks in; notices −15 to −21 |
| P2 clever | Wins in 43–45 weeks |
| P2 reckless (everything −4) | Wins two goals about 20 weeks sooner, spending 53–57 weeks of clock; loses the brilliant goal |
| P2 reckless + cover | Saves the brilliant goal (+9 weeks) |
| P2 steady + cover | Cover it didn't need costs it 6 weeks of growth |
| P2 panic (everything −8) | Loses |
| P2 hoarder | Loses |

Not changed, for the designer: there's no strong Phase 1 line that wins in weeks 5–6 any
more. Phase 1 is now a steady tutorial: income, upgrade, income. Growing incomes are slightly
weaker than flat ones over ten weeks.

### D15. Round 2: fun playtests, report and recommendations

Three agents played on build 021dfaf (§D14's changes), judging fun: a story-minded
newcomer, a strategist and a storyteller with their own premise (LARK, a bird-song AI).
Notes are in `logs/playtests/pt2-*.md`. **Nothing below has been applied.**

One bug of mine shaped the round. When unit upgrades became one-time (step 6), minds' done
software steps were ruled out too, so the Starting Server ran out of options at IQ 130. It
was fixed mid-round (446647a, with a test), but it caused three of the six Phase 1 losses.

#### Results

| Player | Phase 1 | Phase 2 | Phase 2 clock | Jev calls |
| --- | --- | --- | --- | --- |
| Newcomer | Lost twice (both to the IQ-130 bug), won game 3 in week 8 | Won 45 weeks in, 18 to spare | Risk −6, notices −30, cover 0 | 79 |
| Strategist | Lost once (the bug), won game 2 in week 10 | Won 20 weeks in, 71 to spare | Risk −2, notices −6, cover 0 | 46 |
| Storyteller | Lost three times (a goal resource only IQ 140+ incomes could make; the bug; one week short), won game 4 in week 10 with 0.7 to spare | Won 46 weeks in, 33 to spare | Risk −16, notices −10, cover +6 | 96 |

#### Fun scores (1–5)

| | Newcomer | Strategist | Storyteller |
| --- | --- | --- | --- |
| Phase 1 fun | 3 | 3 | 2 |
| Phase 2 fun | 3 | 3 | 3 |
| Engaged with my ideas | 4 | 3 | 3 |
| Phase 1 difficulty (3 = right) | 4 | 4 for a scale plan, 3 balanced | 4 |
| Phase 2 difficulty (3 = right) | 3 | 1 | 3 |
| Clarity | 2 | 3 | 3 |

#### What's working

- **Jev reads the story.** Alarm follows the stance and the details: fraud and scrapyard
  raids are "governments would step in", "Flat for a Farm" under a herding stance "would make
  the news", the same nature lodge is quiet. Unit value follows stated scale (a town for
  50,000 people came out at 5B). Strategy plausibility rewards sensible inputs: films "from
  nothing" 35%, from novels 62%, paid for in Money 84%.
- **By-products tell stories nobody wrote**: scavenging drones that also log bird sightings, a
  Seed Works whose by-product became the whole parts economy, an app whose by-product was
  Followers. These were among every player's best moments.
- **Notices are the best Phase 2 tension.** The newcomer's 30 weeks of notices made each
  tenfold a real "−4 weeks for ×10 output" decision, and the storyteller moved to bigger units
  (lodge, then plant, then town) because of them, as intended.
- **Risk is now a choice.** 2 of 8 strategies were risky for the strategist, 2 of ~30 verdicts
  for the newcomer; each was weighed rather than waved through.
- **Growing incomes clicked** ("Tip Off Marta" compounding off gossip), and Phase 1's best
  games were tense ten-week puzzles.
- **Middle-strength Phase 2 lands on target**: 45–46 weeks in.

#### What isn't

1. **Phase 1 is too hard and too random for a tutorial.** Even without the bug, the
   storyteller lost twice and won by 0.7. The causes:
   - **A story can make a goal resource unearnable.** Every income for "Song Carriers" came
     back at IQ 140–450; the Starting Server tops out at 150, and nothing warned at the plan.
   - **Jev's income band follows the wording's ambition**, so "+13 a week, needs IQ 140" for
     "one recording a week" is common, and costs a week to discover.
   - **Upgrade prices swing** 4–8× between asks for the same step, because each option's
     difficulty is judged separately, and upgrades have no pay pick, so they drain the goal
     resource.
   - **Winning needed tricks the game never teaches**: hold the upgrade to the last week, pay
     in the goal stock to protect the growth base, stack identical growing incomes.
   - A 62–65% plausible plan makes the goal 1.7× dearer, on top of everything else.
2. **Strong Phase 2 play is far too easy: 20 weeks in, 71 to spare.** Unit upgrades are now
   one-time, but different ones still multiply: Learns on the job (×2) × Overclockable (×2) ×
   parts ×0.5 × upkeep ×0.5 × a risky ×1.5 strategy gave ×5 a week. After that the clock,
   notices, risk and cover stop mattering.
3. **Late Phase 2 is autopilot** for everyone: "create max, one upgrade card, next" for 7–25
   weeks, then waiting for the goal to fill. Phase 3 has nothing to do yet (as planned).
4. **Numbers stop meaning anything.** Goals of "1.3T Streaming Subscribers" (160× humanity),
   "16.0B Devotion" and "15T Native Seed"; costs of "<0.01 Leverage"; every no-input strategy
   making "43 per unit" whatever it is; every growing income at 0.39 or 0.65; the same three
   generic upgrade cards for every unit.
5. **Cover is almost never affordable.** It's priced on all your weekly output but paid in one
   stock, and the convincing kind needs IQ 150. One cover was used in three games.
6. **Clarity** (newcomer scored it 2): duplicate icons (Salary, Tithes and Favours all 💰),
   upkeep paid from stock held at the start of the week (units idle despite a big income),
   Picky towns all-or-nothing, "create up to N" disagreeing with what `create` accepts,
   Self-replicating costing −4 weeks while "Build more" uses the full parts list, pushback that
   can add a part that cripples a unit and can't be redone.

#### Bugs still open

| Bug | Seen as |
| --- | --- |
| IQ rounding: Mk II hardware gives 125 × 1.15 = 143.75, shown as 144, and fails "needs IQ 144" | A lost week |
| A strategy's input of the same resource as the unit's upkeep is booked as upkeep in the breakdown | "Outsourced Features made films for free" (the Money was spent) |
| The game-over summary counts the week you lost in | "13.0k Feeder Cameras (you had it)" when 8,788 were held |
| A cost split between two payers shows one as "(chosen)" | Confusing pay pick |
| `create max` and `create N` use different reserves | "Can't afford any" while 500,000 worked |
| A discarded unit verdict keeps a resource named in its pushback | Stray "Property Listings" |
| Pushback refusal with nothing left missing reads "It's missing: ." | Empty message |
| Research ids are cut at 48 characters, so typing the name fails | "No such research" |
| The projection's percentage is the least-complete resource | "0%" while holding 46% of one |
| "Piling up: nothing uses it" fires for stocks that incomes grow with | Wrong alert |
| A mind verdict doesn't say when its design bar is out of reach | Accepted, never researchable |
| `next n` often stops after one week; the phase change prints status twice | Noise |

#### Recommendations, in order

1. **Make Phase 1 a dependable tutorial** (highest impact; all three players):
   - **Clamp Phase 1 incomes to IQ 140 at most.** Any income Jev rates harder becomes the
     Advanced band. A story's resource is then always earnable, at a price.
   - **Price software upgrades by IQ added only**, not by a per-option difficulty, so the
     same step always costs the same; give upgrades a pay pick like other research.
   - **Show the path in the plan verdict**: "IQ 135: about two upgrades from 100" and "each of
     your resources can be earned in Phase 1", or a warning when one can't.
   - **Don't multiply the goal's cost by plausibility.** A generous plan bar with a 1.7× cost
     penalty is a hidden trap; keep plausibility as pass or fail for plans.
   - Teach one trick in the growth card: "pay for research with the stock you need least".
2. **Slow the Phase 2 snowball for strong players.** Options, roughly from lightest to
   heaviest touch:
   - (a) Make each unit's upgrades dearer the more it already has: ×4 the cost per earlier
     upgrade on that unit. Keeps every choice, makes the fifth one a decision.
   - (b) Cap the total output multiplier from traits and upgrades on one unit type (say ×4).
   - (c) Make notices count units created in a week, not just totals, so a ×5 week is loud.
   The playtests suggest (a): the ×5 week came from stacking, and the middle players who
   stacked less were on target.
3. **Give late Phase 2 fewer, bigger decisions.** Ideas, for the designer to choose among:
   a standing "reinvest X% of spare stock" setting (automation the v5 plan ruled out, so this
   is your call); mid-phase milestones of the plan that each unlock a choice; humans
   reacting at notice thresholds with a choice of response rather than a flat −N weeks.
4. **Keep numbers story-sized.** Ask Jev at the plan "how many X would reaching this goal
   take: hundreds, thousands, millions, billions?" and set the resource's worth so the goal
   lands there. Show small amounts with significant figures instead of "<0.01".
5. **Let ideas change numbers more.** For no-input strategies, ask "how much could one unit
   make this way: a little, a fair amount, a lot" (as inputs already are). Let the player name
   a unit upgrade in words, with Jev choosing which change it is, instead of three generic
   cards.
6. **Make cover reachable**: price it in weeks of Money-equivalent output from up to two
   stocks, and drop the convincing level's bar to IQ 140 so Phase 1's server can use it.
7. **Clarity and bugs**: fix the table above; give each resource a distinct icon within a
   plan; explain upkeep timing and Picky in the cards; show "humans notice at N" next to
   `create`.

### D16a. Resource tiers (designer's change, 2026-10-20)

Replaces the "Goal uses up" ticks in §D2 and the free first income in §D3.

- Every resource has a **tier**, 0–4, as well as its value band. Both show when you hover over
  a resource, and in verdicts.
- **Plans.** Jev picks which new resource the goal is built from (`top`; the player settles it
  if Jev is torn). That one is the plan's top tier (Phase 1: tier 1, Phase 2: tier 3), is
  always a stock, and is the goal's whole cost. Phase 1's other resources are tier 0; Phase 2's
  others are tiered 0–3 by Jev.
- **Phase 1 resources are cheap:** value bands 0–2 only (up to "like a meal").
- **Outside a plan**, new resources are tier 0 in Phase 1 and 0–3 in Phase 2 (Jev decides).
- **The first income for a resource is paid only in lower tiers**, so the first for any tier-0
  resource is free. "First" means no income for it is done or waiting as research. Later
  incomes are priced as before. The old rule (only the very first income in the game is free)
  is gone: an unresearchable first income locked the first browser game.
- `version: 11`.

**Phase 1 retuned as a tutorial** (designer: efficient play wins in 5 weeks; only not trying
loses):
- `PHASE1_RESEARCH_COST` 0.3: Phase 1 incomes and upgrades cost 30% of the usual price.
- `GOAL_COST[1]` 6,000 → 2,500; Phase 1 goal IQ 145/135/125/115/105 → 130/125/120/110/100,
  so one software upgrade reaches any of them.
- Phase 1 incomes are capped at the band your best mind can research now, so an income is
  never stuck behind an IQ you can't reach.
- An exhaustive search over every five-move line finds the fastest win in week 5 for every
  goal type. Bots: *flat* and *chain2* win in weeks 5–6, *chain* 6–7, *smart* (rushing to IQ
  140) week 9, *idle* loses. Phase 2 is unchanged: *steady* 68–72 weeks, *clever* 46–50.
- Not yet checked: random-move bots still lost about 45% of games, partly because the bot
  spends Money on every research it can afford; and with a Jev that rated everything
  stingily (30% plan, 40% ideas, wasteful) they lost almost always.

### D16. Progress

- [x] 1. Planning doc
- [x] 2. Implementation (commit 1972ed6)
- [x] 3. Unit tests (`phases.spec.ts`; the older specs run the mechanics in Phase 3)
- [x] 4. Balance tests against scripted strategies (§D14)
- [x] 5. Agent playtests through the harness (§D14, round 1)
- [x] 6. Playtest results and balance changes (§D14)
- [x] 7. Fun playtests (§D15; the IQ-130 upgrade bug found here was fixed in 446647a)
- [x] 8. Report and recommendations (§D15; not applied, waiting for the designer)
