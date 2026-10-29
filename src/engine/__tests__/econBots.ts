import type { JevAnswer, Questions } from '@/ai/jev'
import * as B from '../balance'
import { assign, assignAll, createUnits, doResearch, researchBlocker } from '../actions'
import {
  addStreams,
  delay,
  fillStream,
  grossIncome,
  HORIZON,
  iqWorth,
  runningNet,
  valueAt,
  valueChange,
  worthOf,
  type ActionKind,
  type ActionValue
} from '../actionValue'
import { applyBlocker, applyVerdict } from '../banking'
import { judgeCover } from '../coverProposal'
import { acceptCreate, isContract, judgeCreate, optionBlocker } from '../createProposal'
import { runWeek } from '../cycle'
import { previewWeek } from '../economy'
import { acceptMind, judgeMind } from '../mindProposal'
import {
  bestIQ,
  capOf,
  contractsFor,
  creatable,
  depotsFor,
  findResource,
  findUnit,
  fmt,
  industryScalar,
  iqScalar,
  MONEY_ID,
  openSlots,
  tasksFor,
  tierFactor,
  weeklyUse
} from '../model'
import { coversLeft } from '../phase'
import { goalOf } from '../projection'
import { acceptStrategy, judgeStrategy } from '../strategyProposal'
import type { GameState, Research, Resource } from '../types'
import { acceptUnit, judgeUnit, runPool } from '../unitProposal'
import { acceptUpgrade, judgeUpgrade } from '../upgrade'
import { acceptDepot, judgeDepot } from '../depotProposal'
import { depotAnswers, flat, NANOTECH, phase1, play } from './bots'
import { acceptPlan, judgePlan } from '../planProposal'
import { choice, FakeJudge, noul, score, type Overrides } from './fakeJudge'

// The balance roster: simple scripted players for Phase 2, played through the real engine with
// Jev's typical answers. Each week a bot takes at most one action (a "move"); growing what its
// contracts allow, assigning units and doing research it can afford take none. See the plan in
// ECONOMY_DESIGN.md, "Balance bots".

// ---------------------------------------------------------------- Jev, held fixed

/**
 * Jev's typical answer to everything the bots propose. Efficiency is Reasonable the first three
 * times a bot does a given action and Wasteful after (`judge`), standing in for repeats.
 */
const TYPICAL: Overrides = {
  plausible: noul(0.7),
  feasible: noul(0.7),
  value: score(2),
  alarm: score(1),
  'a_*': score(1),
  reach: score(2),
  techLevel: score(0),
  advancement: score(0),
  input_size: score(1),
  upkeep_0: score(1),
  mode: choice('supply')
}

/** Uses of an action that Jev still rates Reasonable. */
const FRESH_USES = 3
/**
 * Jev's sourcing limit the bots assume: Industrial scale, $400M. Playtest 1's four contracts
 * scored 1.9, 3.8, 3.6 and 3.2; what the bot owns usually caps it well below that.
 */
export const CONTRACT_LIMIT = 4

export type Category = 'procure' | 'units' | 'design' | 'strategy' | 'upgrade' | 'iq' | 'storage' | 'cover' | 'goal'
export const CATEGORIES: Category[] = ['procure', 'units', 'design', 'strategy', 'upgrade', 'iq', 'storage', 'cover', 'goal']

export interface Ctx {
  /** Times each action key has been taken. */
  uses: Map<string, number>
  /** Worth spent so far, by what it went on. */
  spend: Record<Category, number>
  /** Steps a play has queued for the coming weeks, and how long the first has waited. */
  queue: Move[]
  waited: number
  /** This week's action, for the record. */
  action: ActionKind
  label: string
  /** Rate every action Wasteful, as if used up: for the checkpoint values. */
  stale?: boolean
  names: number
}

export const newCtx = (): Ctx => ({
  uses: new Map(),
  spend: Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>,
  queue: [],
  waited: 0,
  action: 'none',
  label: '',
  names: 0
})

/** A fake Jev for one action: typical answers, efficiency by how often the action was used. */
function judge(ctx: Ctx, key: string, answers: Overrides = {}): FakeJudge {
  const fresh = !ctx.stale && (ctx.uses.get(key) ?? 0) < FRESH_USES
  return new FakeJudge({ ...TYPICAL, efficiency: score(fresh ? 2 : 0), ...answers })
}

const used = (ctx: Ctx, key: string) => ctx.uses.set(key, (ctx.uses.get(key) ?? 0) + 1)
const fresh = (ctx: Ctx, base: string) => `${base} ${++ctx.names}`

// ---------------------------------------------------------------- moves

/** One or more moves over the coming weeks. Structural plays build the ladder, IQ and supply; the rest grow. */
export type Play = Move[] & { structural?: boolean }

/** One week's action. `run` returns the new state, or null when it can't be done now. */
export interface Move {
  kind: ActionKind
  key: string
  label: string
  run: (s: GameState, ctx: Ctx) => Promise<GameState | null>
}

const attempt = async (f: () => Promise<GameState | null>): Promise<GameState | null> => {
  try {
    return await f()
  } catch {
    return null
  }
}

/** Procure a resource, paid out `timing` (or the first offer that's affordable). */
export const procure = (resourceId: string, timing: B.CreateTiming = 'now'): Move => ({
  kind: 'procure',
  key: `procure:${resourceId}`,
  label: `Procure ${resourceId} (${timing})`,
  run: (s, ctx) =>
    attempt(async () => {
      const key = `procure:${resourceId}`
      const v = await judgeCreate(s, judge(ctx, key, { timing: choice(timing) }), {
        target: { kind: 'resource', id: resourceId },
        name: fresh(ctx, 'Procure'),
        description: ''
      })
      if (v.rejected) return null
      // Never pay with what waiting research is saving up.
      const saving = reserved(s)
      const ok = v.options
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => !optionBlocker(s, o) && !('inputs' in o && o.inputs.some((f) => saving[f.resourceId])))
      const pick = ok.find(({ o }) => o.timing === timing) ?? ok[0]
      if (!pick) return null
      v.choice = pick.i
      const o = v.options[pick.i]!
      if (!isContract(o)) ctx.spend.procure += o.inputWorth
      const after = acceptCreate(s, v).state
      used(ctx, key)
      return after
    })
})

/** A sourcing contract for a unit: Jev's own take, a band bigger with each contract for it. */
export const contract = (unitId: string): Move => ({
  kind: 'contract',
  key: `contract:${unitId}`,
  label: `Contract ${unitId}`,
  run: (s, ctx) =>
    attempt(async () => {
      const key = `contract:${unitId}`
      // The biggest size on offer: Jev's limit, or ten times what the bot owns.
      const v = await judgeCreate(s, judge(ctx, key, { limit: score(CONTRACT_LIMIT) }), {
        target: { kind: 'unit', id: unitId },
        name: fresh(ctx, 'Contract'),
        description: ''
      })
      if (v.rejected) return null
      const i = v.options.findIndex((o) => isContract(o) && !o.risky && o.total > 0)
      if (i < 0) return null
      v.choice = i
      const after = acceptCreate(s, v).state
      used(ctx, key)
      return after
    })
})

