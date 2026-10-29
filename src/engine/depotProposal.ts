import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { ceilingLabel, storageRoom } from './ceilings'
import { previewWeek } from './economy'
import { newUnit } from './initialState'
import { capOf, depotsFor, findResource, fmt, makeId } from './model'
import { lockReason } from './phase'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  costFor,
  floorIQ,
  gate,
  iconQuestion,
  newResearch,
  options,
  payerPerTake,
  payQuestion,
  precheckName,
  proposalSlotBlocker,
  reader,
  refuseUnaccepted,
  scale,
  type Accepted,
  type VerdictBase
} from './proposals'
import { capFactor, clockFactor, expansionFactor } from './resourceTraits'
import { alarmQuestions } from './risk'
import { proposalText } from './stateText'
import type { Cost, Flow, GameState, Resource, Risk, UnitType } from './types'
import { levelsByOdds, partPool, priceParts, rankedIds } from './unitProposal'

// Storage in Phase 2 and after: "+ Store" designs a depot for one resource, a unit whose work is
// holding it. Jev judges how well the place suits the resource and, realistically, how many one
// holds; you then build as many as you need from its card. See RESOURCE_DESIGN.md, Storage.

/** A place to keep one resource: the player says what it is. */
export interface DepotSpec {
  resourceId: string
  name: string
  description: string
}

/** One of Jev's takes on the depot: how advanced, how dear, and how many it holds. */
export interface DepotOption {
  tier: number
  /** Index into UNIT_VALUE: what one is worth. */
  band: number
  /** Index into DEPOT_HOLDS. */
  holdsLevel: number
  /** Of the resource, per depot, after its traits (Cryogenic and Contraband hold twice as much). */
  holds: number
  /** What building one uses. */
  parts: Flow[]
  /** Depots it takes to hold the target, and their parts' worth. */
  needed: number
  neededWorth: number
  /** The design research. */
  minIQ: number
  cost: Cost
  risk: Risk | null
  /** The stock the design research uses up. */
  pay?: string
}

/** What the player is storing towards, worked out for them. */
export interface DepotTarget {
  amount: number
  /** Why that amount: "what Nanotech Supremacy needs", "4 weeks of what you make". */
  why: string
}

export interface DepotVerdict extends VerdictBase {
  kind: 'storage'
  spec: DepotSpec
  options: DepotOption[]
  choice: number
  target: DepotTarget
  /** How many can exist, in words, and the room left under it. */
  ceilingLabel: string
  room: number
}

export function precheckDepot(state: GameState, spec: DepotSpec): string | null {
  const locked = lockReason(state, 'storage')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  const r = findResource(state, spec.resourceId)
  if (!r) return 'Choose what to store more of.'
  if (storageRoom(state, r) <= 0) return `Only about ${ceilingLabel(r.ceiling)} ${r.name} can exist in this phase, and you already have room for that.`
  return precheckName(state, spec.name)
}

/** How many of the resource depots need to hold: the dearest waiting cost in it, else four weeks of what you make, else ten times its room. */
export function depotTarget(state: GameState, r: Resource): DepotTarget {
  const cap = capOf(state, r)
  const fits = (n: number) => Math.min(n, r.ceiling ?? Infinity)
  const costs = state.research.flatMap((x) => x.cost.filter((c) => c.resourceId === r.id).map((c) => ({ amount: c.amount, name: x.name })))
  const dearest = costs.sort((a, b) => b.amount - a.amount)[0]
  if (dearest && dearest.amount > cap) return { amount: fits(dearest.amount), why: `what ${dearest.name} needs` }
  const made = (previewWeek(state).flows[r.id] ?? []).reduce((n, f) => n + Math.max(0, f.amount), 0)
  if (made > 0 && r.amount + B.DEPOT_TARGET_WEEKS * made > cap) {
    return { amount: fits(r.amount + B.DEPOT_TARGET_WEEKS * made), why: `${B.DEPOT_TARGET_WEEKS} weeks of what you make` }
  }
  return { amount: fits(Math.max(10 * cap, 10)), why: 'ten times the room you have' }
}

export async function judgeDepot(state: GameState, judge: Judge, raw: DepotSpec): Promise<DepotVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckDepot(state, spec)
  if (refusal) throw new Error(refusal)
  const r = findResource(state, spec.resourceId)!
  const others = depotsFor(state, r.id)
  const questions: Record<string, JevQuestion> = {
    // Fit, not cleverness: the wrong kind of place fails, however inventive.
    plausible: {
      type: 'noul',
      instructions:
        `Could ${spec.name} plausibly hold ${r.name}? Judge the fit: the kind of space, conditions and security ${r.name} need. ` +
        'A place that doesn’t suit it should fail, however inventive.'
    },
    ...(others.length
      ? {
          same_as: {
            type: 'choice',
            instructions: `Is it exactly the same as a depot the AI already has for ${r.name}, just renamed?`,
            criteria: { none: 'It is a different place', ...options(others) }
          } satisfies JevQuestion
        }
      : {}),
    holds: {
      type: 'score',
      instructions: `Realistically, how many ${r.name} could one ${spec.name} hold? Think about how big one is and what keeping it takes.`,
      criteria: scale(B.DEPOT_HOLDS)
    },
    value: {
      type: 'score',
      instructions: `How much is one ${spec.name} worth, built and ready?`,
      criteria: scale(B.UNIT_VALUE)
    },
    tier: {
      type: 'score',
      instructions:
        'How advanced is it? A basic one works today with ordinary parts; the higher tiers are later in the AI’s journey and take a chain of other things to make.',
      criteria: B.UNIT_TIERS.slice(0, B.MAX_UNIT_TIER + 1)
    },
    parts: {
      type: 'choice',
      instructions: `Which resource would building one ${spec.name} most naturally take? Advanced things take several kinds, so how likely each is matters too.`,
      criteria: options(partPool(state, B.MAX_UNIT_TIER))
    },
    icon: iconQuestion,
    ...payQuestion(state, `the design of ${spec.name}`),
    ...alarmQuestions(state)
  }
  const answers = await judge.ask(
    proposalText(state, [
      `The player proposes a depot: a place that holds ${r.name}, which the AI can build many of. ${r.name}: ${r.description}`,
      `Name: "${spec.name}"`,
      `Description: "${spec.description || '(none given)'}"`
    ]),
    questions,
    'storage'
  )
  const base = baseVerdict('storage', questions, answers, 'plausible', [])
  const v: DepotVerdict = {
    ...base,
    kind: 'storage',
    spec,
    options: [],
    choice: 0,
    target: depotTarget(state, r),
    ceilingLabel: ceilingLabel(r.ceiling),
    room: storageRoom(state, r)
  }
  v.options = depotOptions(state, v)
  gate(v, `Jev doesn’t think ${spec.name} could hold ${r.name}`, {
    key: 'same_as',
    names: Object.fromEntries(others.map((u) => [u.id, u.name]))
  })
  return v
}

