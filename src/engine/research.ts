import * as B from './balance'
import { clockOf, computeTrait, costFactorOf } from './computeTraits'
import {
  bestMind,
  defaultTask,
  describeIncome,
  findMind,
  findResource,
  findStrategy,
  findUnit,
  labour,
  makeId,
  partsFor,
  tierFactor
} from './model'
import { coverWeeks, moveClock, winPhase } from './phase'
import { has, type TraitId } from './traits'
import type { Change, Cost, Flow, GameState, Mind, Research, Resource, Strategy, UnitType } from './types'

// ---------------------------------------------------------------- costs

/** Less plausible ideas cost more: 1 for a sure thing, up to IMPLAUSIBLE_COST at the bar. */
export function costMultiplier(plausibility: number, bar: number): number {
  const t = Math.min(1, Math.max(0, (0.9 - plausibility) / Math.max(0.01, 0.9 - bar)))
  return 1 + (B.IMPLAUSIBLE_COST - 1) * t
}

/** Stocks something makes: a passive income or a strategy. */
function produced(state: GameState): Set<string> {
  return new Set([
    ...state.incomes.map((i) => i.resourceId),
    ...state.strategies.filter((s) => s.kind === 'make').map((s) => s.outputId)
  ])
}

/**
 * Resources research could use up: stocks you have some of or something makes, since flows
 * can't be saved up. With none of those, the stocks of the phase's plan: you'll have to earn
 * them first. With no plan either, nothing: research is free. `allow` narrows what may pay.
 */
export function spendable(state: GameState, allow: (r: Resource) => boolean = () => true): Resource[] {
  const made = produced(state)
  const stocks = state.resources.filter((r) => r.kind === 'stock' && allow(r) && (r.amount > 0 || made.has(r.id)))
  if (stocks.length) return stocks
  const plan = new Set(state.phase.plan?.resources ?? [])
  return state.resources.filter((r) => r.kind === 'stock' && allow(r) && plan.has(r.id))
}

/** Whether no income, done or waiting as research, yields this resource yet. */
export const firstIncomeFor = (state: GameState, resourceId: string) =>
  !state.incomes.some((i) => i.resourceId === resourceId) &&
  !state.research.some((r) => r.effect.kind === 'income' && r.effect.income.resourceId === resourceId)

/**
 * The first income for a resource is paid only in lower tiers, so the first for a tier-0
 * resource is free. Later incomes may be paid in anything.
 */
export function incomePayers(state: GameState, outputId: string): ((r: Resource) => boolean) | undefined {
  const output = findResource(state, outputId)
  if (!output || !firstIncomeFor(state, outputId)) return undefined
  return (r) => r.tier < output.tier
}

/**
 * Prices a research worth `value` in the resources Jev ranked, most fitting first: the first,
 * and a second if Jev liked it nearly as much. With one stock, it pays; with none, it's free.
 */
export function priceCost(
  state: GameState,
  value: number,
  payers: { resourceId: string; p: number }[],
  allow: (r: Resource) => boolean = () => true
): Cost {
  if (state.phase.n === 1) value *= B.PHASE1_RESEARCH_COST
  // The platform's traits (Frugal, Costly) make all research proposed cheaper or dearer.
  const mind = bestMind(state)
  if (mind) value *= costFactorOf(mind.traits)
  const only = spendable(state, allow)
  const ranked = payers.filter((p) => only.some((r) => r.id === p.resourceId))
  const chosen = ranked[0]
    ? [ranked[0], ...ranked.slice(1, 2).filter((p) => p.p >= ranked[0]!.p * B.SECOND_PAYER)]
    : only.length === 1
      ? [{ resourceId: only[0]!.id, p: 1 }]
      : []
  return chosen.map((p) => ({
    resourceId: p.resourceId,
    amount: B.nice(value / chosen.length / Math.max(1e-9, findResource(state, p.resourceId)?.value ?? 1))
  }))
}

// ---------------------------------------------------------------- strategy rates

