/** The fixed list of traits. Each is a one-line rule; the engine implements each rule by id. */

export const TRAIT_IDS = [
  'networked',
  'mass-produced',
  'learns',
  'by-product',
  'stores',
  'boosts',
  'overclockable',
  'hardy',
  'needs-crew',
  'wears-out',
  'fragile',
  'picky',
  'intermittent',
  'slow-to-start',
  'slow-to-build'
] as const
export type TraitId = (typeof TRAIT_IDS)[number]

export interface Trait {
  id: TraitId
  name: string
  icon: string
  kind: 'perk' | 'drawback' | 'mixed'
  /** What the player reads. */
  rule: string
  /** What Jev is asked: does a unit like this have the trait? */
  question: string
  /** The parameter Jev picks alongside it, if any. */
  param?: 'unit' | 'resource'
}

export const TRAITS: Record<TraitId, Trait> = {
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
    rule: 'Adds storage for a resource: each holds a few weeks of its work’s worth.',
    question: 'Is storing something (like a battery, a tank or a warehouse) one of the main things these do?',
    param: 'resource'
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
    rule: 'Arrives several weeks after you create or build it.',
    question: 'Do these take weeks or months to deliver or construct?'
  }
}

export const has = (unit: { traits: readonly TraitId[] }, trait: TraitId) =>
  unit.traits.includes(trait)

/** Catches a strategy can come with, when the player takes Jev's better answer. */
export const QUIRK_IDS = ['slow-to-start', 'picky'] as const
export type QuirkId = (typeof QUIRK_IDS)[number]

export const QUIRKS: Record<QuirkId, { name: string; icon: string; rule: string }> = {
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

/** Every trait, in list order. */
export const ALL_TRAITS: Trait[] = TRAIT_IDS.map((id) => TRAITS[id])

/** Traits whose rules are about upkeep: free for a unit that runs on nothing, so never offered to one. */
export const UPKEEP_TRAITS: TraitId[] = ['overclockable', 'hardy', 'fragile']

/** Drawbacks that can be a unit's catch: ones that need no extra choice. */
export const catchTraits = (except: readonly TraitId[] = []) =>
  ALL_TRAITS.filter((t) => t.kind === 'drawback' && !t.param && !except.includes(t.id))
