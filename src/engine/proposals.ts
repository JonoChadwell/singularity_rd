import {
  answerFor,
  ranked,
  readChoice,
  readLevel,
  readNoul,
  tornPair,
  type JevAnswer,
  type JevQuestion,
  type Judge
} from '@/ai/jev'
import * as B from './balance'
import { findResource, findUnit, labour, makeId, namesInUse, runsOn, tierFactor } from './model'
import { addStrategy, costMultiplier, priceCost, spendable } from './research'
import { lockReason, moveClock } from './phase'
import { alarmQuestions, riskFrom } from './risk'
import { proposalText } from './stateText'
import { QUIRK_IDS, QUIRKS, TRAITS, type QuirkId, type TraitId } from './traits'
import type { Cost, GameState, Research, Resource, Risk, Strategy } from './types'

export const NAME_MAX = 40
export const DESCRIPTION_MAX = 240
export const MAX_INPUTS = 2

export type ProposalKind = 'resource' | 'strategy' | 'unit' | 'mind' | 'income' | 'plan' | 'cover'

/** What the better of two answers costs: a drawback for a unit, a quirk for a strategy. */
export type Complication = { kind: 'trait'; trait: TraitId } | { kind: 'quirk'; quirk: QuirkId }

/**
 * A question Jev was torn on. When the two answers differ in quality, it's a trade-off:
 * `options[0]` is the worse result, exactly as proposed, and `options[1]` the better one with
 * `catch` attached. Otherwise (`catch` null) it's a plain choice between two different things.
 */
export interface TornPick {
  key: string
  /** What Jev was torn about, as a phrase: "how well it works". */
  topic: string
  catch: Complication | null
  options: { value: string; label: string; p: number }[]
}

/** Which questions the player may settle, and how. */
export interface TornSpec {
  key: string
  topic: string
  /** For quality questions: which way is better. Scores compare levels; choices use this order, best first. */
  better?: 'higher' | 'lower' | readonly string[]
  /** The catch on the better answer. A quality question with no catch isn't asked. */
  catch?: Complication | null
}

export const complicationName = (c: Complication) => (c.kind === 'trait' ? TRAITS[c.trait] : QUIRKS[c.quirk])

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
  /** Phase 2: research humans would notice. */
  risk: Risk | null
}

export type Outcome =
  | { kind: 'added'; name: string }
  | { kind: 'research'; research: Research }

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

/** Which stocks may pay for a research. Everything, unless a rule says otherwise. */
export type Payable = (r: Resource) => boolean

/**
 * Which resources a research would use up. Jev ranks the stocks; the cost goes to the most
 * fitting, and a close second shares it. With only one stock, there's nothing to ask.
 */
export function payQuestion(state: GameState, what: string, allow?: Payable): Record<string, JevQuestion> {
  const stocks = spendable(state, allow)
  if (stocks.length < 2) return {}
  return {
    pay: {
      type: 'choice',
      instructions: `Researching ${what} would use up some of the AI's resources: materials for experiments and prototypes, data, or money to fund it. Which would it most naturally use up?`,
      criteria: options(stocks)
    }
  }
}

/** Jev's ranking of what pays, most fitting first. Empty when there was nothing to ask. */
export function payers(answers: Record<string, JevAnswer>): { resourceId: string; p: number }[] {
  return answers.pay ? ranked(answers.pay).map(([resourceId, p]) => ({ resourceId, p })) : []
}

/** How many of Jev's favourite payers the player may choose between. */
export const PAY_CHOICES = 3

/** The stocks the player may choose to pay with: Jev's favourites. */
export const payOptions = (v: Pick<VerdictBase, 'answers'>) => payers(v.answers).slice(0, PAY_CHOICES)

/**
 * A research's cost: `value` worth of the resources Jev picked, more for less plausible ideas.
 * The player may pick one of Jev's favourites to pay with instead.
 */
export function costFor(
  state: GameState,
  v: Pick<VerdictBase, 'answers' | 'plausibility' | 'bar'> & { risk?: Risk | null; picks?: Record<string, string> },
  value: number,
  allow?: Payable
): Cost {
  const risky = v.risk ? B.RISK_COST : 1
  const pick = v.picks?.pay
  const chosen = pick && payOptions(v).some((p) => p.resourceId === pick) ? [{ resourceId: pick, p: 1 }] : payers(v.answers)
  return priceCost(state, value * costMultiplier(v.plausibility, v.bar) * risky, chosen, allow)
}