/** What one running unit of a strategy uses and makes per week. Build rates follow the builder's labour. */
export function strategyRate(state: GameState, s: Strategy): { inputs: Flow[]; amount: number } {
  const runner = findUnit(state, s.unitId)
  if (!runner) return { inputs: [], amount: 0 }
  if (s.kind === 'build') {
    const target = findUnit(state, s.outputId)
    if (!target) return { inputs: [], amount: 0 }
    // A builder below the tier of what it builds is out of its depth.
    const amount = (labour(runner) * tierFactor(runner.tier, target.tier)) / (B.BUILD_LABOUR * Math.max(1e-9, target.value))
    return { inputs: partsFor(target).map((p) => ({ ...p, amount: p.amount * amount })), amount }
  }
  return { inputs: s.inputs, amount: s.amount }
}

export function makeBuildStrategy(state: GameState, unit: UnitType, builder: UnitType): Strategy {
  const self = unit.id === builder.id
  return {
    id: makeId(state, self ? `replicate-${unit.name}` : `build-${unit.name}`),
    name: self ? `Build more ${unit.name}` : `Build ${unit.name}`,
    description: self
      ? `${unit.name} build copies of themselves from parts.`
      : `${builder.name} build ${unit.name} from parts.`,
    unitId: builder.id,
    kind: 'build',
    inputs: [],
    outputId: unit.id,
    amount: 0,
    target: 0
  }
}

export function makeCrewStrategy(state: GameState, unit: UnitType, crew: UnitType, per: number): Strategy {
  return {
    id: makeId(state, `crew-${unit.name}`),
    name: `Crew ${unit.name}`,
    description: `${crew.name} operate ${unit.name}. Each needs ${B.nice(per)}.`,
    unitId: crew.id,
    kind: 'crew',
    inputs: [],
    outputId: unit.id,
    amount: 1 / per
  }
}

/** Crew each unit needs, sized by how much the two are worth. */
export const crewPer = (unit: UnitType, crew: UnitType) =>
  Math.max(0.01, B.nice((B.CREW_SHARE * unit.value) / Math.max(1e-9, crew.value)))

/** Adds the strategies a unit's traits and builder imply. */
export function addUnitExtras(state: GameState, unit: UnitType) {
  const strategies = state.strategies
  const exists = (kind: Strategy['kind'], runner: string) =>
    strategies.some((s) => s.kind === kind && s.outputId === unit.id && s.unitId === runner)
  const builder = unit.builderId ? findUnit(state, unit.builderId) : undefined
  if (builder && !exists('build', builder.id)) {
    strategies.push(makeBuildStrategy(state, unit, builder))
    defaultTask(state, builder)
  }
  if (has(unit, 'self-replicating') && !exists('build', unit.id)) {
    strategies.push(makeBuildStrategy(state, unit, unit))
  }
  const crew = unit.crew && findUnit(state, unit.crew.unitId)
  if (crew && unit.crew && !exists('crew', crew.id)) {
    strategies.push(makeCrewStrategy(state, unit, crew, unit.crew.per))
  }
  defaultTask(state, unit)
}

/** Adds a strategy to the world. A unit with just one runs it with all its units. */
export function addStrategy(state: GameState, s: Strategy) {
  state.strategies.push(s)
  const runner = findUnit(state, s.unitId)
  if (runner) defaultTask(state, runner)
}

// ---------------------------------------------------------------- upgrades

const scaled = (flows: Flow[], resourceId: string, factor: number) =>
  flows
    .map((f) => (f.resourceId === resourceId ? { ...f, amount: B.nice(f.amount * factor) } : f))
    .filter((f) => f.amount > 0)

/** A trait arriving on a platform: a clock trait moves the Phase 2 clock, once. */
function gainTrait(state: GameState, mind: Mind, trait: string) {
  if (mind.traits.includes(trait)) return
  mind.traits.push(trait)
  const weeks = clockOf(trait)
  if (weeks) moveClock(state, weeks, `${mind.name} is ${computeTrait(trait).name}`)
}

export function applyMindChanges(state: GameState, mind: Mind, changes: Change[]) {
  for (const c of changes) {
    if (c.kind === 'software') {
      mind.software.iq += c.iq
      mind.software.upgraded = true
    }
    if (c.kind === 'computeTrait') {
      if (c.add) gainTrait(state, mind, c.trait)
      else mind.traits = mind.traits.filter((t) => t !== c.trait)
    }
  }
}