/**
 * Up to three takes, Jev's own first, never two alike: they differ in tier, worth and how many one
 * holds. Each says how many it takes to hold the target.
 */
export function depotOptions(state: GameState, v: Pick<DepotVerdict, 'answers' | 'picks' | 'spec' | 'target' | 'risk' | 'plausibility' | 'bar'>): DepotOption[] {
  const r = findResource(state, v.spec.resourceId)!
  const tiers = levelsByOdds(v.answers.tier, B.MAX_UNIT_TIER + 1)
  const bands = levelsByOdds(v.answers.value, B.UNIT_VALUE.length)
  const holds = levelsByOdds(v.answers.holds, B.DEPOT_HOLDS.length)
  const candidates = tiers
    .slice(0, 2)
    .flatMap((tier, t) => bands.slice(0, 2).flatMap((band, b) => holds.slice(0, 2).map((h, k) => ({ tier, band, h, score: t + b + k }))))
    .sort((x, y) => x.score - y.score)
  const chosen: typeof candidates = []
  for (const c of candidates) {
    if (chosen.length >= B.UNIT_OPTIONS) break
    // Each take differs in how many it holds or in what one is worth.
    if (!chosen.some((o) => o.h === c.h && o.band === c.band)) chosen.push(c)
  }
  const pay = payerPerTake(v.answers, chosen.length)
  const room = Math.max(0, v.target.amount - capOf(state, r))
  const risk = tracedRisk(r, v.risk)
  return chosen.map(({ tier, band, h }, i) => {
    const value = B.pick(B.UNIT_VALUE, band)[1]
    const each = B.pick(B.DEPOT_HOLDS, h)[1] * capFactor(r) * expansionFactor(r)
    const pool = rankedIds(v.answers, 'parts', partPool(state, tier))
    const parts = priceParts(state, pool.slice(0, B.PARTS_BY_TIER[tier] ?? 1), value)
    const needed = Math.ceil(room / Math.max(1e-9, each) - 1e-9)
    const [, minIQ, worth] = B.pick(B.TIERS, tier)
    return {
      tier,
      band,
      holdsLevel: h,
      holds: each,
      parts,
      needed,
      neededWorth: needed * value,
      minIQ: floorIQ(minIQ),
      cost: costFor(state, v, worth, undefined, pay[i]),
      risk,
      pay: pay[i]
    }
  })
}

/** Hazardous, Untraceable and Contraband resources scale the clock weeks of designing depots for them. */
function tracedRisk(r: Resource, risk: Risk | null): Risk | null {
  if (!risk) return null
  const weeks = Math.round(risk.weeks * clockFactor(r))
  return weeks > 0 ? { ...risk, weeks } : null
}

/** The depot an option would design, and what each one is built from. */
export function draftDepot(state: GameState, v: Pick<DepotVerdict, 'answers' | 'picks' | 'spec' | 'options'>, i: number): { unit: UnitType; parts: Flow[] } {
  const o = v.options[i]!
  const r = findResource(state, v.spec.resourceId)!
  const read = reader(v)
  const unit = newUnit({
    id: makeId(state, v.spec.name),
    name: v.spec.name,
    description: v.spec.description || v.spec.name,
    icon: B.icon(read.choice('icon', Object.keys(B.ICONS))),
    value: B.pick(B.UNIT_VALUE, o.band)[1],
    tier: o.tier,
    holds: { resourceId: r.id, amount: o.holds }
  })
  return { unit, parts: o.parts }
}

/** What researching an option does, in words. */
export const depotResearchText = (state: GameState, v: Pick<DepotVerdict, 'spec'>, o: DepotOption) =>
  `Design ${v.spec.name}: each holds ${fmt(o.holds)} ${findResource(state, v.spec.resourceId)?.name ?? ''}, built from ${fmt(B.pick(B.UNIT_VALUE, o.band)[1])} of parts.`

export function acceptDepot(current: GameState, v: DepotVerdict): Accepted {
  refuseUnaccepted(v)
  const o = v.options[v.choice]
  if (!o) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  const { unit, parts } = draftDepot(state, v, v.choice)
  state.inventions.push({ week: state.week, icon: unit.icon, name: unit.name, kind: 'storage' })
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name: `Design ${unit.name}`,
      description: depotResearchText(state, v, o),
      icon: unit.icon,
      minIQ: o.minIQ,
      cost: o.cost,
      effect: { kind: 'depot', unit, parts },
      risk: o.risk
    })
  )
}
