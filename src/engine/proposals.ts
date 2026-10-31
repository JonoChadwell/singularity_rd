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
import { ceilingQuestion, readCeiling } from './ceilings'
import { makeId, namesInUse, startingCap } from './model'
import { costMultiplier, priceCost, spendable } from './research'
import { lockReason } from './phase'
import { riskFrom } from './risk'
import { proposalText } from './stateText'
import { QUIRKS, TRAITS, type QuirkId, type TraitId } from './traits'
import {
  ALL_RESOURCE_TRAITS,
  capFactor,
  compatibleTraits,
  RESOURCE_TRAIT_IDS,
  traitLine,
  type ResourceTraitId
} from './resourceTraits'
import type { Cost, GameState, Idea, Research, Resource, Risk } from './types'

export const NAME_MAX = 40
export const DESCRIPTION_MAX = 240

export type ProposalKind = 'resource' | 'strategy' | 'unit' | 'mind' | 'storage' | 'create' | 'plan' | 'cover'

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
  /** The earlier idea Jev thinks this repeats, if any: it's one step less effective. */
  repeatOf: string | null
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
export function payQuestion(state: GameState, what: string, allow?: Payable, verb = 'Researching'): Record<string, JevQuestion> {
  const stocks = spendable(state, allow)
  if (stocks.length < 2) return {}
  return {
    pay: {
      type: 'choice',
      instructions: `${verb} ${what} would use up some of the AI's resources: materials for experiments and prototypes, data, or money to fund it. Which would it most naturally use up?`,
      criteria: options(stocks)
    }
  }
}

/** Jev's ranking of what pays, most fitting first. Empty when there was nothing to ask. */
export function payers(answers: Record<string, JevAnswer>): { resourceId: string; p: number }[] {
  return answers.pay ? ranked(answers.pay).map(([resourceId, p]) => ({ resourceId, p })) : []
}

/** How many of Jev's favourite payers a proposal's takes share out between them. */
export const PAY_CHOICES = 3

/** Each of a proposal's takes' payer: Jev's favourites in turn, so the takes differ in what they use up. Undefined when there was nothing to ask. */
export const payerPerTake = (answers: Record<string, JevAnswer>, count: number): (string | undefined)[] => {
  const favourites = payers(answers).filter((p) => p.p > 0).slice(0, PAY_CHOICES)
  return Array.from({ length: count }, (_, i) => favourites[i % Math.max(1, favourites.length)]?.resourceId)
}

/**
 * A research's cost: `value` worth of the resources Jev picked, more for less plausible ideas.
 * A take may name its own `payer` instead.
 */
