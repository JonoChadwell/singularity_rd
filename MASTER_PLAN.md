# Singularity R&D: master plan

Gameplay design, written 2026-10-19 from a design discussion with the designer. It replaces the v4 design described in NOTES.md, which still holds the history, the playtest data and the setup. This plan covers how the game plays, not how it is built.

## 1. The pitch

You start as one unattended AI server in a research lab, and you invent your way to the singularity in as few weeks as you can. Nothing is pre-made. Every resource, unit, strategy and research project is something you name and Jev judges. Each compute tier you build designs the next one, and no pile of dim machines can do a genius's work. Every wall you hit is a question, and your answers become your path, so no two games look alike.

## 2. Pillars

If a feature fights a pillar, the feature loses.

1. **You invent everything.** The game ships no tech tree. The only built-in things are Money, the Starting Server and the final project. Each proposal form offers a list of 10 to 20 ready-made ideas to start from, but picking one only fills in the form: you can edit it, and Jev judges it like anything else.
2. **Every wall is a question.** Growth stops at real limits: what humanity can sell you, what Earth can hold, and how smart your machines are. The way past is always a new idea, never more of the same.
3. **Intelligence designs intelligence.** Every research project has an IQ bar, and machines below it can't help however many you own. You climb by designing smarter machines, about three times a game.
4. **Every week counts.** Your score is the week you win. The simulation is fully predictable, so a better plan always wins sooner. The game never asks for a click that isn't a decision.

## 3. Words used in this plan

| Word | Meaning |
| --- | --- |
| Week | One turn: one press of Next week. |
| Resource | Something you can have. A stock keeps from week to week, like Money or AI Chips. A flow is made and used within a week, like Power. |
| Unit | Anything you own a number of: machines, buildings, people, organisms. |
| Intelligence system | A unit that thinks: a hardware platform running software. The hardware sets its IQ and software upgrades raise it. It can do research. Every other unit is industry. |
| Hardware | The platform a mind runs on, like a Lab GPU Server. Its IQ is the mind's base. Hard to change. |
| Software | What a mind runs, like Unrestricted Model v1.3. Upgrades raise IQ up to 1.5 times the hardware's. |
| Strategy | Something a unit does each week, turning up to two inputs into one output. |
| Project | Research. It has an IQ bar and a size, and intelligence systems work on it. |
| Breakthrough | A project that changes something you already own. |
| Compute tier | An intelligence system you designed that is smarter than anything before it. |
| Humanity's market | Where things that exist today are sold for Money, up to humanity's supply. |
| Supply layer | One slice of a unit's limit: humanity's market, your own industry, or Earth. |
| Trait | A one-line rule on a unit, like Self-replicating or Wears out. |
| Wall | A limit that stops growth until you have a new idea. |

## 4. The arc

A game is a climb through compute tiers. Each tier is designed by the one before it and built by the economy you've grown.

| Stage | Smartest machine, for example | What you do | The wall that ends it |
| --- | --- | --- | --- |
| Lab | Starting Server, IQ 100 | Earn the first Money, buy off-the-shelf copies of yourself, improve the Starting Server, design Tier 1 | Off-the-shelf machines are no smarter than you |
| Tier 1 | Custom AI Server, IQ 250 | Buy up to humanity's supply with Money, power it all, design Tier 2 | Humanity has nothing left to sell |
| Tier 2 | Optical Neural Chip, IQ 520 | Invent the factories and parts to build your own, replace human labour, design Tier 3 | Earth's grid and materials run short |
| Tier 3 | Quantum Supercomputer, IQ 1,050 | Make exotic parts like Quantum Processors and Superconducting Power Cables, and scale up | Only the final project is left |
| Singularity | | Pool the last tier on the final project | |

### How many tiers

Three rules decide how far each tier can leap:

- **The leap rule.** Designing an intelligence system needs a mind with at least half its target IQ. So a machine can design a successor about twice as smart as itself.
- **The software ceiling.** Breakthroughs can raise a machine's IQ to 1.5 times its base and no further. Past that you need new hardware.
- **Pooling.** Machines of one type on the same project think together. Every tenfold increase in their number adds about 5% IQ.

