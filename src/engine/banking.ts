import { doResearch, researchBlocker } from './actions'
import { computeTrait } from './computeTraits'
import { findResource, findUnit, fmt, makeId, tierLabel } from './model'
import { draftMind, type MindVerdict } from './mindProposal'
import {
  addResearch,
  claimProposal,
  logProposal,
  newResearch,
  recordIdea,
  refuseUnaccepted,
  type Accepted
} from './proposals'
import type { SourcingVerdict } from './sourcingProposal'
import { storageResearchText, type StorageVerdict } from './storageProposal'
import type { GameState, Research, Sourcing } from './types'
import { draftUnit, type UnitVerdict } from './unitProposal'
import { changeKey, describeChanges, targetName, type UpgradeOffer } from './upgrade'
import type { Verdict } from './dispatch'

// Banking: every option Jev offers can be saved to the research list for later (all of them, for
// one action), or applied now (just that one, researched at once if the mind and stocks allow).

export type BankableVerdict = UnitVerdict | MindVerdict | StorageVerdict | SourcingVerdict

/** Verdicts whose options become research. A plan's first unit comes designed, so it isn't one. */
export const isBankable = (v: Verdict): v is BankableVerdict =>
  v.kind === 'mind' || v.kind === 'storage' || v.kind === 'sourcing' || (v.kind === 'unit' && !v.spec.first)

type Draft = Omit<Research, 'id' | 'proposedWeek' | 'group'> & { label: string }

/** The research option `i` of a verdict would become. */
function draftOption(state: GameState, v: BankableVerdict, i: number): Draft {
  switch (v.kind) {
    case 'unit': {
      const { unit, minIQ, cost } = draftUnit(state, { ...v, choice: i })
      const runsOn = findResource(state, v.options[i]!.upkeepId)?.name ?? '?'
      return {
        label: `${tierLabel(v.options[i]!.tier)}, runs on ${runsOn}`,
        name: `Design ${unit.name}`,
        description: `Design ${unit.name}.`,
        icon: unit.icon,
        minIQ,
        cost,
        effect: { kind: 'unit', unit },
        risk: v.risk
      }
    }
    case 'mind': {
      const { mind, minIQ, cost } = draftMind(state, { ...v, choice: i })
      return {
        label: computeTrait(v.options[i]!.perk).name,
        name: `Design ${mind.name}`,
        description: `Design ${mind.hardware.name} hardware with IQ ${mind.hardware.iq}, running ${mind.software.name}. It replaces your current platform for good.`,
        icon: mind.icon,
        minIQ,
        cost,
        effect: { kind: 'mind', mind },
        risk: v.risk
      }
    }
    case 'storage': {
      const o = v.options[i]!
      const r = findResource(state, v.spec.resourceId)
      if (!r) throw new Error('That resource is gone.')
      return {
        label: o.label,
        name: `${r.name}: ${v.spec.name}`,
        description: storageResearchText(r, o),
        icon: '🏗️',
        minIQ: o.minIQ,
        cost: o.cost,
        effect: { kind: 'storage', resourceId: r.id, expansion: { name: v.spec.name, added: o.added } },
        risk: o.risk
      }
    }
    case 'sourcing': {
      const o = v.options[i]!
      const unit = findUnit(state, v.spec.unitId)
      if (!unit) throw new Error('That unit is gone.')
      const sourcing: Sourcing = {
        id: makeId(state, `${unit.name} ${v.spec.name}`),
        unitId: unit.id,
        name: v.spec.name,
        description: v.spec.description || v.spec.name,
        parts: o.parts,
        total: o.total,
        used: 0,
        risky: o.risky
      }
      return {
        label: o.label,
        name: `${unit.name}: ${v.spec.name}`,
        description: `Sourcing for up to ${fmt(o.total)} more ${unit.name}.`,
        icon: '📦',
        minIQ: 0,
        cost: [],
        effect: { kind: 'sourcing', sourcing },
        risk: o.risk
      }
    }
  }
}

/**
 * Banks the verdict's options as research for one action: all of them, or just `only`. The ones
 * banked together are alternatives: doing one drops the rest. A storage option too big for your
 * IQ on the ownership ladder is banked too, with the holder's IQ as its minimum.
 */