export function costFor(
  state: GameState,
  v: Pick<VerdictBase, 'answers' | 'plausibility' | 'bar'> & { risk?: Risk | null },
  value: number,
  allow?: Payable,
  payer?: string
): Cost {
  const risky = v.risk ? B.RISK_COST : 1
  const chosen = payer ? [{ resourceId: payer, p: 1 }] : payers(v.answers)
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

/**
 * Which band a 0–1 answer falls in: the first whose upper bound it doesn't pass. `bounds` rise and
 * end at 1, e.g. [0.4, 0.6, 1] gives bands 0, 1 and 2.
 */
export function bandOf(value: number, bounds: readonly number[]): number {
  const i = bounds.findIndex((upTo) => value <= upTo)
  return i < 0 ? bounds.length - 1 : i
}

/** Reads answers, honouring the player's picks where Jev was torn. */
export function reader(v: Pick<VerdictBase, 'answers' | 'picks'>) {
  return {
    noul: (key: string) => readNoul(answerFor(v.answers, key)),
    /** A 0–1 answer's band: see bandOf. */
    band: (key: string, bounds: readonly number[]) => bandOf(readNoul(answerFor(v.answers, key)), bounds),
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
    risk: riskFrom(answers),
    repeatOf: null
  }
}

// ---------------------------------------------------------------- repeat ideas

/**
 * Asks whether a new idea repeats one the player has already had, of the same kind. Nothing to
 * ask before there are any.
 */
export function repeatQuestion(state: GameState, kind: Idea['kind']): Record<string, JevQuestion> {
  const past = state.ideas
    .map((idea, i) => ({ idea, i }))
    .filter(({ idea }) => idea.kind === kind)
    .slice(-B.REPEAT_LOOKBACK)
  if (!past.length) return {}
  return {
    repeat: {
      type: 'choice',
      instructions:
        'Has the AI already done essentially this before, perhaps under another name? Only pick one if it is the same idea: the same method for the same thing, not just a similar goal.',
      criteria: { none: 'It is a new idea', ...Object.fromEntries(past.map(({ idea, i }) => [`i${i}`, `${idea.name}: ${idea.description}`])) }
    }
  }
}

/** An idea's key: what it was for and what it was called, ignoring case, spacing and punctuation. */
export const ideaKey = (target: string, name: string) =>
  `${target}|${name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}`

/**
 * The earlier idea this one repeats, or null: one of the same kind with the same key (the same
 * name for the same thing, which Jev doesn't reliably spot), else the one Jev picked.
 */
export function repeatOf(state: GameState, answers: Record<string, JevAnswer>, same?: { kind: Idea['kind']; key: string }): string | null {
  const exact = same && state.ideas.find((idea) => idea.kind === same.kind && idea.key === same.key)
  if (exact) return exact.name
  const a = answers.repeat
  if (a?.type !== 'choice' || a.choice === 'none') return null
  return state.ideas[Number(a.choice.slice(1))]?.name ?? null
}

/** The efficiency question: one number, read in EFFICIENCY_BOUNDS. */
export const efficiencyQuestion = (what: string): JevQuestion => ({
  type: 'noul',
  instructions: `Is this a particularly appropriate and efficient way to acquire ${what}?`
})

/** Jev's answer to the efficiency question, 0 to 1. */
export const efficiencyValue = (v: Pick<VerdictBase, 'answers' | 'picks'>) => reader(v).noul('efficiency')

/** Jev's effectiveness rating as a level of EFFICIENCY, a step lower for a repeat, never below Wasteful. */
export function efficiencyLevel(v: Pick<VerdictBase, 'answers' | 'picks' | 'repeatOf'>): number {
  const level = reader(v).band('efficiency', B.EFFICIENCY_BOUNDS)
  return Math.max(0, level - (v.repeatOf ? B.REPEAT_PENALTY : 0))
}

/** Remembers an accepted idea, so later ones can be checked against it. */
export function recordIdea(state: GameState, kind: Idea['kind'], name: string, description: string, key?: string) {
  state.ideas.push({ kind, name, description: description || name, week: state.week, ...(key ? { key } : {}) })
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
 * One action a week: accepting a research proposal (strategy, unit, mind, upgrade, storage,
 * cover) or a Procurement uses it. Resources don't. Doing research already proposed has no
 * weekly limit.
 */
export const proposalSlotBlocker = (state: GameState): string | null =>
  state.proposedThisWeek ? 'You’ve already taken this week’s action. Next week you can take another.' : null

/** Uses the week's proposal, or refuses if it's gone. */
export function claimProposal(state: GameState) {
  const blocker = proposalSlotBlocker(state)
  if (blocker) throw new Error(blocker)
  state.proposedThisWeek = true
}

/** No research ever needs less than MIN_IQ, and every minimum is a multiple of 25. */
export const floorIQ = (iq: number) => Math.max(B.MIN_IQ, Math.ceil(iq / 25) * 25)

/** A requirement of "as smart as you are now" rounds down, so you always meet it (still a multiple of 25). */
export const currentIQBar = (iq: number) => Math.max(B.MIN_IQ, Math.floor(iq / 25) * 25)

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
  /** Jev's trait choices, best first: the player picks one. */
  options: ResourceTraitId[][]
  choice: number
}

/** Traits in Jev's order of fit, with how much it liked each, then the rest in list order. */
function rankedResourceTraits(answer: JevAnswer | undefined): [ResourceTraitId, number][] {
  const order = answer ? ranked(answer) : []
  const known = (id: string): id is ResourceTraitId => (RESOURCE_TRAIT_IDS as readonly string[]).includes(id)
  const seen = new Set<string>()
  return [...order, ...ALL_RESOURCE_TRAITS.map((t) => [t.id, 0] as [string, number])]
    .filter(([id]) => known(id) && !seen.has(id) && !!seen.add(id))
    .map(([id, p]) => [id as ResourceTraitId, p])
}

/**
 * The traits Jev gives a resource on its own: its best fit, and a second from another family
 * when Jev liked that one nearly as much. Never none.
 */
export function autoTraits(answer: JevAnswer | undefined): ResourceTraitId[] {
  const list = rankedResourceTraits(answer)
  const [first, p] = list[0]!
  const second = list.slice(1).find(([id]) => compatibleTraits(first, id))
  return second && p > 0 && second[1] >= p * B.RESOURCE_SECOND_TRAIT ? [first, second[0]] : [first]
}

/** The trait choices for a resource added by hand: Jev's own pick, then the next best on their own. */
export function traitOptions(answer: JevAnswer | undefined): ResourceTraitId[][] {
  const auto = autoTraits(answer)
  const rest = rankedResourceTraits(answer)
    .map(([id]) => id)
    .filter((id) => !auto.includes(id))
  return [auto, ...rest.slice(0, B.RESOURCE_TRAIT_OPTIONS - 1).map((id) => [id])]
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
    [`${prefix}value`]: {
      type: 'score',
      instructions: `How much is a single one of ${it} worth?`,
      criteria: scale(B.RESOURCE_VALUE.slice(0, maxBand(state) + 1))
    },
    ...(maxTier(state) > 0
      ? {
          [`${prefix}tier`]: {
            type: 'score',
            instructions: `How advanced is the technology behind ${it}, compared with what human civilization can make today? Judge the thing itself, not how much of it there is or how hard it is to get.`,
            criteria: B.RESOURCE_TIERS.slice(0, maxTier(state) + 1)
          } satisfies JevQuestion
        }
      : {}),
    [`${prefix}trait`]: {
      type: 'choice',
      instructions: `Going by what ${it} really is, which of these traits fits it most naturally? Each has an upside and a downside; judge the fit, not which is best.`,
      criteria: Object.fromEntries(ALL_RESOURCE_TRAITS.map((t) => [t.id, traitLine(t.id)]))
    },
    [`${prefix}icon`]: name
      ? { ...iconQuestion, instructions: `Which icon best represents ${it}?` }
      : iconQuestion,
    // How many can exist is settled now, not on every storage proposal.
    ...ceilingQuestion(state, 'resource', name ? `"${name}"` : 'of this resource', `${prefix}ceiling`)
  }
}