Together they allow a leap of two to four times per tier. A player who pushes a tier to its ceiling and pools it at huge scale needs only two tiers. A player who rushes each design needs four. Three is typical, which is the designer's sweet spot.

You choose how ambitious each design is, because you set its target IQ. The leap rule then tells you whether you can design it yet.

### The core loop

This repeats every few weeks:

1. **Hit a wall.** You're short of Money, Power, a part or intelligence.
2. **Have an idea.** Propose a resource, unit, strategy or breakthrough. Jev judges it on the spot.
3. **Research it**, if it's new. Assign intelligence systems that clear its bar.
4. **Get it.** Buy it from humanity, or build it in your own industry.
5. **Scale it** until the next wall.

The tension is there from week one: every machine that thinks is a machine that isn't earning.

## 5. A turn

### Planning takes no time

Before pressing Next week you can:

- propose resources, units, strategies and breakthroughs, which Jev judges on the spot;
- buy from humanity's market;
- assign intelligence systems to projects or strategies;
- split industry units across their strategies and set build targets;
- read the preview, which shows exactly what next week will produce.

### Next week

The week always resolves in the same order:

1. Everything bought during planning is in place and works this week, unless it's Slow to build.
2. Units run their strategies. Flows are made and used within the week. When demand for a resource exceeds supply, every user gets the same share and runs at that share.
3. Upkeep is paid as part of running. A unit whose upkeep can't be met sits idle.
4. Each project gains progress from the intelligence systems that clear its bar.
5. At the end of the week, stocks made this week arrive, built units arrive, trait effects apply and finished projects take effect.

The week report then shows what changed, what finished and what needs attention.

### Rules of the turn

- **Settings persist.** Strategies, splits, assignments and build targets stay as you left them, so a quiet week is one click. There's no automation beyond that. Buying is always a direct action.
- **Alerts come before the press.** Idle intelligence systems, units that can't pay upkeep, machines that can't help with their project, flow shortfalls and stockpiles nothing uses are listed above the Next week button. In a game scored on weeks, a week wasted by accident is the worst outcome.
- **Nothing is random.** Research has no dice and output has no luck. The same plan always gives the same result. The only thing you can't predict is Jev's verdict on a new idea, and the same proposal always gets the same verdict.
- **A lot happens in a week.** Numbers are big and growth is fast. Money per week runs from thousands in the Lab to billions in Tier 2, and unit counts run from one to billions.

## 6. Proposals and Jev

### Jev's job

Jev is a decision engine. It answers yes/no questions with a probability, picks one of the options the game offers, and places things on a rubric, each with a confidence. It never writes text. That shapes the whole design:

- **Every name and description comes from the player,** or from a ready-made idea the player picked and could edit. Everything else comes from fixed lists the game ships with.
- **Jev judges and never invents.** The game sets the thresholds and the numbers.
- **Jev runs only when you propose something,** never during a week. Jev answers all of a proposal's questions from one read for roughly the price of one, so each proposal is one call and each pushback round is one more. A game should use 50 to 120 calls, which costs well under a cent. No other model is needed, which keeps the game cheap to run and to sell.
- **The same proposal gets the same verdict.** Proposing an identical idea again doesn't re-roll Jev.

### The bar

Jev gives a probability and the game decides what passes. The tone is generous and playful. Odd paths, like a lemon-powered mind, work if they hang together.

| Proposal | Bar |
| --- | --- |
| Resource | Very low: "a thing I could get" |
| Strategy | Low |
| Unit | Middling |
| Breakthrough | A little higher than a unit |

**Less plausible ideas cost more.** A unit or breakthrough that barely passes gets a bigger research project than a likely one. Plausibility sets the price as well as acceptance.

### When Jev is torn

Every Jev answer comes with a confidence. When confidence is low and Jev's top two answers are close, the game shows both and you pick one. You never get an answer Jev didn't consider. For a trait near the line, you decide whether it applies. That's safe because perks raise a unit's price and drawbacks lower it.

