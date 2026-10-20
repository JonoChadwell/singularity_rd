import { ranked, type JevQuestion, type Judge } from '@/ai/jev'
import * as B from './balance'
import {
  currentIQ,
  findMind,
  findResource,
  findStrategy,
  findUnit,
  iqRoom,
  softwareVersion
} from './model'
import {
  addResearch,
  claimProposal,
  floorIQ,
  newResearch,
  payers,
  payQuestion,
  proposalSlotBlocker,
  reader,
  scale,
  type Accepted
} from './proposals'
import { lockReason } from './phase'
import { priceCost } from './research'
import { alarmQuestion, asksAlarm, riskFrom } from './risk'
import { proposalText } from './stateText'
import { ALL_TRAITS, TRAITS, UPKEEP_TRAITS } from './traits'
import type { Change, Cost, GameState, Mind, Risk, UnitType, UpgradeTarget } from './types'

// Upgrades. Jev doesn't write, so the game lists every improvement that could apply to the
// unit or mind, and Jev picks the three most natural, says how hard each is, and who pays.

interface Candidate {
  key: string
  name: string
  changes: Change[]
}

export interface UpgradeOption extends Candidate {
  /** Jev's preference among the candidates. */
  p: number
  minIQ: number
  cost: Cost
  risk: Risk | null
}

