import { answerFor, ranked, readNoul, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import { compatible, computeTrait, PERKS, type ComputeTraitId } from './computeTraits'
import { contractsFor, currentIQ, findMind, findResource, findStrategy, findUnit, softwareVersion } from './model'
import {
  addResearch,
  claimProposal,
  currentIQBar,
  floorIQ,
  newResearch,
  payers,
  payQuestion,
  proposalSlotBlocker,
  type Accepted
} from './proposals'
import { lockReason } from './phase'
import { seedOf } from './planPresets'
import { costMultiplier, priceCost } from './research'
import { alarmQuestion, asksAlarm, riskFrom } from './risk'
import { proposalText } from './stateText'
import { ALL_TRAITS, TRAITS, UPKEEP_TRAITS } from './traits'
import type { Change, Cost, GameState, Mind, Risk, UnitType, UpgradeTarget } from './types'

// Upgrades. Jev doesn't write, so the game lists every improvement that could apply to the
// unit or mind, and Jev picks the three most natural and who pays. A platform's software upgrade
// can be redone: each replaces the last, counts from the bare hardware and costs in full.

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
  /** A platform's software upgrade: the IQ it adds. */
  step?: number
}

/**
 * The IQ each of a platform's software options adds: random, but not all the same, and fixed for
 * the week, so asking again the same week offers the same sizes.
 */
export function softwareSteps(
  state: GameState,
  mindId: string,
  count: number,
  steps: readonly number[] = B.SOFTWARE_STEPS
): number[] {
  let seed = seedOf(`${state.runId}/${state.week}/${mindId}`)
  // The high bits: an LCG's low bits repeat with a short period.
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 16
  const out = Array.from({ length: count }, () => steps[next() % steps.length]!)
  if (count > 1 && out.every((s) => s === out[0])) {
    const others = steps.filter((s) => s !== out[0])
    out[count - 1] = others[next() % others.length]!
  }
  return out
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
  if (state.research.some((r) => r.effect.kind === 'upgrade' && r.effect.target.id === m.id)) {
    return `An upgrade to ${m.name} is already waiting as research.`
  }
  return null
}

/**
 * A platform's software upgrade: more IQ over the bare hardware, and optionally a trait changed.
 * It can be redone (replacing the last one's IQ), but not while one is already waiting as research.
 * Every candidate is listed at the biggest size; the player picks the size.
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
      // A clock trait pays out once, when it arrives: redoing software would farm it.
      if (t.effect.kind === 'clock') continue
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
  // A depot only holds: cheaper to build is the only way to improve it.
  if (u.holds) return out
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
      const to = Math.round(m.hardware.iq + c.iq)
      if (m.software.upgraded) {
        return `Replaces the current +${m.software.iq} IQ with +${c.iq} over the ${m.hardware.iq} IQ hardware: IQ ${Math.round(currentIQ(m))} → ${to}`
      }
      return `Software ${softwareVersion(false)} → ${softwareVersion(true)}: IQ ${Math.round(currentIQ(m))} → ${to}`
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
          candidates.map((c, i) => [`a_${keyOf(i)}`, alarmQuestion(state, `improving ${thing.name} this way (${text(c)})`)])
        )
      : {}),
    // A software improvement that isn't a natural fit costs more.
    ...(target.kind === 'mind'
      ? Object.fromEntries(
          candidates.map((c, i) => [
            `f_${keyOf(i)}`,
            {
              type: 'noul',
              instructions: `Could the AI plausibly develop this software improvement to ${thing.name}? ${text(c)}`
            } as JevQuestion
          ])
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
  const ranking = candidates
    .map((c, i) => ({ c, i, p: odds.get(keyOf(i)) ?? 0 }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
  const pay = payers(answers)
  // A redo must beat the software it replaces: a smaller size is never offered, nor the same size
  // with nothing else changed. A size that falls short becomes an unused bigger one; a candidate
  // with no size left is dropped.
  const sw = target.kind === 'mind' ? (thing as Mind).software : null
  const fits = (c: Candidate, s: number) => !sw?.upgraded || s > sw.iq || (s === sw.iq && c.changes.length > 1)
  const rolled = target.kind === 'mind' ? softwareSteps(state, target.id, B.UPGRADE_OPTIONS) : []
  const steps: number[] = []
  const order: typeof ranking = []
  for (const r of ranking) {
    if (order.length >= B.UPGRADE_OPTIONS) break
    if (target.kind === 'mind') {
      const want = rolled[order.length]!
      const valid = B.SOFTWARE_STEPS.filter((s) => fits(r.c, s))
      const step = fits(r.c, want) ? want : (valid.find((s) => !steps.includes(s)) ?? valid[0])
      if (step === undefined) continue
      steps.push(step)
    }
    order.push(r)
  }
  if (!order.length) throw new Error(`${thing.name}’s software is already as big as an upgrade can make it. Further progress needs a new platform.`)
  return {
    target,
    options: order.map(({ c, i, p }, n) => {
      const risk = riskFrom(answers, `a_${keyOf(i)}`)
      let minIQ: number
      let value: number
      let tier: number | undefined
      if (target.kind === 'mind') {
        // Software counts from the bare hardware, so a redo pays the full price again.
        const before = (thing as Mind).hardware.iq
        const withTrait = c.changes.some((x) => x.kind === 'computeTrait') ? B.TRAIT_SOFTWARE_COST : 1
        // A mind can always work on its own upgrade; a bigger step just costs more.
        const step = steps[n]!
        const plausible = costMultiplier(readNoul(answerFor(answers, `f_${keyOf(i)}`)), B.BARS.mind)
        const worth = B.softwarePrice(before, step) * withTrait * plausible
        const changes = c.changes.map((x) => (x.kind === 'software' ? { ...x, iq: step } : x))
        return {
          ...c,
          name: sw!.upgraded ? `${c.name} (+${step} IQ, replacing +${sw!.iq})` : `${c.name} (+${step} IQ)`,
          changes,
          p,
          minIQ: currentIQBar(before),
          cost: priceCost(state, risk ? worth * B.RISK_COST : worth, pay),
          risk,
          step
        }
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

/** Takes one of Jev's options as research. */
export function acceptUpgrade(current: GameState, offer: UpgradeOffer, index: number): Accepted {
  const option = offer.options[index]
  if (!option) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  const { minIQ, cost, changes } = option
  const name = `${targetName(state, offer.target)}: ${option.name}`
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