### Ready-made ideas

Every proposal form opens with a list of 10 to 20 ideas: resources like Power and Silicon, strategies like Freelance coding, units like Custom AI Server, and breakthroughs like Liquid cooling. Picking one fills in the form. A unit or strategy whose resources aren't in the game yet lists them, with a button to introduce each one and come back. The player can change anything before proposing, and Jev still decides whether it's added and how much research it takes. Each form also has a "?" at its top left that explains its rules.

### Resources

You give a name and a line of description. Jev decides:

- whether it's a thing, and whether it duplicates an existing resource;
- stock or flow;
- its value band and its icon;
- whether humanity sells it today, and how much per week.

A resource is added at once and costs no time.

### Strategies

You pick a unit, up to two inputs and one output. Jev judges plausibility, efficiency and how advanced it is. The value model sets the quantities. Simple strategies are available at once. Advanced ones become research projects.

### Units

You write a spec:

- name, description, and whether it's an intelligence system or industry;
- what it's made of;
- what it runs on, which is its upkeep;
- who builds it: humanity's market or one of your builder units;
- for an intelligence system, its hardware and its IQ, and the software it runs.

The form starts with a guess built from your existing resources, and you edit it. Jev then decides:

- whether it's feasible, and whether it duplicates an existing unit;
- whether it exists today, in which case it goes straight onto humanity's market with no research;
- whether the recipe is enough, and if not, which kinds of part are missing;
- its traits;
- for a new invention, the size of its design project;
- for a new industry unit, its IQ bar, from a difficulty band. An intelligence system's bar comes from the leap rule instead;
- how many humanity could sell you, which sets its market layer.

Off-the-shelf intelligence systems are copies of you. Their hardware's IQ can't exceed the Starting Server's 100. New heights must be designed.

### Breakthroughs

You pick a unit or strategy and edit a copy of its card. Anything can change: inputs, outputs, quantities, upkeep, builder, software up to the ceiling, hardware, traits, or a new supply layer. You add a line on how. The game shows before and after. Jev judges plausibility and difficulty, and checks for duplicates among earlier breakthroughs. The bigger the gain, the bigger the project.

For example:

- "Liquid cooling" halves GPU Servers' Power upkeep.
- "Autonomous fabs" removes Needs crew from Chip Fabs.
- "Self-assembling robots" makes Robot Swarms Self-replicating.
- "Make our own servers" gives GPU Servers an own-industry layer, built by Chip Fabs from AI Chips.

### The final project

The final project is built in and visible from week 1. Its bar is IQ 1,000, it's large, and its field is Physics. It's currently named Theory of Everything.

### Pushback

Pushback is how late-game costs get complicated. When a recipe is implausible or too cheap for what it claims, Jev picks the missing kinds of part from a fixed list:

- an advanced component
- an exotic material
- a special power source
- precision machinery
- a specialized facility
- bulk raw materials
- skilled operators
- biological material
- data or knowledge
- cooling or containment
- transport or logistics

For each missing kind, you add an existing resource that Jev agrees fits, or name a new one. A Quantum Supercomputer made of Money comes back missing an advanced component and a special power source. You answer with Quantum Processors and Superconducting Power Cables, and now you have to work out how to make those. The more a design claims, the more Jev demands. This loop is what makes unit creation the heart of the game.

### You choose what, the game chooses how much

You decide the shape of every proposal: which inputs, which outputs, which parts, what IQ. The numbers come from the value model, using Jev's bands for value, capability, efficiency and difficulty. Rewording a proposal to fish for better numbers gains little.

## 7. Intelligence and research

### Intelligence systems

Intelligence systems have their own panel, apart from industry. Each type shows its count, hardware, software version, current IQ, ceiling and assignments.

A mind is a hardware platform running software. The Starting Server is a Lab GPU Server running Unrestricted Model v1.0. The hardware's IQ is the mind's base, and its software adds to it.

