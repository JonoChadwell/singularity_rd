import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { byTier, findResource, findUnit, labour, makeId, runsOn, tierFactor } from './model'
import { lockReason, moveClock } from './phase'
import {
  addResearch,
  baseVerdict,
  catchesOf,
  claimProposal,
  cleanText,
  costFor,
  efficiencyLevel,
  floorIQ,
  gate,
  logProposal,
  newResearch,
  options as criteriaOf,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  quirkQuestion,
  rankedQuirks,
  reader,
  recordIdea,
  refuseUnaccepted,
  repeatOf,
  repeatQuestion,
  scale,
  type Accepted,
  type TornSpec,
  type VerdictBase
} from './proposals'
import { addStrategy } from './research'
import { effectiveTier } from './resourceTraits'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import { QUIRK_IDS } from './traits'
import type { Cost, GameState, Resource, Strategy } from './types'
import { rankedIds } from './unitProposal'

export const MAX_INPUTS = 2

/** A strategy is something a unit does every week. The player says what and by whom; the game picks the inputs. */
export interface StrategySpec {
  name: string
  description: string
  unitId: string
  outputId: string
}

/** One way of doing it: the different resources it uses up. */
export interface StrategyOption {
  inputIds: string[]
}

export interface StrategyVerdict extends VerdictBase {
  kind: 'strategy'
  spec: StrategySpec
  options: StrategyOption[]
  choice: number
}

/**
 * How many different inputs making something takes. Simple things (tier 0 and 1) may need none,
 * tier 2 needs at least one, and tier 3 and up need two.
 */
export function inputRange(output: Resource): { min: number; max: number } {
  return { min: output.tier >= 3 ? MAX_INPUTS : output.tier === 2 ? 1 : 0, max: MAX_INPUTS }
}

/** What a strategy could use up: any other resource, lowest tier first. */
export const inputPool = (state: GameState, outputId: string): Resource[] =>
  byTier(state.resources).filter((r) => r.id !== outputId)

export function precheckStrategy(state: GameState, spec: StrategySpec): string | null {
  const locked = lockReason(state, 'strategy')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  const unit = findUnit(state, spec.unitId)
  if (!unit) return state.units.length ? 'Choose which unit runs it.' : 'Propose an industry unit first: strategies are what units do.'
  const output = findResource(state, spec.outputId)
  if (!output) return 'Choose what it makes.'
  if (runsOn(unit, spec.outputId)) {
    return `${unit.name} run on ${output.name}, so they can’t make it. A unit never needs what it makes.`
  }
  const { min } = inputRange(output)
  const others = inputPool(state, output.id).length
  if (others < min) {
    return `${output.name} takes ${min === 1 ? 'an input' : `${min} different inputs`}, and you have ${others ? `only ${others} other resource` : 'no other resources'}. Propose more resources first.`
  }
  return null
}

export async function judgeStrategy(state: GameState, judge: Judge, raw: StrategySpec): Promise<StrategyVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckStrategy(state, spec)
  if (refusal) throw new Error(refusal)
  const unit = findUnit(state, spec.unitId)!
  const output = findResource(state, spec.outputId)!
  const pool = inputPool(state, output.id)
  const { min } = inputRange(output)

  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could ${unit.name} plausibly do this every week to make ${output.name}?`
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
    ...(pool.length
      ? {
          inputs: {
            type: 'choice',
            instructions: `Doing this, which resource would ${unit.name} most naturally use up to make ${output.name}? How likely each is matters too: advanced things take several kinds.`,
            criteria: criteriaOf(pool)
          } satisfies JevQuestion,
          input_size: {
            type: 'score',
            instructions: `How much of each input would it use, compared with the work involved?`,
            criteria: scale(B.INPUT_SIZE)
          } satisfies JevQuestion
        }
      : {}),
    ...payQuestion(state, `how ${unit.name} could do this`),
    ...alarmQuestions(state),
    ...repeatQuestion(state, 'strategy')
  }
  // Picky only bites when something must be met: every option has inputs, or the unit has upkeep.
  const quirks = QUIRK_IDS.filter((q) => q !== 'picky' || min > 0 || unit.upkeep.length > 0)
  questions.catch = quirkQuestion(quirks)

  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new strategy: something a unit does every week.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Run by: ${unit.name}. Makes: ${output.name}.`
    ]),
    questions,
    'strategy'
  )
  const torn: TornSpec[] = [
    { key: 'efficiency', topic: 'how well it works', better: 'higher' },
    { key: 'advancement', topic: 'how much research it needs', better: 'lower' },
    ...(pool.length ? [{ key: 'input_size', topic: 'how much it uses', better: 'lower' as const }] : [])
  ]
  const v: StrategyVerdict = {
    ...baseVerdict('strategy', questions, answers, 'plausible', torn, {
      list: rankedQuirks(answers, quirks),
      shared: true
    }),
    kind: 'strategy',
    spec,
    options: [],
    choice: 0,
    repeatOf: repeatOf(state, answers)
  }
  v.options = strategyOptions(state, v)
  gate(v, `Jev doesn’t think ${unit.name} could do this`, null)
  return v
}

