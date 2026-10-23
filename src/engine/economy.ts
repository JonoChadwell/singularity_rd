import * as B from './balance'
import { drainOf } from './computeTraits'
import {
  allocation,
  findResource,
  findUnit,
  incomeYield,
  labour,
  owned
} from './model'
import { strategyRate } from './research'
import { has } from './traits'
import type { GameState, Strategy, UnitType, UnitWeek, WeekReport } from './types'

/** Crew is rationed like a flow, under a pseudo-resource per crewed unit type. */
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
  /** Build strategies: units per machine per week. */
  builds: { unitId: string; perMachine: number; cap: number } | null
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
  return {
    unassigned: 0,
    unpaid: 0,
    unpaidFor: null,
    done: 0,
    resting: false,
    built: 0,
    lost: 0
  }
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

function upkeepNeeds(u: UnitType, runner: Runner) {
  const factor = u.overclocked && has(u, 'overclockable') ? B.OVERCLOCK_UPKEEP : 1
  for (const f of u.upkeep) {
    runner.needs.set(f.resourceId, (runner.needs.get(f.resourceId) ?? 0) + f.amount * factor)
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
        builds: null,
        strategy,
        f: 1,
        o: 1,
        limitedBy: null,
        picky: has(u, 'picky')
      }
      const rate = strategyRate(state, strategy)
      for (const f of rate.inputs) {
        runner.needs.set(f.resourceId, (runner.needs.get(f.resourceId) ?? 0) + f.amount)
      }
      if (strategy.quirk === 'picky') runner.picky = true
      if (strategy.kind === 'make') {
        const out = findResource(state, strategy.outputId)
        const warm =
          strategy.quirk === 'slow-to-start' ? Math.min(1, ((strategy.weeksRun ?? 0) + 1) / B.SLOW_WEEKS) : 1
        runner.makes.set(strategy.outputId, rate.amount * factor * warm)
        const by = u.byproduct ? findResource(state, u.byproduct) : undefined
        if (by && out && by.id !== out.id) {
          const value = rate.amount * factor * out.value * B.BY_PRODUCT_SHARE
          runner.makes.set(by.id, (runner.makes.get(by.id) ?? 0) + value / by.value)
        }
      } else if (strategy.kind === 'crew') {
        runner.makes.set(crewId(strategy.outputId), rate.amount)
      } else {
        const target = findUnit(state, strategy.outputId)
        if (!target) continue
        const goal = strategy.target ?? 0
        const needed = Math.max(0, goal - owned(target) - (strategy.carry ?? 0))
        const perMachine = rate.amount * factor
        const useful = perMachine > 0 ? Math.ceil(needed / perMachine - 1e-9) : 0
        const used = Math.min(machines, useful)
        week.done += machines - used
        if (used <= 0) continue
        runner.machines = used
        runner.builds = { unitId: target.id, perMachine, cap: needed }
        // Builders that only need to build part of a batch use a matching share of parts.
        const share = Math.min(1, needed / (used * perMachine))
        for (const [id, amount] of runner.needs) runner.needs.set(id, amount * share)
        runner.builds.perMachine *= share
      }
      upkeepNeeds(u, runner)
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

/**
 * Simulates one week and mutates `state` to the start of the next. Deterministic: the same
 * state always gives the same week. The preview runs it on a copy.
 */
export function simulateWeek(state: GameState): WeekReport {
  const report: WeekReport = {
    flows: {},
    shares: {},
    runs: {},
    units: {},
    wasted: {}
  }
  // Growing incomes count what was owned at the start of the week.
  const yields = state.incomes.map((income) => incomeYield(state, income))
  const runners = buildRunners(state, report)
  const isFlow = (id: string) => isCrew(id) || findResource(state, id)?.kind === 'flow'

  // Shares of each resource. Users of a scarce resource all get the same share; iterate
  // because flows made this week depend on who could run.
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
      let supply = 0
      if (isFlow(id)) {
        supply = isCrew(id) ? 0 : (findResource(state, id)?.stored ?? 0)
        for (const r of runners) supply += (r.makes.get(id) ?? 0) * r.machines * r.o
      } else {
        supply = findResource(state, id)?.amount ?? 0
      }
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
  const flowPool = new Map<string, number>()
  const stockIn = new Map<string, number>()
  const note = (id: string, label: string, amount: number) => {
    if (isCrew(id) || Math.abs(amount) < 1e-12) return
    const list = (report.flows[id] ??= [])
    const row = list.find((x) => x.label === label)
    if (row) row.amount += amount
    else list.push({ label, amount })
  }
  for (const res of state.resources) {
    if (res.kind === 'flow' && res.stored > 0) {
      flowPool.set(res.id, res.stored)
      note(res.id, 'Stored last week', res.stored)
    }
  }
  const built = new Map<string, number>()
  for (const r of runners) {
    const settled = settle(r, shares)
    for (const id of r.needs.keys()) {
      const used = useOf(r, id, settled) * r.machines
      const label = r.upkeep.has(id) ? `${r.unit.name} upkeep` : r.label
      if (isFlow(id)) flowPool.set(id, (flowPool.get(id) ?? 0) - used)
      else {
        const res = findResource(state, id)
        if (res) res.amount = Math.max(0, res.amount - used)
      }
      note(id, label, -used)
    }
    for (const [id, per] of r.makes) {
      const made = per * r.machines * r.o
      if (isFlow(id)) flowPool.set(id, (flowPool.get(id) ?? 0) + made)
      else stockIn.set(id, (stockIn.get(id) ?? 0) + made)
      note(id, r.label, made)
    }
    if (r.builds) {
      const amount = Math.min(r.builds.cap, r.builds.perMachine * r.machines * r.o)
      built.set(r.builds.unitId, (built.get(r.builds.unitId) ?? 0) + amount)
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

  // Passive incomes arrive with the week's other stock.
  state.incomes.forEach((income, i) => {
    if (!findResource(state, income.resourceId)) return
    stockIn.set(income.resourceId, (stockIn.get(income.resourceId) ?? 0) + yields[i]!)
    note(income.resourceId, income.name, yields[i]!)
  })

  // ---- End of the week.

  // Leftover flows are lost, unless something Stores them.
  for (const res of state.resources) {
    if (res.kind !== 'flow') continue
    const left = Math.max(0, flowPool.get(res.id) ?? 0)
    const capacity = state.units
      .filter((u) => u.stores === res.id && has(u, 'stores'))
      .reduce((n, u) => n + (u.count * labour(u)) / Math.max(1e-9, res.value), 0)
    res.stored = Math.min(left, capacity)
    if (left - res.stored > 1e-9 && (report.flows[res.id]?.length ?? 0) > 0) {
      report.wasted[res.id] = left - res.stored
    }
  }
  for (const [id, amount] of stockIn) {
    const res = findResource(state, id)
    if (res) res.amount += amount
  }

  // A thirsty platform burns a share of the richest stock (by worth). Running dry costs nothing.
  for (const mind of state.minds) {
    const share = drainOf(mind.traits)
    if (share <= 0) continue
    const richest = state.resources
      .filter((r) => r.kind === 'stock' && r.amount > 0)
      .sort((a, b) => b.amount * b.value - a.amount * a.value)[0]
    if (!richest) continue
    const burned = richest.amount * share
    richest.amount -= burned
    note(richest.id, `${mind.name} burns it`, -burned)
  }

  // Units arrive.
  for (const u of state.units) {
    const week = report.units[u.id]!
    for (const p of u.pending) p.weeks -= 1
    const arrived = u.pending.filter((p) => p.weeks <= 0).reduce((n, p) => n + p.count, 0)
    u.pending = u.pending.filter((p) => p.weeks > 0)
    for (const r of u.ramp) r.weeks += 1
    u.ramp = u.ramp.filter((r) => r.weeks < B.SLOW_WEEKS)
    if (arrived) addUnits(u, arrived, false)

    const raw = built.get(u.id) ?? 0
    if (raw > 0) {
      const builders = state.strategies.filter((s) => s.kind === 'build' && s.outputId === u.id)
      const carrier = builders[0]
      const total = raw + (carrier?.carry ?? 0)
      const whole = Math.floor(total + 1e-9)
      if (carrier) carrier.carry = total - whole
      if (whole > 0) {
        addUnits(u, whole, true)
        u.built += whole
        week.built = whole
      }
    }

    // Traits that act at the end of the week.
    if (has(u, 'wears-out') && u.count > 0) {
      const lost = Math.round(u.count * B.WEAR)
      u.count -= lost
      week.lost += lost
    }
    if (has(u, 'fragile') && week.unpaid > 0 && u.count > 0) {
      const lost = Math.min(u.count, Math.ceil(B.FRAGILE * week.unpaid))
      u.count -= lost
      week.lost += lost
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