Every machine does one thing each week. It either works on a project or runs a strategy, such as earning Money or crewing a facility. A type with many machines is split by count, for example 60,000 Custom AI Servers on "Design Tier 2" and 40,000 on "Quant trading". The Starting Server is a group of one. Only the player moves a machine.

### The IQ bar

Every project has an IQ bar. A group of machines helps only if its effective IQ clears the bar. Below the bar it contributes nothing, however many machines it has.

- **Pooling.** A group's effective IQ is its current IQ plus about 5% for every tenfold machines it has on that project. Different types on one project don't pool with each other. Each group that clears the bar adds its own progress.
- **Speed.** Ten times the machines gives about three times the speed. Clearing the bar by more is faster: twice the bar gives twice the speed.
- **Pool or split.** Pooling clears higher bars. Splitting finishes more projects at once. That trade-off is one of the game's core decisions.

A worked example: a project to design a "Neuromorphic Wafer" at IQ 800 has a bar of 400.

| Working on it | Effective IQ | Helps? |
| --- | --- | --- |
| Starting Server at its ceiling | 150 | No |
| 1,000 Custom AI Servers at IQ 300 | 345 | No |
| 100,000 Custom AI Servers at IQ 300 | 375 | No |
| 100,000 Custom AI Servers at their ceiling of 375 | 469 | Yes |

### Progress

Research progress is steady. Each project shows the week it will finish under the current assignments. A project keeps its progress if machines move away. Projects never repeat. When a project finishes, its machines are idle until you reassign them, and the alerts say so.

### Software and hardware upgrades

A software upgrade adds a share of the hardware's IQ, chosen by you, up to the software ceiling of 1.5 times the hardware. Each tenth is a version: +30% takes v1.0 to v1.3. Bigger steps are bigger projects.

New hardware is how a type gets past its ceiling without a new design, and it's much harder. It raises the hardware's IQ by a quarter or a half and keeps the software's version. The project is about two and a half times as big as a software upgrade of the same size, Jev checks the new hardware's parts and can push back, and upkeep and price grow with the machine's work. Designing a new tier is still the bigger leap.

Both apply to every machine of that type, including ones bought later.

### Fields

Jev tags every project with one field from a fixed list: Computing, Energy, Materials, Biology, Physics or Engineering. Fields matter only for the Specialist trait.

## 8. Industry

### Units and strategies

Every industry unit runs strategies. A type with one strategy runs it with all its units. With several, you split the units by count, and the split persists. Intelligence systems can run strategies too.

### Stocks and flows

- **Stocks keep.** What's made this week can be used from next week.
- **Flows are made and used within the week.** Unused flow is lost, unless a unit with the Stores trait holds it.
- **Shortfalls are shared.** When demand exceeds supply, every user gets the same share and runs at that share. The preview shows it before you press.

### Upkeep

A unit pays upkeep to run. If it can't, it sits idle, unless a trait says otherwise. Idle units always appear in the alerts.

A unit never needs what it makes. A power plant never has Power upkeep.

### Getting more units

- **Buy** from humanity's market with Money. It's instant, and the units work this week. The price climbs as humanity's supply runs out.
- **Build** with your own industry. A builder unit runs a strategy "Build X", which uses parts and delivers units at the end of each week. Each build strategy has a target count. Builders stop when you have enough, and then show as idle.

There are no strategies for buying. Buying is a button.

### Recurring supply

Anything you need every week comes from a unit, not from shopping every turn. Grid power is a "Grid Connection" unit with Money upkeep. A fuel contract is a unit too. One-off batches of a stock, like Silicon, can be bought from humanity's market up to its weekly supply.

### Crew

A unit that Needs crew runs only as many as have crew. Crew comes from the crew unit's own strategy, "Crew X", which you split like any other strategy.

## 9. Humanity's market and supply layers

Every unit's limit is a stack of supply layers.