export function bankVerdict(current: GameState, v: BankableVerdict, only?: number): Accepted {
  refuseUnaccepted(v)
  const state = structuredClone(current)
  claimProposal(state)
  const all = only === undefined
  const picks = (all ? v.options.map((_, i) => i) : [only]).filter((i) => v.options[i])
  if (!picks.length) throw new Error('Choose one of the options.')
  const group = `${v.kind}:${state.week}:${v.spec.name}`
  const first = draftOption(state, v, picks[0]!)
  state.inventions.push({ week: state.week, icon: first.icon, name: v.spec.name, kind: v.kind })
  if (v.kind === 'storage' || v.kind === 'sourcing') recordIdea(state, v.kind, first.name, v.spec.description)
  state.decidedThisWeek = true
  let last: Accepted | undefined
  for (const i of picks) {
    const { label, ...fields } = draftOption(state, v, i)
    last = addResearch(
      state,
      newResearch(state, {
        ...fields,
        name: all && picks.length > 1 ? `${fields.name} (${label})` : fields.name,
        group: picks.length > 1 ? group : undefined
      })
    )
  }
  return last!
}

/** Banks one option and researches it at once. */
export function applyVerdict(current: GameState, v: BankableVerdict, index: number): Accepted {
  const banked = bankVerdict(current, v, index)
  if (banked.outcome.kind !== 'research') throw new Error('Nothing to apply.')
  const { research } = banked.outcome
  return { state: doResearch(banked.state, research.id), outcome: { kind: 'added', name: research.name } }
}

/** Why an option can't be applied now, or null if it can. */
export function applyBlocker(state: GameState, v: BankableVerdict, index: number): string | null {
  try {
    const banked = bankVerdict(state, v, index)
    return banked.outcome.kind === 'research' ? researchBlocker(banked.state, banked.outcome.research.id) : null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

// ---------------------------------------------------------------- upgrades

/** Banks an upgrade offer's options (all, or just `only`) as research for one action. */
export function bankUpgrade(current: GameState, offer: UpgradeOffer, only?: number): Accepted {
  const state = structuredClone(current)
  claimProposal(state)
  const picks = (only === undefined ? offer.options.map((_, i) => i) : [only]).filter((i) => offer.options[i])
  if (!picks.length) throw new Error('Choose one of the options.')
  // A platform has one software upgrade at a time, so its options are alternatives.
  const group = offer.target.kind === 'mind' ? `upgrade:${state.week}:${offer.target.id}` : undefined
  let last: Accepted | undefined
  const taken = new Set<string>()
  for (const i of picks) {
    const option = offer.options[i]!
    if (taken.has(changeKey(option.changes))) continue
    taken.add(changeKey(option.changes))
    const name = `${targetName(state, offer.target)}: ${option.name}`
    state.inventions.push({ week: state.week, icon: '💡', name, kind: 'upgrade' })
    last = addResearch(
      state,
      newResearch(state, {
        name,
        description: describeChanges(state, offer.target, option.changes),
        icon: '💡',
        minIQ: option.minIQ,
        cost: option.cost,
        effect: { kind: 'upgrade', target: offer.target, changes: option.changes },
        risk: option.risk,
        group: picks.length > 1 ? group : undefined
      })
    )
  }
  state.decidedThisWeek = true
  logProposal(state, 'good', `Saved ${picks.length} option${picks.length === 1 ? '' : 's'} to Research.`)
  return last!
}

export function applyUpgrade(current: GameState, offer: UpgradeOffer, index: number): Accepted {
  const banked = bankUpgrade(current, offer, index)
  if (banked.outcome.kind !== 'research') throw new Error('Nothing to apply.')
  const { research } = banked.outcome
  return { state: doResearch(banked.state, research.id), outcome: { kind: 'added', name: research.name } }
}

export function upgradeApplyBlocker(state: GameState, offer: UpgradeOffer, index: number): string | null {
  try {
    const banked = bankUpgrade(state, offer, index)
    return banked.outcome.kind === 'research' ? researchBlocker(banked.state, banked.outcome.research.id) : null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
