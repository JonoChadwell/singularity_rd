import * as B from './balance'
import { drainOf } from './computeTraits'
import { allocation, capOf, contractsFor, findResource, makeId, OVERFLOW, TRAIT_GROWTH, TRAIT_LOSS } from './model'
import { strategyRate } from './research'
import { growthOf, makeFactor, refillOf, useFactor, weeklyLossOf } from './resourceTraits'
import { has } from './traits'
import type { GameState, Sourcing, Strategy, UnitType, UnitWeek, WeekReport } from './types'

/** Crew is rationed like a resource, under a pseudo-resource per crewed unit type. */
const crewId = (unitId: string) => `crew:${unitId}`
const isCrew = (id: string) => id.startsWith('crew:')

interface Runner {
  label: string
  unit: UnitType
  machines: number
  /** Per machine per week. */
  needs: Map<string, number>
  upkeep: Set<string>
  makes: Map<string, number>
  strategy: Strategy
  /** Share of machines running, which sets what they use. */
  f: number
  /** Share of full output. Below `f` only for Hardy units short of upkeep. */
  o: number
  limitedBy: string | null
  /** Runs only when every need is fully met. */
  picky: boolean
}

function emptyUnitWeek(): UnitWeek {
  return { unassigned: 0, unpaid: 0, unpaidFor: null, resting: false, built: 0, lost: 0 }
}

/** Output multiplier from traits and warm-up. */
export function outputFactor(state: GameState, u: UnitType): number {
  let f = 1
  if (has(u, 'networked')) f *= 1 + B.NETWORKED * Math.log10(Math.max(1, u.count))
  if (has(u, 'learns')) f *= 1 + Math.min(1, u.weeksRun * B.LEARN_PER_WEEK)
  if (u.overclocked && has(u, 'overclockable')) f *= B.OVERCLOCK_OUTPUT
  let boost = 0
  for (const b of state.units) {
    if (b.boosts === u.id && b.count > 0 && u.count > 0) {
      boost += B.BOOST_PER_RATIO * (b.count / u.count)
    }
  }
  f *= 1 + Math.min(B.BOOST_CAP, boost)
  if (u.ramp.length && u.count > 0) {
    const cold = u.ramp.reduce((n, r) => n + r.count * (1 - r.weeks / B.SLOW_WEEKS), 0)
    f *= Math.max(0, (u.count - cold) / u.count)
  }
  return f
}

export const resting = (state: GameState, u: UnitType) =>
  has(u, 'intermittent') && state.week % 2 === 0

/** What a runner uses of a resource each week, as a factor of the rate: its traits move it. */
const useOfResource = (state: GameState, id: string) => {
  const r = findResource(state, id)
  return r ? useFactor(r) : 1
}

function upkeepNeeds(state: GameState, u: UnitType, runner: Runner) {
  const factor = u.overclocked && has(u, 'overclockable') ? B.OVERCLOCK_UPKEEP : 1
  for (const f of u.upkeep) {
    const amount = f.amount * factor * useOfResource(state, f.resourceId)
    runner.needs.set(f.resourceId, (runner.needs.get(f.resourceId) ?? 0) + amount)
    runner.upkeep.add(f.resourceId)
  }
  if (u.crew) runner.needs.set(crewId(u.id), 1)
}