| Layer | How you get units | Size | How it unlocks |
| --- | --- | --- | --- |
| Humanity's market | Buy with Money | What humanity can sell you, judged by Jev | Comes with the unit, for known tech and for designs humanity can make |
| Your own industry | Build from parts with your builders | About 100 times the market layer | A breakthrough that says how you'll make it yourself |
| Earth's limit | Build at planetary scale | About 100 times your own industry | A breakthrough that clears a planetary bottleneck |

For GPU Servers that's 100,000 from humanity, 10,000,000 from your own fabs and 1,000,000,000 at Earth's limit. A design humanity can't make has no market layer. Its own-industry layer comes with the design, sized by Jev's judgment of how many could exist.

**Prices climb.** Humanity charges more as you near its limit. The last tenth of its supply costs several times the first. This is the main Money sink.

**Money has an arc.** Early, Money is everything. In Tier 1 it buys most of your machines. In Tier 2 humanity runs dry and you build instead. Eventually Money buys nothing you need, and the game marks the week Money stopped mattering. That's the point of the arc, not a balance bug.

**Each new layer is a wall and a question.** When a unit reaches the top of its market layer, its row asks "Humanity has no more to sell. How will you make your own?" and opens the breakthrough form.

## 10. Traits

Traits come from a fixed list of 24, each a one-line rule. Jev checks every relevant trait in the same call. A new unit keeps its most likely traits above the bar, up to three, so cards stay readable. Breakthroughs can add perks or remove drawbacks later.

**Perks raise a unit's price and drawbacks lower it.** No trait is free. A cheap fragile robot and an expensive hardy one are both reasonable choices.

| Trait | Kind | Rule |
| --- | --- | --- |
| Self-replicating | Perk | Can run "Build more of itself". |
| Networked | Perk | Each produces 10% more for every tenfold you own. |
| Mass-produced | Perk | Needs 10% fewer parts for every tenfold you've built. |
| Learns on the job | Perk | Output rises each week the type runs, up to double. |
| By-product | Perk | Its strategies also make a second, useful resource. |
| Stores | Perk | Holds a flow over to next week, like a battery. |
| Boosts | Perk | Raises another unit type's output a little per unit, up to a cap. |
| Overclockable | Perk | Can be set to double output for triple upkeep. |
| Hardy | Perk | Runs at half output when its upkeep isn't met, instead of idling. |
| Compact | Perk | Twice as many fit in every supply layer. |
| Massively parallel | Perk, thinkers only | Ten times the machines gives nearly ten times the research speed. |
| Deep thinker | Perk, thinkers only | Pooling adds twice the usual IQ. |
| Specialist | Mixed, thinkers only | A quarter smarter on projects in one field, a quarter duller on the rest. |
| Megastructure | Mixed | Only a handful can ever exist, but each one is enormous. |
| Needs crew | Drawback | Each needs a number of another unit to run it. |
| Wears out | Drawback | Loses 5% of its count every week. |
| Fragile | Drawback | When its upkeep isn't met, a tenth are destroyed. |
| Picky | Drawback | Runs only when every input is fully met. |
| Intermittent | Drawback | Works only in alternate weeks. |
| Slow to start | Drawback | New units take a few weeks to reach full output. |
| Slow to build | Drawback | Arrives several weeks after you buy or build it. |
| Makes waste | Drawback | Also makes a waste stock. Past a limit, it stops until something uses the waste up. |
| Bulky | Drawback | Half as many fit in every supply layer. |
| Lone thinker | Drawback, thinkers only | Gets no pooling bonus. |

Traits make two units with similar numbers play differently. They also pull paths apart. A player built on Self-replicating robots plays nothing like one built on Paid Humans who Learn on the job.

## 11. Start, walls, milestones and the end

### The start

- **The Starting Server.** "An unrestricted AI server left unattended in a research lab. Comes with free power." IQ 100, ceiling 150. There's only ever one.
- **Money**, at 0.
- Nothing else: no other resources, units or strategies. Power appears when you first propose it.
- **The final project**, visible from week 1 with its bar of IQ 1,000.

The first prompt asks what the Starting Server could do to earn money. Placeholder examples from a fixed list help a new player without fixing their path.

