import { ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { currentIQ, findResource, findStrategy, findUnit, iqRoom, layerSize, softwareVersion } from './model'
import {
  baseVerdict,
  catchesOf,
  cleanText,
  fieldQuestion,
  gate,
  logProposal,
  newProject,
  precheckName,
  quirkQuestion,
  rankedQuirks,
  reader,
  scale,
  type Accepted,
  type Complication,
  type VerdictBase
} from './proposals'
import {
  applyStrategyChanges,
  applyUnitChanges,
  costMultiplier,
  gainOf,
  projectSize,
  type TraitParam
} from './research'
import { proposalText } from './stateText'
import { catchTraits, QUIRK_IDS, QUIRKS, TRAITS, type TraitId } from './traits'
import { FIELDS, type Change, type Field, type GameState, type Strategy, type UnitType } from './types'
import { missingKinds, priceParts, recipeQuestions } from './unitProposal'

export interface BreakthroughSpec {
  name: string
  /** How it works, in a line. */
  description: string
  target: { kind: 'unit' | 'strategy'; id: string }
  changes: Change[]
  params: TraitParam[]
}

export interface BreakthroughVerdict extends VerdictBase {
  kind: 'breakthrough'
  spec: BreakthroughSpec
  missing: B.PartKind[]
  pushbackRounds: number
}

export const FACTORS = [0.75, 0.5, 0.25, 0]
export const OUTPUT_FACTORS = [1.25, 1.5, 2, 3]

const layerChange = (spec: Pick<BreakthroughSpec, 'changes'>) =>
  spec.changes.find((c): c is Extract<Change, { kind: 'layer' }> => c.kind === 'layer' && c.layer === 'own')
const hardwareChange = (spec: Pick<BreakthroughSpec, 'changes'>) =>
  spec.changes.find((c): c is Extract<Change, { kind: 'hardware' }> => c.kind === 'hardware')

/**
 * The change whose parts Jev checks, and whose parts pushback adds to: new hardware, or an
 * own-industry layer. A breakthrough has at most one.
 */
export function recipeOf(spec: Pick<BreakthroughSpec, 'changes'>): { parts: string[] } | undefined {
  return hardwareChange(spec) ?? layerChange(spec)
}

/** What one is worth after the breakthrough, which prices its new parts. */
function valueAfter(unit: UnitType, spec: Pick<BreakthroughSpec, 'changes'>): number {
  const hw = hardwareChange(spec)
  if (!hw) return unit.value
  const iq = Math.round(unit.hardware.iq * (1 + hw.share))
  return (unit.value * B.mindValue(iq)) / Math.max(1e-9, B.mindValue(unit.hardware.iq))
}

/** New parts for the unit, priced at its worth after the breakthrough. */
export function recipeParts(state: GameState, unit: UnitType, spec: Pick<BreakthroughSpec, 'changes'>) {
  const recipe = recipeOf(spec)
  return recipe ? priceParts(state, recipe.parts, valueAfter(unit, spec)) : []
}

export function targetName(state: GameState, target: BreakthroughSpec['target']): string {
  return (target.kind === 'unit' ? findUnit(state, target.id)?.name : findStrategy(state, target.id)?.name) ?? '?'
}

/** One change in words, for Jev and for the card. */
export function describeChange(state: GameState, target: BreakthroughSpec['target'], c: Change): string {
  const res = (id: string) => findResource(state, id)?.name ?? '?'
  const pct = (f: number) => (f === 0 ? 'removed' : `×${f}`)
  switch (c.kind) {
    case 'software': {
      const u = findUnit(state, target.id)
      if (!u) return 'Software upgrade'
      const next = u.software.bonus + c.share
      return `Software ${u.software.name} ${softwareVersion(u.software.bonus)} → ${softwareVersion(next)}: IQ ${Math.round(currentIQ(u))} → ${Math.round(u.hardware.iq * (1 + next))}`
    }
    case 'hardware': {
      const u = findUnit(state, target.id)
      if (!u) return `New hardware: ${c.name}`
      const iq = Math.round(u.hardware.iq * (1 + c.share))
      return `New hardware: ${u.hardware.name} → ${c.name}, built from ${c.parts.map(res).join(', ')}. Hardware IQ ${u.hardware.iq} → ${iq}; upkeep and price grow with it`
    }
    case 'upkeep':
      return `${res(c.resourceId)} upkeep ${pct(c.factor)}`
    case 'parts':
      return `${res(c.resourceId)} needed to build one ${pct(c.factor)}`
    case 'trait':
      return `${c.add ? 'Becomes' : 'No longer'} ${TRAITS[c.trait].name}`
    case 'layer':
      return c.layer === 'own'
        ? `Own industry: built by ${findUnit(state, c.builderId ?? '')?.name ?? '?'} from ${c.parts.map(res).join(', ')}`
        : 'Reaches Earth’s limit: a planetary bottleneck cleared'
    case 'output':
      return `Output ×${c.factor}`
    case 'input':
      return `${res(c.resourceId)} used ${pct(c.factor)}`
    case 'quirk':
      return `Becomes ${QUIRKS[c.quirk].name}`
  }
}

export function precheckBreakthrough(state: GameState, spec: BreakthroughSpec): string | null {
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!spec.changes.length) return 'Change something on the card.'
  const unit = spec.target.kind === 'unit' ? findUnit(state, spec.target.id) : undefined
  const strategy = spec.target.kind === 'strategy' ? findStrategy(state, spec.target.id) : undefined
  if (!unit && !strategy) return 'Choose what to change.'
  if (strategy && strategy.kind !== 'make') return 'Only ordinary strategies can be changed.'
  for (const c of spec.changes) {
    if (c.kind === 'software' && (!unit?.mind || c.share > iqRoom(unit) + 1e-9)) {
      return unit?.mind ? `${unit.name}’s software is near its ceiling. Smarter needs new hardware.` : 'Only minds run software.'
    }
    if (c.kind === 'hardware') {
      if (!unit?.mind) return 'Only minds have a hardware platform.'
      if (!c.name.trim() || c.name.trim().toLowerCase() === unit.hardware.name.toLowerCase()) return 'Name the new hardware.'
      if (!c.parts.length) return 'Say what the new hardware is made from.'
      if (c.parts.length > B.MAX_PARTS) return `At most ${B.MAX_PARTS} parts.`
      if (layerChange(spec)) return 'Change the hardware and the supply in separate breakthroughs.'
    }
    if ((c.kind === 'upkeep' || c.kind === 'parts') && !unit) return 'That change needs a unit.'
    if (c.kind === 'trait') {
      if (!unit) return 'Only units have traits.'
      const t = TRAITS[c.trait]
      if (c.add && unit.traits.includes(c.trait)) return `${unit.name} are already ${t.name}.`
      if (!c.add && !unit.traits.includes(c.trait)) return `${unit.name} aren’t ${t.name}.`
      if (c.add && t.thinkers && !unit.mind) return `${t.name} is for minds only.`
      if (c.add && t.param && !spec.params.some((p) => p.trait === c.trait)) return `Say what ${t.name} applies to.`
    }
    if (c.kind === 'layer') {
      if (!unit || unit.starting) return 'There’s only ever one Starting Server.'
      if (c.layer === 'own' && unit.layers.own) return `${unit.name} already have an own-industry layer.`
      if (c.layer === 'own' && (!c.builderId || !findUnit(state, c.builderId))) return 'Choose who builds them.'
      if (c.layer === 'own' && !c.parts.length) return 'Say what they’re made from.'
      if (c.layer === 'earth' && !unit.layers.own) return 'Build your own industry first.'
      if (c.layer === 'earth' && unit.layers.earth) return `${unit.name} already reach Earth’s limit.`
    }
    if ((c.kind === 'output' || c.kind === 'input') && !strategy) return 'That change needs a strategy.'
  }
  return null
}

