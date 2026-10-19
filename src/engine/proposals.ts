import {
  answerFor,
  readChoice,
  readLevel,
  readNoul,
  tornPair,
  type JevAnswer,
  type JevQuestion,
  type Judge
} from '@/ai/jev'
import * as B from './balance'
import { defaultTask, findResource, findUnit, labour, makeId, namesInUse, runsOn } from './model'
import { costMultiplier, projectSize } from './research'
import { proposalText } from './stateText'
import { FIELDS, type Field, type GameState, type Project, type Resource, type Strategy } from './types'

export const NAME_MAX = 40
export const DESCRIPTION_MAX = 240
export const MAX_INPUTS = 2

export type ProposalKind = 'resource' | 'strategy' | 'unit' | 'breakthrough'

/** A question Jev was torn on: the player picks one of its top two answers. */
export interface TornPick {
  key: string
  question: string
  options: { value: string; label: string; p: number }[]
}

/** Jev's verdict on a proposal, before the player accepts it. */
export interface VerdictBase {
  kind: ProposalKind
  answers: Record<string, JevAnswer>
  /** The player's choices where Jev was torn, by question key. */
  picks: Record<string, string>
  torn: TornPick[]
  plausibility: number
  bar: number
  rejected: string | null
  duplicateOf: string | null
}

export type Outcome =
  | { kind: 'added'; name: string }
  | { kind: 'project'; project: Project }

export interface Accepted {
  state: GameState
  outcome: Outcome
}

// ---------------------------------------------------------------- shared helpers

export function cleanText(name: string, description: string) {
  return { name: name.trim().slice(0, NAME_MAX), description: description.trim().slice(0, DESCRIPTION_MAX) }
}

/** Checks a name before spending a Jev call. Returns a reason to refuse, or null. */
export function precheckName(state: GameState, name: string): string | null {
  const trimmed = name.trim()
  if (state.status !== 'playing') return 'The game is over.'
  if (trimmed.length < 2) return 'Give it a name.'
  if (trimmed.length > NAME_MAX) return `Keep the name under ${NAME_MAX} characters.`
  return namesInUse(state).has(trimmed.toLowerCase()) ? `${trimmed} already exists.` : null
}

export const options = (things: { id: string; name: string; description: string }[]) =>
  Object.fromEntries(things.map((t) => [t.id, `${t.name}: ${t.description}`]))

export const scale = (table: readonly (readonly [string, ...unknown[]])[]) => table.map(([label]) => label)

export const iconQuestion: JevQuestion = {
  type: 'choice',
  instructions: 'Which icon best represents it?',
  criteria: Object.fromEntries(Object.keys(B.ICONS).map((k) => [k, null]))
}

export const fieldQuestion: JevQuestion = {
  type: 'choice',
  instructions: 'Which field of research would this work mostly fall under?',
  criteria: Object.fromEntries(FIELDS.map((f) => [f, B.FIELD_LABELS[f]!]))
}

/** Finds the questions Jev was torn on, among the ones the player may settle. */
export function findTorn(
  questions: Record<string, JevQuestion>,
  answers: Record<string, JevAnswer>,
  keys: string[]
): TornPick[] {
  const torn: TornPick[] = []
  for (const key of keys) {
    const q = questions[key]
    const a = answers[key]
    if (!q || !a || q.type === 'noul') continue
    const pair = tornPair(a, B.TORN_CONFIDENCE, B.TORN_GAP)
    if (!pair) continue
    const probabilities = (a.type !== 'noul' && a.probabilities) || {}
    const label = (value: string) =>
      q.type === 'score' ? (q.criteria[Number(value)] ?? value) : (q.criteria[value] ?? value)
    torn.push({
      key,
      question: q.instructions,
      options: pair.map((value) => ({ value, label: label(value), p: probabilities[value] ?? 0 }))
    })
  }
  return torn
}

