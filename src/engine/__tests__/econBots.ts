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
  findResource,
  findUnit,
  industryScalar,
  iqScalar,
  MONEY_ID,
  openSlots,
  tasksFor,
  weeklyUse
} from '../model'
import { coversLeft } from '../phase'
import { goalOf } from '../projection'
import { acceptStorage, judgeStorage } from '../storageProposal'
import { acceptStrategy, judgeStrategy } from '../strategyProposal'
import type { GameState, Research } from '../types'
import { acceptUnit, judgeUnit, runPool } from '../unitProposal'
import { acceptUpgrade, judgeUpgrade } from '../upgrade'
import { flat, NANOTECH, phase1, play } from './bots'
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
      used(ctx, key)
      return acceptCreate(s, v).state
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
      const band = Math.min(B.SOURCING_LIMITS.length - 1, 1 + (ctx.uses.get(key) ?? 0))
      const v = await judgeCreate(s, judge(ctx, key, { limit: score(band) }), {
        target: { kind: 'unit', id: unitId },
        name: fresh(ctx, 'Contract'),
        description: ''
      })
      const i = v.options.findIndex((o) => isContract(o) && !o.risky && o.total > 0)
      if (v.rejected || i < 0) return null
      v.choice = i
      used(ctx, key)
      return acceptCreate(s, v).state
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
      used(ctx, key)
      return acceptStrategy(s, v).state
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
      used(ctx, `design:${tier}`)
      return acceptUnit(s, v).state
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
      used(ctx, `upgrade:${unitId}`)
      return acceptUpgrade(s, offer, i).state
    })
})

/** The newest unit of a tier, once its design is done. */
const unitOfTierNow = (s: GameState, tier: number) => [...s.units].reverse().find((u) => u.tier === tier)

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

