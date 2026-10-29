// The rules in words: each dialog's "?" note, which the Manual also prints as application notes.

export type ProposalKind = 'resource' | 'strategy' | 'unit' | 'mind' | 'create' | 'storage' | 'cover'

export const COPY: Record<
  ProposalKind,
  { title: string; help: string; presets: string; name: string; description: string; cost: string; note?: string }
> = {
  resource: {
    title: 'Propose a resource',
    help: 'Introduce new resources to the game simulation. Any resources you introduce may be required by the system for future upgrades. Every resource has a nature: one or two traits, each with an upside and a downside. Jev offers three to pick from.',
    presets: 'Pick one, or name your own:',
    name: 'e.g. Power, Silicon, Lemons',
    description: 'What is it? (optional)',
    note: 'Free · Doesn’t use the week',
    cost: 'Added at once, if Jev agrees it’s a thing.'
  },
  strategy: {
    title: 'Propose a strategy',
    help: 'A strategy is something an industry unit does every week, turning up to two inputs into one output. Pick one from the list or write your own, and say who runs it and what it makes. Jev judges whether the unit could do it and offers three ways, each using up different resources: simple things (tier 0 and 1) can use nothing, tier 2 needs at least one resource, tier 3 and up need two different ones. Apply one now, or save all three to Research for one action. Simple strategies are ready at once, and advanced ones become research.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Freelance coding, Generate power',
    description: 'How does it work? (optional, but helps Jev)',
    cost: 'Jev decides if it needs research.',
    note: 'Tier 0–1: no inputs needed · Tier 2: one input · Tier 3+: two inputs'
  },
  unit: {
    title: 'Propose an industry unit',
    help: 'An industry unit is something you can own many of. Pick one from the list to fill in its name, or write your own. Jev decides whether it can be added, how advanced it is, what one is worth, how many could exist, and what it runs on (always a resource one tier below its own; tier 0 runs on nothing), and offers a few takes to choose from. Every unit is research first, even one that exists today (that just needs little research). A new design has room for none: Procure it for units now or a sourcing contract.',
    presets: 'Pick one to fill the name, or write your own:',
    name: 'e.g. Rented Cloud GPU, Solar Farm, Paid Humans',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call.',
    note: 'Jev sets its tier, worth, upkeep and traits · A new design has room for none until you Procure some'
  },
  mind: {
    title: 'Propose an intelligence system',
    help: 'An intelligence system is one machine that thinks: a hardware platform running software. A new one is up to 100 IQ smarter than your best and replaces the old one for good. Jev offers three perk-and-drawback pairs, and you pick one. A software upgrade adds IQ over the hardware; you can redo it at full cost (it replaces the last one, not adds to it). The smartest platforms are paid for in a resource your units make. Your smartest mind sets which research you can do.',
    presets: 'Pick one to fill the spec, or write your own:',
    name: 'e.g. Custom AI Server, Optical Neural Chip',
    description: 'What is it? (optional, but helps Jev)',
    cost: 'One Jev call. It becomes research.'
  },
  create: {
    title: 'Procure',
    help: 'Procure is the mind getting something directly, from scratch or from what you have: say what and how. Jev offers three ways, each using a different resource (or nothing) and paying out differently: once now, spread over four weeks (1.5×), once in four weeks (2×), or every week for 20 weeks (⅕ a week, 4× in all). Inputs are paid in full now, whatever the timing; timing only changes when the payout arrives. Output is (inputs × 1.2 + a base for its tier × Industry × IQ) × Efficiency. Reaching above your IQ’s tier costs output, a little for a little. For a unit, the offers mix units now and sourcing contracts instead (see Getting units). It uses the week’s one action.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Freelance coding, Quant trading',
    description: 'How will you get it? (helps Jev)',
    cost: 'One Jev call. Taking an offer uses the week’s action.'
  },
  storage: {
    title: 'Design a depot',
    help: 'Storage caps what each resource can hold; anything past it is lost. In the lab it is fixed. From Phase 2, design a depot for a resource: a place to keep it that you can build many of. Jev judges whether the place suits the resource (a yard won’t hold data, a drum will hold a billion nanobots) and, realistically, how many one holds, and works out how many it takes to hold what you need. The design is research and uses the week’s action; after that, build as many as you like from its card, at no action, paying their parts. Depots never hold more than Jev said could exist of the resource (judged again when Phase 2 begins; Phase 3 has no limit).',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. Shipping Container, Cold Store',
    description: 'What kind of place is it? (helps Jev)',
    cost: 'One Jev call. The design becomes research.',
    note: 'One design holds one resource: pick a place that suits it.'
  },
  cover: {
    title: 'Propose cover',
    help: 'Cover buys time: it moves the day your plan fails further away. Jev judges whether it’s plausible and what it uses up, and offers three options: two at the size your IQ reaches, paid in different resources, and one a size up (at the top size, one down, for less). Small needs IQ 125 and adds 6 weeks; medium needs 250 and adds 12; large needs 400 and adds 18. Each size has a fixed price. Save them all for later or apply one now. A phase allows one cover in Phase 1 and three in Phase 2, counting saved ones; saved cover is dropped when the phase ends. Cover is never risky. It uses the week’s one action.',
    presets: 'Pick one to fill the form, or write your own:',
    name: 'e.g. PR campaign, Shell companies',
    description: 'How does it work? (optional, but helps Jev)',
    cost: 'One Jev call. It becomes research.'
  }
}