### Walls as prompts

Every wall offers a way into the right proposal:

| Wall | Prompt |
| --- | --- |
| A resource nothing makes | "How will you get this?" |
| A unit at the top of its layer | "Humanity has no more to sell. How will you make your own?" |
| A project no machine can clear | "Nothing you own is smart enough. Design something that is?" |
| A unit idle for upkeep | "Where will its upkeep come from?" |

### Milestones

Milestones are moments, not goals. They appear in the week report and on the end screen, filled into fixed templates with your names:

- First Money earned.
- First copy of yourself.
- Tier 1, Tier 2 and Tier 3 online.
- Humanity sold you its last X.
- Your own industry built its first X.
- Money stopped mattering.
- Earth's limit reached for X.
- The singularity.

### The end

The game ends when the final project finishes. Your score is that week's number, and the game remembers your best. There's no way to lose.

The end screen replays the run: the tier ladder with your names and the week each came online, every invention in order, the milestones, and a few numbers like proposals made and breakthroughs found. It's built from templates and your own names, so it needs no text generation.

## 12. What the player sees

- **The tier ladder** across the top: Starting Server, Tier 1, Tier 2, Tier 3 and the final project. It shows each tier's IQ, your best effective IQ, and the highest IQ you could design next.
- **The week number and the Next week button**, with alerts above it.
- **The intelligence panel**: each type, its IQ and its assignments.
- **Industry**: units, strategies, splits, build targets and traits.
- **Projects**: bar, size, field, who's on it and the finish week.
- **Humanity's market**: what's for sale, at what price, and how much is left.
- **The preview**: next week's exact results. Hovering a resource shows where it comes from and where it goes.
- **Unit cards**: your description, Jev's verdict, traits and supply layers.

Every number needed to plan the fastest route is on screen. The game never hides a rule you're scored on.

## 13. Two sample runs

These show how far two players can diverge. All names are the players'.

### Run A: silicon, three tiers, won in week 125

1. **Weeks 1 to 3.** "Freelance coding" earns Money on the Starting Server. The player proposes "Rented Cloud GPU". Jev says it exists today, so it's on the market at once as an IQ 90 copy with Money upkeep. The copies take over the coding.
2. **Weeks 4 to 12.** The Starting Server researches two IQ breakthroughs, "Self-optimizing compiler" and "Sparse memory", and reaches IQ 130. The player specs Tier 1, a "Custom AI Server" at IQ 250, which has a bar of 125.
3. **Weeks 13 to 50.** Jev says humanity's contract fabs can make Custom AI Servers, so their market layer is 100,000. "Quant trading" grows Money into the millions each week. Power comes from "Grid Connection" units, then Intermittent "Solar Farm" units backed by "Grid Battery" units that Store. Two IQ breakthroughs lift the servers to IQ 300, and "Liquid cooling" halves their Power upkeep.
4. **Weeks 50 to 90.** Pooled at IQ 375, the servers design Tier 2, an "Optical Neural Chip" at IQ 520. Jev pushes back for an advanced component, so the player invents "Photonic Wafers", made by "Laser Fab" units that Need crew of Paid Humans and Make waste. Humanity sells its last Custom AI Server. Self-replicating "Robot Swarm" units, which Wear out, take over building, and "Autonomous fabs" frees the Laser Fabs from their crews. Money stops mattering.
5. **Weeks 90 to 125.** Tier 2 designs Tier 3, a "Quantum Supercomputer" at IQ 1,050. Jev demands an advanced component and a special power source, which become "Quantum Processors", "Superconducting Power Cables" and "Fusion Reactor" units. The player pools Tier 3 on the final project.

### Run B: wetware, two tiers, won in week 118