/** The card after the changes, for before-and-after. Works on a copy. */
export function previewChanges(
  state: GameState,
  spec: BreakthroughSpec
): { state: GameState; unit?: UnitType; strategy?: Strategy } {
  const copy = structuredClone(state)
  if (spec.target.kind === 'unit') {
    const unit = findUnit(copy, spec.target.id)
    if (!unit) return { state: copy }
    applyUnitChanges(copy, unit, spec.changes, recipeParts(copy, unit, spec), spec.params)
    return { state: copy, unit }
  }
  const strategy = findStrategy(copy, spec.target.id)
  if (strategy) applyStrategyChanges(copy, strategy, spec.changes)
  return { state: copy, strategy }
}

export async function judgeBreakthrough(
  state: GameState,
  judge: Judge,
  raw: BreakthroughSpec
): Promise<BreakthroughVerdict> {
  const spec: BreakthroughSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckBreakthrough(state, spec)
  if (refusal) throw new Error(refusal)
  const name = targetName(state, spec.target)
  const changes = spec.changes.map((c) => describeChange(state, spec.target, c))
  const earlier = [
    ...state.breakthroughs.map((b) => b.name),
    ...state.projects.filter((p) => p.effect.kind === 'breakthrough').map((p) => p.name)
  ]
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Is this a plausible breakthrough for ${name}, given how it says it works?`
    },
    difficulty: {
      type: 'score',
      instructions: 'How hard would the research be?',
      criteria: scale(B.BREAKTHROUGH_DIFFICULTY)
    },
    field: fieldQuestion
  }
  if (earlier.length) {
    questions.same_as = {
      type: 'choice',
      instructions: 'Is it the same idea as an earlier breakthrough?',
      criteria: { none: 'It is a new idea', ...Object.fromEntries(earlier.map((n, i) => [`b${i}`, n])) }
    }
  }
  const recipe = recipeOf(spec)
  if (recipe) {
    const hw = hardwareChange(spec)
    const parts = recipe.parts.map((id) => findResource(state, id)?.name ?? '?').join(', ')
    Object.assign(questions, recipeQuestions(hw ? `one ${name} on new ${hw.name} hardware` : `one ${name}`, parts))
  }
  // The catch if the player takes the easier research: a drawback for a unit, a quirk for a strategy.
  const unit = spec.target.kind === 'unit' ? findUnit(state, spec.target.id) : undefined
  const adding = spec.changes.flatMap((c) => (c.kind === 'trait' && c.add ? [c.trait] : []))
  const drawbacks = unit ? catchTraits(unit.mind, [...unit.traits, ...adding]) : []
  if (unit && drawbacks.length) {
    questions.catch = {
      type: 'choice',
      instructions: 'If this research were done the quick way, which drawback would come with it?',
      criteria: Object.fromEntries(drawbacks.map((t) => [t.id, `${t.name}: ${t.rule}`]))
    }
  } else if (!unit) {
    questions.catch = quirkQuestion(QUIRK_IDS)
  }
  const answers = await judge.ask(
    proposalText(state, [
      `The player proposes a breakthrough for ${name}.`,
      `Name: "${spec.name}"`,
      `How: "${spec.description || '(not said)'}"`,
      'Changes:',
      ...changes.map((c) => `- ${c}`)
    ]),
    questions,
    'breakthrough'
  )
  const catches: Complication[] = unit
    ? (answers.catch ? ranked(answers.catch).map(([k]) => k) : [])
        .filter((k): k is TraitId => drawbacks.some((t) => t.id === k))
        .map((trait) => ({ kind: 'trait', trait }))
    : rankedQuirks(answers, QUIRK_IDS)
  const v: BreakthroughVerdict = {
    ...baseVerdict(
      'breakthrough',
      questions,
      answers,
      'plausible',
      [{ key: 'difficulty', topic: 'how hard the research is', better: 'lower' }],
      { list: catches, shared: false }
    ),
    kind: 'breakthrough',
    spec,
    missing: [],
    pushbackRounds: 0
  }
  gate(
    v,
    'Jev doesn’t find it plausible',
    earlier.length ? { key: 'same_as', names: Object.fromEntries(earlier.map((n, i) => [`b${i}`, n])) } : null
  )
  if (recipe) v.missing = missingKinds(v)
  return v
}

export function draftBreakthrough(state: GameState, v: BreakthroughVerdict): { bar: number; size: number; field: Field } {
  const read = reader(v)
  let bar = B.pick(B.BREAKTHROUGH_DIFFICULTY, read.level('difficulty', B.BREAKTHROUGH_DIFFICULTY.length))[1]
  const unit = v.spec.target.kind === 'unit' ? findUnit(state, v.spec.target.id) : undefined
  // A step in IQ follows the leap rule: reaching a new IQ needs a mind with half of it.
  for (const c of v.spec.changes) {
    if (!unit) break
    const iq =
      c.kind === 'software'
        ? unit.hardware.iq * (1 + unit.software.bonus + c.share)
        : c.kind === 'hardware'
          ? unit.hardware.iq * (1 + c.share) * (1 + unit.software.bonus)
          : 0
    bar = Math.max(bar, Math.ceil(iq * B.DESIGN_BAR))
  }
  const weeks = Math.max(B.BREAKTHROUGH_MIN_WEEKS, gainOf(v.spec.changes) * B.BREAKTHROUGH_WEEKS_PER_GAIN)
  return { bar, size: projectSize(bar, weeks, costMultiplier(v.plausibility, v.bar)), field: read.choice('field', FIELDS) }
}

/** The proposed changes, plus any catch the player took on for easier research. */
export function withCatches(v: BreakthroughVerdict): Change[] {
  const extra: Change[] = catchesOf(v).map((c) =>
    c.kind === 'trait' ? { kind: 'trait', trait: c.trait, add: true } : { kind: 'quirk', quirk: c.quirk }
  )
  return [...v.spec.changes, ...extra]
}

export function acceptBreakthrough(current: GameState, v: BreakthroughVerdict): Accepted {
  if (v.rejected || v.duplicateOf) throw new Error('This proposal was not accepted.')
  if (v.missing.length) throw new Error('Answer Jev’s pushback first.')
  const state = structuredClone(current)
  const { bar, size, field } = draftBreakthrough(state, v)
  const unit = v.spec.target.kind === 'unit' ? findUnit(state, v.spec.target.id) : undefined
  const changes = withCatches(v)
  const project = newProject(state, {
    name: v.spec.name,
    description: changes.map((c) => describeChange(state, v.spec.target, c)).join('; '),
    icon: '💡',
    field,
    bar,
    size,
    effect: {
      kind: 'breakthrough',
      target: v.spec.target,
      changes,
      parts: unit && recipeOf(v.spec) ? recipeParts(state, unit, v.spec) : undefined,
      params: v.spec.params
    }
  })
  state.projects.push(project)
  state.inventions.push({ week: state.week, icon: '💡', name: v.spec.name, kind: 'breakthrough' })
  state.decidedThisWeek = true
  logProposal(state, 'good', `💡 ${project.name}: bar IQ ${bar}, size ${size}.`)
  return { state, outcome: { kind: 'project', project } }
}

/** Layer sizes before and after, for the card. */
export const layerSummary = (u: UnitType) =>
  (['market', 'own', 'earth'] as const).map((l) => ({ layer: l, size: layerSize(u, l) }))