/**
 * Builds a resource from Jev's answers (with an optional key prefix). A plan's top resource
 * passes its tier. Its storage starts at its tier's worth.
 */
export function resourceFrom(
  state: GameState,
  v: Pick<VerdictBase, 'answers' | 'picks'>,
  spec: ResourceSpec,
  prefix = '',
  top: number | null = null,
  traits: ResourceTraitId[] = autoTraits(v.answers[`${prefix}trait`])
): Resource {
  const read = reader(v)
  const band = read.level(`${prefix}value`, maxBand(state) + 1)
  const tier = top ?? (read.has(`${prefix}tier`) ? read.level(`${prefix}tier`, maxTier(state) + 1) : 0)
  const value = B.pick(B.RESOURCE_VALUE, band)[1]
  const r: Resource = {
    id: makeId(state, spec.name),
    name: spec.name,
    description: spec.description || spec.name,
    icon: B.icon(read.choice(`${prefix}icon`, Object.keys(B.ICONS))),
    band,
    tier,
    value,
    amount: 0,
    cap: B.nice(startingCap(tier, value) * capFactor({ traits })),
    traits,
    ceiling: readCeiling(v.answers, 'resource', `${prefix}ceiling`)
  }
  return r
}

/** Retiers a resource, keeping its storage in step: a plan may move one into an empty tier. */
export function setTier(r: Resource, tier: number) {
  r.tier = tier
  r.cap = B.nice(startingCap(tier, r.value) * capFactor(r))
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
    // Value and tier just take Jev's answer.
    ...baseVerdict('resource', questions, answers, 'is_thing', []),
    kind: 'resource',
    spec,
    options: traitOptions(answers.trait),
    choice: 0
  }
  gate(v, 'Jev doesn’t recognise it as a thing', {
    key: 'same_as',
    names: Object.fromEntries(state.resources.map((r) => [r.id, r.name]))
  })
  return v
}

export function draftResource(state: GameState, v: ResourceVerdict): Resource {
  return resourceFrom(state, v, v.spec, '', null, v.options[v.choice] ?? v.options[0])
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