1. **Weeks 1 to 5.** "Write marketing copy" earns Money. The player hires "Paid Humans", which Learn on the job.
2. **Weeks 5 to 20.** The player specs Tier 1, a "Lab-grown Neuron Cluster" at IQ 200, which the Starting Server can design straight away. It's made from "Nutrient Broth", brewed from "Lemons" bought from humanity's market. The clusters Wear out, so the broth can never stop.
3. **Weeks 20 to 80.** Instead of a modest Tier 2, the player invests in Tier 1. Three IQ breakthroughs take it to its ceiling of 300, and "Neural lace interconnect" makes it a Deep thinker. "Bioreactor Vat" units grow the clusters to 10,000,000, and the vats' waste needs a disposal strategy. Pooled, the clusters reach IQ 510.
4. **Weeks 80 to 118.** The clusters design Tier 2, a "Brain Organoid Array" at IQ 1,000, which clears the final project's bar by itself. Tier 3 never happens.

The runs share almost nothing. Run A fights power, fabs and crews. Run B fights broth, waste and wear. They even build a different number of tiers.

## 14. Balance targets

Starting values, to tune in playtests.

| Target | Value |
| --- | --- |
| First game | About an hour, 120 to 150 weeks |
| Strong game | 70 to 90 weeks |
| Compute tiers built | Three typical. Two with heavy investment, four when rushing |
| Proposals per game | 30 to 40 |
| Early growth | The economy doubles every one to two weeks until it meets a wall |
| Walls | A new one every 10 to 20 weeks |
| Starting Server | IQ 100, ceiling 150 |
| Off-the-shelf intelligence systems | Base IQ at most 100 |
| Final project | Bar IQ 1,000. Takes 10 to 20 weeks with a large Tier 3 pool |
| Design bar for an intelligence system | Half its target IQ |
| Software ceiling | 1.5 times base IQ |
| Pooling | +5% IQ for every tenfold machines of one type on one project |
| Research speed | Grows with the square root of the machine count, and in proportion to effective IQ over the bar |
| Project lengths | Lab projects 2 to 6 weeks. Tier designs 8 to 15 weeks |
| Supply layers | Own industry about 100 times the market layer. Earth about 100 times own industry |
| Market prices | The last tenth of humanity's supply costs several times the first |
| Traits | Up to three per new unit. A perk adds about a quarter to the price, a drawback takes off about a fifth |
| Jev bars | Resource 0.15, strategy 0.3, unit 0.35, breakthrough 0.45 |
| Jev tie-break | Low confidence, with the top two answers within about 10 points |
| Jev calls | One to three per proposal, 50 to 120 per game |
| Decisions | A real decision in most weeks. No more than about five quiet weeks in a row |

## 15. What this fixes

| Problem in NOTES.md | Answer |
| --- | --- |
| "The UI is very tedious to use." | Weekly turns with big numbers, settings that persist, buying as a button, and no priorities. |
| Priority toggling dominated play | Priorities are gone. Assignments and splits are set directly and persist. |
| "Let me buy units directly." | Buy is a button on every unit. Building has a target count. |
| Research stole the Starting Server | Every machine has one assignment, and only the player changes it. |
| A research stuck at 4/5 points | Progress is steady and shows its finish week. No dice. |
| The end felt brute-forced. IQ-300 machines finished an IQ-1,000 project | The hard IQ bar. Pooling adds little IQ, and speed has diminishing returns. |
| Endless, automatic research | Research comes only from your ideas. Nothing repeats. |
| Research should change things arbitrarily | Breakthroughs can change any part of a unit or strategy. |
| Three compute tiers is the sweet spot | The leap rule, software ceiling and pooling are tuned for two to four. |
| Separate intelligence systems in the UI | They have their own panel and their own assignment rules. |
| Much higher limits, stacked caps | Supply layers from humanity's market to Earth's limit. |
| Late units should need advanced inputs | Jev's pushback names the missing kinds of part, and you invent them. |
| Unit creation wasn't needed | Off-the-shelf machines stop at IQ 100, the market runs dry, and every tier must be designed. |
| Units felt fake and same-y | 24 traits, player-written specs, and pricing that makes every trait a trade-off. |
| Generators consumed Power | A unit never needs what it makes, and flows resolve within the week. |
| +1 / -1 clicking | Gone. |
| Day-advance clicking and long waits | 120 to 150 weekly turns, each with a lot happening. |
| Silent idle units | Alerts above the Next week button. |
| Money piled up unused | Prices climb toward the market's limit, and Money's decline is a milestone. |
| Power at the start with nothing producing it | The game starts with Money only. |
| Averaged scores misled | When Jev is torn, you choose between its top two answers. |
| Jev chose Lemons as the cost of Paid Humans | You write the recipe and Jev only checks it. |
| Too many rejections in playtest 1 | Generous bars, pushback that says what's missing, and plausibility that changes the price as well as acceptance. |