/** A strategy: `unitId` makes `outputId`, with Jev's first way of doing it. */
export const strategy = (unitId: string, outputId: string): Move => ({
  kind: 'strategy',
  key: `strategy:${unitId}:${outputId}`,
  label: `${unitId} makes ${outputId}`,
  run: (s, ctx) =>
    attempt(async () => {
      const key = `strategy:${unitId}:${outputId}`
      const v = await judgeStrategy(s, judge(ctx, key), { name: fresh(ctx, `Make ${outputId}`), description: '', unitId, outputId })
      if (v.rejected) return null
      const after = acceptStrategy(s, v).state
      used(ctx, key)
      return after
    })
})

/** Designs a unit of a tier, worth "like a car", running on a resource one tier down. */
export const design = (tier: number): Move => ({
  kind: 'design',
  key: `design:${tier}`,
  label: `Design a tier ${tier} unit`,
  run: (s, ctx) =>
    attempt(async () => {
      const runs = runPool(s, tier)
      if (tier > 0 && !runs.length) return null
      // What it runs on: something already made if there is one.
      const made = new Set(s.strategies.map((x) => x.outputId))
      const upkeep = runs.find((r) => made.has(r.id)) ?? runs[0]
      const answers: Overrides = { tier: score(tier), ...(upkeep ? { [`runs_t${tier}`]: choice(upkeep.id) } : {}) }
      const v = await judgeUnit(s, judge(ctx, `design:${tier}`, answers), { name: fresh(ctx, `Tier ${tier} Works`), description: '' })
      if (v.rejected || v.duplicateOf || v.options[0]?.tier !== tier) return null
      v.choice = 0
      const after = acceptUnit(s, v).state
      used(ctx, `design:${tier}`)
      return after
    })
})

/** A unit's output upgrade on its busiest strategy: ×1.5 on what it makes. */
export const upgradeUnit = (unitId: string): Move => ({
  kind: 'upgrade',
  key: `upgrade:${unitId}`,
  label: `Upgrade ${unitId}`,
  run: (s, ctx) =>
    attempt(async () => {
      const u = findUnit(s, unitId)
      const main = u?.rest ? s.strategies.find((x) => x.id === u.rest) : undefined
      if (!u || !main) return null
      const best = (questions: Questions): JevAnswer => {
        const criteria = (questions as unknown as { best: { criteria: Record<string, string> } }).best.criteria
        const key = Object.entries(criteria).find(([, text]) => text.startsWith(`Better ${main.name}`))?.[0] ?? 'c0'
        return { type: 'choice', choice: key, probabilities: { [key]: 0.9 } }
      }
      const offer = await judgeUpgrade(s, judge(ctx, `upgrade:${unitId}`, { best }), { kind: 'unit', id: unitId })
      const i = offer.options.findIndex((o) => o.changes.some((c) => c.kind === 'output'))
      if (i < 0) return null
      const after = acceptUpgrade(s, offer, i).state
      used(ctx, `upgrade:${unitId}`)
      return after
    })
})

/** The newest unit of a tier, once its design is done. */
const unitOfTierNow = (s: GameState, tier: number) => workers(s).reverse().find((u) => u.tier === tier)

/** Work for the newest unit of a tier: its best output. Waits until the design is done. */
export const workTier = (tier: number): Move => ({
  kind: 'strategy',
  key: `work:${tier}`,
  label: `Tier ${tier} unit gets work`,
  run: async (s, ctx) => {
    const u = unitOfTierNow(s, tier)
    const makes = u && !tasksFor(s, u).length ? bestOutput(s, u.id) : null
    return u && makes ? strategy(u.id, makes).run(s, ctx) : null
  }
})

/** A contract for the newest unit of a tier. Waits until the design is done. */
export const contractTier = (tier: number): Move => ({
  kind: 'contract',
  key: `contract-tier:${tier}`,
  label: `Contract tier ${tier} units`,
  run: async (s, ctx) => {
    const u = unitOfTierNow(s, tier)
    return u ? contract(u.id).run(s, ctx) : null
  }
})

