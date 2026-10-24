import type { JevQuestion, Judge } from '@/ai/jev'
import * as B from './balance'
import { bestIQ, capOf, findResource, fmt, industryScalar } from './model'
import { lockReason } from './phase'
import {
  addResearch,
  baseVerdict,
  claimProposal,
  cleanText,
  floorIQ,
  gate,
  newResearch,
  options,
  payers,
  payQuestion,
  proposalSlotBlocker,
  reader,
  refuseUnaccepted,
  scale,
  efficiencyLevel,
  recordIdea,
  repeatOf,
  repeatQuestion,
  type Accepted,
  type VerdictBase
} from './proposals'
import { costMultiplier, priceCost } from './research'
import { capFactor, clockFactor, expansionFactor } from './resourceTraits'
import { alarmQuestions, expansionRisk, riskFrom } from './risk'
import { proposalText } from './stateText'
import type { Cost, Expansion, GameState, Resource, Risk, StorageCatch } from './types'

/** A way to hold more of a resource: the player says how. */
export interface StorageSpec {
  resourceId: string
  name: string
  description: string
}

export interface StorageOption {
  label: string
  /** Units of the resource it adds. */
  added: number
  catch: StorageCatch | null
  risky: boolean
  risk: Risk | null
  minIQ: number
  cost: Cost
  iqEfficiency: number
  /** Who could plausibly hold the new total: an index into HOLDERS. */
  holder: number
  /** Too much for your IQ: the ownership ladder blocks it. */
  blocked: boolean
}

export interface StorageVerdict extends VerdictBase {
  kind: 'storage'
  spec: StorageSpec
  options: StorageOption[]
  choice: number
  /** The scalars, for the chips. */
  scalars: { industry: number; iq: number; efficiency: number }
}

export function precheckStorage(state: GameState, spec: StorageSpec): string | null {
  const locked = lockReason(state, 'storage')
  if (locked) return locked
  const slot = proposalSlotBlocker(state)
  if (slot) return slot
  if (!findResource(state, spec.resourceId)) return 'Choose what to store more of.'
  if (spec.name.trim().length < 2) return 'Name this way of storing more.'
  return null
}

/** The IQ scalar for storage: (best IQ / 100)². */
export const storageIQScalar = (state: GameState) => (bestIQ(state) / 100) ** 2

/** Units of a resource an expansion of this size would add, before the catch. */
function addedBy(state: GameState, r: Resource, size: number, efficiency: number): number {
  const worth = (B.STORAGE_WORTH[r.tier] ?? 0) * size * industryScalar(state) * storageIQScalar(state) * efficiency
  // Resource traits: a smaller or bigger cap all round, and expansions that hold more.
  return B.nice((worth / Math.max(1e-9, r.value)) * capFactor(r) * expansionFactor(r))
}

export async function judgeStorage(state: GameState, judge: Judge, raw: StorageSpec): Promise<StorageVerdict> {
  const spec = { ...raw, ...cleanText(raw.name, raw.description) }
  const refusal = precheckStorage(state, spec)
  if (refusal) throw new Error(refusal)
  const r = findResource(state, spec.resourceId)!
  const others = state.resources.filter((x) => x.id !== r.id)
  const questions: Record<string, JevQuestion> = {
    plausible: {
      type: 'noul',
      instructions: `Could the AI plausibly hold more ${r.name} this way?`
    },
    efficiency: {
      type: 'score',
      instructions: `How effective is this as a way to hold more ${r.name}?`,
      criteria: scale(B.EFFICIENCY)
    },
    catch: {
      type: 'choice',
      instructions: `If holding much more ${r.name} this way came with a catch, which would be most natural?`,
      criteria: Object.fromEntries(B.STORAGE_CATCHES.map(([id, label]) => [id, label]))
    },
    ...(others.length
      ? {
          upkeep: {
            type: 'choice',
            instructions: `If storing ${r.name} this way needed something every week to keep it going, which resource?`,
            criteria: options(others)
          } satisfies JevQuestion
        }
      : {}),
    ...payQuestion(state, `building storage for ${r.name}`),
    ...alarmQuestions(state),
    ...repeatQuestion(state, 'storage')
  }
  const text = [
    `The player proposes a way to hold more ${r.name}: ${r.description}`,
    `Name: "${spec.name}"`,
    `How: "${spec.description || '(not said)'}"`
  ]
  const answers = await judge.ask(proposalText(state, text), questions, 'storage')
  const base = { ...baseVerdict('storage', questions, answers, 'plausible', []), repeatOf: repeatOf(state, answers) }
  const efficiency = B.pick(B.EFFICIENCY, efficiencyLevel(base))[1]
  const v: StorageVerdict = {
    ...base,
    kind: 'storage',
    spec,
    options: [],
    choice: 0,
    scalars: { industry: industryScalar(state), iq: storageIQScalar(state), efficiency }
  }
  gate(v, `Jev doesn’t think the AI could hold more ${r.name} this way`, null)
  if (v.rejected) return v

  // The ownership ladder: who could plausibly hold each new total.
  const totals = B.STORAGE_SIZES.map(([, size]) => capOf(state, r) + addedBy(state, r, size, efficiency))
  const holderQuestions: Record<string, JevQuestion> = Object.fromEntries(
    totals.map((total, i) => [
      `holder_${i}`,
      {
        type: 'score',
        instructions: `Who could plausibly hold ${fmt(total)} ${r.name} (worth ${fmt(total * r.value)} in all) at once?`,
        criteria: B.HOLDERS.map(([label]) => label)
      } satisfies JevQuestion
    ])
  )
  const holders = await judge.ask(proposalText(state, text), holderQuestions, 'storage-holders')
  Object.assign(v.answers, holders)
  // Options too big for your IQ stay on offer: save them for later, once your IQ reaches the holder.
  v.options = storageOptions(state, v)
  return v
}