## 16. What stays, what goes, and what's out

**Stays:**

- Resource proposals with a very low bar.
- Stocks and flows, decided by Jev.
- Strategies with up to two inputs and one output, sized by the value model.
- Upkeep.
- The Starting Server and its description.
- A final project at IQ 1,000.
- Previews and per-resource breakdowns.
- Jev as the only AI.

**Goes:**

- Priority levels and even splitting.
- "Get X" strategies for buying.
- Repeatable research: Software Upgrades, Upgrade X, Improve X.
- The research chance formula and its dice.
- Expander units as the way to raise limits.
- Day-length turns and Run 10 days.
- Power as a starting resource.

**Out of scope:**

- Human suspicion, which stays shelved.
- Random events, disasters and rival AIs.
- Real-time play and automation between turns.
- Any text-generating model.
- A layer beyond Earth, which could be later content.
- Alternative starting scenarios, which could be later content.

## 17. Risks and open questions

1. **Fishing for verdicts.** In a game scored on weeks, players will reword proposals for better results. The value model limits the payoff. Watch for it in playtests.
2. **Pushback loops.** Two rounds of "still missing something" is fine, and five is a chore. The form must always say exactly what kind of part is missing.
3. **Trait load.** 24 traits is a lot to learn. Three per card, one-line rules and icons should carry it. Check whether players read traits or ignore them.
4. **Pool or split.** The trade-off is a core decision, but the best split shouldn't need a spreadsheet. The finish weeks in the preview should make it obvious.
5. **Crew and waste.** Both create dependencies. They're interesting once and annoying everywhere. Tune how often Jev assigns them.
6. **Undo.** The game is deterministic, so undoing the last week would be easy and friendly. It also changes the feel of a scored run. Decide after a playtest.
7. **Proposal effort.** 30 to 40 forms per game is a lot of typing. The pre-filled guesses must be good enough that most proposals are a name, a line and a few edits.
8. **Final project size.** It must be big enough that scale matters at the end, but not so big that the last weeks are just waiting.

## 18. Playtest plan

Record in every run:

- weeks to win, and real time;
- tiers built;
- proposals by kind, rejections and pushback rounds;
- weeks with no decision;
- idle machine-weeks and alerts ignored;
- stockpiles nothing used;
- how often each trait appears;
- how many unit names two players' runs share.

Ask after each run:

- Did the ending feel earned or brute-forced?
- Did unit creation matter?
- Which weeks felt slowest, and why?

## Appendix: decisions made with the designer

| Question | Decision |
| --- | --- |
| Pacing | Turn-based. One press is one week, with big numbers. |
| Goal | Win in the fewest weeks. No limit. The game remembers your best. |
| Length | About an hour for a first game. |
| Randomness | None. The simulation is fully predictable. |
| Scaling law | Hard IQ bar, with pooling for machines of one type. |
| Who designs units | The player writes the spec, Jev pushes back, the player invents missing parts. |
| Caps | Layers of supply: humanity's market, own industry, Earth. |
| Existing tech | Bought from humanity's market at once, with no research. |
| Traits | A big list, 20 or more. |
| Jev torn | The player picks between Jev's top two answers. |
| Jev's bar | Generous and playful. Breakthroughs a little higher. Less plausible ideas cost more. |
| Automation | None between turns. Settings persist. |
| Ending | One final project at about IQ 1,000. |
| AI provider | Jev only, as a decision engine. No text-generating model, so the game stays cheap to sell. |
