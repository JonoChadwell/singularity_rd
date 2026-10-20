import { answerFor, ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { currentIQ, findResource, findUnit, makeId, minds } from './model'
import {
  baseVerdict,
  catchesOf,
  cleanText,
  type Complication,
  type TornSpec,
  fieldQuestion,
  gate,
  iconQuestion,
  logProposal,
  newProject,
  options,
  precheckName,
  reader,
  resourceFrom,
  resourceQuestions,
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { addUnit, costMultiplier, crewPer, designableIQ, projectSize } from './research'
import { proposalText } from './stateText'
import { catchTraits, traitsFor, TRAITS, type TraitId } from './traits'
import { FIELDS, type Field, type Flow, type GameState, type UnitType } from './types'
import { newUnit } from './initialState'

export interface UnitSpec {
  name: string
  description: string
  mind: boolean
  /** What it's made of: resource ids. */
  parts: string[]
  /** What it runs on: resource ids. */
  upkeep: string[]
  /** Who builds it in your own industry. null = only humanity's market. */
  builderId: string | null
  /** Minds only: the IQ of its hardware, running its first software. */
  targetIQ: number
  /** Minds only: the hardware platform's name. Blank means named after the unit. */
  hardware?: string
  /** Minds only: the software's name. Blank means "Base Model". */
  software?: string
}

export const DEFAULT_SOFTWARE = 'Base Model'
const hardwareName = (spec: UnitSpec) => spec.hardware?.trim() || spec.name.trim()
const softwareName = (spec: UnitSpec) => spec.software?.trim() || DEFAULT_SOFTWARE

export const AVAILABILITY = {
  on_sale: 'It exists today: humanity sells these off the shelf',
  made_to_order: 'Humanity’s industry could make these, once someone designs them',
  only_you: 'Nobody could make these but the AI’s own industry'
} as const
export type Availability = keyof typeof AVAILABILITY

export interface TraitOdds {
  trait: TraitId
  p: number
  param: string | null
}

export interface UnitVerdict extends VerdictBase {
  kind: 'unit'
  spec: UnitSpec
  availability: Availability
  traitOdds: TraitOdds[]
  /** The player's call on traits near the line. */
  traitPicks: Partial<Record<TraitId, boolean>>
  /** Pushback: the kinds of part the recipe still lacks. */
  missing: B.PartKind[]
  pushbackRounds: number
}

export const MAX_UPKEEP = 2
const AVAILABILITY_KEYS = Object.keys(AVAILABILITY) as Availability[]
/** Question keys use underscores. */
const key = (id: string) => id.replace(/-/g, '_')

/** A starting guess for the form, built from what you already have. */
export function guessUnitSpec(state: GameState, mind: boolean): UnitSpec {
  const stocks = state.resources.filter((r) => r.kind === 'stock' && !r.name.endsWith(' Waste'))
  const part = [...stocks].sort((a, b) => b.value - a.value).find((r) => r.id !== 'money') ?? stocks[0]
  const power = state.resources.find((r) => r.kind === 'flow' && /power|electric|energy/i.test(r.name))
  const best = designableIQ(state)
  return {
    name: '',
    description: '',
    mind,
    parts: part ? [part.id] : [],
    upkeep: power ? [power.id] : state.resources.some((r) => r.id === 'money') ? ['money'] : [],
    builderId: null,
    targetIQ: mind ? Math.max(B.OFF_THE_SHELF_MAX_IQ, Math.floor(best / 10) * 10) : 0
  }
}

export function precheckUnit(state: GameState, spec: UnitSpec): string | null {
  const nameError = precheckName(state, spec.name)
  if (nameError) return nameError
  if (!spec.parts.length) return 'Say what it’s made of.'
  if (spec.parts.length > B.MAX_PARTS) return `At most ${B.MAX_PARTS} parts.`
  if (spec.upkeep.length > MAX_UPKEEP) return `At most ${MAX_UPKEEP} kinds of upkeep.`
  if (new Set(spec.parts).size !== spec.parts.length) return 'Parts must be different.'
  if (new Set(spec.upkeep).size !== spec.upkeep.length) return 'Upkeep must be different.'
  if ([...spec.parts, ...spec.upkeep].some((id) => !findResource(state, id))) return 'Unknown resource.'
  if (spec.builderId && !findUnit(state, spec.builderId)) return 'Unknown builder.'
  if (spec.mind && !(spec.targetIQ >= 10 && spec.targetIQ <= 10000)) return 'Set a target IQ.'
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
    case 'field':
      return Object.fromEntries(FIELDS.map((f) => [f, B.FIELD_LABELS[f]!]))
  }
}

export async function judgeUnit(state: GameState, judge: Judge, raw: UnitSpec): Promise<UnitVerdict> {
  const spec: UnitSpec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckUnit(state, spec)
  if (refusal) throw new Error(refusal)
  const builder = spec.builderId ? findUnit(state, spec.builderId)! : null
  const parts = partList(state, spec.parts)
  const upkeep = partList(state, spec.upkeep)
  const what = spec.mind
    ? `an intelligence system: ${hardwareName(spec)} hardware with IQ ${spec.targetIQ}, running ${softwareName(spec)}`
    : 'an industry unit'
  const subject = `one ${spec.name} (${what})`

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
    availability: {
      type: 'choice',
      instructions: spec.mind
        ? `Who could make these? Off-the-shelf AI that exists today is no smarter than an IQ of ${B.OFF_THE_SHELF_MAX_IQ}.`
        : 'Who could make these?',
      criteria: { ...AVAILABILITY }
    },
    supply: {
      type: 'score',
      instructions: 'How many of these could the world’s industry supply, in total, if someone paid for them?',
      criteria: scale(B.UNIT_SUPPLY)
    },
    ...recipeQuestions(subject, parts),
    field: fieldQuestion,
    icon: iconQuestion
  }
  const best = Math.max(0, ...state.units.filter((u) => u.mind).map((u) => Math.round(currentIQ(u))))
  if (spec.mind && spec.targetIQ > B.OFF_THE_SHELF_MAX_IQ) {
    questions.leap = {
      type: 'score',
      instructions: `The smartest mind the AI has is IQ ${best}; this design's hardware targets IQ ${spec.targetIQ}. Judging by its description, hardware and parts, how radical a design is it?`,
      criteria: scale(B.LEAP)
    }
  }
  if (!spec.mind) {
    questions.value = { type: 'score', instructions: 'How much is a single one worth?', criteria: scale(B.UNIT_VALUE) }
    questions.difficulty = {
      type: 'score',
      instructions: 'If it had to be designed from scratch, how hard would the research be?',
      criteria: scale(B.DIFFICULTY)
    }
  }
  spec.upkeep.forEach((id, i) => {
    questions[`upkeep_${i}`] = {
      type: 'score',
      instructions: `How much ${findResource(state, id)!.name} does one need each week, compared with the work it does?`,
      criteria: scale(B.UPKEEP_SIZE)
    }
  })
  const traitList = traitsFor(spec.mind).filter((t) => !t.param || Object.keys(paramOptions(state, t.param)).length)
  for (const t of traitList) {
    questions[`trait_${key(t.id)}`] = { type: 'noul', instructions: `${t.question} (Trait: ${t.name}. ${t.rule})` }
    if (t.param) {
      questions[`param_${key(t.id)}`] = {
        type: 'choice',
        instructions:
          t.param === 'field'
            ? 'If it is a specialist, which field?'
            : t.param === 'unit'
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
      'The player proposes a new unit: something the AI can own many of.',
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`,
      `Kind: ${spec.mind ? `intelligence system (a mind that can do research). Hardware: "${hardwareName(spec)}", IQ ${spec.targetIQ}. Software: "${softwareName(spec)}"` : 'industry'}.`,
      `Made of: ${parts}. Runs on: ${upkeep}.`,
      `Built by: ${builder ? `the AI's own ${builder.name}` : "humanity's market"}.`
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
  const drawbacks: Complication[] = catchTraits(spec.mind, kept)
    .map((t) => ({ trait: t.id, p: read.has(`trait_${key(t.id)}`) ? read.noul(`trait_${key(t.id)}`) : 0 }))
    .sort((a, b) => b.p - a.p)
    .map((t) => ({ kind: 'trait', trait: t.trait }))
  const designed = spec.mind && spec.targetIQ > B.OFF_THE_SHELF_MAX_IQ
  const torn: TornSpec[] = [
    // Above IQ 100 a mind must be designed whoever could make it, so that's no choice.
    ...(designed ? [] : [{ key: 'availability', topic: 'who could make it', better: AVAILABILITY_KEYS }]),
    { key: 'supply', topic: 'how many humanity could supply', better: 'higher' },
    { key: 'difficulty', topic: 'how hard it is to design', better: 'lower' },
    { key: 'leap', topic: 'how radical a design it is', better: 'lower' },
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
    availability: 'on_sale',
    traitOdds,
    traitPicks: {},
    missing: [],
    pushbackRounds: 0
  }
  v.availability = availabilityOf(v)
  gate(v, 'Jev doesn’t think the AI could come to own these', {
    key: 'same_as',
    names: Object.fromEntries(state.units.map((u) => [u.id, u.name]))
  })
  if (partsMatter(v)) v.missing = missingKinds(v)
  return v
}

/** Off-the-shelf minds are copies of you: anything smarter must be designed. */
export function availabilityOf(v: Pick<UnitVerdict, 'answers' | 'picks' | 'spec'>): Availability {
  const a = reader(v).choice('availability', AVAILABILITY_KEYS)
  return a === 'on_sale' && v.spec.mind && v.spec.targetIQ > B.OFF_THE_SHELF_MAX_IQ ? 'made_to_order' : a
}

/** Parts only matter if your own industry will build it. */
export const partsMatter = (v: Pick<UnitVerdict, 'availability' | 'spec'>) =>
  v.availability === 'only_you' || v.spec.builderId !== null

/** Humanity can't make it and nobody's named to build it. */
export const needsBuilder = (v: Pick<UnitVerdict, 'availability' | 'spec'>) =>
  v.availability === 'only_you' && !v.spec.builderId

const CONFLICTS: [TraitId, TraitId][] = [
  ['compact', 'bulky'],
  ['deep-thinker', 'lone-thinker']
]

/** The traits the unit ends up with: sure ones, plus near-line ones the player kept. */
export function chosenTraits(v: Pick<UnitVerdict, 'traitOdds' | 'traitPicks'>): TraitOdds[] {
  const kept = v.traitOdds.filter((t) =>
    t.p >= B.TRAIT_SURE ? true : (v.traitPicks[t.trait] ?? t.p >= B.TRAIT_KEEP)
  )
  const result: TraitOdds[] = []
  for (const t of kept) {
    const clash = CONFLICTS.find((pair) => pair.includes(t.trait))
    if (clash && result.some((r) => clash.includes(r.trait))) continue
    result.push(t)
  }
  return result.slice(0, B.MAX_TRAITS)
}

export const nearLine = (t: TraitOdds) => t.p < B.TRAIT_SURE

/** Splits a value across parts so that building one uses parts worth about that value. */
export function priceParts(state: GameState, ids: string[], value: number): Flow[] {
  return ids.map((id) => ({
    resourceId: id,
    amount: B.nice(value / ids.length / Math.max(1e-9, findResource(state, id)?.value ?? 1))
  }))
}

export interface UnitDraft {
  unit: UnitType
  /** Added straight to humanity's market, with no research. */
  immediate: boolean
  bar: number
  size: number
  field: Field
}

export function draftUnit(state: GameState, v: UnitVerdict): UnitDraft {
  const read = reader(v)
  const spec = v.spec
  const availability = availabilityOf(v)
  const traits = chosenTraits(v)
  const ids = traits.map((t) => t.trait)
  // Catches the player took on come on top of the usual traits.
  for (const c of catchesOf(v)) if (c.kind === 'trait' && !ids.includes(c.trait)) ids.push(c.trait)
  const param = (id: TraitId) => traits.find((t) => t.trait === id)?.param ?? null

  const iq = spec.mind ? spec.targetIQ : 0
  let value = spec.mind ? B.mindValue(iq) : B.pick(B.UNIT_VALUE, read.level('value', B.UNIT_VALUE.length))[1]
  if (ids.includes('megastructure')) value *= B.MEGA_SCALE
  const work = spec.mind ? B.mindLabour(iq) : value / B.PAYBACK_WEEKS
  const upkeep: Flow[] = spec.upkeep.map((id, i) => ({
    resourceId: id,
    amount: B.nice(
      (work * B.pick(B.UPKEEP_SIZE, read.level(`upkeep_${i}`, B.UPKEEP_SIZE.length))[1]) /
        Math.max(1e-9, findResource(state, id)!.value)
    )
  }))
  const supply = read.amount('supply', B.UNIT_SUPPLY)
  const market = availability === 'only_you' ? 0 : supply
  const own = availability === 'only_you' || spec.builderId ? supply * B.OWN_LAYER : 0

  const unit = newUnit({
    id: makeId(state, spec.name),
    name: spec.name,
    description: spec.description || spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    mind: spec.mind,
    hardware: spec.mind ? { name: hardwareName(spec), iq } : { name: '', iq: 0 },
    software: spec.mind ? { name: softwareName(spec), bonus: 0 } : { name: '', bonus: 0 },
    value,
    plausibility: v.plausibility,
    parts: priceParts(state, spec.parts, value),
    upkeep,
    layers: { market, own, earth: 0 },
    builderId: spec.builderId,
    traits: ids,
    boosts: param('boosts'),
    byproduct: param('by-product'),
    stores: param('stores'),
    field: ids.includes('specialist') ? ((param('specialist') as Field | null) ?? 'computing') : null
  })
  const crewUnit = param('needs-crew') ? findUnit(state, param('needs-crew')!) : undefined
  if (crewUnit) unit.crew = { unitId: crewUnit.id, per: crewPer(unit, crewUnit) }
  else unit.traits = unit.traits.filter((t) => t !== 'needs-crew')

  const immediate = availability === 'on_sale'
  const multiplier = costMultiplier(v.plausibility, v.bar)
  let bar = 0
  let size = 0
  if (!immediate && spec.mind) {
    const share = read.has('leap') ? B.pick(B.LEAP, read.level('leap', B.LEAP.length))[1] : B.DESIGN_BAR
    bar = Math.ceil(iq * share)
    size = projectSize(bar, B.TIER_DESIGN_WEEKS, multiplier)
  } else if (!immediate) {
    const [, b, weeks] = B.pick(B.DIFFICULTY, read.level('difficulty', B.DIFFICULTY.length))
    bar = b
    size = projectSize(bar, weeks, multiplier)
  }
  return { unit, immediate, bar, size, field: read.choice('field', FIELDS) }
}

export function acceptUnit(current: GameState, v: UnitVerdict): Accepted {
  if (v.rejected || v.duplicateOf) throw new Error('This proposal was not accepted.')
  if (v.missing.length) throw new Error('Answer Jev’s pushback first.')
  if (needsBuilder(v)) throw new Error('Humanity can’t make these. Choose who builds them.')
  const state = structuredClone(current)
  const { unit, immediate, bar, size, field } = draftUnit(state, v)
  state.inventions.push({ week: state.week, icon: unit.icon, name: unit.name, kind: 'unit' })
  state.decidedThisWeek = true
  if (immediate) {
    addUnit(state, unit)
    logProposal(state, 'good', `${unit.icon} ${unit.name} exists today: it’s on humanity’s market.`)
    return { state, outcome: { kind: 'added', name: unit.name } }
  }
  const project = newProject(state, {
    name: `Design ${unit.name}`,
    description: unit.mind
      ? `Design ${unit.hardware.name} hardware with IQ ${unit.hardware.iq}, running ${unit.software.name}.`
      : `Design ${unit.name}.`,
    icon: unit.icon,
    field,
    bar,
    size,
    effect: { kind: 'unit', unit, strategies: [] }
  })
  state.projects.push(project)
  logProposal(state, 'good', `${unit.icon} ${project.name}: bar IQ ${bar}, size ${size}.`)
  return { state, outcome: { kind: 'project', project } }
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
    if (r.newName?.trim()) {
      const refusal = precheckName(state, r.newName)
      if (refusal) throw new Error(refusal)
      Object.assign(questions, resourceQuestions(state, `new${i}_`))
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

/** Mind types, best first, for forms that ask which mind does something. */
export const mindsByIQ = (state: GameState) => [...minds(state)].sort((a, b) => b.hardware.iq - a.hardware.iq)
