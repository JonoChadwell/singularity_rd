import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { currentIQ, findResource, findStrategy, findUnit, iqRoom, layerSize } from './model'
import {
  baseVerdict,
  cleanText,
  fieldQuestion,
  gate,
  logProposal,
  newProject,
  precheckName,
  reader,
  scale,
  type Accepted,
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
import { TRAITS } from './traits'
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

const layerChange = (spec: BreakthroughSpec) =>
  spec.changes.find((c): c is Extract<Change, { kind: 'layer' }> => c.kind === 'layer' && c.layer === 'own')

export function targetName(state: GameState, target: BreakthroughSpec['target']): string {
  return (target.kind === 'unit' ? findUnit(state, target.id)?.name : findStrategy(state, target.id)?.name) ?? '?'
}

/** One change in words, for Jev and for the card. */
export function describeChange(state: GameState, target: BreakthroughSpec['target'], c: Change): string {
  const res = (id: string) => findResource(state, id)?.name ?? '?'
  const pct = (f: number) => (f === 0 ? 'removed' : `×${f}`)
  switch (c.kind) {
    case 'iq': {
      const u = findUnit(state, target.id)
      return u ? `IQ ${Math.round(currentIQ(u))} → ${Math.round(currentIQ(u) + u.baseIQ * c.share)}` : 'IQ up'
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
    if (c.kind === 'iq' && (!unit?.mind || c.share > iqRoom(unit) + 1e-9)) {
      return unit?.mind ? `${unit.name} is near its ceiling. Smarter needs new hardware.` : 'Only minds have IQ.'
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
    const layer = layerChange(spec)
    applyUnitChanges(copy, unit, spec.changes, layer ? priceParts(copy, layer.parts, unit.value) : [], spec.params)
    return { state: copy, unit }
  }
  const strategy = findStrategy(copy, spec.target.id)
  if (strategy) applyStrategyChanges(strategy, spec.changes)
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
  const layer = layerChange(spec)
  if (layer) {
    const recipe = layer.parts.map((id) => findResource(state, id)?.name ?? '?').join(', ')
    Object.assign(questions, recipeQuestions(`one ${name}`, recipe))
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
  const v: BreakthroughVerdict = {
    ...baseVerdict('breakthrough', questions, answers, 'plausible', ['difficulty']),
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
  if (layer) v.missing = missingKinds(v)
  return v
}

export function draftBreakthrough(state: GameState, v: BreakthroughVerdict): { bar: number; size: number; field: Field } {
  const read = reader(v)
  let bar = B.pick(B.BREAKTHROUGH_DIFFICULTY, read.level('difficulty', B.BREAKTHROUGH_DIFFICULTY.length))[1]
  const unit = v.spec.target.kind === 'unit' ? findUnit(state, v.spec.target.id) : undefined
  const iq = v.spec.changes.find((c) => c.kind === 'iq')
  // An IQ step follows the leap rule: reaching a new IQ needs a mind with half of it.
  if (unit && iq?.kind === 'iq') bar = Math.max(bar, Math.ceil((currentIQ(unit) + unit.baseIQ * iq.share) * B.DESIGN_BAR))
  const weeks = Math.max(B.BREAKTHROUGH_MIN_WEEKS, gainOf(v.spec.changes) * B.BREAKTHROUGH_WEEKS_PER_GAIN)
  return { bar, size: projectSize(bar, weeks, costMultiplier(v.plausibility, v.bar)), field: read.choice('field', FIELDS) }
}

export function acceptBreakthrough(current: GameState, v: BreakthroughVerdict): Accepted {
  if (v.rejected || v.duplicateOf) throw new Error('This proposal was not accepted.')
  if (v.missing.length) throw new Error('Answer Jev’s pushback first.')
  const state = structuredClone(current)
  const { bar, size, field } = draftBreakthrough(state, v)
  const layer = layerChange(v.spec)
  const unit = v.spec.target.kind === 'unit' ? findUnit(state, v.spec.target.id) : undefined
  const project = newProject(state, {
    name: v.spec.name,
    description: v.spec.changes.map((c) => describeChange(state, v.spec.target, c)).join('; '),
    icon: '💡',
    field,
    bar,
    size,
    effect: {
      kind: 'breakthrough',
      target: v.spec.target,
      changes: v.spec.changes,
      parts: layer && unit ? priceParts(state, layer.parts, unit.value) : undefined,
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