/** The platform's software upgrade, at the biggest size on offer. */
export const software = (): Move => ({
  kind: 'software',
  key: 'software',
  label: 'Software upgrade',
  run: (s, ctx) =>
    attempt(async () => {
      const mind = s.minds[0]!
      if (mind.software.upgraded || s.research.some((r) => r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind')) return null
      const offer = await judgeUpgrade(s, judge(ctx, 'software', { 'd_*': score(1) }), { kind: 'mind', id: mind.id })
      const steps = offer.options.map((o) => o.step ?? 0)
      used(ctx, 'software')
      return stripTraits(acceptUpgrade(s, offer, steps.indexOf(Math.max(...steps))).state)
    })
})

/** A new platform, at the biggest step on offer. */
export const platform = (): Move => ({
  kind: 'platform',
  key: 'platform',
  label: 'New platform',
  run: (s, ctx) =>
    attempt(async () => {
      if (s.research.some((r) => r.effect.kind === 'mind')) return null
      const v = await judgeMind(s, judge(ctx, 'platform'), { name: fresh(ctx, 'Platform'), description: '' })
      if (v.rejected || !v.options.length) return null
      v.choice = v.options.reduce((best, o, i) => (o.step > v.options[best]!.step ? i : best), 0)
      used(ctx, 'platform')
      return stripTraits(acceptMind(s, v).state)
    })
})

/** Storage for a resource: the smallest option that holds `need`, or the biggest that isn't risky. */
export const storage = (resourceId: string, need = 0): Move => ({
  kind: 'storage',
  key: `storage:${resourceId}`,
  label: `Storage for ${resourceId}`,
  run: (s, ctx) =>
    attempt(async () => {
      const r = findResource(s, resourceId)
      if (!r || s.research.some((x) => x.effect.kind === 'storage' && x.effect.resourceId === resourceId)) return null
      const v = await judgeStorage(s, judge(ctx, `storage:${resourceId}`), { resourceId, name: fresh(ctx, 'Warehouse'), description: '' })
      if (v.rejected) return null
      const ok = v.options.map((o, i) => ({ o, i })).filter(({ o }) => !o.advanced && !o.risky && o.added > 0)
      const pick = ok.find(({ o }) => capOf(s, r) + o.added >= need) ?? ok[ok.length - 1]
      if (!pick) return null
      v.choice = pick.i
      used(ctx, `storage:${resourceId}`)
      return acceptStorage(s, v).state
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
  storage: 'storage',
  goal: 'goal',
  cover: 'cover'
}

/** Does every research it can afford, the goal first, counting what it costs. */
export function research(state: GameState, ctx: Ctx): GameState {
  let s = state
  const order = () => [...s.research].sort((a, b) => Number(b.effect.kind === 'goal') - Number(a.effect.kind === 'goal'))
  for (let pass = 0; pass < 2; pass++) {
    for (const r of order()) {
      if (s.phase.n !== state.phase.n || researchBlocker(s, r.id)) continue
      const before = worthOf(s).stock
      s = doResearch(s, r.id)
      const kind = r.effect.kind === 'upgrade' && r.effect.target.kind === 'mind' ? 'iq' : SPEND_OF[r.effect.kind]
      ctx.spend[kind] += Math.max(0, before - worthOf(s).stock)
    }
  }
  return s
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
 * for the next twenty units of each open contract, and what waiting research costs.
 */
export function demand(s: GameState): Record<string, number> {
  const want: Record<string, number> = {}
  const add = (id: string, n: number) => (want[id] = (want[id] ?? 0) + n)
  for (const [id, n] of Object.entries(weeklyUse(previewWeek(s)))) add(id, 4 * n)
  for (const c of s.sourcing) {
    const u = findUnit(s, c.unitId)
    const n = Math.min(openSlots(c), 20)
    if (!n) continue
    for (const p of c.parts) add(p.resourceId, p.amount * n)
    for (const f of u?.upkeep ?? []) add(f.resourceId, f.amount * n * 4)
  }
  for (const r of s.research) if (bestIQ(s) >= r.minIQ) for (const c of r.cost) add(c.resourceId, c.amount)
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
  return s
}

/**
 * What waiting research will use up, per resource, kept back from new units: only research
 * within reach (what you hold and about four weeks' income), so saving for something far off
 * doesn't stop all growth.
 */
function reserved(s: GameState): Record<string, number> {
  const out: Record<string, number> = {}
  const reach = worthOf(s).stock + 4 * Math.max(0, grossIncome(s))
  for (const r of s.research) {
    if (bestIQ(s) < r.minIQ) continue
    const worth = r.cost.reduce((n, c) => n + c.amount * (findResource(s, c.resourceId)?.value ?? 0), 0)
    if (worth > reach) continue
    for (const c of r.cost) out[c.resourceId] = (out[c.resourceId] ?? 0) + c.amount
  }
  return out
}

/**
 * Creates every unit the open contracts allow, highest tier first, keeping back a week's running
 * and what waiting research needs; then assigns them.
 */
export function grow(state: GameState, ctx: Ctx): GameState {
  let s = state
  const keep = reserved(s)
  const use = weeklyUse(previewWeek(s))
  const reserve: Record<string, number> = {}
  for (const id of new Set([...Object.keys(keep), ...Object.keys(use)])) reserve[id] = (keep[id] ?? 0) + (use[id] ?? 0)
  const byTier = [...s.units].sort((a, b) => b.tier - a.tier)
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
  return assignBest(s)
}

// ---------------------------------------------------------------- what the bots consider

const highestTier = (s: GameState) => Math.max(-1, ...s.units.map((u) => u.tier))

/** The most valuable resource a unit could make without a tier penalty: its own tier or below; the goal's if it can. */
function bestOutput(s: GameState, unitId: string): string | null {
  const u = findUnit(s, unitId)
  if (!u) return null
  const g = goalResource(s)
  const gr = g ? findResource(s, g) : undefined
  if (gr && gr.tier <= u.tier) return gr.id
  const fits = s.resources.filter((r) => r.tier <= u.tier && !u.upkeep.some((f) => f.resourceId === r.id))
  return [...fits].sort((a, b) => b.tier - a.tier || b.value - a.value)[0]?.id ?? MONEY_ID
}

/** Resources that something uses (inputs or upkeep) but nothing makes and nothing delivers. */
function unsupplied(s: GameState): string[] {
  // Made only if some unit is actually there to make it.
  const made = new Set([
    ...s.strategies.filter((x) => x.kind === 'make' && findUnit(s, x.unitId)?.count).map((x) => x.outputId),
    ...s.deliveries.flatMap((d) => (d.target.kind === 'resource' ? [d.target.id] : []))
  ])
  const needed = new Set<string>()
  // Upkeep of units owned or about to be: a contract with room can't fill without it.
  const coming = (unitId: string) => (findUnit(s, unitId)?.count ?? 0) > 0 || contractsFor(s, unitId).some((c) => openSlots(c) > 0)
  for (const u of s.units) if (coming(u.id)) for (const f of u.upkeep) needed.add(f.resourceId)
  // Parts of contracts with room left: units can't be made without them.
  for (const c of s.sourcing) if (openSlots(c)) for (const p of c.parts) needed.add(p.resourceId)
  for (const x of s.strategies) {
    const u = findUnit(s, x.unitId)
    if (u && coming(u.id) && tasksFor(s, u).includes(x.id)) for (const f of x.inputs) needed.add(f.resourceId)
  }
  return [...needed].filter((id) => !made.has(id))
}

/** Resources that open contracts' parts, upkeep or running strategies use up. */
function inUse(s: GameState): string[] {
  const ids = new Set<string>()
  for (const c of s.sourcing) if (openSlots(c)) for (const p of c.parts) ids.add(p.resourceId)
  for (const u of s.units) if (u.count) for (const f of u.upkeep) ids.add(f.resourceId)
  for (const x of s.strategies) if (findUnit(s, x.unitId)?.count) for (const f of x.inputs) ids.add(f.resourceId)
  return [...ids]
}

/** The unit best placed to make a resource: the lowest tier that's at least the resource's, else the highest. */
function makerFor(s: GameState, resourceId: string): string | null {
  const r = findResource(s, resourceId)
  if (!r) return null
  const can = s.units.filter((u) => u.count > 0 && !u.upkeep.some((f) => f.resourceId === resourceId))
  const fit = can.filter((u) => u.tier >= r.tier).sort((a, b) => a.tier - b.tier)[0]
  return (fit ?? [...can].sort((a, b) => b.tier - a.tier)[0])?.id ?? null
}

/**
 * A cost of waiting research bigger than its resource can hold, with no storage waiting for it.
 * The goal's counts once something makes its resource, or the goal's IQ is a step away.
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
      const waiting = s.research.some((x) => x.effect.kind === 'storage' && x.effect.resourceId === c.resourceId)
      if (res && capOf(s, res) < c.amount && !waiting) return c
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

  // The goal's own needs come first when time is short.
  const big = tooBig(s)
  if (big) push(storage(big.resourceId, big.amount))
  if (g && needIQ(g.minIQ) && weeksLeft <= weeksToGoalIQ(s) + IQ_SLACK) push(...iqPlay())
  if (style.lean === 'brain' && g && needIQ(g.minIQ)) push(...iqPlay())

  if (!style.procureOnly) {
    // Units sitting idle, or with nothing to do yet.
    for (const u of s.units) {
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
  // What the economy wants more of than it holds: make it, store room for it, and buy it in.
  if (!style.procureOnly) {
    const want = demand(s)
    for (const [id, need] of Object.entries(want)) {
      const r = findResource(s, id)
      if (!r || r.amount >= need || id === top) continue
      const maker = makerFor(s, id)
      const exists = s.strategies.some((x) => x.unitId === maker && x.outputId === id) || s.research.some((x) => x.effect.kind === 'strategy' && x.effect.strategy.unitId === maker && x.effect.strategy.outputId === id)
      if (maker && !exists) push(strategy(maker, id))
      if (capOf(s, r) < need) {
        push(storage(id, need))
        push(storage(id, need), procure(id))
      }
    }
  }
  // Storage for what overflows.
  const report = previewWeek(s)
  const income = Math.max(1, grossIncome(s, report))
  for (const [id, wasted] of Object.entries(report.wasted)) {
    const r = findResource(s, id)
    if (r && wasted * r.value > income * 0.05) push(storage(id, capOf(s, r) * 4))
  }
  if (weeksLeft < 15) push(cover())
  // Something to Procure: what's short, the goal's resource, or Money.
  // What waiting research is short of: structure, when a Procurement or two would finish it.
  const short = shortOf(s)
  structural = !!short && (shortWorth(s, short) <= 2 * B.CREATE_WORTH * industryScalar(s) * iqScalar(s))
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
    for (const u of s.units) {
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
  for (const u of s.units) v.weekly = addStreams(v.weekly, fillOf(s, u.id))
  for (const u of base.units) v.weekly = addStreams(v.weekly, fillOf(base, u.id).map((x) => -x))
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
      (p) => (p[0]!.kind === 'storage' && tooBig(s)?.resourceId === p[0]!.key.split(':')[1]) || (p.some((m) => m.kind === 'software' || m.kind === 'platform') && g && bestIQ(s) < g.minIQ && weeksLeft <= weeksToGoalIQ(s) + IQ_SLACK)
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
  /** Greedy only, at checkpoints: each kind's best value, fresh and after its third use. */
  values?: { fresh: Weighed[]; stale: Weighed[] }
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
  const rec: RunRecord = { bot: bot.name, approach, goalIQ: g.minIQ, won: null, lost: null, rows: [], mix: {} }
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
    ...(values ? { values } : {})
  }
}

export { HORIZON }
