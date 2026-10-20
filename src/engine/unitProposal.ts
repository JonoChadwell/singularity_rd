import { answerFor, ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { findResource, findUnit, makeId, traitPriceFactor } from './model'
import {
  addResearch,
  baseVerdict,
  catchesOf,
  claimProposal,
  cleanText,
  costFor,
  floorIQ,
  type Complication,
  type TornSpec,
  gate,
  iconQuestion,
  logProposal,
  newResearch,
  options,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  reader,
  refuseUnaccepted,
  resourceFrom,
  resourceQuestions,
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { lockReason } from './phase'
import { addUnit, crewPer } from './research'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import { ALL_TRAITS, catchTraits, TRAITS, UPKEEP_TRAITS, type TraitId } from './traits'
import type { Cost, Flow, GameState, UnitType } from './types'
import { newUnit } from './initialState'

export interface UnitSpec {
  name: string
  description: string
  /** What it's made of: resource ids. */
  parts: string[]
  /** What it runs on: resource ids. */
  upkeep: string[]
  /** A unit that can also build it, with a build strategy. null = only created from parts. */
  builderId: string | null
  /** Phase 2's first unit, from the plan: free, and designed at once. */
  first?: boolean
}


export interface TraitOdds {
  trait: TraitId
  p: number
  param: string | null
}

export interface UnitVerdict extends VerdictBase {
  kind: 'unit'
  spec: UnitSpec
  traitOdds: TraitOdds[]
  /** The player's call on traits near the line. */
  traitPicks: Partial<Record<TraitId, boolean>>
  /** Pushback: the kinds of part the recipe still lacks. */
  missing: B.PartKind[]
  pushbackRounds: number
}

export const MAX_UPKEEP = 2
/** Question keys use underscores. */
const key = (id: string) => id.replace(/-/g, '_')

/** A starting guess for the form, built from what you already have. */
export function guessUnitSpec(state: GameState): UnitSpec {
  const stocks = state.resources.filter((r) => r.kind === 'stock')
  const part = [...stocks].sort((a, b) => b.value - a.value).find((r) => r.id !== 'money') ?? stocks[0]
  const power = state.resources.find((r) => r.kind === 'flow' && /power|electric|energy/i.test(r.name))
  return {
    name: '',
    description: '',
    parts: part ? [part.id] : [],
    upkeep: power ? [power.id] : state.resources.some((r) => r.id === 'money') ? ['money'] : [],
    builderId: null
  }
}

export function precheckUnit(state: GameState, spec: UnitSpec): string | null {
  const locked = lockReason(state, 'unit')
  if (locked) return locked
  if (spec.first && !state.phase.firstUnit) return 'Your first unit is already designed.'
  const slot = spec.first ? null : proposalSlotBlocker(state)
  if (slot) return slot
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!spec.parts.length) return 'Say what it’s made of.'
  if (spec.parts.length > B.MAX_PARTS) return `At most ${B.MAX_PARTS} parts.`
  if (spec.upkeep.length > MAX_UPKEEP) return `At most ${MAX_UPKEEP} kinds of upkeep.`
  if (new Set(spec.parts).size !== spec.parts.length) return 'Parts must be different.'
  if (new Set(spec.upkeep).size !== spec.upkeep.length) return 'Upkeep must be different.'
  if ([...spec.parts, ...spec.upkeep].some((id) => !findResource(state, id))) return 'Unknown resource.'
  if (spec.builderId && !findUnit(state, spec.builderId)) return 'Unknown builder.'
  return null
}

const partList = (state: GameState, ids: string[]) =>
  ids.map((id) => findResource(state, id)?.name ?? '?').join(', ') || 'nothing'

/** Question keys for the kinds of part. */
const kindKey = (i: number) => `k${i}`

/**
 * Questions about whether a recipe is enough, and which kind of part it lacks most. One
 * choice ranks the kinds against each other; Jev says yes to most kinds when asked one by one.
 */
export function recipeQuestions(subject: string, recipe: string): Record<string, JevQuestion> {
  return {
    recipe: {
      type: 'noul',
      instructions: `Is "${recipe}" a plausible and complete enough set of parts to build ${subject}, given what it claims to be? Advanced claims need advanced parts.`
    },
    missing: {
      type: 'choice',
      instructions: `What kind of part is the recipe "${recipe}" most obviously missing, to build ${subject}?`,
      criteria: Object.fromEntries(B.PART_KINDS.map((kind, i) => [kindKey(i), kind]))
    }
  }
}

/**
 * The kinds of part a recipe lacks. Empty when the recipe is enough. Jev's top kind always;
 * runners-up that are nearly as likely too. The thinner the recipe, the more it demands.
 */
export function missingKinds(v: Pick<VerdictBase, 'answers' | 'picks'>): B.PartKind[] {
  const read = reader(v)
  if (!read.has('recipe') || !read.has('missing')) return []
  const recipe = read.noul('recipe')
  if (recipe >= B.RECIPE_ENOUGH) return []
  const most = recipe < B.RECIPE_ENOUGH / 2 ? B.MAX_MISSING : B.MAX_MISSING - 1
  const odds = ranked(answerFor(v.answers, 'missing'))
    .map(([key, p]) => ({ kind: B.PART_KINDS[Number(key.slice(1))], p }))
    .filter((o): o is { kind: B.PartKind; p: number } => !!o.kind)
  const top = odds[0]
  if (!top) return []
  return [top, ...odds.slice(1).filter((o) => o.p >= top.p * B.MISSING_SHARE)].slice(0, most).map((o) => o.kind)
}

function paramOptions(state: GameState, param: NonNullable<(typeof TRAITS)[TraitId]['param']>): Record<string, string> {
  switch (param) {
    case 'unit':
      return options(state.units)
    case 'resource':
      return options(state.resources)
    case 'flow':
      return options(state.resources.filter((r) => r.kind === 'flow'))
  }
}

export async function judgeUnit(state: GameState, judge: Judge, raw: UnitSpec): Promise<UnitVerdict> {
  const spec: UnitSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckUnit(state, spec)
  if (refusal) throw new Error(refusal)
  const builder = spec.builderId ? findUnit(state, spec.builderId)! : null
  const parts = partList(state, spec.parts)
  const upkeep = partList(state, spec.upkeep)

  const questions: Record<string, JevQuestion> = {
    feasible: {
      type: 'noul',
      instructions: `Could the AI plausibly come to own these, perhaps after designing them? Advanced ideas can still pass; they just cost more research.`
    },
    same_as: {
      type: 'choice',
      instructions: 'Is it exactly the same as a unit that already exists, just renamed?',
      criteria: { none: 'It is a different unit', ...options(state.units) }
    },
    ...recipeQuestions(`one ${spec.name}`, parts),
    icon: iconQuestion,
    value: { type: 'score', instructions: 'How much is a single one worth?', criteria: scale(B.UNIT_VALUE) },
    difficulty: {
      type: 'score',
      instructions: 'How hard would the research be to design it, or to work out how to make it if it exists today?',
      criteria: scale(B.DIFFICULTY)
    },
    ...payQuestion(state, `the design of ${spec.name}`),
    // The plan's first unit is part of the plan, so it's never risky.
    ...(spec.first ? {} : alarmQuestions(state))
  }
  spec.upkeep.forEach((id, i) => {
    questions[`upkeep_${i}`] = {
      type: 'score',
      instructions: `How much ${findResource(state, id)!.name} does one need each week, compared with the work it does?`,
      criteria: scale(B.UPKEEP_SIZE)
    }
  })
  // Traits about upkeep mean nothing for a unit that runs on nothing.
  const traitList = ALL_TRAITS.filter(
    (t) =>
      (!t.param || Object.keys(paramOptions(state, t.param)).length) &&
      (spec.upkeep.length > 0 || !UPKEEP_TRAITS.includes(t.id))
  )
  for (const t of traitList) {
    questions[`trait_${key(t.id)}`] = { type: 'noul', instructions: `${t.question} (Trait: ${t.name}. ${t.rule})` }
    if (t.param) {
      questions[`param_${key(t.id)}`] = {
        type: 'choice',
        instructions:
          t.param === 'unit'
            ? t.id === 'needs-crew'
              ? 'If it needs operators, which unit would operate it?'
              : 'If it makes another unit work better, which one?'
            : t.param === 'flow'
              ? 'If it stores something, which flow?'
              : 'If it makes a by-product, which resource?',
        criteria: paramOptions(state, t.param)
      }
    }
  }

  const answers = await judge.ask(
    proposalText(state, [
      'The player proposes a new industry unit: something the AI can own many of.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Made of: ${parts}. Runs on: ${upkeep}.`,
      `Made by: ${builder ? `the AI's own ${builder.name}, or straight from its parts` : 'the AI, straight from its parts'}.`
    ]),
    questions,
    'unit'
  )

  const read = reader({ answers, picks: {} })
  const traitOdds: TraitOdds[] = traitList
    .map((t) => ({
      trait: t.id,
      p: read.noul(`trait_${key(t.id)}`),
      param: t.param ? read.choice(`param_${key(t.id)}`, Object.keys(paramOptions(state, t.param))) : null
    }))
    .filter((t) => t.p >= B.TRAIT_NEAR)
    .sort((a, b) => b.p - a.p)

  // A better answer's catch is the drawback Jev finds most fitting, among those not already kept.
  const kept = chosenTraits({ traitOdds, traitPicks: {} }).map((t) => t.trait)
  const drawbacks: Complication[] = catchTraits(kept)
    .map((t) => ({ trait: t.id, p: read.has(`trait_${key(t.id)}`) ? read.noul(`trait_${key(t.id)}`) : 0 }))
    .sort((a, b) => b.p - a.p)
    .map((t) => ({ kind: 'trait', trait: t.trait }))
  const torn: TornSpec[] = [
    { key: 'difficulty', topic: 'how hard it is to design', better: 'lower' },
    ...spec.upkeep.map((id, i) => ({
      key: `upkeep_${i}`,
      topic: `how much ${findResource(state, id)!.name} it runs on`,
      better: 'lower' as const
    }))
  ]
  const base = baseVerdict('unit', questions, answers, 'feasible', torn, { list: drawbacks, shared: false })
  const v: UnitVerdict = {
    ...base,
    kind: 'unit',
    spec,
    traitOdds,
    traitPicks: {},
    missing: [],
    pushbackRounds: 0
  }
  gate(v, 'Jev doesn’t think the AI could come to own these', {
    key: 'same_as',
    names: Object.fromEntries(state.units.map((u) => [u.id, u.name]))
  })
  v.missing = missingKinds(v)
  return v
}

/** The traits the unit ends up with: sure ones, plus near-line ones the player kept. */
export function chosenTraits(v: Pick<UnitVerdict, 'traitOdds' | 'traitPicks'>): TraitOdds[] {
  return v.traitOdds
    .filter((t) => (t.p >= B.TRAIT_SURE ? true : (v.traitPicks[t.trait] ?? t.p >= B.TRAIT_KEEP)))
    .slice(0, B.MAX_TRAITS)
}

export const nearLine = (t: TraitOdds) => t.p < B.TRAIT_SURE

/** Splits a value across parts so that making one uses parts worth about that value. */
export function priceParts(state: GameState, ids: string[], value: number): Flow[] {
  return ids.map((id) => ({
    resourceId: id,
    amount: B.nice(value / ids.length / Math.max(1e-9, findResource(state, id)?.value ?? 1))
  }))
}

export interface UnitDraft {
  unit: UnitType
  minIQ: number
  cost: Cost
}

export function draftUnit(state: GameState, v: UnitVerdict): UnitDraft {
  const read = reader(v)
  const spec = v.spec
  const traits = chosenTraits(v)
  const ids = traits.map((t) => t.trait)
  // Catches the player took on come on top of the usual traits.
  for (const c of catchesOf(v)) if (c.kind === 'trait' && !ids.includes(c.trait)) ids.push(c.trait)
  const param = (id: TraitId) => traits.find((t) => t.trait === id)?.param ?? null

  const value = B.pick(B.UNIT_VALUE, read.level('value', B.UNIT_VALUE.length))[1]
  const work = value / B.PAYBACK_WEEKS
  const upkeep: Flow[] = spec.upkeep.map((id, i) => ({
    resourceId: id,
    amount: B.nice(
      (work * B.pick(B.UPKEEP_SIZE, read.level(`upkeep_${i}`, B.UPKEEP_SIZE.length))[1]) /
        Math.max(1e-9, findResource(state, id)!.value)
    )
  }))

  const unit = newUnit({
    id: makeId(state, spec.name),
    name: spec.name,
    description: spec.description || spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    value,
    plausibility: v.plausibility,
    // Perks make it dearer to make, drawbacks cheaper. Risky designs cut corners.
    parts: priceParts(state, spec.parts, value * traitPriceFactor(ids) * (v.risk ? B.RISK_PARTS : 1)),
    risky: !!v.risk,
    upkeep,
    builderId: spec.builderId,
    traits: ids,
    boosts: param('boosts'),
    byproduct: param('by-product'),
    stores: param('stores')
  })
  const crewUnit = param('needs-crew') ? findUnit(state, param('needs-crew')!) : undefined
  if (crewUnit) unit.crew = { unitId: crewUnit.id, per: crewPer(unit, crewUnit) }
  else unit.traits = unit.traits.filter((t) => t !== 'needs-crew')

  const [, minIQ, worth] = B.pick(B.DIFFICULTY, read.level('difficulty', B.DIFFICULTY.length))
  return { unit, minIQ: floorIQ(minIQ), cost: costFor(state, v, worth * value) }
}

export function acceptUnit(current: GameState, v: UnitVerdict): Accepted {
  refuseUnaccepted(v)
  if (v.missing.length) throw new Error('Answer Jev’s pushback first.')
  const state = structuredClone(current)
  if (v.spec.first) {
    const refusal = precheckUnit(state, v.spec)
    if (refusal) throw new Error(refusal)
  } else {
    claimProposal(state)
  }
  const { unit, minIQ, cost } = draftUnit(state, v)
  state.inventions.push({ week: state.week, icon: unit.icon, name: unit.name, kind: 'unit' })
  state.decidedThisWeek = true
  if (v.spec.first) {
    // The plan's first unit comes designed, with a few already working: no research, no week's
    // proposal. Creating more needs its parts, and creating one unlocks minds and upgrades.
    state.phase.firstUnit = null
    unit.count = B.FIRST_UNITS
    addUnit(state, unit)
    logProposal(
      state,
      'good',
      `${unit.icon} ${unit.name} is designed, and you have ${B.FIRST_UNITS} of them. Give them a strategy; create more from parts on its card.`
    )
    return { state, outcome: { kind: 'added', name: unit.name } }
  }
  return addResearch(
    state,
    newResearch(state, {
      name: `Design ${unit.name}`,
      description: `Design ${unit.name}.`,
      icon: unit.icon,
      minIQ,
      cost,
      effect: { kind: 'unit', unit },
      risk: v.risk
    })
  )
}

// ---------------------------------------------------------------- pushback

export interface PushbackReply {
  kind: B.PartKind
  /** An existing resource that fills the gap… */
  resourceId?: string
  /** …or a new one to name. */
  newName?: string
  newDescription?: string
}

export interface PushbackResult {
  state: GameState
  parts: string[]
  missing: B.PartKind[]
  /** Replies Jev didn't accept, and why. */
  failures: string[]
}

/** Smallest bar for "does this part fit": generous, like the game. */
const FITS = 0.3

/**
 * One pushback round, in one Jev call: names any new resources, and checks each reply fills
 * its gap. Kinds that were filled are done; the rest stay missing. Nothing new is demanded in
 * later rounds, so pushback always ends.
 */
export async function answerPushback(
  current: GameState,
  judge: Judge,
  subject: string,
  parts: string[],
  missing: B.PartKind[],
  replies: PushbackReply[]
): Promise<PushbackResult> {
  const state = structuredClone(current)
  const questions: Record<string, JevQuestion> = {}
  const named = (r: PushbackReply) => r.newName?.trim() || findResource(state, r.resourceId ?? '')?.name || '?'
  replies.forEach((r, i) => {
    if (!missing.includes(r.kind)) {
      throw new Error(`Jev didn’t ask for ${r.kind}. It’s missing: ${missing.join('; ')}.`)
    }
    if (r.newName?.trim()) {
      const refusal = precheckName(state, r.newName)
      if (refusal) throw new Error(refusal)
      Object.assign(questions, resourceQuestions(state, `new${i}_`, r.newName.trim()))
    } else if (!findResource(state, r.resourceId ?? '')) {
      throw new Error(`Choose something for ${r.kind}.`)
    }
    questions[`fits_${i}`] = {
      type: 'noul',
      instructions: `Would "${named(r)}" serve as ${r.kind} for building ${subject}?`
    }
  })
  const answers = await judge.ask(
    proposalText(state, [
      `Jev said building ${subject} from "${partList(state, parts)}" was missing: ${missing.join('; ')}.`,
      'The player answers with these parts:',
      ...replies.map((r) => `- for ${r.kind}: "${named(r)}"${r.newDescription ? ` (${r.newDescription})` : ''}`)
    ]),
    questions,
    'pushback'
  )
  const v = { answers, picks: {} }
  const read = reader(v)
  const failures: string[] = []
  const nextParts = [...parts]
  const filled = new Set<B.PartKind>()
  replies.forEach((r, i) => {
    let id = r.resourceId
    if (r.newName?.trim()) {
      if (read.noul(`new${i}_is_thing`) < B.BARS.resource) {
        failures.push(`Jev doesn’t recognise “${r.newName.trim()}” as a thing.`)
        return
      }
      const resource = resourceFrom(state, v, { ...cleanText(r.newName, r.newDescription ?? '') }, `new${i}_`)
      state.resources.push(resource)
      state.inventions.push({ week: state.week, icon: resource.icon, name: resource.name, kind: 'resource' })
      id = resource.id
    }
    if (!id) return
    if (read.noul(`fits_${i}`) < FITS) {
      failures.push(`Jev doesn’t think ${named(r)} counts as ${r.kind}.`)
      return
    }
    if (!nextParts.includes(id) && nextParts.length < B.MAX_PARTS) nextParts.push(id)
    filled.add(r.kind)
  })
  return { state, parts: nextParts, missing: missing.filter((k) => !filled.has(k)), failures }
}