/** Compute traits are out of scope: the bots' platforms and software come without them. */
function stripTraits(s: GameState): GameState {
  for (const r of s.research) {
    if (r.effect.kind === 'mind') r.effect.mind.traits = []
    if (r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind') r.effect.changes = r.effect.changes.filter((c) => c.kind === 'software')
  }
  return s
}

/** The IQ step the bots take: the option nearest +50, the smaller on a tie, never +0. */
export const IQ_STEP = 50
const nearestStep = (steps: number[]) =>
  steps.reduce((best, step, i) => {
    if (step <= 0) return best
    const b = steps[best]!
    const closer = Math.abs(step - IQ_STEP) < Math.abs(b - IQ_STEP) || (Math.abs(step - IQ_STEP) === Math.abs(b - IQ_STEP) && step < b)
    return b <= 0 || closer ? i : best
  }, 0)

/** The platform's software upgrade, at the size nearest +50. */
export const software = (): Move => ({
  kind: 'software',
  key: 'software',
  label: 'Software upgrade',
  run: (s, ctx) =>
    attempt(async () => {
      const mind = s.minds[0]!
      if (mind.software.upgraded || s.research.some((r) => r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind')) return null
      const offer = await judgeUpgrade(s, judge(ctx, 'software', { 'd_*': score(1) }), { kind: 'mind', id: mind.id })
      const after = stripTraits(acceptUpgrade(s, offer, nearestStep(offer.options.map((o) => o.step ?? 0))).state)
      used(ctx, 'software')
      return after
    })
})

/** A new platform, at the step nearest +50. */
export const platform = (): Move => ({
  kind: 'platform',
  key: 'platform',
  label: 'New platform',
  run: (s, ctx) =>
    attempt(async () => {
      if (s.research.some((r) => r.effect.kind === 'mind')) return null
      const v = await judgeMind(s, judge(ctx, 'platform'), { name: fresh(ctx, 'Platform'), description: '' })
      if (v.rejected || !v.options.length) return null
      v.choice = nearestStep(v.options.map((o) => o.step))
      const after = stripTraits(acceptMind(s, v).state)
      used(ctx, 'platform')
      return after
    })
})

/** A depot for a resource, designed or waiting: building more of it takes no action. */
const hasDepot = (s: GameState, resourceId: string) =>
  depotsFor(s, resourceId).length > 0 || s.research.some((x) => x.effect.kind === 'depot' && x.effect.unit.holds?.resourceId === resourceId)

/**
 * Storage for a resource: designs a depot for it, Jev's own take, when it has none. Once it has
 * one, grow() builds as many as it needs, at no action. `need` is kept for the label.
 */
export const storage = (resourceId: string, need = 0): Move => ({
  kind: 'storage',
  key: `storage:${resourceId}`,
  label: `Depot for ${resourceId}${need ? ` (${fmt(need)})` : ''}`,
  run: (s, ctx) =>
    attempt(async () => {
      const r = findResource(s, resourceId)
      if (!r || hasDepot(s, resourceId)) return null
      const v = await judgeDepot(s, judge(ctx, `storage:${resourceId}`, depotAnswers(s)), { resourceId, name: fresh(ctx, 'Warehouse'), description: '' })
      if (v.rejected || !v.options.length) return null
      v.choice = 0
      const after = acceptDepot(s, v).state
      used(ctx, `storage:${resourceId}`)
      return after
    })
})

/** The biggest cover that can be done now. */
export const cover = (): Move => ({
  kind: 'cover',
  key: 'cover',
  label: 'Cover',
  run: (s, ctx) =>
    attempt(async () => {
      if (coversLeft(s) <= 0) return null
      const v = await judgeCover(s, judge(ctx, 'cover'), { name: fresh(ctx, 'Cover story'), description: '' })
      if (v.rejected) return null
      const ok = v.options.map((o, i) => ({ o, i })).filter(({ i }) => !applyBlocker(s, v, i))
      const pick = ok.sort((a, b) => b.o.weeks - a.o.weeks)[0]
      if (!pick) return null
      const before = worthOf(s).net
      const after = applyVerdict(s, v, pick.i).state
      ctx.spend.cover += Math.max(0, before - worthOf(after).net)
      used(ctx, 'cover')
      return after
    })
})

// ---------------------------------------------------------------- what takes no action

const SPEND_OF: Record<Research['effect']['kind'], Category> = {
  unit: 'design',
  mind: 'iq',
  strategy: 'strategy',
  upgrade: 'upgrade',
  depot: 'storage',
  goal: 'goal',
  cover: 'cover'
}

/** Does every research it can afford, the goal first, counting what it costs. */
export function research(state: GameState, ctx: Ctx): GameState {
  let s = state
  const order = () => [...s.research].sort((a, b) => Number(b.effect.kind === 'goal') - Number(a.effect.kind === 'goal'))
  for (let pass = 0; pass < 2; pass++) {
    const saving = savingFor(s)
    for (const r of order()) {
      if (s.phase.n !== state.phase.n || researchBlocker(s, r.id)) continue
      // Nothing small spends what a platform or a design is half saved up for, except a depot,
      // which is what lets a big cost fit.
      const small = !KEY_RESEARCH.has(r.effect.kind) && r.effect.kind !== 'goal' && r.effect.kind !== 'depot'
      if (small && r.cost.some((c) => saving.has(c.resourceId))) continue
      const before = worthOf(s).stock
      s = doResearch(s, r.id)
      const kind = r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind' ? 'iq' : SPEND_OF[r.effect.kind]
      ctx.spend[kind] += Math.max(0, before - worthOf(s).stock)
    }
  }
  return s
}

/** Research that moves the game on: platforms, software and designs. Other research waits for it. */
const KEY_RESEARCH = new Set<Research['effect']['kind']>(['mind', 'unit', 'upgrade'])

/** Resources a waiting key research (smart enough for it, at least half paid for) is saving up. */
function savingFor(s: GameState): Set<string> {
  const out = new Set<string>()
  for (const r of s.research) {
    if (!KEY_RESEARCH.has(r.effect.kind) || (r.effect.kind === 'upgrade' && r.effect.target.kind !== 'mind') || bestIQ(s) < r.minIQ) continue
    const have = r.cost.reduce((n, c) => n + Math.min(c.amount, findResource(s, c.resourceId)?.amount ?? 0), 0)
    const need = r.cost.reduce((n, c) => n + c.amount, 0)
    if (need > 0 && have >= need / 2) for (const c of r.cost) out.add(c.resourceId)
  }
  return out
}

/** The goal research, while it's waiting. */
const goal = (s: GameState) => goalOf(s)
/** The resource the goal uses up. */
export const goalResource = (s: GameState) => goal(s)?.cost[0]?.resourceId ?? null

/** Worth a strategy makes per unit, less its inputs. The goal's resource counts thrice: it's what the phase is for. */
function strategyWorth(s: GameState, id: string, want: Record<string, number> = demand(s)): number {
  const x = s.strategies.find((y) => y.id === id)
  const out = x && findResource(s, x.outputId)
  if (!x || !out) return 0
  const inputs = x.inputs.reduce((n, f) => n + f.amount * (findResource(s, f.resourceId)?.value ?? 0), 0)
  // What's wanted and short counts double; what piles up with no use, a quarter.
  const need = want[out.id] ?? 0
  const use = out.amount < need ? 2 : need === 0 && out.amount > capOf(s, out) * 0.5 ? 0.25 : 1
  return x.amount * out.value * (out.id === goalResource(s) ? 3 : 1) * use - inputs
}

/**
 * How much of each resource the economy wants on hand: four weeks of what running uses, the parts
 * for the next five units of each open contract, and what waiting research costs. With `soon`,
 * only research worth eight weeks' income or less: what's worth working towards now.
 */
export function demand(s: GameState, soon = false): Record<string, number> {
  const want: Record<string, number> = {}
  const add = (id: string, n: number) => (want[id] = (want[id] ?? 0) + n)
  for (const [id, n] of Object.entries(weeklyUse(previewWeek(s)))) add(id, 4 * n)
  for (const c of s.sourcing) {
    const u = findUnit(s, c.unitId)
    const n = Math.min(openSlots(c), 5)
    if (!n) continue
    for (const p of c.parts) add(p.resourceId, p.amount * n)
    for (const f of u?.upkeep ?? []) add(f.resourceId, f.amount * n * 4)
  }
  const income = grossIncome(s)
  for (const r of s.research) {
    if (bestIQ(s) < r.minIQ) continue
    const worth = r.cost.reduce((n, c) => n + c.amount * (findResource(s, c.resourceId)?.value ?? 0), 0)
    if (soon && worth > 8 * income) continue
    for (const c of r.cost) add(c.resourceId, c.amount)
  }
  return want
}

/**
 * Puts every unit on its most valuable strategy, then moves enough onto strategies that make
 * whatever is running short, so nothing starves.
 */
export function assignBest(state: GameState): GameState {
  let s = state
  for (const u of s.units) {
    const tasks = tasksFor(s, u)
    if (!tasks.length || !u.count) continue
    const want = demand(s)
    const best = [...tasks].sort((a, b) => strategyWorth(s, b, want) - strategyWorth(s, a, want))[0]!
    s = assignAll(s, u.id, best)
  }
  for (let pass = 0; pass < 3; pass++) {
    const report = previewWeek(s)
    let moved = false
    for (const [resourceId, share] of Object.entries(report.shares)) {
      if (share >= 0.999) continue
      const demand = -(report.flows[resourceId] ?? []).reduce((n, f) => n + Math.min(0, f.amount), 0)
      const short = demand * (1 - share)
      const maker = s.strategies.find((x) => x.kind === 'make' && x.outputId === resourceId && findUnit(s, x.unitId)?.count)
      if (!maker || maker.amount <= 0) continue
      const u = findUnit(s, maker.unitId)!
      const now = u.rest === maker.id ? u.count : (u.assign[maker.id] ?? 0)
      if (u.rest === maker.id) continue
      const want = Math.min(u.count - 1, now + Math.ceil(short / maker.amount))
      if (want > now) {
        s = assign(s, u.id, maker.id, want)
        moved = true
      }
    }
    if (!moved) break
  }
  // What research due soon and contracts want that nothing is making fast enough: enough units
  // to fill the gap in about three weeks, never more than half of a type.
  const want = demand(s, true)
  const report = previewWeek(s)
  for (const [resourceId, need] of Object.entries(want)) {
    const r = findResource(s, resourceId)
    if (!r || r.amount >= need) continue
    const made = (report.flows[resourceId] ?? []).reduce((n, f) => n + Math.max(0, f.amount), 0)
    const gap = (need - r.amount) / 3 - made
    if (gap <= 0) continue
    const maker = s.strategies.find((x) => x.kind === 'make' && x.outputId === resourceId && (findUnit(s, x.unitId)?.count ?? 0) > 1)
    if (!maker || maker.amount <= 0) continue
    const u = findUnit(s, maker.unitId)!
    if (u.rest === maker.id) continue
    const now = u.assign[maker.id] ?? 0
    const n = Math.min(Math.floor(u.count / 2), now + Math.ceil(gap / maker.amount))
    if (n > now) s = assign(s, u.id, maker.id, n)
  }
  return s
}

/**
 * What waiting research will use up, per resource, kept back from new units: only research
 * worth two weeks' income or less, so saving for something far off never stops the growth that
 * would pay for it.
 */
function reserved(s: GameState): Record<string, number> {
  const out: Record<string, number> = {}
  const reach = 2 * Math.max(0, grossIncome(s))
  for (const r of s.research) {
    if (bestIQ(s) < r.minIQ) continue
    const worth = r.cost.reduce((n, c) => n + c.amount * (findResource(s, c.resourceId)?.value ?? 0), 0)
    if (worth > reach) continue
    // Keeping back for a cost that can't fit in storage yet only stops the growth.
    if (r.cost.some((c) => { const x = findResource(s, c.resourceId); return !x || c.amount > capOf(s, x) })) continue
    for (const c of r.cost) out[c.resourceId] = (out[c.resourceId] ?? 0) + c.amount
  }
  return out
}

/**
 * Creates every unit the open contracts allow, highest tier first, keeping back a week's running
 * and what waiting research needs; then assigns them.
 */
/** What the bots keep back: a week's running and the research due soon. */
function reserveOf(s: GameState): Record<string, number> {
  const keep = reserved(s)
  const use = weeklyUse(previewWeek(s))
  const reserve: Record<string, number> = {}
  for (const id of new Set([...Object.keys(keep), ...Object.keys(use)])) reserve[id] = (keep[id] ?? 0) + (use[id] ?? 0)
  return reserve
}

export function grow(state: GameState, ctx: Ctx): GameState {
  let s = state
  const reserve = reserveOf(s)
  const byTier = workers(s).sort((a, b) => b.tier - a.tier)
  for (const u of byTier) {
    for (const c of contractsFor(s, u.id)) {
      if (!c.parts.length || !openSlots(c)) continue
      const n = creatable(s, c, reserve)
      if (n <= 0) continue
      const before = worthOf(s).stock
      s = createUnits(s, c.id, n)
      ctx.spend.units += Math.max(0, before - worthOf(s).stock)
    }
  }
  // Depots: only as many as it takes to hold what's coming, paid from what would overflow this
  // week plus a share of the rest, so building them never starves what runs.
  const keep = reserved(s)
  const wasted = previewWeek(s).wasted
  const budget: Record<string, number> = {}
  for (const r of s.resources) {
    const spare = Math.max(0, r.amount - (keep[r.id] ?? 0))
    budget[r.id] = Math.min(spare, (wasted[r.id] ?? 0) + DEPOT_SHARE * spare)
  }
  // The worst overflow first.
  const lost = (u: (typeof s.units)[number]) => (wasted[u.holds!.resourceId] ?? 0) * (findResource(s, u.holds!.resourceId)?.value ?? 0)
  for (const u of s.units.filter((x) => x.holds).sort((a, b) => lost(b) - lost(a))) {
    const r = findResource(s, u.holds!.resourceId)
    const c = contractsFor(s, u.id)[0]
    if (!r || !c || !openSlots(c)) continue
    const want = Math.ceil((depotNeed(s, r) - capOf(s, r)) / u.holds!.amount - 1e-9)
    const held = Object.fromEntries(s.resources.map((x) => [x.id, x.amount - (budget[x.id] ?? 0)]))
    const n = Math.min(want, creatable(s, c, held))
    for (const p of c.parts) budget[p.resourceId] = Math.max(0, (budget[p.resourceId] ?? 0) - Math.max(0, n) * p.amount)
    if (n <= 0) continue
    const before = worthOf(s).stock
    s = createUnits(s, c.id, n)
    ctx.spend.storage += Math.max(0, before - worthOf(s).stock)
  }
  return assignBest(s)
}

/** Share of a stock, past what would overflow and what research needs, that may go on depots in a week. */
const DEPOT_SHARE = 0.25

/** Units that work: everything but depots. */
const workers = (s: GameState) => s.units.filter((u) => !u.holds)

/** What a resource's depots should hold: its dearest waiting cost, or what it has plus four weeks of what's made. */
function depotNeed(s: GameState, r: Resource): number {
  const costs = s.research.flatMap((x) => x.cost).filter((c) => c.resourceId === r.id).map((c) => c.amount)
  const made = (previewWeek(s).flows[r.id] ?? []).reduce((n, f) => n + Math.max(0, f.amount), 0)
  return Math.max(0, ...costs, r.amount + B.DEPOT_TARGET_WEEKS * made)
}

// ---------------------------------------------------------------- what the bots consider

const highestTier = (s: GameState) => Math.max(-1, ...workers(s).map((u) => u.tier))

/** The most valuable resource a unit could make without a tier penalty: its own tier or below; the goal's if it can. */
function bestOutput(s: GameState, unitId: string): string | null {
  const u = findUnit(s, unitId)
  if (!u) return null
  const g = goalResource(s)
  const gr = g ? findResource(s, g) : undefined
  if (gr && gr.tier <= u.tier) return gr.id
  // Otherwise what the economy wants and is short of, counting the tier bonus for making
  // something below the unit's own tier; what piles up with no use counts least.
  const want = demand(s)
  const score = (r: Resource) => {
    const need = want[r.id] ?? 0
    const use = r.amount < need ? 2 : need === 0 && r.amount > capOf(s, r) * 0.5 ? 0.25 : 1
    return tierFactor(u.tier, r.tier) * use
  }
  const fits = s.resources.filter((r) => r.tier <= u.tier && !u.upkeep.some((f) => f.resourceId === r.id))
  return [...fits].sort((a, b) => score(b) - score(a) || b.tier - a.tier)[0]?.id ?? MONEY_ID
}

/** Resources that something uses (inputs or upkeep) but nothing makes and nothing delivers. */
function unsupplied(s: GameState): string[] {
  // Made only if some unit is actually there to make it, or a strategy for it is waiting as research.
  const made = new Set([
    ...s.strategies.filter((x) => x.kind === 'make' && findUnit(s, x.unitId)?.count).map((x) => x.outputId),
    ...s.research.flatMap((r) => (r.effect.kind === 'strategy' ? [r.effect.strategy.outputId] : [])),
    ...s.deliveries.flatMap((d) => (d.target.kind === 'resource' ? [d.target.id] : []))
  ])
  const needed = new Set<string>()
  // Upkeep of units owned or about to be: a contract with room can't fill without it.
  const coming = (unitId: string) => (findUnit(s, unitId)?.count ?? 0) > 0 || contractsFor(s, unitId).some((c) => openSlots(c) > 0)
  for (const u of s.units) if (coming(u.id)) for (const f of u.upkeep) needed.add(f.resourceId)
  // Parts of contracts with room left: units can't be made without them. Depots are built only as needed.
  for (const c of s.sourcing) if (openSlots(c) && !findUnit(s, c.unitId)?.holds) for (const p of c.parts) needed.add(p.resourceId)
  for (const x of s.strategies) {
    const u = findUnit(s, x.unitId)
    if (u && coming(u.id) && tasksFor(s, u).includes(x.id)) for (const f of x.inputs) needed.add(f.resourceId)
  }
  return [...needed].filter((id) => !made.has(id))
}

/** Resources that open contracts' parts, upkeep or running strategies use up. */
function inUse(s: GameState): string[] {
  const ids = new Set<string>()
  for (const c of s.sourcing) if (openSlots(c) && !findUnit(s, c.unitId)?.holds) for (const p of c.parts) ids.add(p.resourceId)
  for (const u of s.units) if (u.count) for (const f of u.upkeep) ids.add(f.resourceId)
  for (const x of s.strategies) if (findUnit(s, x.unitId)?.count) for (const f of x.inputs) ids.add(f.resourceId)
  return [...ids]
}

/** The unit best placed to make a resource: the lowest tier that's at least the resource's, else the highest. */
function makerFor(s: GameState, resourceId: string): string | null {
  const r = findResource(s, resourceId)
  if (!r) return null
  const can = workers(s).filter((u) => u.count > 0 && !u.upkeep.some((f) => f.resourceId === resourceId))
  const fit = can.filter((u) => u.tier >= r.tier).sort((a, b) => a.tier - b.tier)[0]
  return (fit ?? [...can].sort((a, b) => b.tier - a.tier)[0])?.id ?? null
}

/** Share of its cap a stock must reach before more room for it is worth an action. */
const NEAR_CAP = 0.75

/**
 * A cost of waiting research bigger than its resource can hold, with no storage waiting for it.
 * The goal's counts once something makes its resource, or the goal's IQ is a step away. Any other
 * counts once it's within reach (at most four times what fits now, or eight weeks' income):
 * before that, growing the fleet (which storage reach grows with) does more.
 */
function tooBig(s: GameState): { resourceId: string; amount: number } | null {
  for (const r of s.research) {
    if (r.effect.kind === 'goal') {
      const id = r.cost[0]?.resourceId
      const making = s.strategies.some((x) => x.kind === 'make' && x.outputId === id && findUnit(s, x.unitId)?.count)
      if (!making && bestIQ(s) + B.MAX_IQ_STEP < r.minIQ) continue
    }
    for (const c of r.cost) {
      const res = findResource(s, c.resourceId)
      if (!res || capOf(s, res) >= c.amount || hasDepot(s, c.resourceId)) continue
      if (r.effect.kind !== 'goal' && res.amount < NEAR_CAP * capOf(s, res)) continue
      if (r.effect.kind === 'goal' || c.amount <= 4 * capOf(s, res) || c.amount * res.value <= 8 * grossIncome(s)) return c
    }
  }
  return null
}

/** A resource a waiting research or open contract is short of, for a Procurement: the nearest to done first. */
function shortOf(s: GameState): string | null {
  const gaps = s.research
    .filter((r) => r.effect.kind !== 'goal' && bestIQ(s) >= r.minIQ)
    .flatMap((r) => r.cost.map((c) => ({ id: c.resourceId, worth: (c.amount - (findResource(s, c.resourceId)?.amount ?? 0)) * (findResource(s, c.resourceId)?.value ?? 0) })))
    .filter((g) => g.worth > 0)
    .sort((a, b) => a.worth - b.worth)
  if (gaps[0]) return gaps[0].id
  for (const c of s.sourcing) {
    if (!openSlots(c) || !c.parts.length) continue
    const short = c.parts.find((p) => (findResource(s, p.resourceId)?.amount ?? 0) < p.amount * 3)
    if (short) return short.resourceId
  }
  return null
}

/** Worth a waiting research (not the goal) still needs of a resource. */
function shortWorth(s: GameState, resourceId: string): number {
  const r = findResource(s, resourceId)
  if (!r) return 0
  const need = s.research.filter((x) => x.effect.kind !== 'goal').flatMap((x) => x.cost).filter((c) => c.resourceId === resourceId)
  return Math.max(0, ...need.map((c) => (c.amount - r.amount) * r.value))
}

const waitingKind = (s: GameState, kind: Research['effect']['kind']) => s.research.some((r) => r.effect.kind === kind)
const waitingIQ = (s: GameState) => waitingKind(s, 'mind') || s.research.some((r) => r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind')

/** The IQ move that comes next: the software if it's still to do, otherwise a new platform. */
const iqMove = (s: GameState): Move | null => (waitingIQ(s) ? null : s.minds[0]!.software.upgraded ? platform() : software())

/** The tier a platform this smart must be paid in, if one is needed and nothing your units make reaches it. */
function platformGate(s: GameState): number | null {
  const tier = B.platformGateTier(bestIQ(s) + B.MAX_IQ_STEP)
  if (tier === null) return null
  const tierOf = (id: string) => findResource(s, id)?.tier ?? -1
  const made =
    s.strategies.some((x) => x.kind === 'make' && tierOf(x.outputId) >= tier) ||
    s.research.some((r) => r.effect.kind === 'strategy' && tierOf(r.effect.strategy.outputId) >= tier)
  return made ? null : tier
}

export interface Style {
  /** The highest tier of unit it designs. */
  maxTier: number
  /** Upgrades each fleet's output once. */
  upgrades: boolean
  /** Order of priorities: IQ first, units first, or the ladder. */
  lean: 'balanced' | 'brain' | 'scale'
  /** Never designs, sources or runs units: Procure, IQ and storage only. */
  procureOnly?: boolean
}

/** Weeks left on the clock at which the bots take cover before anything else. */
export const COVER_AT = 3

/** Weeks of slack past the expected IQ climb at which the goal's IQ becomes the priority. */
const IQ_SLACK = 30

/** The weeks a full IQ climb to the goal is likely to take: about four weeks a step. */
const weeksToGoalIQ = (s: GameState) => Math.ceil(Math.max(0, (goal(s)?.minIQ ?? 0) - bestIQ(s)) / B.MAX_IQ_STEP) * 4

/**
 * What a bot could do this week, in its order of priority. Each item is a play: one move, or
 * several over the coming weeks (a new tier: design, strategy, contract).
 */
export function candidates(s: GameState, style: Style): Play[] {
  const out: Play[] = []
  const g = goal(s)
  const top = goalResource(s)
  const weeksLeft = (s.phase.deadline ?? 0) - s.week + 1
  const needIQ = (target: number) => bestIQ(s) < target && iqMove(s)
  /** The IQ step, with the strategy the next platform's pay gate needs first, if any. */
  const iqPlay = (): (Move | null)[] => {
    const tier = s.minds[0]!.software.upgraded ? platformGate(s) : null
    if (tier === null || style.procureOnly) return [iqMove(s)]
    const target = s.resources.find((r) => r.tier === tier && s.phase.plan?.resources.includes(r.id))
    const maker = target && makerFor(s, target.id)
    return target && maker ? [strategy(maker, target.id), iqMove(s)] : [null]
  }
  // Steps that build the economy's structure (the ladder, IQ, supply) rather than grow it.
  let structural = true
  const push = (...moves: (Move | null)[]) => {
    const real = moves.filter((m): m is Move => !!m)
    if (real.length === moves.length) out.push(Object.assign(real, { structural }))
  }
  const grows = () => {
    structural = false
    growth(s, style, push)
    structural = true
  }

  // With the clock nearly out, cover comes before anything else.
  if (weeksLeft <= COVER_AT && coversLeft(s) > 0) push(cover())
  // The goal's own needs come first when time is short.
  const big = tooBig(s)
  if (big) push(storage(big.resourceId, big.amount))
  if (g && needIQ(g.minIQ) && weeksLeft <= weeksToGoalIQ(s) + IQ_SLACK) push(...iqPlay())
  if (style.lean === 'brain' && g && needIQ(g.minIQ)) push(...iqPlay())

  if (!style.procureOnly) {
    // Units sitting idle, or with nothing to do yet.
    for (const u of workers(s)) {
      const hasWork = tasksFor(s, u).length > 0 || s.research.some((r) => r.effect.kind === 'strategy' && r.effect.strategy.unitId === u.id)
      const hasRoom = contractsFor(s, u.id).some((c) => c.parts.length)
      if (!hasWork && (u.count || hasRoom || u.tier === highestTier(s))) {
        const makes = bestOutput(s, u.id)
        // A unit with no contract needs one too: work alone makes nothing.
        if (makes) {
          if (hasRoom) push(strategy(u.id, makes))
          else push(strategy(u.id, makes), contract(u.id))
        }
      }
    }
    // Whatever is used but never made.
    for (const id of unsupplied(s)) {
      const maker = makerFor(s, id)
      if (maker) push(strategy(maker, id))
      else push(procure(id))
    }
    // A platform paid in what units make, of a tier.
    const gate = platformGate(s)
    if (gate !== null && bestIQ(s) < (g?.minIQ ?? 0)) {
      const target = s.resources.find((r) => r.tier === gate && s.phase.plan?.resources.includes(r.id))
      const maker = target && makerFor(s, target.id)
      if (target && maker) push(strategy(maker, target.id))
    }
    if (style.lean === 'scale') grows()
    // The next tier.
    const next = highestTier(s) + 1
    if (next <= style.maxTier && next <= B.MAX_UNIT_TIER && !waitingKind(s, 'unit')) {
      const [, iq] = B.TIERS[next]!
      if (bestIQ(s) >= iq && (next === 0 || runPool(s, next).length)) {
        push(design(next), workTier(next), contractTier(next))
      } else if (needIQ(iq)) push(...iqPlay(), design(next), workTier(next), contractTier(next))
    }
    if (style.lean !== 'scale') grows()
  }

  // IQ toward the goal.
  if (g && needIQ(g.minIQ) && (style.lean !== 'scale' || highestTier(s) >= Math.min(style.maxTier, 3))) push(...iqPlay())
  structural = false
  // What the economy wants more of than it holds, counting only research due soon: make it, store
  // room for it, and buy it in. First, parts that open contract slots are starved of: buying them
  // in grows the fleet at once.
  if (!style.procureOnly) {
    for (const c of s.sourcing) {
      if (!openSlots(c) || !c.parts.length || creatable(s, c) > 0) continue
      const starved = c.parts.find((p) => (findResource(s, p.resourceId)?.amount ?? 0) < p.amount)
      if (starved) push(procure(starved.resourceId))
    }
    const want = demand(s, true)
    for (const [id, need] of Object.entries(want)) {
      const r = findResource(s, id)
      if (!r || r.amount >= need || id === top) continue
      const makes = (unitId: string) =>
        s.strategies.some((x) => x.unitId === unitId && x.outputId === id) ||
        s.research.some((x) => x.effect.kind === 'strategy' && x.effect.strategy.unitId === unitId && x.effect.strategy.outputId === id)
      const maker = makerFor(s, id)
      if (maker && !makes(maker)) push(strategy(maker, id))
      // The makers it has aren't enough: the biggest fleet that doesn't run on it can help.
      const helper = workers(s)
        .filter((u) => u.count > 0 && !makes(u.id) && !u.upkeep.some((f) => f.resourceId === id))
        .sort((a, b) => b.count * b.value - a.count * a.value)[0]
      if (helper && maker && makes(maker)) push(strategy(helper.id, id))
      // Room only helps once the stock is near its cap; before that, making more is what's short.
      if (capOf(s, r) < need && r.amount >= NEAR_CAP * capOf(s, r)) {
        push(storage(id, need))
        push(storage(id, need), procure(id))
      }
    }
  }
  // Storage for what overflows.
  const wanted = demand(s)
  const report = previewWeek(s)
  const income = Math.max(1, grossIncome(s, report))
  for (const [id, wasted] of Object.entries(report.wasted)) {
    const r = findResource(s, id)
    // Only what the economy wants: room for an output nothing uses is wasted too.
    if (r && wasted * r.value > income * 0.05 && (wanted[id] ?? 0) > 0) push(storage(id, capOf(s, r) * 4))
  }
  if (weeksLeft < 15) push(cover())
  // Something to Procure: what's short, the goal's resource, or Money.
  // What waiting research is short of: structure, when a Procurement or two would finish it,
  // converting a quarter of the richest other stock.
  const short = shortOf(s)
  const convert = Math.max(0, ...s.resources.filter((r) => r.id !== short).map((r) => r.amount * r.value * B.CREATE_CONVERT_SHARE * B.CREATE_INPUT_RETURN))
  structural = !!short && shortWorth(s, short) <= 2 * (B.CREATE_WORTH * industryScalar(s) * iqScalar(s) + convert)
  if (short) push(procure(short))
  structural = false
  // Procure as conversion: whatever contracts, upkeep or inputs use, bought with what piles up.
  for (const id of inUse(s)) if (id !== short) push(procure(id))
  // The goal's resource only once there's room for it: before that, it all overflows.
  const topRes = top ? findResource(s, top) : undefined
  if (topRes && capOf(s, topRes) > topRes.amount) push(procure(topRes.id))
  push(procure(MONEY_ID))
  return out
}

/** Contracts that are nearly full, and fleets worth upgrading. */
function growth(s: GameState, style: Style, push: (...m: (Move | null)[]) => void) {
  for (const u of [...s.units].sort((a, b) => b.tier - a.tier)) {
    if (!tasksFor(s, u).length) continue
    const cs = contractsFor(s, u.id).filter((c) => c.parts.length)
    if (!cs.length || cs.every((c) => openSlots(c) <= c.total * 0.2)) push(contract(u.id))
  }
  if (style.upgrades) {
    for (const u of workers(s)) {
      if (u.count >= 10 && !s.upgrades.some((x) => x.targetId === u.id) && !s.research.some((r) => r.effect.kind === 'upgrade' && r.effect.target.id === u.id)) {
        push(upgradeUnit(u.id))
      }
    }
  }
}

// ---------------------------------------------------------------- valuing a play

/**
 * What a play is worth, by doing it on a copy: every step back to back, research done and units
 * created, then valued from the state. A play of several steps takes as many weeks, so its stream
 * starts later. Contracts also count the slots that will fill in the weeks after; IQ counts what
 * it adds to Procurements.
 */
export async function valuePlay(state: GameState, ctx: Ctx, play: Move[]): Promise<{ value: ActionValue; after: GameState } | null> {
  const trial: Ctx = { ...ctx, uses: new Map(ctx.uses), spend: { ...ctx.spend }, queue: [], waited: 0 }
  // What the week does anyway, with no action: research done and units created.
  const base = grow(research(state, { ...trial, spend: { ...trial.spend } }), { ...trial, spend: { ...trial.spend } })
  let s = state
  let borrowed = 0
  for (const m of play) {
    s = { ...s, proposedThisWeek: false }
    const next = await m.run(s, trial)
    if (!next) return null
    // Research the play needs but can't pay for yet is paid from income later: lend the
    // shortfall now and start the stream once income would have covered it.
    const lent = lend(state, next)
    borrowed += lent.worth
    s = grow(research(lent.state, trial), trial)
  }
  const v = valueChange(base, s, playKind(play), play.map((m) => m.label).join(', then '))
  v.now -= borrowed
  const spare = runningNet(base)
  if (borrowed > 0 && spare <= 0) return { value: { ...v, weekly: new Array<number>(HORIZON).fill(0) }, after: s }
  const wait = borrowed > 0 ? Math.ceil(borrowed / spare) : 0
  // Open slots fill from what's spare, at what one more unit would make: counted against what
  // they'd have filled anyway.
  for (const u of workers(s)) v.weekly = addStreams(v.weekly, fillOf(s, u.id))
  for (const u of workers(base)) v.weekly = addStreams(v.weekly, fillOf(base, u.id).map((x) => -x))
  if (play.some((m) => m.kind === 'software' || m.kind === 'platform')) v.weekly = addStreams(v.weekly, iqWorth(base, s))
  v.weekly = delay(v.weekly, play.length - 1 + wait)
  return { value: v, after: s }
}

/** What a unit's open slots will add, week by week, as spare running pays for them. */
const fillOf = (s: GameState, unitId: string) => fillStream(s, unitId, Math.max(0, oneMore(s, unitId)), Math.max(0, runningNet(s)))

/**
 * Tops up what research added since `before` is short of, if the mind is smart enough and
 * storage can hold it: the worth lent, and the state with it.
 */
function lend(before: GameState, state: GameState): { state: GameState; worth: number } {
  const old = new Set(before.research.map((r) => r.id))
  let s = state
  let worth = 0
  for (const r of state.research) {
    if (old.has(r.id) || r.effect.kind === 'goal' || bestIQ(state) < r.minIQ) continue
    for (const c of r.cost) {
      const res = findResource(s, c.resourceId)
      if (!res || res.amount >= c.amount || capOf(s, res) < c.amount) continue
      if (s === state) s = structuredClone(state)
      const x = findResource(s, c.resourceId)!
      worth += (c.amount - x.amount) * x.value
      x.amount = c.amount
    }
  }
  return { state: s, worth }
}

const playKind = (play: Move[]): ActionKind => (play.some((m) => m.kind === 'design') ? 'design' : play[play.length - 1]!.kind)

/** What one more of a unit would add to a week's running, on the strategy new units join. */
function oneMore(s: GameState, unitId: string): number {
  const more = structuredClone(s)
  const u = findUnit(more, unitId)!
  u.count += 1
  return runningNet(more) - runningNet(s)
}

// ---------------------------------------------------------------- the roster

export type Policy = (s: GameState, ctx: Ctx) => Promise<GameState>

/** Records the week's action. */
function took(ctx: Ctx, m: Move) {
  ctx.action = m.kind
  ctx.label = m.label
}

/** Runs the next step a play queued, if any. */
async function queued(s: GameState, ctx: Ctx): Promise<GameState | null> {
  const m = ctx.queue[0]
  if (!m) return null
  const next = await m.run(s, ctx)
  if (next) {
    ctx.queue.shift()
    ctx.waited = 0
    took(ctx, m)
    return next
  }
  // Not ready yet (its research is still waiting): try again next week, for a while.
  if (++ctx.waited > QUEUE_PATIENCE) {
    ctx.queue.shift()
    ctx.waited = 0
  }
  return null
}

/** Weeks a queued step waits for what it needs before it's dropped. */
const QUEUE_PATIENCE = 8

/** A scripted bot: the first thing on its list it can do. */
export function scripted(style: Style): Policy {
  return async (s, ctx) => {
    const q = await queued(s, ctx)
    if (q) return q
    for (const play of candidates(s, style)) {
      const next = await play[0]!.run(s, ctx)
      if (!next) continue
      took(ctx, play[0]!)
      ctx.queue.push(...play.slice(1))
      return next
    }
    return s
  }
}

/** The values a greedy bot weighed this week, for the report: each kind's best, in weeks of income. */
export interface Weighed {
  kind: ActionKind
  value: number
}

/**
 * The reference player: values every play the climber would consider and takes the best, over
 * min(weeks left, 20). The goal's needs, when time is short, it takes as they come.
 */
export function greedy(style: Style = CLIMBER, weighed?: (w: Weighed[]) => void): Policy {
  return async (s, ctx) => {
    const q = await queued(s, ctx)
    if (q) return q
    const plays = candidates(s, style)
    const weeksLeft = (s.phase.deadline ?? 0) - s.week + 1
    const horizon = Math.max(1, Math.min(20, weeksLeft))
    const income = Math.max(1, grossIncome(s))
    // The goal's needs are first in the list when they're pressing: take them as they are.
    const g = goal(s)
    const urgent = plays.find(
      (p) =>
        (p[0]!.kind === 'cover' && weeksLeft <= COVER_AT) ||
        (p[0]!.kind === 'storage' && tooBig(s)?.resourceId === p[0]!.key.split(':')[1]) || (p.some((m) => m.kind === 'software' || m.kind === 'platform') && g && bestIQ(s) < g.minIQ && weeksLeft <= weeksToGoalIQ(s) + IQ_SLACK)
    )
    let best: { play: Move[]; score: number } | null = null
    const seen: Weighed[] = []
    // The structure it builds as the climber would; only how it grows is chosen by value.
    if (!urgent && !weighed) {
      for (const play of plays.filter((p) => p.structural)) {
        const next = await play[0]!.run(s, ctx)
        if (!next) continue
        took(ctx, play[0]!)
        ctx.queue.push(...play.slice(1))
        return next
      }
    }
    for (const play of urgent ? [urgent] : weighed ? plays : plays.filter((p) => !p.structural)) {
      const valued = await valuePlay(s, ctx, play)
      if (!valued) continue
      // Value per week of action: a play of three steps uses three weeks.
      let score = valueAt(valued.value, horizon) / play.length
      // Weeks off the clock cost more as the slack runs out.
      const slack = weeksLeft - weeksToGoalIQ(s) - 10
      if (valued.value.clock < 0) score += (valued.value.clock * income * 20) / Math.max(5, slack)
      // A step towards a tier or the goal is worth what the next tier's units would make.
      if (valued.value.unlocks.includes('the goal')) score += income * horizon * 0.2
      seen.push({ kind: playKind(play), value: score / income })
      if (!best || score > best.score) best = { play, score }
    }
    weighed?.(seen)
    if (!best) return s
    const next = await best.play[0]!.run(s, ctx)
    if (!next) return s
    took(ctx, best.play[0]!)
    ctx.queue.push(...best.play.slice(1))
    return next
  }
}

export const CLIMBER: Style = { maxTier: 4, upgrades: true, lean: 'balanced' }

/** One weekly Procurement of Money, and nothing else. */
export const idle: Policy = async (s, ctx) => {
  if (s.week !== s.phase.start) return s
  const next = await procure(MONEY_ID, 'weekly').run(s, ctx)
  if (next) took(ctx, procure(MONEY_ID, 'weekly'))
  return next ?? s
}

export interface Bot {
  name: string
  policy: () => Policy
}

export const ROSTER: Bot[] = [
  { name: 'greedy', policy: () => greedy() },
  { name: 'climber', policy: () => scripted(CLIMBER) },
  { name: 'brain', policy: () => scripted({ ...CLIMBER, lean: 'brain' }) },
  { name: 'scale', policy: () => scripted({ ...CLIMBER, lean: 'scale' }) },
  { name: 'tier0', policy: () => scripted({ ...CLIMBER, maxTier: 0 }) },
  { name: 'no-upgrades', policy: () => scripted({ ...CLIMBER, upgrades: false }) },
  { name: 'procurer', policy: () => scripted({ ...CLIMBER, maxTier: -1, procureOnly: true }) },
  { name: 'idle', policy: () => idle }
]

// ---------------------------------------------------------------- playing and recording

export interface WeekRow {
  /** Weeks into Phase 2, from 1. */
  week: number
  income: number
  running: number
  stock: number
  fleet: number
  fleetByTier: number[]
  net: number
  iq: number
  hardwareIQ: number
  weeksLeft: number
  /** Goal resource held, and what the goal costs. */
  goalHeld: number
  goalCost: number
  action: ActionKind
  label: string
  spend: Record<Category, number>
  /** The biggest working unit type's share of the working fleet's worth. */
  largestShare: number
  /** Worth of the depots owned. */
  depotWorth: number
  /** Some waiting research costs more of a resource than it can hold. */
  capBlocked: boolean
  /** Greedy only, at checkpoints: each kind's best value, fresh and after its third use. */
  values?: { fresh: Weighed[]; stale: Weighed[] }
}

/** A sourcing contract signed in a run: when, for what, how big, and when it was full. */
export interface ContractRecord {
  week: number
  unit: string
  name: string
  worth: number
  /** The Phase 2 week its last slot was used, or null. */
  filled: number | null
}

/** The contracts in a state that aren't depot builds, by id. */
export const signedContracts = (s: GameState) => s.sourcing.filter((c) => c.parts.length && !findUnit(s, c.unitId)?.holds)

/** Notes the contracts signed or filled this week. */
export function trackContracts(s: GameState, week: number, seen: Map<string, ContractRecord>) {
  for (const c of signedContracts(s)) {
    const u = findUnit(s, c.unitId)
    let rec = seen.get(c.id)
    if (!rec) seen.set(c.id, (rec = { week, unit: u?.name ?? c.unitId, name: c.name, worth: c.total * (u?.value ?? 0), filled: null }))
    if (rec.filled === null && openSlots(c) === 0) rec.filled = week
  }
}

/** The biggest working unit type's share of the working fleet, the depots' worth, and whether a cost can't fit. */
export function fleetShape(s: GameState): Pick<WeekRow, 'largestShare' | 'depotWorth' | 'capBlocked'> {
  const working = s.units.filter((u) => !u.holds).map((u) => u.count * u.value)
  const total = working.reduce((n, w) => n + w, 0)
  return {
    largestShare: total > 0 ? Math.max(...working) / total : 0,
    depotWorth: s.units.filter((u) => u.holds).reduce((n, u) => n + u.count * u.value, 0),
    capBlocked: s.research.some((r) => r.cost.some((c) => { const x = findResource(s, c.resourceId); return !!x && c.amount > capOf(s, x) }))
  }
}

export interface RunRecord {
  bot: string
  approach: number
  goalIQ: number
  /** Phase 2 week it was won or lost in, or null. */
  won: number | null
  lost: number | null
  rows: WeekRow[]
  mix: Partial<Record<ActionKind, number>>
  /** Contracts signed (depot builds aside), and depot designs. */
  contracts: ContractRecord[]
  depots: number
}

/** Weeks into Phase 2 at which greedy's options are recorded. */
export const CHECKPOINTS = [1, 9, 20, 45, 70]

/**
 * A Phase 2 start as a real game reaches it: the Phase 1 bot plays the balanced bribe plan to a
 * win, keeping its three resources and anything still paying out; then the nanotech plan for
 * this approach brings five more, and its first unit is designed (free, no action).
 */
export async function econStart(approach: number): Promise<GameState> {
  const p1 = await play(await phase1(1), flat, 12)
  let s = p1.state
  if (s.phase.n !== 2) throw new Error('The Phase 1 bot never escaped the lab.')
  const values = Object.fromEntries(NANOTECH.resources.map((_, i) => [`r${i}_value`, score(2)]))
  const plan = await judgePlan(s, new FakeJudge({ ...values, approach: noul(B.APPROACH_AT[2][approach]!) }), NANOTECH)
  s = acceptPlan(s, plan).state
  // Resource traits are out of scope for the balance runs (fake Jev would give them all Cryogenic).
  for (const r of s.resources) r.traits = []
  const v = await judgeUnit(s, new FakeJudge({ ...TYPICAL }), { name: 'CNC Mill', description: '', first: true })
  return acceptUnit(s, v).state
}

/** Plays a bot through Phase 2, recording every week. */
export async function playEcon(bot: Bot, approach: number, limit = 120): Promise<RunRecord> {
  let s = await econStart(approach)
  const ctx = newCtx()
  const policy = bot.policy()
  const start = s.week
  const g = goal(s)!
  const rec: RunRecord = { bot: bot.name, approach, goalIQ: g.minIQ, won: null, lost: null, rows: [], mix: {}, contracts: [], depots: 0 }
  const seen = new Map<string, ContractRecord>()
  const goalId = g.cost[0]!.resourceId
  for (let i = 0; i < limit; i++) {
    const week = s.week - start + 1
    ctx.action = 'none'
    ctx.label = ''
    s = research(s, ctx)
    if (s.phase.n !== 2) {
      rec.won = week
      break
    }
    let values: WeekRow['values']
    if (bot.name === 'greedy' && CHECKPOINTS.includes(week)) values = await checkpoint(s, ctx)
    s = await policy(s, ctx)
    s = research(s, ctx)
    if (s.phase.n !== 2) {
      rec.won = week
      break
    }
    s = grow(s, ctx)
    rec.mix[ctx.action] = (rec.mix[ctx.action] ?? 0) + 1
    rec.rows.push(row(s, ctx, week, goalId, values))
    trackContracts(s, week, seen)
    rec.contracts = [...seen.values()]
    rec.depots = s.units.filter((u) => u.holds).length
    s = runWeek(s)
    if (s.phase.status === 'lost') {
      rec.lost = week
      break
    }
  }
  return rec
}

/** Each kind's best value this week, fresh and as if every action had been used three times. */
async function checkpoint(s: GameState, ctx: Ctx): Promise<WeekRow['values']> {
  const read = async (stale: boolean) => {
    let seen: Weighed[] = []
    await greedy(CLIMBER, (w) => (seen = w))(s, { ...ctx, uses: new Map(ctx.uses), queue: [], waited: 0, stale })
    const best = new Map<ActionKind, number>()
    for (const w of seen) best.set(w.kind, Math.max(best.get(w.kind) ?? -Infinity, w.value))
    return [...best].map(([kind, value]) => ({ kind, value }))
  }
  return { fresh: await read(false), stale: await read(true) }
}

function row(s: GameState, ctx: Ctx, week: number, goalId: string, values?: WeekRow['values']): WeekRow {
  const report = previewWeek(s)
  const w = worthOf(s)
  const g = goal(s)
  return {
    week,
    income: grossIncome(s, report),
    running: runningNet(s, report),
    stock: w.stock,
    fleet: w.fleet,
    fleetByTier: w.byTier,
    net: w.net,
    iq: bestIQ(s),
    hardwareIQ: s.minds[0]!.hardware.iq,
    weeksLeft: (s.phase.deadline ?? 0) - s.week + 1,
    goalHeld: findResource(s, goalId)?.amount ?? 0,
    goalCost: g?.cost[0]?.amount ?? 0,
    action: ctx.action,
    label: ctx.label,
    spend: { ...ctx.spend },
    ...fleetShape(s),
    ...(values ? { values } : {})
  }
}

export { HORIZON }