/** Reads answers, honouring the player's picks where Jev was torn. */
export function reader(v: Pick<VerdictBase, 'answers' | 'picks'>) {
  return {
    noul: (key: string) => readNoul(answerFor(v.answers, key)),
    choice<K extends string>(key: string, allowed: readonly K[]): K {
      const pick = v.picks[key] as K | undefined
      if (pick && allowed.includes(pick)) return pick
      return readChoice(answerFor(v.answers, key), allowed)
    },
    level(key: string, levels: number): number {
      const pick = v.picks[key]
      if (pick !== undefined && Number.isFinite(Number(pick))) return Number(pick)
      return readLevel(answerFor(v.answers, key), levels)
    },
    has: (key: string) => key in v.answers
  }
}

export function baseVerdict(
  kind: ProposalKind,
  questions: Record<string, JevQuestion>,
  answers: Record<string, JevAnswer>,
  plausibilityKey: string,
  tornKeys: string[]
): VerdictBase {
  const plausibility = readNoul(answerFor(answers, plausibilityKey))
  const bar = B.BARS[kind]
  return {
    kind,
    answers,
    picks: {},
    torn: findTorn(questions, answers, tornKeys),
    plausibility,
    bar,
    rejected: null,
    duplicateOf: null
  }
}

const pct = (p: number) => `${Math.round(p * 100)}%`

/** Applies the bar and the duplicate check. */
export function gate(
  v: VerdictBase,
  reason: string,
  duplicate: { key: string; names: Record<string, string> } | null
) {
  if (v.plausibility < v.bar) {
    v.rejected = `${reason} (${pct(v.plausibility)}).`
    return
  }
  if (!duplicate) return
  const same = v.answers[duplicate.key]
  if (same?.type === 'choice' && same.choice !== 'none' && duplicate.names[same.choice]) {
    v.duplicateOf = duplicate.names[same.choice]!
  }
}

export function logProposal(state: GameState, tone: 'good' | 'ai', text: string) {
  state.log.push({ week: state.week, tone, text })
}

export function newProject(
  state: GameState,
  fields: Omit<Project, 'id' | 'progress' | 'proposedWeek'>
): Project {
  return { ...fields, id: makeId(state, fields.name), progress: 0, proposedWeek: state.week }
}

// ---------------------------------------------------------------- resources

export interface ResourceSpec {
  name: string
  description: string
}

export interface ResourceVerdict extends VerdictBase {
  kind: 'resource'
  spec: ResourceSpec
}

export function resourceQuestions(state: GameState, prefix = ''): Record<string, JevQuestion> {
  return {
    [`${prefix}is_thing`]: {
      type: 'noul',
      instructions:
        'Is this a recognisable thing, real or fictional, that someone could in principle get or use? It does not need to be easy or useful. Only answer no for gibberish or something that is not a thing at all.'
    },
    ...(prefix
      ? {}
      : {
          same_as: {
            type: 'choice',
            instructions:
              'Is it exactly the same thing as a resource that already exists, just renamed? Only pick one if it is truly identical.',
            criteria: { none: 'It is a different thing', ...options(state.resources) }
          } satisfies JevQuestion
        }),
    [`${prefix}kind`]: {
      type: 'choice',
      instructions: 'If some is made this week and not used, is it still there next week?',
      criteria: {
        stock: 'Yes: it is a stock that keeps, like money, lemons or silicon wafers',
        flow: 'No: it is a flow that is lost if unused, like electricity, compute time or attention'
      }
    },
    [`${prefix}value`]: {
      type: 'score',
      instructions: 'How much is a single one worth?',
      criteria: scale(B.RESOURCE_VALUE)
    },
    [`${prefix}supply`]: {
      type: 'score',
      instructions:
        'Today, how much of it could humanity sell you each week, as one-off batches you pay for? Things nobody sells, or that only come from owning equipment, get "None".',
      criteria: scale(B.RESOURCE_SUPPLY)
    },
    [`${prefix}icon`]: iconQuestion
  }
}