/**
 * Finds the questions Jev was torn on, among the ones the player may settle. Never offers
 * "easier" against "harder": a quality question becomes a trade-off with a catch, or isn't
 * asked at all (Jev's top answer stands).
 */
export function findTorn(
  questions: Record<string, JevQuestion>,
  answers: Record<string, JevAnswer>,
  specs: TornSpec[],
  catches: Catches = NO_CATCHES
): TornPick[] {
  const torn: TornPick[] = []
  let next = 0
  for (const s of specs) {
    const q = questions[s.key]
    const a = answers[s.key]
    if (!q || !a || q.type === 'noul') continue
    const pair = tornPair(a, B.TORN_CONFIDENCE, B.TORN_GAP)
    if (!pair) continue
    // Only questions that actually come up take a catch, most fitting first.
    const spec = s.better && s.catch === undefined ? { ...s, catch: catches.list[catches.shared ? 0 : next] ?? null } : s
    if (spec.better && !spec.catch) continue
    if (spec.better && !catches.shared) next++
    const probabilities = (a.type !== 'noul' && a.probabilities) || {}
    const label = (value: string) =>
      q.type === 'score' ? (q.criteria[Number(value)] ?? value) : (q.criteria[value] ?? value)
    let [first, second] = pair
    if (spec.better) {
      const rank = (value: string) =>
        spec.better === 'higher'
          ? -Number(value)
          : spec.better === 'lower'
            ? Number(value)
            : (spec.better as readonly string[]).indexOf(value)
      // Worse first: that's exactly what was proposed.
      if (rank(first) < rank(second)) [first, second] = [second, first]
    }
    torn.push({
      key: spec.key,
      topic: spec.topic,
      catch: spec.better ? (spec.catch ?? null) : null,
      options: [first, second].map((value) => ({ value, label: label(value), p: probabilities[value] ?? 0 }))
    })
  }
  return torn
}

/** Asks which quirk would be a strategy's most natural catch. */
export function quirkQuestion(quirks: readonly QuirkId[]): JevQuestion {
  return {
    type: 'choice',
    instructions: 'If doing this well came with a catch, which would be most natural?',
    criteria: Object.fromEntries(quirks.map((q) => [q, `${QUIRKS[q].name}: ${QUIRKS[q].rule}`]))
  }
}

/** Quirks, most fitting first, from the answer to `quirkQuestion`. */
export function rankedQuirks(answers: Record<string, JevAnswer>, quirks: readonly QuirkId[]): Complication[] {
  const a = answers.catch
  const order = a ? ranked(a).map(([k]) => k) : []
  return [...order, ...quirks]
    .filter((k, i, all): k is QuirkId => (quirks as readonly string[]).includes(k) && all.indexOf(k) === i)
    .map((quirk) => ({ kind: 'quirk', quirk }))
}

/** The catches the player took on, by choosing Jev's better answers. */
export function catchesOf(v: Pick<VerdictBase, 'torn' | 'picks'>): Complication[] {
  const out: Complication[] = []
  for (const t of v.torn) {
    if (!t.catch || v.picks[t.key] !== t.options[1]?.value) continue
    if (!out.some((c) => JSON.stringify(c) === JSON.stringify(t.catch))) out.push(t.catch)
  }
  return out
}

/**
 * Candidate catches for trade-offs, most fitting first. Strategies share one quirk
 * (`shared`); units and breakthroughs take a different drawback for each trade-off.
 */