function buildRunners(state: GameState, report: WeekReport): Runner[] {
  const runners: Runner[] = []
  for (const u of state.units) {
    const week = emptyUnitWeek()
    report.units[u.id] = week
    const { byTask, free } = allocation(state, u)
    week.unassigned = free
    if (resting(state, u)) {
      week.resting = true
      continue
    }
    const factor = outputFactor(state, u)
    for (const [taskId, machines] of Object.entries(byTask)) {
      const strategy = state.strategies.find((s) => s.id === taskId)
      if (!strategy) continue
      const runner: Runner = {
        label: strategy.name,
        unit: u,
        machines,
        needs: new Map(),
        upkeep: new Set(),
        makes: new Map(),
        strategy,
        f: 1,
        o: 1,
        limitedBy: null,
        picky: has(u, 'picky')
      }
      const rate = strategyRate(state, strategy)
      for (const f of rate.inputs) {
        const amount = f.amount * useOfResource(state, f.resourceId)
        runner.needs.set(f.resourceId, (runner.needs.get(f.resourceId) ?? 0) + amount)
      }
      if (strategy.quirk === 'picky') runner.picky = true
      if (strategy.kind === 'make') {
        const out = findResource(state, strategy.outputId)
        const warm =
          strategy.quirk === 'slow-to-start' ? Math.min(1, ((strategy.weeksRun ?? 0) + 1) / B.SLOW_WEEKS) : 1
        // The output's traits (Perishable, Seasonal...) change how much units make of it.
        const made = out ? makeFactor(out, state.week) : 1
        runner.makes.set(strategy.outputId, rate.amount * factor * warm * made)
        const by = u.byproduct ? findResource(state, u.byproduct) : undefined
        if (by && out && by.id !== out.id) {
          const value = rate.amount * factor * out.value * B.BY_PRODUCT_SHARE * makeFactor(by, state.week)
          runner.makes.set(by.id, (runner.makes.get(by.id) ?? 0) + value / by.value)
        }
      } else {
        runner.makes.set(crewId(strategy.outputId), rate.amount)
      }
      upkeepNeeds(state, u, runner)
      runners.push(runner)
    }
  }
  return runners
}

/** Each runner's share given the resource shares: the scarcest need limits it. */
function settle(runner: Runner, shares: Map<string, number>, skip?: string) {
  const u = runner.unit
  let inputs = 1
  let upkeep = 1
  let limitedBy: string | null = null
  let lowest = 1
  for (const id of runner.needs.keys()) {
    if (id === skip) continue
    const s = shares.get(id) ?? 1
    if (s < lowest - 1e-12) {
      lowest = s
      limitedBy = id
    }
    if (runner.upkeep.has(id)) upkeep = Math.min(upkeep, s)
    else inputs = Math.min(inputs, s)
  }
  if (runner.picky && lowest < 1 - 1e-9) return { f: 0, o: 0, limitedBy }
  if (has(u, 'hardy') && upkeep < 1) {
    return { f: inputs, o: inputs * Math.max(B.HARDY, upkeep), limitedBy, upkeepShare: upkeep }
  }
  const f = Math.min(inputs, upkeep)
  return { f, o: f, limitedBy }
}

/** What a runner uses of a resource per machine, given how it settled. */
function useOf(runner: Runner, id: string, settled: ReturnType<typeof settle>): number {
  const need = runner.needs.get(id) ?? 0
  if ('upkeepShare' in settled && runner.upkeep.has(id)) return need * settled.f * (settled.upkeepShare ?? 1)
  return need * settled.f
}

/** The contract that takes units made by Procurements: created on first use, always full. */
function createdContract(state: GameState, u: UnitType): Sourcing {
  let c = contractsFor(state, u.id).find((x) => x.name === CREATED)
  if (!c) {
    c = { id: makeId(state, `${u.name} created`), unitId: u.id, name: CREATED, description: 'Made by Procurement.', parts: [], total: 0, used: 0, risky: false }
    state.sourcing.push(c)
  }
  return c
}
export const CREATED = 'Created directly'

/** Units made by a Procurement arrive with cap to match. */
export function deliverUnits(state: GameState, u: UnitType, n: number) {
  if (n <= 0) return
  const c = createdContract(state, u)
  c.total += n
  c.used += n
  u.built += n
  addUnits(u, n, true)
}

/** Lost units give their slots back, to the most recent contract that has some filled. */
export function releaseSlots(state: GameState, unitId: string, n: number) {
  for (const c of [...contractsFor(state, unitId)].reverse()) {
    if (n <= 0) return
    const back = Math.min(n, c.used)
    c.used -= back
    n -= back
  }
}