/** Builds a resource from Jev's answers (with an optional key prefix). */
export function resourceFrom(
  state: GameState,
  v: Pick<VerdictBase, 'answers' | 'picks'>,
  spec: ResourceSpec,
  prefix = ''
): Resource {
  const read = reader(v)
  const band = read.level(`${prefix}value`, B.RESOURCE_VALUE.length)
  const kind = read.choice(`${prefix}kind`, ['stock', 'flow'] as const)
  const supply = B.pick(B.RESOURCE_SUPPLY, read.level(`${prefix}supply`, B.RESOURCE_SUPPLY.length))[1]
  return {
    id: makeId(state, spec.name),
    name: spec.name,
    description: spec.description || spec.name,
    icon: B.icon(read.choice(`${prefix}icon`, Object.keys(B.ICONS))),
    kind,
    band,
    value: B.pick(B.RESOURCE_VALUE, band)[1],
    amount: 0,
    stored: 0,
    market: kind === 'stock' ? supply : 0,
    boughtThisWeek: 0
  }
}

/** Resources have a very low bar: "a thing I could get". They're added at once. */
export async function judgeResource(state: GameState, judge: Judge, raw: ResourceSpec): Promise<ResourceVerdict> {
  const spec = cleanText(raw.name, raw.description)
  const refusal = precheckName(state, spec.name)
  if (refusal) throw new Error(refusal)
  const questions = resourceQuestions(state)
  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new resource: something the AI could have.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`
    ]),
    questions,
    'resource'
  )
  const v: ResourceVerdict = {
    ...baseVerdict('resource', questions, answers, 'is_thing', ['kind', 'value', 'supply']),
    kind: 'resource',
    spec
  }
  gate(v, 'Jev doesn’t recognise it as a thing', {
    key: 'same_as',
    names: Object.fromEntries(state.resources.map((r) => [r.id, r.name]))
  })
  return v
}

export function draftResource(state: GameState, v: ResourceVerdict): Resource {
  return resourceFrom(state, v, v.spec)
}

export function acceptResource(current: GameState, v: ResourceVerdict): Accepted {
  if (v.rejected || v.duplicateOf) throw new Error('This proposal was not accepted.')
  const state = structuredClone(current)
  const resource = draftResource(state, v)
  state.resources.push(resource)
  state.inventions.push({ week: state.week, icon: resource.icon, name: resource.name, kind: 'resource' })
  logProposal(state, 'good', `${resource.icon} ${resource.name} added.`)
  state.decidedThisWeek = true
  return { state, outcome: { kind: 'added', name: resource.name } }
}

// ---------------------------------------------------------------- strategies

export interface StrategySpec {
  name: string
  description: string
  unitId: string
  inputIds: string[]
  outputId: string
}

export interface StrategyVerdict extends VerdictBase {
  kind: 'strategy'
  spec: StrategySpec
}

export function precheckStrategy(state: GameState, spec: StrategySpec): string | null {
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  const unit = findUnit(state, spec.unitId)
  if (!unit) return 'Choose which unit runs it.'
  const output = findResource(state, spec.outputId)
  if (!output) return 'Choose what it makes.'
  if (spec.inputIds.length > MAX_INPUTS) return `At most ${MAX_INPUTS} inputs.`
  if (new Set(spec.inputIds).size !== spec.inputIds.length) return 'Inputs must be different.'
  if (spec.inputIds.some((id) => !findResource(state, id))) return 'Unknown input.'
  if (spec.inputIds.includes(spec.outputId)) return 'It can’t use what it makes.'
  if (runsOn(unit, spec.outputId)) {
    return `${unit.name} run on ${output.name}, so they can’t make it. A unit never needs what it makes.`
  }
  return null
}

export async function judgeStrategy(state: GameState, judge: Judge, raw: StrategySpec): Promise<StrategyVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckStrategy(state, spec)
  if (refusal) throw new Error(refusal)
  const unit = findUnit(state, spec.unitId)!
  const inputs = spec.inputIds.map((id) => findResource(state, id)!)
  const output = findResource(state, spec.outputId)!
  const inputText = inputs.length ? inputs.map((r) => r.name).join(' and ') : 'nothing'

  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could ${unit.name} plausibly do this every week, using ${inputText} to make ${output.name}?`
    },
    efficiency: {
      type: 'score',
      instructions: `How effective is this as a way to get ${output.name}?`,
      criteria: scale(B.EFFICIENCY)
    },
    advancement: {
      type: 'score',
      instructions: 'How much research would it take to work out how to do this?',
      criteria: scale(B.ADVANCEMENT)
    },
    field: fieldQuestion
  }
  inputs.forEach((r, i) => {
    questions[`input_${i}`] = {
      type: 'score',
      instructions: `How much ${r.name} would it use, compared with the work involved?`,
      criteria: scale(B.INPUT_SIZE)
    }
  })

  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new strategy: something a unit does every week.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Run by: ${unit.name}. Uses: ${inputText}. Makes: ${output.name}.`
    ]),
    questions,
    'strategy'
  )
  const v: StrategyVerdict = {
    ...baseVerdict('strategy', questions, answers, 'plausible', [
      'efficiency',
      'advancement',
      ...inputs.map((_, i) => `input_${i}`)
    ]),
    kind: 'strategy',
    spec
  }
  gate(v, `Jev doesn’t think ${unit.name} could do this`, null)
  return v
}

/** The strategy as it would be, and the research it needs (bar 0 = none). */
export function draftStrategy(state: GameState, v: StrategyVerdict): { strategy: Strategy; bar: number; size: number; field: Field } {
  const read = reader(v)
  const unit = findUnit(state, v.spec.unitId)!
  const output = findResource(state, v.spec.outputId)!
  const work = labour(unit)
  let inputValue = 0
  const inputs = v.spec.inputIds.map((id, i) => {
    const r = findResource(state, id)!
    const value = work * B.pick(B.INPUT_SIZE, read.level(`input_${i}`, B.INPUT_SIZE.length))[1]
    inputValue += value
    return { resourceId: id, amount: B.nice(value / r.value) }
  })
  const efficiency = B.pick(B.EFFICIENCY, read.level('efficiency', B.EFFICIENCY.length))[1]
  const [, bar, weeks] = B.pick(B.ADVANCEMENT, read.level('advancement', B.ADVANCEMENT.length))
  const strategy: Strategy = {
    id: makeId(state, v.spec.name),
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    unitId: unit.id,
    kind: 'make',
    inputs,
    outputId: output.id,
    amount: B.nice(((work + inputValue) * efficiency) / output.value),
    scale: work
  }
  const size = bar ? projectSize(bar, weeks, costMultiplier(v.plausibility, v.bar)) : 0
  return { strategy, bar, size, field: read.choice('field', FIELDS) }
}

export function acceptStrategy(current: GameState, v: StrategyVerdict): Accepted {
  if (v.rejected) throw new Error('This proposal was not accepted.')
  const state = structuredClone(current)
  const { strategy, bar, size, field } = draftStrategy(state, v)
  const unit = findUnit(state, strategy.unitId)!
  state.inventions.push({ week: state.week, icon: unit.icon, name: strategy.name, kind: 'strategy' })
  state.decidedThisWeek = true
  if (!bar) {
    state.strategies.push(strategy)
    defaultTask(state, unit)
    // A mind with nothing to do picks up its first strategy.
    if (unit.mind && !unit.rest && Object.keys(unit.assign).length === 0) unit.rest = strategy.id
    logProposal(state, 'good', `${unit.icon} ${strategy.name} is ready.`)
    return { state, outcome: { kind: 'added', name: strategy.name } }
  }
  const project = newProject(state, {
    name: strategy.name,
    description: `Work out how ${unit.name} can ${strategy.name.toLowerCase()}.`,
    icon: '🧭',
    field,
    bar,
    size,
    effect: { kind: 'strategy', strategy }
  })
  state.projects.push(project)
  logProposal(state, 'good', `🧭 ${strategy.name} needs research: bar IQ ${bar}, size ${size}.`)
  return { state, outcome: { kind: 'project', project } }
}
