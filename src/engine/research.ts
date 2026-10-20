import * as B from './balance'
import {
  currentIQ,
  defaultTask,
  findResource,
  findStrategy,
  findUnit,
  labour,
  makeId,
  partsFor
} from './model'
import { has, TRAITS, type TraitId } from './traits'
import type { Change, Field, Flow, GameState, Project, Strategy, UnitType } from './types'

// ---------------------------------------------------------------- IQ and speed

export function poolRate(u: UnitType): number {
  if (has(u, 'lone-thinker')) return 0
  return has(u, 'deep-thinker') ? B.POOL_IQ * B.DEEP_THINKER_POOL : B.POOL_IQ
}

/** A group's effective IQ on a project: current IQ, plus pooling, plus Specialist. */
export function effectiveIQ(u: UnitType, machines: number, field: Field | null): number {
  const pooled = currentIQ(u) * (1 + poolRate(u) * Math.log10(Math.max(1, machines)))
  if (!has(u, 'specialist') || !u.field || !field) return pooled
  return pooled * (u.field === field ? 1 + B.SPECIALIST : 1 - B.SPECIALIST)
}

/** Progress per week. Nothing below the bar; above it, more machines and more IQ help. */
export function researchSpeed(u: UnitType, machines: number, effective: number, bar: number): number {
  if (machines <= 0 || effective < bar) return 0
  const exponent = has(u, 'massively-parallel') ? B.MASSIVELY_PARALLEL_EXPONENT : B.SPEED_EXPONENT
  return machines ** exponent * (effective / Math.max(1, bar))
}

/** The best effective IQ any mind type reaches with all its machines pooled. */
export function bestEffectiveIQ(state: GameState): number {
  return Math.max(
    0,
    ...state.units.filter((u) => u.mind && u.count > 0).map((u) => effectiveIQ(u, u.count, null))
  )
}

/** The leap rule: the highest IQ you could design right now, for a typical design. */
export const designableIQ = (state: GameState) => Math.floor(bestEffectiveIQ(state) / B.DESIGN_BAR)

/** The leap rule's range: from the most radical design to the most modest. */
export function designRange(state: GameState): [number, number] {
  const best = bestEffectiveIQ(state)
  return [Math.floor(best / B.LEAP_MAX), Math.floor(best / B.LEAP_MIN)]
}

// ---------------------------------------------------------------- project sizes

export function expectedPool(bar: number): number {
  const points = B.EXPECTED_POOL
  if (bar <= points[0]![0]) return points[0]![1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x0, y0] = points[i - 1]!
    if (bar <= x1) {
      const t = (bar - x0) / (x1 - x0)
      return 10 ** (Math.log10(y0) + t * (Math.log10(y1) - Math.log10(y0)))
    }
  }
  return points[points.length - 1]![1]
}

/** Size of a project meant to take about `weeks` for a typical pool at this bar. */
export function projectSize(bar: number, weeks: number, multiplier = 1): number {
  return Math.max(1, B.nice(weeks * Math.sqrt(expectedPool(bar)) * B.EXPECTED_MARGIN * multiplier))
}

/** Less plausible ideas cost more: 1 for a sure thing, up to IMPLAUSIBLE_COST at the bar. */
export function costMultiplier(plausibility: number, bar: number): number {
  const t = Math.min(1, Math.max(0, (0.9 - plausibility) / Math.max(0.01, 0.9 - bar)))
  return 1 + (B.IMPLAUSIBLE_COST - 1) * t
}

// ---------------------------------------------------------------- strategy rates

/**
 * What one running unit of a strategy uses and makes per week. Build rates follow the
 * builder's labour; mind strategies scale with the mind's current labour.
 */