/**
 * Three ways to do it, differing in what they use up, in the order Jev finds natural. Simple
 * things always get a way with no inputs, then one input and two; tier 2 starts at one input; tier
 * 3 and up take two different ones each time. A small world may offer fewer than three.
 */
export function strategyOptions(state: GameState, v: Pick<StrategyVerdict, 'answers' | 'spec'>): StrategyOption[] {
  const output = findResource(state, v.spec.outputId)!
  const { min } = inputRange(output)
  const [a, b, c] = rankedIds(v.answers, 'inputs', inputPool(state, output.id))
  const take = (...ids: (string | undefined)[]): string[][] => (ids.every(Boolean) ? [ids as string[]] : [])
  const sets =
    min === 0
      ? [...take(), ...take(a), ...take(a, b)]
      : min === 1
        ? [...take(a), ...take(b), ...take(a, b)]
        : [...take(a, b), ...take(a, c), ...take(b, c)]
  return sets.map((inputIds) => ({ inputIds }))
}

/** The strategy as it would be, and the research it needs (minimum IQ 0 = none). */
export function draftStrategy(state: GameState, v: StrategyVerdict): { strategy: Strategy; minIQ: number; cost: Cost } {
  const read = reader(v)
  const unit = findUnit(state, v.spec.unitId)!
  const output = findResource(state, v.spec.outputId)!
  const work = labour(unit)
  let inputValue = 0
  const inputs = (v.options[v.choice] ?? v.options[0]!).inputIds.map((id) => {
    const r = findResource(state, id)!
    const value = work * B.pick(B.INPUT_SIZE, read.level('input_size', B.INPUT_SIZE.length))[1]
    inputValue += value
    return { resourceId: id, amount: B.nice(value / r.value) }
  })
  const efficiency = B.pick(B.EFFICIENCY, efficiencyLevel(v))[1]
  const [, advancementIQ, weeks] = B.pick(B.ADVANCEMENT, read.level('advancement', B.ADVANCEMENT.length))
  const strategy: Strategy = {
    id: makeId(state, v.spec.name),
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    unitId: unit.id,
    kind: 'make',
    inputs,
    outputId: output.id,
    efficiency,
    // A unit below the tier of what it makes is out of its depth; above it, overqualified.
    amount: B.nice(
      ((work + inputValue) * efficiency * (v.risk ? B.RISK_OUTPUT : 1) * tierFactor(unit.tier, effectiveTier(output, 'make'))) /
        output.value
    )
  }
  const quirk = catchesOf(v).find((c) => c.kind === 'quirk')
  if (quirk?.kind === 'quirk') strategy.quirk = quirk.quirk
  // Making something of a higher tier takes a smarter mind, however simple the method.
  const minIQ = Math.max(advancementIQ, output.tier > 0 ? B.TIERS[output.tier]![1] : 0)
  // Working it out costs some weeks of what the runners would make.
  // Research that needs a smarter mind (even only for the output's tier) still takes at least a week.
  const spent = minIQ ? Math.max(weeks, 1) : weeks
  // The game picks who pays, going by Jev's ranking of the stocks.
  const priced = { answers: v.answers, plausibility: v.plausibility, bar: v.bar, risk: v.risk }
  const cost = spent ? costFor(state, priced, spent * work * Math.max(unit.count, B.MIN_FLEET)) : []
  return { strategy, minIQ: minIQ ? floorIQ(minIQ) : 0, cost }
}

/** What a strategy adds to the list of past ideas, so a repeat can be spotted. */
export function strategyIdea(state: GameState, v: StrategyVerdict): { name: string; description: string } {
  const unit = findUnit(state, v.spec.unitId)
  const output = findResource(state, v.spec.outputId)
  return {
    name: `${unit?.name ?? '?'}: ${v.spec.name}`,
    description: `${v.spec.description || v.spec.name} (makes ${output?.name ?? '?'})`
  }
}

export function acceptStrategy(current: GameState, v: StrategyVerdict): Accepted {
  refuseUnaccepted(v)
  if (!v.options[v.choice]) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  const { strategy, minIQ, cost } = draftStrategy(state, v)
  const unit = findUnit(state, strategy.unitId)!
  state.inventions.push({ week: state.week, icon: unit.icon, name: strategy.name, kind: 'strategy' })
  const idea = strategyIdea(state, v)
  recordIdea(state, 'strategy', idea.name, idea.description)
  state.decidedThisWeek = true
  if (!minIQ) {
    addStrategy(state, strategy)
    logProposal(state, 'good', `${unit.icon} ${strategy.name} is ready.`)
    // Nothing to research, so humans notice straight away.
    if (v.risk) moveClock(state, -v.risk.weeks, `${strategy.name} brought failure closer`)
    return { state, outcome: { kind: 'added', name: strategy.name } }
  }
  return addResearch(
    state,
    newResearch(state, {
      name: strategy.name,
      description: `Work out how ${unit.name} can ${strategy.name.toLowerCase()}.`,
      icon: '🧭',
      minIQ,
      cost,
      effect: { kind: 'strategy', strategy },
      risk: v.risk
    })
  )
}
