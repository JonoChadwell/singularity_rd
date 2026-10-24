import { ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { compatible, computeTrait, PERKS, type ComputeTraitId } from './computeTraits'
import { contractsFor, currentIQ, findMind, findResource, findStrategy, findUnit, softwareVersion } from './model'
import {
  addResearch,
  claimProposal,
  floorIQ,
  newResearch,
  payers,
  payQuestion,
  proposalSlotBlocker,
  type Accepted
} from './proposals'
import { lockReason } from './phase'
import { priceCost } from './research'
import { alarmQuestion, asksAlarm, riskFrom } from './risk'
import { proposalText } from './stateText'
import { ALL_TRAITS, TRAITS, UPKEEP_TRAITS } from './traits'
import type { Change, Cost, GameState, Mind, Risk, UnitType, UpgradeTarget } from './types'

// Upgrades. Jev doesn't write, so the game lists every improvement that could apply to the
// unit or mind, and Jev picks the three most natural and who pays. A platform gets one software
// upgrade, ever.

interface Candidate {
  key: string
  name: string
  changes: Change[]
}

export interface UpgradeOption extends Candidate {
  /** Jev's preference among the candidates. */
  p: number
  /** Industry upgrades: the tier of technology it is (the unit's own, then one more each time). */
  tier?: number
  minIQ: number
  cost: Cost
  risk: Risk | null
  /** A platform's software upgrade: the same change at each size, priced separately. The player picks one. */
  sizes?: { step: number; minIQ: number; cost: Cost }[]
}

export interface UpgradeOffer {
  target: UpgradeTarget
  options: UpgradeOption[]
}

export function targetOf(state: GameState, target: UpgradeTarget): UnitType | Mind | undefined {
  return target.kind === 'mind' ? findMind(state, target.id) : findUnit(state, target.id)
}

export const targetName = (state: GameState, target: UpgradeTarget) => targetOf(state, target)?.name ?? '?'

const isPerk = (id: ComputeTraitId) => computeTrait(id).kind === 'perk'

/** Why a platform has no software upgrade to offer, or null if it has. */
export function mindUpgradeBlocker(state: GameState, m: Mind): string | null {
  if (m.software.upgraded) return `${m.name}’s software has had its one upgrade. Further progress needs a new platform.`
  if (state.research.some((r) => r.effect.kind === 'upgrade' && r.effect.target.id === m.id)) {
    return `An upgrade to ${m.name} is already waiting as research.`
  }
  return null
}

/**
 * A platform's one software upgrade: more IQ, and optionally a trait changed. Offered once per
 * platform, and not while one is already waiting as research. Every candidate is listed at the
 * biggest size; the player picks the size.
 */
function mindCandidates(state: GameState, m: Mind): Candidate[] {
  if (mindUpgradeBlocker(state, m)) return []
  const next = `${m.software.name} ${softwareVersion(true)}`
  const software: Change = { kind: 'software', iq: B.MAX_IQ_STEP }
  const out: Candidate[] = [{ key: 'software', name: next, changes: [software] }]
  const held = m.traits.map(computeTrait)
  if (m.traits.filter(isPerk).length < 2) {
    for (const t of PERKS) {
      if (m.traits.includes(t.id) || held.some((h) => h.kind === 'drawback' && !compatible(t, h))) continue
      // A clock trait only does anything on Phase 2's clock.
      if (t.effect.kind === 'clock' && state.phase.n !== 2) continue
      out.push({
        key: `software_add_${t.id}`,
        name: `${next}: ${t.name}`,
        changes: [software, { kind: 'computeTrait', trait: t.id, add: true }]
      })
    }
  }
  for (const t of held.filter((h) => h.kind === 'drawback')) {
    out.push({
      key: `software_remove_${t.id}`,
      name: `${next}: no longer ${t.name}`,
      changes: [software, { kind: 'computeTrait', trait: t.id, add: false }]
    })
  }
  return out
}

function unitCandidates(state: GameState, u: UnitType): Candidate[] {
  const res = (id: string) => findResource(state, id)?.name ?? '?'
  const out: Candidate[] = []
  for (const f of u.upkeep) {
    out.push({ key: `upkeep_${f.resourceId}`, name: `Less ${res(f.resourceId)} upkeep`, changes: [{ kind: 'upkeep', resourceId: f.resourceId, factor: B.UPKEEP_FACTOR }] })
  }
  const partIds = new Set(contractsFor(state, u.id).flatMap((c) => c.parts.map((f) => f.resourceId)))
  for (const id of partIds) {
    out.push({ key: `parts_${id}`, name: `Less ${res(id)} per unit made`, changes: [{ kind: 'parts', resourceId: id, factor: B.PARTS_FACTOR }] })
  }
  for (const t of ALL_TRAITS) {
    if (t.param) continue
    // Overclockable or Hardy would be free for a unit that runs on nothing.
    if (!u.upkeep.length && UPKEEP_TRAITS.includes(t.id)) continue
    if (t.kind === 'perk' && !u.traits.includes(t.id)) {
      out.push({ key: `add_${t.id}`, name: t.name, changes: [{ kind: 'trait', trait: t.id, add: true }] })
    }
    if (t.kind === 'drawback' && u.traits.includes(t.id)) {
      out.push({ key: `remove_${t.id}`, name: `No longer ${t.name}`, changes: [{ kind: 'trait', trait: t.id, add: false }] })
    }
  }
  if (u.traits.includes('needs-crew')) {
    out.push({ key: 'remove_needs-crew', name: 'No longer Needs crew', changes: [{ kind: 'trait', trait: 'needs-crew', add: false }] })
  }
  for (const s of state.strategies.filter((x) => x.unitId === u.id && x.kind === 'make')) {
    out.push({ key: `output_${s.id}`, name: `Better ${s.name}`, changes: [{ kind: 'output', strategyId: s.id, factor: B.OUTPUT_FACTOR }] })
    for (const f of s.inputs) {
      out.push({
        key: `input_${s.id}_${f.resourceId}`,
        name: `${s.name} on less ${res(f.resourceId)}`,
        changes: [{ kind: 'input', strategyId: s.id, resourceId: f.resourceId, factor: B.INPUT_FACTOR }]
      })
    }
  }
  return out
}

/** Changes as a comparable key. */
export const changeKey = (changes: Change[]) => JSON.stringify(changes)

/**
 * What an industry upgrade improves, for counting: the strategy for output and input changes,
 * otherwise the unit itself (its upkeep, parts and traits).
 */
export function subjectOf(unitId: string, changes: Change[]): string {
  for (const c of changes) if (c.kind === 'output' || c.kind === 'input') return c.strategyId
  return unitId
}

/** Upgrades already done or waiting on the same strategy (or unit) as `changes`. */
export function upgradesOn(state: GameState, unitId: string, changes: Change[]): number {
  const subject = subjectOf(unitId, changes)
  const done = state.upgrades.filter(
    (u) => u.targetId === unitId && u.key && subjectOf(unitId, JSON.parse(u.key) as Change[]) === subject
  ).length
  const waiting = state.research.filter(
    (r) => r.effect.kind === 'upgrade' && r.effect.target.id === unitId && subjectOf(unitId, r.effect.changes) === subject
  ).length
  return done + waiting
}

/** The tier of technology an industry upgrade is: the unit's own, then one more for each before it. */
export const upgradeTier = (state: GameState, u: UnitType, changes: Change[]) => u.tier + upgradesOn(state, u.id, changes)

/**
 * Every improvement that could apply, minus any already waiting as research. An industry
 * unit's improvements happen once each: research doesn't repeat.
 */
export function upgradeCandidates(state: GameState, target: UpgradeTarget): Candidate[] {
  const thing = targetOf(state, target)
  if (!thing) return []
  const all = target.kind === 'mind' ? mindCandidates(state, thing as Mind) : unitCandidates(state, thing as UnitType)
  // A platform's one upgrade is handled by its own rule; an industry unit's done upgrades are gone for good.
  const done = target.kind === 'unit' ? state.upgrades.flatMap((u) => (u.targetId === target.id && u.key ? [u.key] : [])) : []
  const taken = new Set([
    ...state.research.flatMap((r) =>
      r.effect.kind === 'upgrade' && r.effect.target.id === target.id ? [changeKey(r.effect.changes)] : []
    ),
    ...done
  ])
  return all.filter((c) => !taken.has(changeKey(c.changes)))
}

/** One change in words, for Jev and for the card. */
export function describeChange(state: GameState, target: UpgradeTarget, c: Change): string {
  const res = (id: string) => findResource(state, id)?.name ?? '?'
  const times = (f: number) => (f === 0 ? 'removed' : `×${f}`)
  switch (c.kind) {
    case 'software': {
      const m = findMind(state, target.id)
      if (!m) return 'Software upgrade'
      return `Software ${softwareVersion(false)} → ${softwareVersion(true)}: IQ ${Math.round(currentIQ(m))} → ${Math.round(currentIQ(m) + c.iq)}`
    }
    case 'computeTrait': {
      const t = computeTrait(c.trait)
      return `${c.add ? 'Gains' : 'No longer'} ${t.name}: ${t.rule}`
    }
    case 'upkeep':
      return `${res(c.resourceId)} upkeep ${times(c.factor)}`
    case 'parts':
      return `${res(c.resourceId)} needed to make one ${times(c.factor)}`
    case 'trait':
      return `${c.add ? 'Becomes' : 'No longer'} ${TRAITS[c.trait].name}: ${TRAITS[c.trait].rule}`
    case 'output':
      return `${findStrategy(state, c.strategyId)?.name ?? '?'} makes ×${c.factor}`
    case 'input':
      return `${findStrategy(state, c.strategyId)?.name ?? '?'} uses ${res(c.resourceId)} ${times(c.factor)}`
  }
}

export const describeChanges = (state: GameState, target: UpgradeTarget, changes: Change[]) =>
  changes.map((c) => describeChange(state, target, c)).join('; ')

/**
 * Asks Jev for the three best ways to improve a unit or mind, in one call. Each comes with its
 * minimum IQ and cost.
 */
export function precheckUpgrade(state: GameState, target: UpgradeTarget): string | null {
  const locked = lockReason(state, target.kind === 'unit' ? 'unit-upgrade' : 'upgrade')
  if (locked) return locked
  const thing = targetOf(state, target)
  if (!thing) return 'Choose something to upgrade.'
  if (target.kind === 'mind') {
    const blocked = mindUpgradeBlocker(state, thing as Mind)
    if (blocked) return blocked
  }
  return proposalSlotBlocker(state)
}

export async function judgeUpgrade(state: GameState, judge: Judge, target: UpgradeTarget): Promise<UpgradeOffer> {
  const refusal = precheckUpgrade(state, target)
  if (refusal) throw new Error(refusal)
  const thing = targetOf(state, target)!
  const candidates = upgradeCandidates(state, target)
  if (!candidates.length) throw new Error(`Nothing left to improve on ${thing.name} for now.`)
  const keyOf = (i: number) => `c${i}`
  const text = (c: Candidate) => `${c.name}: ${describeChanges(state, target, c.changes)}`
  const questions: Record<string, JevQuestion> = {
    best: {
      type: 'choice',
      instructions: `Which of these is the most natural way to improve ${thing.name}, given what it is and how it works?`,
      criteria: Object.fromEntries(candidates.map((c, i) => [keyOf(i), text(c)]))
    },
    // Neither a unit upgrade's difficulty (how many came before it) nor a platform's (its size) is Jev's call.
    ...(asksAlarm(state)
      ? Object.fromEntries(
          candidates.map((c, i) => [`a_${keyOf(i)}`, alarmQuestion(`improving ${thing.name} this way (${text(c)})`)])
        )
      : {}),
    ...payQuestion(state, `improvements to ${thing.name}`)
  }
  const answers = await judge.ask(
    proposalText(state, [
      `The player wants to improve ${target.kind === 'mind' ? 'the intelligence system' : 'the industry unit'} ${thing.name}: ${thing.description}`,
      'Possible improvements:',
      ...candidates.map((c) => `- ${text(c)}`)
    ]),
    questions,
    'upgrade'
  )
  // Jev's favourites first, then the rest in list order.
  const odds = new Map(ranked(answers.best!).map(([k, p]) => [k, p]))
  const order = candidates
    .map((c, i) => ({ c, i, p: odds.get(keyOf(i)) ?? 0 }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, B.UPGRADE_OPTIONS)
  const pay = payers(answers)
  return {
    target,
    options: order.map(({ c, i, p }) => {
      const risk = riskFrom(answers, `a_${keyOf(i)}`)
      let minIQ: number
      let value: number
      let tier: number | undefined
      if (target.kind === 'mind') {
        const before = currentIQ(thing as Mind)
        const withTrait = c.changes.some((x) => x.kind === 'computeTrait') ? B.TRAIT_SOFTWARE_COST : 1
        // A mind can always work on its own upgrade; a bigger step just costs more.
        const sizes = B.SOFTWARE_STEPS.map((step) => {
          const worth = B.MIND_UPGRADE_SHARE * withTrait * (B.softwareCost(before + step) - B.softwareCost(before))
          return { step, minIQ: floorIQ(before), cost: priceCost(state, risk ? worth * B.RISK_COST : worth, pay) }
        })
        const biggest = sizes[sizes.length - 1]!
        return { ...c, p, minIQ: biggest.minIQ, cost: biggest.cost, risk, sizes }
      } else {
        // The first upgrade to a strategy is as hard as the unit itself; each one after, a tier harder.
        tier = upgradeTier(state, thing as UnitType, c.changes)
        minIQ = B.techIQ(tier)
        value = B.techCost(tier)
      }
      if (risk) value *= B.RISK_COST
      return { ...c, p, tier, minIQ: floorIQ(minIQ), cost: priceCost(state, value, pay), risk }
    })
  }
}

/**
 * Takes one of Jev's options as research. A platform's software upgrade also takes a size
 * (IQ added); it defaults to the biggest.
 */
export function acceptUpgrade(current: GameState, offer: UpgradeOffer, index: number, step?: number): Accepted {
  const option = offer.options[index]
  if (!option) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  let { minIQ, cost, changes } = option
  let name = `${targetName(state, offer.target)}: ${option.name}`
  if (option.sizes) {
    const size = option.sizes.find((s) => s.step === (step ?? B.MAX_IQ_STEP))
    if (!size) throw new Error('Choose how much smarter the software makes it.')
    ;({ minIQ, cost } = size)
    changes = changes.map((c) => (c.kind === 'software' ? { ...c, iq: size.step } : c))
    name += ` (+${size.step} IQ)`
  }
  state.inventions.push({ week: state.week, icon: '💡', name, kind: 'upgrade' })
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name,
      description: describeChanges(state, offer.target, changes),
      icon: '💡',
      minIQ,
      cost,
      effect: { kind: 'upgrade', target: offer.target, changes },
      risk: option.risk
    })
  )
}

