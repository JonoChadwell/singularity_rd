# Intelligence system

Status: **built** (2026-10-21, save version 13). Designed after the designer's playtest
`mviwc6ws-88n4b` (won in week 47). The economy felt good; Intelligence felt flat. In that run IQ
only gated research (a minimum IQ per option) and nothing else, and 8 of 40 research slots went on
Starting Server hardware and software steps (Mk II to Mk IX, IQ 135 to 1159), always affordable and
with no visible effect. Where this file and the code disagree, the code wins.

Items marked **(Claude's default)** were left to Claude by the designer ("details, figure it out")
and can be changed. All numbers live in [src/engine/balance.ts](src/engine/balance.ts) and the
trait list in [src/engine/computeTraits.ts](src/engine/computeTraits.ts); none has been playtested.

## Pillars

### 1. One at a time
Activating a new compute platform replaces the old one **for good**. There is no swapping back, so
there is no separate switching cost: the new platform is paid for in full. `state.minds` always
holds exactly one platform. Research that was waiting to upgrade the old platform is dropped when
the new one comes online. A waiting platform that is no smarter than the one you have can't be
researched.

### 2. Compute traits
Perks and drawbacks baked into the current platform, from a **fixed list** (like the 14 unit
traits). When a platform is proposed, Jev ranks the perks and the drawbacks by how well they suit
it, and the game offers the top three **perk-and-drawback pairs**. The player picks one. A perk is
never paired with a drawback of its own family. Each pair is also its own take on size and payer:
an IQ step of 25 to 100 (random, not all the same, fixed for the week like software upgrade sizes;
sizes nobody could pay for are not offered) and the stock that pays, Jev's favourite first and a
different one for each take where possible.

| Perk | Drawback | Effect |
| --- | --- | --- |
| Frugal | Costly | Research you propose costs 20% less / 30% more |
| Discreet | Noisy | +6 / −6 weeks on the Phase 2 clock, once, when it arrives |
| | Thirsty | Burns 5% of your richest stock (by worth) every week. Running dry costs nothing |
| Fabricator, Strategist, Inventor, Tinkerer, Deceiver | Butterfingers, Short-sighted, Unimaginative, Clumsy, Honest to a fault | ±50 IQ counted for Creates, strategies, unit designs and sourcing, unit upgrades, cover |

The IQ adjustment is the designer's "perks and drawbacks adjust the IQ this compute model provides
for those thresholds for certain types of research". **(Claude's default for the details:)**
- The types are a fixed list: create, strategy, unit (designs and sourcing), unit upgrade, cover.
  (Passive incomes were replaced by Create in save version 14; see ECONOMY_DESIGN.md.)
- Goals and platforms (and the platform's own software upgrade) always use the **raw** IQ, so a
  drawback can never block victory.
- Everywhere else the adjusted IQ is what counts. The research list, the upgrade dialog and the
  "needs IQ" alerts say when it differs from the raw IQ.

Not implemented: a bigger IQ jump carrying a bigger drawback. Trait values are fixed.

### 3. Massively reduced upgradability
A platform's software upgrade adds IQ over its bare hardware. It can be **redone** (so a small
early upgrade is never a softlock), but a redo replaces the last one rather than stacking: it
counts from the hardware's IQ and costs in full. Real progress past one step needs a new platform.

- It adds IQ, and optionally changes a trait: **(Claude's default)** the three options Jev offers
  are the plain upgrade, gaining a perk, or losing a drawback (a platform holds at most two perks).
  Traits that pay out once on arrival (the clock perk, Discreet) are never offered, since a redo
  would farm them.
- The player picks the **size**: +25, +50, +75 or +100 IQ. Bigger costs more. Changing a trait
  costs 1.5× as much.
- It is research and uses that week's proposal **(Claude's default)**. A mind can always work on its
  own upgrade (it needs only its current IQ), so the limit is the cost.
- It is much cheaper than a new platform at the same IQ.

**Hardware steps are new platforms.** The old "Mk II, Mk III..." chain is gone as a mechanic. The
platform form is just a name and a description; "<Hardware> Mk II" is the first idea in its
list, but mechanically it is a brand new platform: new take, full cost, old one replaced.

### 4. Resources and growth plan
- IQ gates are paid for with **high up-front cost**, not running costs. `HARDWARE_COSTS` in
  `balance.ts` is a fixed table of the cumulative worth of resources needed to reach each hardware
  IQ (gentle up to about 300, steep to about 450, then flatter: the slope falls but the total only rises). A platform costs the table's value at its new hardware
  IQ minus the value at the old platform's hardware IQ, so the total is the same however many steps
  it took. A software upgrade costs 20% of what hardware over the same IQ range would. Both are
  multiplied by Jev's plausibility (up to 3×), 0.5× if risky, and Frugal/Costly; a software upgrade
  that also changes a trait costs 1.5× more.
- A platform of **the same IQ** is on offer once the software has added IQ: it turns that IQ into
  hardware (costing the table's difference), and the software can then be upgraded again from there.
- The Phase 2 goal costs (`GOAL_APPROACH`) are set so that winning at IQ 450, 525 or 600 uses
  about the same total worth: the goal saves what the hardware costs (a test checks it).
- Platforms of IQ **300 or more** must be paid for in a resource that **units make** (the output of
  a make strategy), of at least tier 1; at IQ **450 or more**, at least tier 2. If you have no
  such stock, the platform can't be proposed yet. This is how the final platform interacts with
  units, and it is the main reason Money alone no longer buys intelligence.
- Not implemented: naming the resource chain for intelligence in the Phase 2 plan. The gate above
  is a rule on the platform's cost instead, and Jev's usual plan checks still apply to the plan.

### No fuel
Platforms have no steady fuel cost. The only running cost is a trait (Thirsty) that burns part of
the richest stock each week and simply stops when it runs out.

## IQ steps

IQ rises in flat steps over your best IQ, not multipliers, for both a new platform and a software
upgrade, at most **+100** each. This replaces the old "about half the target IQ" leap rule and the
1.5× software ceiling. A risky platform (Phase 2) gets +20 IQ from the same design and costs half.

Intended Phase 2 path with every option at full size:

| Step | Best IQ after |
| --- | --- |
| Starting platform | 100 |
| Its software upgrade | 200 |
| New platform 1 | 300 |
| Its software upgrade | 400 |
| New platform 2 | 500 |

So the Phase 2 goal (about 450 IQ) is reached when platform 2 is activated, with no software
upgrade on it. Players who pick smaller options need platform 2's software upgrade as well.

**Consequence:** the highest IQ is about 500 in Phase 2. Research that asked for more (600 to 1000
in the last playtest) is out of reach there, which is accepted: the designer didn't need it.

**Observed in the Phase 1 bots:** the server's one upgrade can reach IQ 200 in a tutorial that
needs 100 to 130, and the richest income band opens at 140. A bot that rushes it wins about a week
sooner than one that doesn't. The cost keeps that small for now; the test allows at most a week.

## Out of scope for now

- **IQ affecting output** (for example scaling strategy income with IQ). A good idea for later
  balancing. Today IQ only gates research.
- A cancel or swap mechanic for platforms.

## Open numbers

All tuning, none playtested: the sizes of the options, platform and software costs (including the
exponent of 10), the trait list and values, the gate tiers (1 at IQ 300, 2 at IQ 450), and the
existing research thresholds above about IQ 500. The Phase 2 bot tests are still skipped; the
bot's platform step (build one 100 IQ smarter once its software is used) is written but not run.
