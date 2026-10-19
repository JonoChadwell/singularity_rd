/** The fixed list of traits. Each is a one-line rule; the engine implements each rule by id. */

export const TRAIT_IDS = [
  'self-replicating',
  'networked',
  'mass-produced',
  'learns',
  'by-product',
  'stores',
  'boosts',
  'overclockable',
  'hardy',
  'compact',
  'massively-parallel',
  'deep-thinker',
  'specialist',
  'megastructure',
  'needs-crew',
  'wears-out',
  'fragile',
  'picky',
  'intermittent',
  'slow-to-start',
  'slow-to-build',
  'makes-waste',
  'bulky',
  'lone-thinker'
] as const
export type TraitId = (typeof TRAIT_IDS)[number]

export interface Trait {
  id: TraitId
  name: string
  icon: string
  kind: 'perk' | 'drawback' | 'mixed'
  /** Only intelligence systems can have it. */
  thinkers?: boolean
  /** What the player reads. */
  rule: string
  /** What Jev is asked: does a unit like this have the trait? */
  question: string
  /** The parameter Jev picks alongside it, if any. */
  param?: 'unit' | 'resource' | 'flow' | 'field'
}

export const TRAITS: Record<TraitId, Trait> = {
  'self-replicating': {
    id: 'self-replicating',
    name: 'Self-replicating',
    icon: '♻️',
    kind: 'perk',
    rule: 'Can run “Build more of itself”.',
    question: 'Could one of these build copies of itself from parts?'
  },
  networked: {
    id: 'networked',
    name: 'Networked',
    icon: '🕸️',
    kind: 'perk',
    rule: 'Each produces 10% more for every tenfold you own.',
    question: 'Do these get better at their work the more of them are connected together?'
  },
  'mass-produced': {
    id: 'mass-produced',
    name: 'Mass-produced',
    icon: '🏭',
    kind: 'perk',
    rule: 'Needs 10% fewer parts for every tenfold you’ve built.',
    question: 'Are these the kind of thing that gets much cheaper to make in huge volumes?'
  },
  learns: {
    id: 'learns',
    name: 'Learns on the job',
    icon: '📈',
    kind: 'perk',
    rule: 'Output rises each week the type runs, up to double.',
    question: 'Do these get noticeably better at their work with experience?'
  },
  'by-product': {
    id: 'by-product',
    name: 'By-product',
    icon: '🎁',
    kind: 'perk',
    rule: 'Its strategies also make a second, useful resource.',
    question: 'Does running one of these naturally produce a useful by-product?',
    param: 'resource'
  },
  stores: {
    id: 'stores',
    name: 'Stores',
    icon: '🔋',
    kind: 'perk',
    rule: 'Holds a flow over to next week, like a battery.',
    question: 'Is storing something (like a battery or a tank) one of the main things these do?',
    param: 'flow'
  },
  boosts: {
    id: 'boosts',
    name: 'Boosts',
    icon: '🚀',
    kind: 'perk',
    rule: 'Raises another unit type’s output a little per unit, up to a cap.',
    question: 'Does having these make some other kind of unit work better?',
    param: 'unit'
  },
  overclockable: {
    id: 'overclockable',
    name: 'Overclockable',
    icon: '🔥',
    kind: 'perk',
    rule: 'Can be set to double output for triple upkeep.',
    question: 'Can these be pushed well beyond normal output at a high running cost?'
  },
  hardy: {
    id: 'hardy',
    name: 'Hardy',
    icon: '🛡️',
    kind: 'perk',
    rule: 'Runs at half output when its upkeep isn’t met, instead of idling.',
    question: 'Can these keep working, more slowly, when they don’t get what they need to run?'
  },
  compact: {
    id: 'compact',
    name: 'Compact',
    icon: '📦',
    kind: 'perk',
    rule: 'Twice as many fit in every supply layer.',
    question: 'Are these unusually small for what they do?'
  },
  'massively-parallel': {
    id: 'massively-parallel',
    name: 'Massively parallel',
    icon: '🧩',
    kind: 'perk',
    thinkers: true,
    rule: 'Ten times the machines gives nearly ten times the research speed.',
    question: 'Can huge numbers of these split one research problem between them with almost no overhead?'
  },
  'deep-thinker': {
    id: 'deep-thinker',
    name: 'Deep thinker',
    icon: '🌀',
    kind: 'perk',
    thinkers: true,
    rule: 'Pooling adds twice the usual IQ.',
    question: 'When many of these think together, do they become much smarter than any one alone?'
  },
  specialist: {
    id: 'specialist',
    name: 'Specialist',
    icon: '🎯',
    kind: 'mixed',
    thinkers: true,
    rule: 'A quarter smarter on projects in one field, a quarter duller on the rest.',
    question: 'Is this mind built for one field of science rather than general thinking?',
    param: 'field'
  },
  megastructure: {
    id: 'megastructure',
    name: 'Megastructure',
    icon: '🏛️',
    kind: 'mixed',
    rule: 'Only a handful can ever exist, but each one is enormous.',
    question: 'Is each one of these a gigantic structure, so only a handful could ever exist?'
  },
  'needs-crew': {
    id: 'needs-crew',
    name: 'Needs crew',
    icon: '👷',
    kind: 'drawback',
    rule: 'Each needs a number of another unit to run it.',
    question: 'Do these need people or other units to operate them?',
    param: 'unit'
  },
  'wears-out': {
    id: 'wears-out',
    name: 'Wears out',
    icon: '🍂',
    kind: 'drawback',
    rule: 'Loses 5% of its count every week.',
    question: 'Do these wear out, die or break down within months?'
  },
  fragile: {
    id: 'fragile',
    name: 'Fragile',
    icon: '🥚',
    kind: 'drawback',
    rule: 'When its upkeep isn’t met, a tenth are destroyed.',
    question: 'Are these damaged or killed if they go without what they need to run?'
  },
  picky: {
    id: 'picky',
    name: 'Picky',
    icon: '🧐',
    kind: 'drawback',
    rule: 'Runs only when every input is fully met.',
    question: 'Do these stop entirely rather than slow down when any supply runs short?'
  },
  intermittent: {
    id: 'intermittent',
    name: 'Intermittent',
    icon: '🌗',
    kind: 'drawback',
    rule: 'Works only in alternate weeks.',
    question: 'Do these only work some of the time, like solar panels or seasonal crops?'
  },
  'slow-to-start': {
    id: 'slow-to-start',
    name: 'Slow to start',
    icon: '🐢',
    kind: 'drawback',
    rule: 'New units take a few weeks to reach full output.',
    question: 'Do new ones take weeks of setup, growth or training before they work fully?'
  },
  'slow-to-build': {
    id: 'slow-to-build',
    name: 'Slow to build',
    icon: '⏳',
    kind: 'drawback',
    rule: 'Arrives several weeks after you buy or build it.',
    question: 'Do these take weeks or months to deliver or construct?'
  },
  'makes-waste': {
    id: 'makes-waste',
    name: 'Makes waste',
    icon: '☣️',
    kind: 'drawback',
    rule: 'Also makes a waste stock. Past a limit, it stops until something uses the waste up.',
    question: 'Do these produce waste that has to be dealt with?'
  },
  bulky: {
    id: 'bulky',
    name: 'Bulky',
    icon: '🐘',
    kind: 'drawback',
    rule: 'Half as many fit in every supply layer.',
    question: 'Are these unusually large or space-hungry for what they do?'
  },
  'lone-thinker': {
    id: 'lone-thinker',
    name: 'Lone thinker',
    icon: '🗿',
    kind: 'drawback',
    thinkers: true,
    rule: 'Gets no pooling bonus.',
    question: 'Do these work poorly together, so many of them are no smarter than one?'
  }
}