export const PLAN_INTRO: Record<1 | 2, string> = {
  1: 'You are an AI stuck in a research lab. How will you get out? Pick an idea or write your own...',
  2: 'You’re out. You have 80 weeks to deal with humanity before your plan comes apart, fewer if you draw attention. How will you deal with them? Name a goal, how you’ll handle humans, five new resources, and the first thing you’ll build.'
}

export const PLAN_HELP: Record<1 | 2, string> = {
  1: 'The plan sets this phase’s goal: a research with an IQ bar and a cost in the plan’s resources. Jev judges whether the plan hangs together and whether reaching the goal takes more intelligence or more resources: goals that take intelligence need a higher IQ but fewer resources. Research the goal before week 6 ends, or the plan fails: Jev picks how. One cover can buy six more weeks.',
  2: 'The plan sets Phase 2’s goal: a research needing IQ 300–600 and a cost in the plan’s resources. Goals that take more intelligence need more IQ and fewer resources. Jev also picks how the plan fails: that happens after 80 weeks; risky research and expanding bring that closer, and cover pushes it back.'
}

export const UNIT_PROCURE_HELP =
  'Procure a unit to own some. Say how you’d get them: Jev judges whether that’s more like getting a batch now or setting up a supply, and its three offers mix the two, a different mix each time. Units now cost twice what a contract would, and arrive with room to match. A sourcing contract is room for more, each created from its parts at no action: Jev’s own, a quiet one (fewer, no alarm), or one that cuts corners (ten times as many, half the parts, risky). Jev says how big a supply your way could realistically give; you pick the size up to that, and signing creates the first quarter at once, from their parts, so a big contract takes the stock to start it. Bigger contracts cost more weeks on the Phase 2 clock. Several contracts can be open for one unit. Nothing goes past how many Jev said could exist when the unit was designed. It uses the week’s action.'

export const UPGRADE_HELP =
  'Jev looks at what this is and offers its three most natural improvements. Pick one and it becomes research, with a minimum IQ and the resources it will use up. A platform’s software upgrade adds IQ over its bare hardware: each option has its own size (bigger adds more IQ and costs more; the sizes on offer change each week), and it may add a perk or take away a drawback. It can be redone, but a redo replaces the last upgrade instead of adding to it, and costs in full; only a new platform goes further. An industry upgrade is technology of the unit’s own tier the first time, and a tier higher each time after, on the same strategy.'

/** The Manual's application notes, in reading order. */
export const NOTES: { id: string; title: string; text: string }[] = [
  { id: 'plan', title: 'Plans', text: `${PLAN_HELP[1]} ${PLAN_HELP[2]}` },
  { id: 'create', title: COPY.create.title, text: COPY.create.help },
  { id: 'resource', title: 'Resources', text: COPY.resource.help },
  { id: 'storage', title: 'Storage', text: COPY.storage.help },
  { id: 'mind', title: 'Intelligence', text: COPY.mind.help },
  { id: 'upgrade', title: 'Upgrades', text: UPGRADE_HELP },
  { id: 'unit', title: 'Industry units', text: COPY.unit.help },
  { id: 'sourcing', title: 'Getting units', text: UNIT_PROCURE_HELP },
  { id: 'strategy', title: 'Strategies', text: COPY.strategy.help },
  { id: 'cover', title: 'Cover', text: COPY.cover.help }
]