/**
 * Three expansions that trade off: a modest clean one, a large one with a catch, and a huge risky
 * one. Each is paid in a different resource where there's a choice. Options too big for your
 * IQ on the ownership ladder are blocked.
 */
export function storageOptions(state: GameState, v: Pick<StorageVerdict, 'answers' | 'picks' | 'spec' | 'plausibility' | 'bar' | 'scalars'>): StorageOption[] {
  const r = findResource(state, v.spec.resourceId)!
  const read = reader(v)
  const pay = payers(v.answers)
  const alarm = riskFrom(v.answers)
  const tierIQ = B.techIQ(r.tier)
  const iqEfficiency = B.iqEfficiency(tierIQ, bestIQ(state))
  const reach = B.holderReach(bestIQ(state))
  const catchId = read.choice('catch', B.STORAGE_CATCHES.map(([id]) => id))
  return B.STORAGE_SIZES.map(([label, size, risky], i) => {
    const added = addedBy(state, r, size, v.scalars.efficiency)
    const worth = added * r.value
    const holder = read.has(`holder_${i}`) ? read.level(`holder_${i}`, B.HOLDERS.length) : 0
    // The large one carries the catch; the risky one's catch is the clock.
    const caught: StorageCatch | null = i === 1 ? catchFor(state, v, catchId, worth) : null
    const payer = pay.length ? [pay[i % pay.length]!] : []
    // Priced on the base size: Industry, IQ and Efficiency make an expansion bigger, not dearer.
    const value = B.STORAGE_COST_SHARE * (B.STORAGE_WORTH[r.tier] ?? 0) * size * iqEfficiency * costMultiplier(v.plausibility, v.bar)
    return {
      label,
      added,
      catch: caught,
      risky,
      risk: tracedRisk(r, expansionRisk(state, i === 0 ? null : alarm, worth, risky)),
      minIQ: Math.max(floorIQ(tierIQ), holder > reach ? (B.HOLDERS[holder]?.[1] ?? 0) : 0),
      cost: priceCost(state, value, payer.map((p) => ({ ...p, p: 1 }))),
      iqEfficiency,
      holder,
      blocked: holder > reach
    }
  })
}

/** Hazardous, Untraceable and Contraband resources scale the clock weeks of their expansions. */
function tracedRisk(r: Resource, risk: Risk | null): Risk | null {
  if (!risk) return null
  const weeks = Math.round(risk.weeks * clockFactor(r))
  return weeks > 0 ? { ...risk, weeks } : null
}

function catchFor(
  state: GameState,
  v: Pick<StorageVerdict, 'answers' | 'picks'>,
  id: B.StorageCatchId,
  worth: number
): StorageCatch {
  if (id === 'decay') return { kind: 'decay', share: B.STORAGE_DECAY }
  if (id === 'fill') return { kind: 'fill', share: B.STORAGE_FILL }
  const upkeepId = v.answers.upkeep ? reader(v).choice('upkeep', state.resources.map((x) => x.id)) : null
  const payer = upkeepId ? findResource(state, upkeepId) : undefined
  if (!payer) return { kind: 'decay', share: B.STORAGE_DECAY }
  return { kind: 'upkeep', resourceId: payer.id, amount: B.nice((worth * B.STORAGE_UPKEEP) / payer.value) }
}

/** A storage catch in words. */
export function describeCatch(state: GameState, c: StorageCatch | null): string {
  if (!c) return 'No catch'
  switch (c.kind) {
    case 'upkeep': {
      const r = findResource(state, c.resourceId)
      return `Needs ${fmt(c.amount)} ${r?.icon ?? ''} ${r?.name ?? '?'} a week, or the extra space is lost that week`
    }
    case 'decay':
      return `${Math.round(c.share * 100)}% of what’s stored spoils every week`
    case 'fill':
      return `Only ${Math.round(c.share * 100)}% of the extra space can fill each week`
  }
}

export function acceptStorage(current: GameState, v: StorageVerdict): Accepted {
  refuseUnaccepted(v)
  const option = v.options[v.choice]
  if (!option) throw new Error('Choose one of the options.')
  if (option.blocked) throw new Error(`That’s more than ${B.HOLDERS[B.holderReach(bestIQ(current))]![0].toLowerCase()} could hold.`)
  const state = structuredClone(current)
  claimProposal(state)
  const r = findResource(state, v.spec.resourceId)
  if (!r) throw new Error('That resource is gone.')
  const expansion: Expansion = { name: v.spec.name, added: option.added, catch: option.catch }
  state.inventions.push({ week: state.week, icon: r.icon, name: v.spec.name, kind: 'storage' })
  recordIdea(state, 'storage', `${r.name}: ${v.spec.name}`, v.spec.description)
  state.decidedThisWeek = true
  return addResearch(
    state,
    newResearch(state, {
      name: `${r.name}: ${v.spec.name}`,
      description: `Room for ${fmt(option.added)} more ${r.name}.`,
      icon: '🏗️',
      minIQ: option.minIQ,
      cost: option.cost,
      effect: { kind: 'storage', resourceId: r.id, expansion },
      risk: option.risk
    })
  )
}