export interface UpgradeOffer {
  target: UpgradeTarget
  options: UpgradeOption[]
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

/** "Lab GPU Server" → "Lab GPU Server Mk II"; "… Mk II" → "… Mk III". */
export function nextHardwareName(name: string, steps: number): string {
  const m = /^(.*) Mk ([IVX]+)$/.exec(name)
  const base = m ? m[1]! : name
  const at = m ? ROMAN.indexOf(m[2]!) : 0
  return `${base} Mk ${ROMAN[Math.min(ROMAN.length - 1, at + steps)]}`
}

export function targetOf(state: GameState, target: UpgradeTarget): UnitType | Mind | undefined {
  return target.kind === 'mind' ? findMind(state, target.id) : findUnit(state, target.id)
}

export const targetName = (state: GameState, target: UpgradeTarget) => targetOf(state, target)?.name ?? '?'

/**
 * Software steps that close a third, a half or two-thirds of the gap to the ceiling, rounded
 * down to SOFTWARE_ROUND and at least that, so each upgrade adds less than the last.
 */
export function softwareSteps(m: Mind): number[] {
  const room = iqRoom(m)
  if (room < B.SOFTWARE_ROUND - 1e-9) return []
  const round = (x: number) => Math.max(1, Math.floor(x / B.SOFTWARE_ROUND + 1e-9)) * B.SOFTWARE_ROUND
  const steps = B.SOFTWARE_STEPS.map((f) => Math.round(round(room * f) * 100) / 100)
  return [...new Set(steps)].filter((s) => s <= room + 1e-9)
}

function mindCandidates(state: GameState, m: Mind): Candidate[] {
  const hardware = lockReason(state, 'hardware')
    ? []
    : B.HARDWARE_STEPS.map((share, i) => {
        const name = nextHardwareName(m.hardware.name, i + 1)
        return { key: `hardware_${share}`, name, changes: [{ kind: 'hardware', name, share }] as Change[] }
      })
  return [
    ...softwareSteps(m).map((share) => ({
      key: `software_${share}`,
      name: `${m.software.name} ${softwareVersion(m.software.bonus + share)}`,
      changes: [{ kind: 'software', share }] as Change[]
    })),
    ...hardware
  ]
}

function unitCandidates(state: GameState, u: UnitType): Candidate[] {
  const res = (id: string) => findResource(state, id)?.name ?? '?'
  const out: Candidate[] = []
  for (const f of u.upkeep) {
    out.push({ key: `upkeep_${f.resourceId}`, name: `Less ${res(f.resourceId)} upkeep`, changes: [{ kind: 'upkeep', resourceId: f.resourceId, factor: B.UPKEEP_FACTOR }] })
  }
  for (const f of u.parts) {
    out.push({ key: `parts_${f.resourceId}`, name: `Less ${res(f.resourceId)} per unit made`, changes: [{ kind: 'parts', resourceId: f.resourceId, factor: B.PARTS_FACTOR }] })
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
 * Every improvement that could apply, minus any already waiting as research. An industry
 * unit's improvements happen once each: research doesn't repeat.
 */
export function upgradeCandidates(state: GameState, target: UpgradeTarget): Candidate[] {
  const thing = targetOf(state, target)
  if (!thing) return []
  const all = target.kind === 'mind' ? mindCandidates(state, thing as Mind) : unitCandidates(state, thing as UnitType)
  const taken = new Set([
    ...state.research.flatMap((r) =>
      r.effect.kind === 'upgrade' && r.effect.target.id === target.id ? [changeKey(r.effect.changes)] : []
    ),
    ...state.upgrades.flatMap((u) => (u.targetId === target.id && u.key ? [u.key] : []))
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
      const next = m.software.bonus + c.share
      return `Software ${softwareVersion(m.software.bonus)} → ${softwareVersion(next)}: IQ ${Math.round(currentIQ(m))} → ${Math.round(m.hardware.iq * (1 + next))}`
    }
    case 'hardware': {
      const m = findMind(state, target.id)
      if (!m) return `New hardware: ${c.name}`
      return `New hardware ${c.name}: IQ ${Math.round(currentIQ(m))} → ${Math.round(currentIQ(m) * (1 + c.share))}`
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

/** IQ after an IQ change, which sets its minimum by the leap rule. */
function iqAfter(m: Mind, changes: Change[]): number {
  let iq = currentIQ(m)
  for (const c of changes) {
    if (c.kind === 'software') iq = m.hardware.iq * (1 + m.software.bonus + c.share)
    if (c.kind === 'hardware') iq *= 1 + c.share
  }
  return iq
}

/**
 * Asks Jev for the three best ways to improve a unit or mind, in one call. Each comes with its
 * minimum IQ and cost.
 */
export function precheckUpgrade(state: GameState, target: UpgradeTarget): string | null {
  const locked = lockReason(state, target.kind === 'unit' ? 'unit-upgrade' : 'upgrade')
  if (locked) return locked
  if (!targetOf(state, target)) return 'Choose something to upgrade.'
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
    ...Object.fromEntries(
      candidates.map((c, i) => [
        `d_${keyOf(i)}`,
        { type: 'score', instructions: `How hard would the research be for: ${text(c)}?`, criteria: scale(B.UPGRADE_DIFFICULTY) }
      ])
    ),
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
  const read = reader({ answers, picks: {} })
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
      const [, bandIQ, share] = B.pick(B.UPGRADE_DIFFICULTY, read.level(`d_${keyOf(i)}`, B.UPGRADE_DIFFICULTY.length))
      const risk = riskFrom(answers, `a_${keyOf(i)}`)
      let minIQ = bandIQ
      let value: number
      if (target.kind === 'mind') {
        const m = thing as Mind
        const before = currentIQ(m)
        const iq = iqAfter(m, c.changes)
        // A mind can always work on its own upgrade; harder ones just cost more.
        minIQ = Math.min(Math.max(minIQ, iq * B.DESIGN_BAR), before)
        const hardware = c.changes.some((x) => x.kind === 'hardware') ? B.HARDWARE_COST : 1
        value = share * B.MIND_UPGRADE_SHARE * hardware * (B.mindDesignCost(iq) - B.mindDesignCost(before))
      } else {
        const u = thing as UnitType
        value = share * B.UPGRADE_FLEET_SHARE * u.value * Math.max(u.count, B.MIN_FLEET)
      }
      if (risk) value *= B.RISK_COST
      return { ...c, p, minIQ: floorIQ(minIQ), cost: priceCost(state, value, pay), risk }
    })
  }
}

/** Takes one of Jev's options as research. */
export function acceptUpgrade(current: GameState, offer: UpgradeOffer, index: number): Accepted {
  const option = offer.options[index]
  if (!option) throw new Error('Choose one of the options.')
  const state = structuredClone(current)
  claimProposal(state)
  const name = `${targetName(state, offer.target)}: ${option.name}`
  state.inventions.push({ week: state.week, icon: '💡', name, kind: 'upgrade' })
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name,
      description: describeChanges(state, offer.target, option.changes),
      icon: '💡',
      minIQ: option.minIQ,
      cost: option.cost,
      effect: { kind: 'upgrade', target: offer.target, changes: option.changes },
      risk: option.risk
    })
  )
}