/**
 * Simulates one week and mutates `state` to the start of the next. Deterministic: the same
 * state always gives the same week. The preview runs it on a copy.
 */
export function simulateWeek(state: GameState): WeekReport {
  const report: WeekReport = { flows: {}, shares: {}, runs: {}, units: {}, wasted: {} }
  const runners = buildRunners(state, report)

  // Shares of each resource: what's on hand plus what's made this week. Users of a scarce
  // resource all get the same share; iterate because what's made depends on who could run.
  const ids = new Set<string>()
  for (const r of runners) {
    for (const id of r.needs.keys()) ids.add(id)
    for (const id of r.makes.keys()) ids.add(id)
  }
  const shares = new Map<string, number>([...ids].map((id) => [id, 1]))
  for (let round = 0; round < 60; round++) {
    let moved = 0
    for (const r of runners) {
      const s = settle(r, shares)
      r.f = s.f
      r.o = s.o
      r.limitedBy = s.limitedBy
    }
    for (const id of ids) {
      let supply = isCrew(id) ? 0 : (findResource(state, id)?.amount ?? 0)
      for (const r of runners) supply += (r.makes.get(id) ?? 0) * r.machines * r.o
      let demand = 0
      for (const r of runners) {
        if (!r.needs.has(id)) continue
        const others = settle(r, shares, id)
        demand += (r.needs.get(id) ?? 0) * r.machines * Math.max(others.f, 0)
      }
      const share = demand > 1e-12 ? Math.min(1, supply / demand) : 1
      moved = Math.max(moved, Math.abs(share - (shares.get(id) ?? 1)))
      shares.set(id, share)
    }
    if (moved < 1e-9) break
  }
  for (const r of runners) {
    const s = settle(r, shares)
    r.f = s.f
    r.o = s.o
    r.limitedBy = s.limitedBy
  }
  for (const [id, s] of shares) if (!isCrew(id)) report.shares[id] = s

  // Use and make.
  const note = (id: string, label: string, amount: number) => {
    if (isCrew(id) || Math.abs(amount) < 1e-12) return
    const list = (report.flows[id] ??= [])
    const row = list.find((x) => x.label === label)
    if (row) row.amount += amount
    else list.push({ label, amount })
  }
  const delta = new Map<string, number>()
  const change = (id: string, amount: number) => delta.set(id, (delta.get(id) ?? 0) + amount)
  for (const r of runners) {
    const settled = settle(r, shares)
    for (const id of r.needs.keys()) {
      const used = useOf(r, id, settled) * r.machines
      const label = r.upkeep.has(id) ? `${r.unit.name} upkeep` : r.label
      if (!isCrew(id)) change(id, -used)
      note(id, label, -used)
    }
    for (const [id, per] of r.makes) {
      const made = per * r.machines * r.o
      if (!isCrew(id)) change(id, made)
      note(id, r.label, made)
    }
    const run = (report.runs[r.strategy.id] ??= { units: 0, fraction: 0, limitedBy: null })
    run.units += r.machines
    run.fraction = r.o
    run.limitedBy = r.o < 1 - 1e-9 ? r.limitedBy : null
    const week = report.units[r.unit.id]!
    if (r.limitedBy && r.upkeep.has(r.limitedBy) && r.f < 1 - 1e-9) {
      week.unpaid += r.machines * (1 - r.o)
      week.unpaidFor = r.limitedBy
    }
  }

  // Procurements deliver.
  const unitsIn = new Map<string, number>()
  state.deliveries = state.deliveries.filter((d) => {
    if (d.delay > 0) {
      d.delay -= 1
      return true
    }
    if (d.target.kind === 'resource') {
      if (findResource(state, d.target.id)) {
        change(d.target.id, d.amount)
        note(d.target.id, d.name, d.amount)
      }
    } else {
      unitsIn.set(d.target.id, (unitsIn.get(d.target.id) ?? 0) + Math.floor(d.amount + 1e-9))
    }
    if (d.weeks === null) return true
    d.weeks -= 1
    return d.weeks > 0
  })

  for (const res of state.resources) res.amount = Math.max(0, res.amount + (delta.get(res.id) ?? 0))

  // ---- End of the week.

  for (const res of state.resources) {
    // Its own traits: Energetic, Perishable, Volatile and Liquid lose a share of what's left.
    const loss = weeklyLossOf(res)
    if (loss > 0 && res.amount > 0) {
      const lost = res.amount * loss
      res.amount -= lost
      note(res.id, TRAIT_LOSS, -lost)
    }
    const cap = capOf(state, res)
    const limit = cap
    // Overflow is lost.
    if (res.amount > limit + 1e-9) {
      report.wasted[res.id] = res.amount - limit
      note(res.id, OVERFLOW, -(res.amount - limit))
      res.amount = limit
    }
    // Compounding, Self-replicating and Renewable grow on their own, but only into free room.
    const grown = Math.min(Math.max(0, limit - res.amount), res.amount * growthOf(res) + cap * refillOf(res))
    if (grown > 1e-9) {
      res.amount += grown
      note(res.id, TRAIT_GROWTH, grown)
    }
  }

  // A thirsty platform burns a share of the richest stock (by worth). Running dry costs nothing.
  for (const mind of state.minds) {
    const share = drainOf(mind.traits)
    if (share <= 0) continue
    const richest = state.resources
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount * b.value - a.amount * a.value)[0]
    if (!richest) continue
    const burned = richest.amount * share
    richest.amount -= burned
    note(richest.id, `${mind.name} burns it`, -burned)
  }

  // Units arrive.
  for (const u of state.units) {
    const week = report.units[u.id] ?? (report.units[u.id] = emptyUnitWeek())
    for (const p of u.pending) p.weeks -= 1
    const arrived = u.pending.filter((p) => p.weeks <= 0).reduce((n, p) => n + p.count, 0)
    u.pending = u.pending.filter((p) => p.weeks > 0)
    for (const r of u.ramp) r.weeks += 1
    u.ramp = u.ramp.filter((r) => r.weeks < B.SLOW_WEEKS)
    if (arrived) addUnits(u, arrived, false)

    const delivered = unitsIn.get(u.id) ?? 0
    if (delivered > 0) {
      deliverUnits(state, u, delivered)
      week.built = delivered
    }

    // Traits that act at the end of the week. Lost units give their slots back.
    let lost = 0
    if (has(u, 'wears-out') && u.count > 0) lost += Math.round(u.count * B.WEAR)
    if (has(u, 'fragile') && week.unpaid > 0 && u.count > lost) {
      lost += Math.min(u.count - lost, Math.ceil(B.FRAGILE * week.unpaid))
    }
    if (lost > 0) {
      u.count -= lost
      week.lost += lost
      releaseSlots(state, u.id, lost)
    }
    if (runners.some((r) => r.unit === u && r.o > 0)) u.weeksRun += 1
  }
  for (const s of state.strategies) {
    if (runners.some((r) => r.strategy === s && r.o > 0)) s.weeksRun = (s.weeksRun ?? 0) + 1
  }

  state.proposedThisWeek = false
  state.week += 1
  return report
}

/**
 * Adds units to a type. Slow to build ones arrive later; Slow to start ones warm up.
 * `delay` is false for units that have already waited.
 */
export function addUnits(u: UnitType, n: number, delay: boolean) {
  if (n <= 0) return
  if (delay && has(u, 'slow-to-build')) {
    u.pending.push({ count: n, weeks: B.SLOW_WEEKS })
    return
  }
  u.count += n
  if (has(u, 'slow-to-start')) u.ramp.push({ count: n, weeks: 0 })
}

/** Next week, if nothing changes. */
export function previewWeek(state: GameState): WeekReport {
  return simulateWeek(structuredClone(state))
}

export const netFlow = (report: WeekReport | null, id: string) =>
  (report?.flows[id] ?? []).reduce((n, f) => n + f.amount, 0)