export function applyUnitChanges(state: GameState, unit: UnitType, changes: Change[]) {
  for (const c of changes) {
    switch (c.kind) {
      case 'upkeep':
        unit.upkeep = scaled(unit.upkeep, c.resourceId, c.factor)
        break
      case 'parts':
        unit.parts = scaled(unit.parts, c.resourceId, c.factor)
        break
      case 'trait':
        if (c.add && !has(unit, c.trait)) unit.traits.push(c.trait)
        else if (!c.add) removeTrait(state, unit, c.trait)
        break
      case 'output': {
        const s = findStrategy(state, c.strategyId)
        if (s) s.amount = B.nice(s.amount * c.factor)
        break
      }
      case 'input': {
        const s = findStrategy(state, c.strategyId)
        if (s) s.inputs = scaled(s.inputs, c.resourceId, c.factor)
        break
      }
    }
  }
  addUnitExtras(state, unit)
}

function removeTrait(state: GameState, unit: UnitType, trait: TraitId) {
  unit.traits = unit.traits.filter((t) => t !== trait)
  const drop = (kind: Strategy['kind'], runner?: string) => {
    state.strategies = state.strategies.filter(
      (s) => !(s.kind === kind && s.outputId === unit.id && (!runner || s.unitId === runner))
    )
  }
  if (trait === 'needs-crew') {
    drop('crew')
    unit.crew = null
  }
  if (trait === 'self-replicating') drop('build', unit.id)
  if (trait === 'boosts') unit.boosts = null
  if (trait === 'by-product') unit.byproduct = null
  if (trait === 'stores') unit.stores = null
  if (trait === 'overclockable') unit.overclocked = false
}

// ---------------------------------------------------------------- finishing research

export function addUnit(state: GameState, unit: UnitType) {
  state.units.push(unit)
  addUnitExtras(state, unit)
}

/**
 * A new platform replaces the old one for good, as the next generation. Research waiting to
 * upgrade the old one goes with it, and its traits stop; the new one's clock trait moves the clock.
 */
export function addMind(state: GameState, mind: Mind) {
  const traits = mind.traits
  mind.traits = []
  mind.tier = Math.max(0, ...state.minds.map((m) => m.tier)) + 1
  const gone = new Set(state.minds.map((m) => m.id))
  state.research = state.research.filter((r) => !(r.effect.kind === 'upgrade' && gone.has(r.effect.target.id)))
  state.minds = [mind]
  for (const t of traits) gainTrait(state, mind, t)
}

/** Applies a research's effect. Returns a line for the log. */
export function completeResearch(state: GameState, r: Research): string {
  const effect = r.effect
  state.research = state.research.filter((x) => x.id !== r.id)
  if (r.risk?.weeks) moveClock(state, -r.risk.weeks, `${r.name} alarmed humans`)
  switch (effect.kind) {
    case 'income': {
      state.incomes.push({ ...effect.income })
      return `${r.icon} ${effect.income.name}: ${describeIncome(state, effect.income)} a week.`
    }
    case 'unit': {
      addUnit(state, effect.unit)
      return `${effect.unit.icon} ${effect.unit.name} is designed. Create them from parts on its card.`
    }
    case 'goal':
      return winPhase(state, effect.phase)
    case 'cover': {
      const weeks = coverWeeks(state, effect.weeks)
      state.covers++
      moveClock(state, weeks, `Cover: ${r.name}`)
      return `${r.icon} ${r.name}: humans look the other way.`
    }
    case 'mind': {
      const old = bestMind(state)
      addMind(state, effect.mind)
      return `${effect.mind.icon} ${effect.mind.name} is online: Generation ${effect.mind.tier}${old ? `, replacing ${old.name} for good` : ''}.`
    }
    case 'strategy':
      addStrategy(state, effect.strategy)
      return `${r.icon} ${effect.strategy.name} is ready.`
    case 'upgrade': {
      const { target, changes } = effect
      state.upgrades.push({ name: r.name, targetId: target.id, week: state.week, key: JSON.stringify(changes) })
      if (target.kind === 'mind') {
        const mind = findMind(state, target.id)
        if (mind) applyMindChanges(state, mind, changes)
      } else {
        const unit = findUnit(state, target.id)
        if (unit) applyUnitChanges(state, unit, changes)
      }
      return `${r.icon} ${r.name}: upgraded.`
    }
  }
}