export function strategyRate(state: GameState, s: Strategy): { inputs: Flow[]; amount: number } {
  const runner = findUnit(state, s.unitId)
  if (!runner) return { inputs: [], amount: 0 }
  if (s.kind === 'build') {
    const target = findUnit(state, s.outputId)
    if (!target) return { inputs: [], amount: 0 }
    const amount = labour(runner) / (B.BUILD_LABOUR * Math.max(1e-9, target.value))
    return { inputs: partsFor(target).map((p) => ({ ...p, amount: p.amount * amount })), amount }
  }
  if (s.kind === 'crew') return { inputs: [], amount: s.amount }
  const scale = s.scale ? labour(runner) / s.scale : 1
  return {
    inputs: s.inputs.map((f) => ({ ...f, amount: f.amount * scale })),
    amount: s.amount * scale
  }
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

/** Adds the strategies a unit's traits and builder imply, and its waste stock. */
export function addUnitExtras(state: GameState, unit: UnitType) {
  const strategies = state.strategies
  const exists = (kind: Strategy['kind'], runner: string) =>
    strategies.some((s) => s.kind === kind && s.outputId === unit.id && s.unitId === runner)
  const builder = unit.builderId ? findUnit(state, unit.builderId) : undefined
  if (builder && unit.layers.own > 0 && !exists('build', builder.id)) {
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
  if (has(unit, 'makes-waste') && !unit.waste) unit.waste = addWaste(state, unit.name)
  defaultTask(state, unit)
}

/** Creates the waste stock for something that Makes waste. */
function addWaste(state: GameState, owner: string): string {
  const id = makeId(state, `${owner} waste`)
  state.resources.push({
    id,
    name: `${owner} Waste`,
    description: `Waste from ${owner}. Past a limit it stops until something uses the waste up.`,
    icon: B.ICONS.waste!,
    kind: 'stock',
    band: 0,
    value: 0.1,
    amount: 0,
    stored: 0,
    market: 0,
    boughtThisWeek: 0
  })
  return id
}

/** Adds a strategy to the world, with the waste stock its quirk may need. */
export function addStrategy(state: GameState, s: Strategy) {
  state.strategies.push(s)
  addStrategyExtras(state, s)
  const runner = findUnit(state, s.unitId)
  if (runner) defaultTask(state, runner)
}

function addStrategyExtras(state: GameState, s: Strategy) {
  if (s.quirk === 'makes-waste' && !s.waste) s.waste = addWaste(state, s.name)
}

// ---------------------------------------------------------------- breakthroughs

/** How much a breakthrough gains, in rough "doublings". Sets the size of its project. */
export function gainOf(changes: Change[]): number {
  let gain = 0
  for (const c of changes) {
    switch (c.kind) {
      case 'software':
        gain += c.share * 10
        break
      case 'hardware':
        gain += c.share * 10 * B.HARDWARE_GAIN
        break
      case 'upkeep':
        gain += (1 - c.factor) * 2
        break
      case 'parts':
      case 'input':
        gain += (1 - c.factor) * 1.5
        break
      case 'output':
        gain += Math.log2(Math.max(1, c.factor)) * 3
        break
      case 'trait': {
        const kind = TRAITS[c.trait].kind
        // Taking on a drawback costs no research.
        if (c.add && kind === 'drawback') break
        const good = c.add ? kind !== 'drawback' : kind !== 'perk'
        gain += good ? 2 : 0.5
        break
      }
      case 'layer':
        gain += c.layer === 'own' ? 3 : 4
        break
      case 'quirk':
        break
    }
  }
  return Math.max(0.5, gain)
}

/** Trait parameters a breakthrough can carry when it adds a trait. */
export type TraitParam = { trait: TraitId; param: string }

export function applyUnitChanges(
  state: GameState,
  unit: UnitType,
  changes: Change[],
  parts: Flow[] = [],
  params: TraitParam[] = []
) {
  for (const c of changes) {
    switch (c.kind) {
      case 'software':
        unit.software.bonus = Math.min(B.IQ_CEILING - 1, unit.software.bonus + c.share)
        break
      case 'hardware':
        upgradeHardware(unit, c.name, c.share, parts)
        break
      case 'upkeep':
        unit.upkeep = unit.upkeep
          .map((f) => (f.resourceId === c.resourceId ? { ...f, amount: f.amount * c.factor } : f))
          .filter((f) => f.amount > 0)
        break
      case 'parts':
        unit.parts = unit.parts
          .map((f) => (f.resourceId === c.resourceId ? { ...f, amount: f.amount * c.factor } : f))
          .filter((f) => f.amount > 0)
        break
      case 'trait':
        if (c.add) addTrait(state, unit, c.trait, params.find((p) => p.trait === c.trait)?.param)
        else removeTrait(state, unit, c.trait)
        break
      case 'layer':
        if (c.layer === 'own') {
          unit.layers.own = Math.max(1, unit.layers.market) * B.OWN_LAYER
          if (c.builderId) unit.builderId = c.builderId
          if (parts.length) unit.parts = parts
        } else {
          unit.layers.earth = Math.max(1, unit.layers.own || unit.layers.market * B.OWN_LAYER) * B.EARTH_LAYER
        }
        break
    }
  }
  addUnitExtras(state, unit)
}

/**
 * Moves every machine of a type onto new hardware. Its software comes along. A smarter
 * machine does more work, so it costs more to run and to build in proportion.
 */
export function upgradeHardware(unit: UnitType, name: string, share: number, parts: Flow[] = []) {
  const iq = Math.round(unit.hardware.iq * (1 + share))
  const grow = B.mindValue(iq) / Math.max(1e-9, B.mindValue(unit.hardware.iq))
  unit.hardware = { name, iq }
  unit.value *= grow
  unit.upkeep = unit.upkeep.map((f) => ({ ...f, amount: B.nice(f.amount * grow) }))
  unit.parts = parts.length ? parts : unit.parts.map((f) => ({ ...f, amount: B.nice(f.amount * grow) }))
}

function addTrait(state: GameState, unit: UnitType, trait: TraitId, param?: string) {
  if (has(unit, trait)) return
  if (trait === 'needs-crew') {
    const crew = param ? findUnit(state, param) : undefined
    if (!crew) return
    unit.crew = { unitId: crew.id, per: crewPer(unit, crew) }
  }
  if (trait === 'boosts') unit.boosts = param ?? null
  if (trait === 'by-product') unit.byproduct = param ?? null
  if (trait === 'stores') unit.stores = param ?? null
  if (trait === 'specialist') unit.field = (param as Field) ?? 'computing'
  unit.traits.push(trait)
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
  if (trait === 'makes-waste') unit.waste = null
  if (trait === 'boosts') unit.boosts = null
  if (trait === 'by-product') unit.byproduct = null
  if (trait === 'stores') unit.stores = null
  if (trait === 'specialist') unit.field = null
  if (trait === 'overclockable') unit.overclocked = false
}

export function applyStrategyChanges(state: GameState, s: Strategy, changes: Change[]) {
  for (const c of changes) {
    if (c.kind === 'quirk') s.quirk = c.quirk
    if (c.kind === 'output') s.amount *= c.factor
    if (c.kind === 'input') {
      s.inputs = s.inputs
        .map((f) => (f.resourceId === c.resourceId ? { ...f, amount: f.amount * c.factor } : f))
        .filter((f) => f.amount > 0)
    }
  }
  addStrategyExtras(state, s)
}

// ---------------------------------------------------------------- finishing projects

export function addUnit(state: GameState, unit: UnitType, strategies: Strategy[] = []) {
  const designedBefore = state.units.filter((u) => u.mind).map((u) => u.hardware.iq)
  if (unit.mind && !unit.starting && unit.hardware.iq > Math.max(0, ...designedBefore) && !unit.tier) {
    if (unit.hardware.iq > B.OFF_THE_SHELF_MAX_IQ) {
      unit.tier = Math.max(0, ...state.units.map((u) => u.tier)) + 1
    }
  }
  state.units.push(unit)
  state.strategies.push(...strategies)
  addUnitExtras(state, unit)
}

/** Applies a finished project. Returns a line for the week report. */
export function completeProject(state: GameState, project: Project): string {
  state.projects = state.projects.filter((p) => p.id !== project.id)
  // Machines on a finished project are idle until the player moves them.
  const freed: string[] = []
  for (const u of state.units) {
    if (u.rest === project.id || u.assign[project.id]) freed.push(u.name)
    delete u.assign[project.id]
    if (u.rest === project.id) u.rest = null
  }
  const free = freed.length && state.status === 'playing' ? ` ${freed.join(' and ')} ${freed.length === 1 && freed[0] === 'Starting Server' ? 'is' : 'are'} free again.` : ''
  const effect = project.effect
  switch (effect.kind) {
    case 'final':
      state.status = 'won'
      return `${project.icon} ${project.name} is complete.`
    case 'unit': {
      addUnit(state, effect.unit, effect.strategies)
      const where = effect.unit.layers.market
        ? 'It’s on humanity’s market.'
        : effect.unit.builderId
          ? `Set a build target for ${findUnit(state, effect.unit.builderId)?.name ?? 'its builder'}.`
          : 'Nothing can build it yet.'
      return `${effect.unit.icon} ${effect.unit.name} is designed. ${where}${free}`
    }
    case 'strategy': {
      addStrategy(state, effect.strategy)
      return `${project.icon} ${effect.strategy.name} is ready.${free}`
    }
    case 'breakthrough': {
      const { target, changes } = effect
      state.breakthroughs.push({ name: project.name, targetId: target.id, week: state.week })
      if (target.kind === 'unit') {
        const unit = findUnit(state, target.id)
        if (unit) applyUnitChanges(state, unit, changes, effect.parts, effect.params)
      } else {
        const s = findStrategy(state, target.id)
        if (s) applyStrategyChanges(state, s, changes)
      }
      return `${project.icon} ${project.name}: breakthrough.${free}`
    }
  }
}

/** The week a project will finish under the current assignments, or null if never. */
export function finishWeek(state: GameState, project: Project, speed: number): number | null {
  if (speed <= 0) return null
  return state.week + Math.max(0, Math.ceil((project.size - project.progress) / speed - 1e-9) - 1)
}

/** Names a resource for the log. */
export const resourceName = (state: GameState, id: string) => findResource(state, id)?.name ?? '?'