export interface Catches {
  list: Complication[]
  shared: boolean
}
const NO_CATCHES: Catches = { list: [], shared: false }

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
  torn: TornSpec[],
  catches: Catches = NO_CATCHES
): VerdictBase {
  const plausibility = readNoul(answerFor(answers, plausibilityKey))
  const bar = B.BARS[kind]
  const found = findTorn(questions, answers, torn, catches)
  // Trade-offs start on the answer that does exactly what was proposed.
  const picks = Object.fromEntries(found.filter((t) => t.catch).map((t) => [t.key, t.options[0]!.value]))
  return {
    kind,
    answers,
    picks,
    torn: found,
    plausibility,
    bar,
    rejected: null,
    duplicateOf: null,
    risk: riskFrom(answers)
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

/** Refuses a verdict Jev didn't pass, saying why. */
export function refuseUnaccepted(v: Pick<VerdictBase, 'rejected' | 'duplicateOf'>) {
  if (v.duplicateOf) throw new Error(`Jev thinks this is the same as ${v.duplicateOf}. Make it different, or use ${v.duplicateOf}.`)
  if (v.rejected) throw new Error(`Not accepted: ${v.rejected}`)
}

export function logProposal(state: GameState, tone: 'good' | 'ai', text: string) {
  state.log.push({ week: state.week, tone, text })
}

/**
 * One research proposal a week: accepting a strategy, unit, mind, upgrade or passive income uses
 * it. Resources don't. Doing research already proposed has no weekly limit.
 */
export const proposalSlotBlocker = (state: GameState): string | null =>
  state.proposedThisWeek ? 'You’ve already proposed research this week. Next week you can propose another.' : null

/** Uses the week's proposal, or refuses if it's gone. */
export function claimProposal(state: GameState) {
  const blocker = proposalSlotBlocker(state)
  if (blocker) throw new Error(blocker)
  state.proposedThisWeek = true
}

/** No research ever needs less than MIN_IQ. */
export const floorIQ = (iq: number) => Math.max(B.MIN_IQ, Math.ceil(iq))

export function newResearch(state: GameState, fields: Omit<Research, 'id' | 'proposedWeek'>): Research {
  return { ...fields, minIQ: floorIQ(fields.minIQ), id: makeId(state, fields.name), proposedWeek: state.week }
}

/** Adds a research to the list, with a line for the log. */
export function addResearch(state: GameState, research: Research): Accepted {
  state.research.push(research)
  logProposal(state, 'good', `${research.icon} ${research.name}: research needing IQ ${research.minIQ}.`)
  return { state, outcome: { kind: 'research', research } }
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

/** The value bands a new resource may have now: Phase 1 things are cheap. */
export const maxBand = (state: GameState) => B.PHASE_MAX_BAND[state.phase.n]
/** The highest tier a new resource may have now, outside a plan's top resource. */
export const maxTier = (state: GameState) => B.PHASE_MAX_TIER[state.phase.n]

/**
 * Questions about a resource. With a prefix, several resources are asked about in one call, so
 * each question names its own (`name`); otherwise Jev answers them all alike. Tier is only asked
 * when the phase allows more than one.
 */
export function resourceQuestions(state: GameState, prefix = '', name = ''): Record<string, JevQuestion> {
  const it = name ? `"${name}"` : 'it'
  const This = name ? `"${name}"` : 'this'
  return {
    [`${prefix}is_thing`]: {
      type: 'noul',
      instructions: `Is ${This} a recognisable thing, real or fictional, that someone could in principle get or use? It does not need to be easy or useful. Only answer no for gibberish or something that is not a thing at all.`
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
      instructions: `If some of ${it} is made this week and not used, is it still there next week? Most things keep; only things like electricity or attention are lost.`,
      criteria: {
        stock: 'Yes: it is a stock that keeps, like money, lemons, documents, keys or silicon wafers',
        flow: 'No: it is a flow that is lost if unused, like electricity, compute time or attention'
      }
    },
    [`${prefix}value`]: {
      type: 'score',
      instructions: `How much is a single one of ${it} worth?`,
      criteria: scale(B.RESOURCE_VALUE.slice(0, maxBand(state) + 1))
    },
    ...(maxTier(state) > 0
      ? {
          [`${prefix}tier`]: {
            type: 'score',
            instructions: `How far along the AI's journey is ${it}: something to start from, or something that takes a chain of other things to make?`,
            criteria: B.RESOURCE_TIERS.slice(0, maxTier(state) + 1)
          } satisfies JevQuestion
        }
      : {}),
    [`${prefix}icon`]: name
      ? { ...iconQuestion, instructions: `Which icon best represents ${it}?` }
      : iconQuestion
  }
}

/**
 * Builds a resource from Jev's answers (with an optional key prefix). A plan's top resource
 * passes its tier, and is always a stock, since the goal uses it up.
 */
export function resourceFrom(
  state: GameState,
  v: Pick<VerdictBase, 'answers' | 'picks'>,
  spec: ResourceSpec,
  prefix = '',
  top: number | null = null
): Resource {
  const read = reader(v)
  const band = read.level(`${prefix}value`, maxBand(state) + 1)
  const kind = top === null ? read.choice(`${prefix}kind`, ['stock', 'flow'] as const) : 'stock'
  const tier = top ?? (read.has(`${prefix}tier`) ? read.level(`${prefix}tier`, maxTier(state) + 1) : 0)
  return {
    id: makeId(state, spec.name),
    name: spec.name,
    description: spec.description || spec.name,
    icon: B.icon(read.choice(`${prefix}icon`, Object.keys(B.ICONS))),
    kind,
    band,
    tier,
    value: B.pick(B.RESOURCE_VALUE, band)[1],
    amount: 0,
    stored: 0
  }
}

/** Resources have a very low bar: "a thing I could get". They're added at once. */
export async function judgeResource(state: GameState, judge: Judge, raw: ResourceSpec): Promise<ResourceVerdict> {
  const spec = cleanText(raw.name, raw.description)
  const refusal = lockReason(state, 'resource') ?? precheckName(state, spec.name)
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
    // Only stock-or-flow is worth asking about: it changes how the thing plays. Value just
    // takes Jev's answer.
    ...baseVerdict('resource', questions, answers, 'is_thing', [
      { key: 'kind', topic: 'whether it keeps from week to week' }
    ]),
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
  refuseUnaccepted(v)
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
    ...payQuestion(state, `how ${unit.name} could do this`),
    ...alarmQuestions(state)
  }
  const quirks = QUIRK_IDS.filter((q) => q !== 'picky' || inputs.length > 0 || unit.upkeep.length > 0)
  questions.catch = quirkQuestion(quirks)
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
  const torn: TornSpec[] = [
    { key: 'efficiency', topic: 'how well it works', better: 'higher' },
    { key: 'advancement', topic: 'how much research it needs', better: 'lower' },
    ...inputs.map((r, i) => ({ key: `input_${i}`, topic: `how much ${r.name} it uses`, better: 'lower' as const }))
  ]
  const v: StrategyVerdict = {
    ...baseVerdict('strategy', questions, answers, 'plausible', torn, {
      list: rankedQuirks(answers, quirks),
      shared: true
    }),
    kind: 'strategy',
    spec
  }
  gate(v, `Jev doesn’t think ${unit.name} could do this`, null)
  return v
}

/** The strategy as it would be, and the research it needs (minimum IQ 0 = none). */
export function draftStrategy(state: GameState, v: StrategyVerdict): { strategy: Strategy; minIQ: number; cost: Cost } {
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
      ((work + inputValue) * efficiency * (v.risk ? B.RISK_OUTPUT : 1) * tierFactor(unit.tier, output.tier)) /
        output.value
    )
  }
  const quirk = catchesOf(v).find((c) => c.kind === 'quirk')
  if (quirk?.kind === 'quirk') strategy.quirk = quirk.quirk
  // Making something of a higher tier takes a smarter mind, however simple the method.
  const minIQ = Math.max(advancementIQ, output.tier > 0 ? B.TIERS[output.tier]![1] : 0)
  // Working it out costs some weeks of what the runners would make.
  const cost = weeks ? costFor(state, v, weeks * work * Math.max(unit.count, B.MIN_FLEET)) : []
  return { strategy, minIQ: minIQ ? floorIQ(minIQ) : 0, cost }
}

export function acceptStrategy(current: GameState, v: StrategyVerdict): Accepted {
  refuseUnaccepted(v)
  const state = structuredClone(current)
  claimProposal(state)
  const { strategy, minIQ, cost } = draftStrategy(state, v)
  const unit = findUnit(state, strategy.unitId)!
  state.inventions.push({ week: state.week, icon: unit.icon, name: strategy.name, kind: 'strategy' })
  state.decidedThisWeek = true
  if (!minIQ) {
    addStrategy(state, strategy)
    logProposal(state, 'good', `${unit.icon} ${strategy.name} is ready.`)
    // Nothing to research, so humans notice straight away.
    if (v.risk) moveClock(state, -v.risk.weeks, `${strategy.name} alarmed humans`)
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