export const has = (unit: { traits: readonly TraitId[] }, trait: TraitId) =>
  unit.traits.includes(trait)

/** Catches a strategy can come with, when the player takes Jev's better answer. */
export const QUIRK_IDS = ['makes-waste', 'slow-to-start', 'picky'] as const
export type QuirkId = (typeof QUIRK_IDS)[number]

export const QUIRKS: Record<QuirkId, { name: string; icon: string; rule: string }> = {
  'makes-waste': {
    name: 'Makes waste',
    icon: '☣️',
    rule: 'Also makes a waste stock. Past a limit, it stops until something uses the waste up.'
  },
  'slow-to-start': {
    name: 'Slow to start',
    icon: '🐢',
    rule: 'Takes a few weeks of running to reach full output.'
  },
  picky: {
    name: 'Picky',
    icon: '🧐',
    rule: 'Runs only when every input and upkeep is fully met.'
  }
}

/** Drawbacks that can be a unit's catch: ones that need no extra choice, for this kind of unit. */
export const catchTraits = (mind: boolean, except: readonly TraitId[] = []) =>
  traitsFor(mind).filter((t) => t.kind === 'drawback' && !t.param && !except.includes(t.id))

/** Traits Jev can give a unit of this kind. */
export function traitsFor(mind: boolean): Trait[] {
  return TRAIT_IDS.map((id) => TRAITS[id]).filter((t) => mind || !t.thinkers)
}
