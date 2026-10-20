/**
 * A command-line harness for playing Singularity R&D without the browser. It runs the same
 * engine and asks the real Jev, saves the game between commands, and writes the same run log
 * as the browser (logs/runs/<runId>.jsonl), so a harness game can be analysed like any other.
 *
 *   npm run play -- help
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from 'vite'
import { CachedJudge, JudgeError, type Answers, type Judge, type JevAnswer, type Questions } from '@/ai/jev'
import * as actions from '@/engine/actions'
import { alertsFor } from '@/engine/alerts'
import {
  acceptBreakthrough,
  describeChange,
  draftBreakthrough,
  judgeBreakthrough,
  recipeOf,
  targetName,
  withCatches,
  type BreakthroughSpec,
  type BreakthroughVerdict
} from '@/engine/breakthroughProposal'
import { runWeek } from '@/engine/cycle'
import { previewWeek } from '@/engine/economy'
import { createInitialState } from '@/engine/initialState'
import {
  affordable,
  allocation,
  ceilingIQ,
  currentIQ,
  describeFlows,
  findResource,
  findUnit,
  fmt,
  fmtCount,
  layerSize,
  marketLeft,
  marketPrice,
  MONEY_ID,
  moneyUse,
  softwareLabel,
  tasksFor,
  unitLimit
} from '@/engine/model'
import {
  BREAKTHROUGH_PRESETS,
  RESOURCE_PRESETS,
  STRATEGY_PRESETS,
  UNIT_PRESETS
} from '@/engine/presets'
import {
  acceptResource,
  acceptStrategy,
  catchesOf,
  complicationName,
  draftResource,
  draftStrategy,
  judgeResource,
  judgeStrategy,
  type ResourceSpec,
  type StrategySpec,
  type StrategyVerdict,
  type ResourceVerdict
} from '@/engine/proposals'
import { designRange, effectiveIQ, finishWeek, researchSpeed, bestEffectiveIQ } from '@/engine/research'
import { TRAITS, type TraitId } from '@/engine/traits'
import type { GameState, Project } from '@/engine/types'
import {
  acceptUnit,
  answerPushback,
  availabilityOf,
  AVAILABILITY,
  chosenTraits,
  draftUnit,
  judgeUnit,
  missingKinds,
  nearLine,
  needsBuilder,
  partsMatter,
  type PushbackReply,
  type UnitSpec,
  type UnitVerdict
} from '@/engine/unitProposal'
import { snapshot } from '@/telemetry'
import { RunLog } from '../server/runLog'

type Verdict = ResourceVerdict | StrategyVerdict | UnitVerdict | BreakthroughVerdict

interface Save {
  state: GameState
  /** A verdict waiting for the player to accept or discard it. */
  verdict: Verdict | null
}

const ROOT = process.cwd()
const SAVES = join(ROOT, 'logs', 'harness')
const runLog = new RunLog(join(ROOT, 'logs', 'runs'))

// ---------------------------------------------------------------- Jev, straight from Node

/** Asks Jev directly with the key from .env.local, retrying when rate-limited. */
class NodeJudge implements Judge {
  constructor(
    private readonly runId: () => string,
    private readonly env = loadEnv('development', ROOT, '')
  ) {}

  async ask<Q extends Questions>(state: string, questions: Q, purpose = ''): Promise<Answers<Q>> {
    const key = this.env.JEV_API_KEY
    if (!key) throw new JudgeError('JEV_API_KEY is not set in .env.local.')
    const endpoint = `${(this.env.JEV_BASE_URL || 'https://openrouter.ai/api').replace(/\/+$/, '')}/v1/systemone`
    const request = { model: this.env.JEV_MODEL || 'jev-latest', state, questions }
    for (let attempt = 0; ; attempt++) {
      const started = Date.now()
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })
      const text = await res.text()
      let response: unknown = text
      try {
        response = JSON.parse(text)
      } catch {
        // Keep the raw text.
      }
      await runLog.append(this.runId(), { event: 'jev', purpose, status: res.status, ms: Date.now() - started, request, response })
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
        continue
      }
      if (!res.ok) throw new JudgeError(`Jev request failed (${res.status}): ${text.slice(0, 300)}`, res.status)
      const answers = ((response as { answers?: Record<string, JevAnswer> }).answers ?? {}) as Record<string, JevAnswer>
      for (const k of Object.keys(questions)) if (!answers[k]) throw new JudgeError(`Jev did not answer "${k}".`)
      return answers as Answers<Q>
    }
  }
}

// ---------------------------------------------------------------- saves and logging

function savePath(slot: string) {
  return join(SAVES, `${slot}.json`)
}

function load(slot: string): Save {
  const path = savePath(slot)
  if (!existsSync(path)) throw new Error(`No game in slot "${slot}". Start one with: new`)
  return JSON.parse(readFileSync(path, 'utf8')) as Save
}

function store(slot: string, save: Save) {
  mkdirSync(SAVES, { recursive: true })
  writeFileSync(savePath(slot), JSON.stringify(save))
}

const log = (s: GameState, event: string, data: Record<string, unknown> = {}) =>
  runLog.append(s.runId, { event, week: s.week, harness: true, ...data })

function judgeFor(save: Save): Judge {
  return new CachedJudge(
    new NodeJudge(() => save.state.runId),
    () => save.state.jevCache,
    () => save.state.stats.jevCalls++
  )
}

/** Takes a new state, keeping Jev's answers and call count, as the browser store does. */
function adopt(save: Save, next: GameState) {
  next.jevCache = save.state.jevCache
  next.stats.jevCalls = save.state.stats.jevCalls
  save.state = next
}

// ---------------------------------------------------------------- printing

const pct = (p: number) => `${Math.round(p * 100)}%`
const out: string[] = []
const say = (line = '') => out.push(line)

function printStatus(s: GameState) {
  const preview = previewWeek(structuredClone(s))
  const money = findResource(s, MONEY_ID)!.amount
  const net = (id: string) => (preview.flows[id] ?? []).reduce((n, f) => n + f.amount, 0)
  const [lo, hi] = designRange(s)
  say(`WEEK ${s.week} (${s.status}) · Money ${fmt(money)} (net ${fmt(net(MONEY_ID))}/wk, upkeep-reserve ${fmt(moneyUse(preview))}) · Jev calls ${s.stats.jevCalls}`)
  say(`Best pooled IQ ${Math.round(bestEffectiveIQ(s))} · designs within reach IQ ${lo}–${hi}`)
  say('\nRESOURCES')
  for (const r of s.resources) {
    const sources = (preview.flows[r.id] ?? []).map((f) => `${f.label} ${f.amount >= 0 ? '+' : ''}${fmt(f.amount)}`).join(', ')
    const share = preview.shares[r.id]
    say(
      `  ${r.id} "${r.name}" ${r.kind} worth ${fmt(r.value)} · have ${fmt(r.amount)}${r.stored ? ` (+${fmt(r.stored)} stored)` : ''} · net ${fmt(net(r.id))}` +
        `${share !== undefined && share < 1 ? ` · SHORT: ${pct(share)} met` : ''}` +
        `${r.market ? ` · market ${fmt(r.market - r.boughtThisWeek)}/${fmt(r.market)} left this week` : ''}` +
        `${sources ? `\n      ${sources}` : ''}`
    )
  }
  for (const [label, group] of [
    ['MINDS', s.units.filter((u) => u.mind)],
    ['INDUSTRY', s.units.filter((u) => !u.mind)]
  ] as const) {
    if (!group.length) continue
    say(`\n${label}`)
    for (const u of group) {
      const w = preview.units[u.id]
      const left = marketLeft(u)
      const { byTask, free } = allocation(s, u)
      say(
        `  ${u.id} "${u.name}"${u.tier ? ` Tier ${u.tier}` : ''} ×${fmtCount(u.count)}/${u.starting ? 1 : fmtCount(unitLimit(u))}` +
          ` [layers market ${fmtCount(layerSize(u, 'market'))}, own ${fmtCount(layerSize(u, 'own'))}, earth ${fmtCount(layerSize(u, 'earth'))}; bought ${fmtCount(u.bought)}, built ${fmtCount(u.built)}]`
      )
      if (u.mind) {
        say(`      IQ ${Math.round(currentIQ(u))}/${Math.round(ceilingIQ(u))} · hardware ${u.hardware.name} (${u.hardware.iq}) · software ${softwareLabel(u)}`)
      }
      say(
        `      upkeep ${u.upkeep.length ? describeFlows(s, u.upkeep) : 'none'} · parts ${describeFlows(s, u.parts)} · value ${fmt(u.value)}` +
          `${u.traits.length ? ` · traits ${u.traits.join(', ')}` : ''}${u.crew ? ` · crew ${u.crew.per} ${u.crew.unitId}` : ''}${u.builderId ? ` · built by ${u.builderId}` : ''}`
      )
      if (left > 0) say(`      market: ${fmtCount(left)} left at ${fmt(marketPrice(u))} each (max affordable now ${fmtCount(affordable(u, money, moneyUse(preview)))})`)
      const tasks = Object.entries(byTask).map(([t, n]) => `${t}=${fmtCount(n)}${t === u.rest ? '(rest)' : ''}`)
      say(`      tasks: ${tasks.join(', ') || 'none'}${free ? ` · ${fmtCount(free)} UNASSIGNED` : ''} · can do: ${tasksFor(s, u).join(', ') || 'nothing'}`)
      if (w && (w.unpaid || w.done || w.resting || w.choked || w.built || w.lost)) {
        say(`      next week: ${w.unpaid ? `${fmtCount(w.unpaid)} unpaid (${w.unpaidFor}) ` : ''}${w.done ? `${fmtCount(w.done)} builders done ` : ''}${w.resting ? 'resting ' : ''}${w.choked ? 'CHOKED by waste ' : ''}${w.built ? `builds ${fmtCount(w.built)} ` : ''}${w.lost ? `loses ${fmtCount(w.lost)}` : ''}`)
      }
    }
  }
  if (s.strategies.length) {
    say('\nSTRATEGIES')
    for (const st of s.strategies) {
      const run = preview.runs[st.id]
      const outName = st.kind === 'make' ? findResource(s, st.outputId)?.name : findUnit(s, st.outputId)?.name
      say(
        `  ${st.id} "${st.name}" [${st.unitId}] ${st.kind}: ${st.inputs.length ? `${describeFlows(s, st.inputs)} → ` : ''}${fmt(st.amount)} ${outName}` +
          `${st.target !== undefined ? ` · target ${fmtCount(st.target)}` : ''}${st.quirk ? ` · quirk ${st.quirk}` : ''}` +
          `${run ? ` · next week ${fmtCount(run.units)} running at ${pct(run.fraction)}${run.limitedBy ? ` (short of ${run.limitedBy})` : ''}` : ''}`
      )
    }
  }
  say('\nPROJECTS')
  for (const p of s.projects) printProject(s, p, preview)
  const alerts = alertsFor(s, preview)
  if (alerts.length) {
    say('\nALERTS')
    for (const a of alerts) say(`  [${a.tone}] ${a.text}${a.prompt ? ` → ${a.prompt.label}` : ''}`)
  }
}

function printProject(s: GameState, p: Project, preview = previewWeek(structuredClone(s))) {
  const speed = preview.progress[p.id] ?? 0
  const done = finishWeek(s, p, speed)
  say(`  ${p.id} "${p.name}" bar ${p.bar} · ${fmt(p.progress)}/${fmt(p.size)} · ${p.field} · ${speed ? `+${fmt(speed)}/wk, finishes week ${done}` : 'no progress'}`)
  for (const g of preview.groups[p.id] ?? []) {
    say(`      ${g.unitId} ×${fmtCount(g.machines)} effective IQ ${Math.round(g.effectiveIQ)} ${g.clears ? `clears, +${fmt(g.speed)}/wk` : 'BELOW BAR'}`)
  }
  say(`      if pooled: ${estimates(s, p.bar, p.size - p.progress, p.field)}`)
}

/** Weeks each mind type would take on a project with every machine it has. */
function estimates(s: GameState, bar: number, size: number, field: Project['field'] | null) {
  return (
    s.units
      .filter((u) => u.mind && u.count > 0)
      .map((u) => {
        const eff = effectiveIQ(u, u.count, field)
        const speed = researchSpeed(u, u.count, eff, bar)
        return `${u.id} eff ${Math.round(eff)} → ${speed ? `${Math.ceil(size / speed)} wk` : 'can’t'}`
      })
      .join('; ') || 'no minds'
  )
}

function printVerdict(s: GameState, v: Verdict) {
  say(`VERDICT (${v.kind}): plausibility ${pct(v.plausibility)} vs bar ${pct(v.bar)}`)
  if (v.rejected) say(`  REJECTED: ${v.rejected}`)
  if (v.duplicateOf) say(`  DUPLICATE of ${v.duplicateOf}`)
  for (const t of v.torn) {
    say(`  torn on ${t.topic} [pick ${t.key} <value>]: now ${v.picks[t.key] ?? '(Jev’s top)'}`)
    t.options.forEach((o, i) =>
      say(`    ${o.value}: ${o.label} (${pct(o.p)})${t.catch && i === 1 ? ` + catch: ${complicationName(t.catch).name}` : ''}`)
    )
  }
  if (v.kind === 'resource') {
    const r = draftResource(s, v)
    say(`  → ${r.name}: ${r.kind}, worth ${fmt(r.value)}, market ${fmt(r.market)}/wk`)
  } else if (v.kind === 'strategy') {
    const d = draftStrategy(s, v)
    say(`  → ${describeFlows(s, d.strategy.inputs)} → ${fmt(d.strategy.amount)} ${findResource(s, d.strategy.outputId)?.name} per unit${d.strategy.quirk ? ` · quirk ${d.strategy.quirk}` : ''}`)
    say(d.bar ? `  → research: bar ${d.bar}, size ${fmt(d.size)} (${d.field}) · ${estimates(s, d.bar, d.size, d.field)}` : '  → ready at once')
  } else if (v.kind === 'unit') {
    const d = draftUnit(s, v)
    const u = d.unit
    say(`  availability: ${AVAILABILITY[availabilityOf(v)]}${needsBuilder(v) ? ' — NEEDS A BUILDER [builder <unitId>]' : ''}`)
    say(d.immediate ? '  → goes straight onto humanity’s market' : `  → design project: bar ${d.bar}, size ${fmt(d.size)} (${d.field}) · ${estimates(s, d.bar, d.size, d.field)}`)
    say(`  → ${u.mind ? `IQ ${u.hardware.iq} (${u.hardware.name}, ${softwareLabel(u)}), ` : ''}value ${fmt(u.value)}, upkeep ${describeFlows(s, u.upkeep)}, parts ${describeFlows(s, u.parts)}`)
    say(`  → layers market ${fmtCount(u.layers.market)}, own ${fmtCount(u.layers.own)} · traits ${u.traits.join(', ') || 'none'}`)
    for (const t of v.traitOdds.filter(nearLine).slice(0, 4)) {
      const on = chosenTraits(v).some((c) => c.trait === t.trait)
      say(`  near the line: ${t.trait} ${pct(t.p)} (${TRAITS[t.trait].kind}) now ${on ? 'ON' : 'off'} [trait ${t.trait} on|off]`)
    }
  } else {
    const d = draftBreakthrough(s, v)
    for (const c of withCatches(v)) say(`  • ${describeChange(s, v.spec.target, c)}`)
    say(`  → research: bar ${d.bar}, size ${fmt(d.size)} (${d.field}) · ${estimates(s, d.bar, d.size, d.field)}`)
  }
  const extra = catchesOf(v)
  if (extra.length) say(`  catches taken: ${extra.map((c) => complicationName(c).name).join(', ')}`)
  if ('missing' in v && v.missing.length) say(`  PUSHBACK: missing ${v.missing.join('; ')} [pushback '<json replies>']`)
}

// ---------------------------------------------------------------- the week

/** Runs up to `n` weeks, stopping after any week where something happened worth a decision. */
async function advance(save: Save, n: number) {
  for (let i = 0; i < n && save.state.status === 'playing'; i++) {
    const before = save.state
    const week = before.week
    const alertKeys = new Set(alertsFor(before, previewWeek(structuredClone(before))).map((a) => a.key))
    adopt(save, runWeek(before))
    const s = save.state
    const events = s.log.filter((e) => e.week === week)
    const newAlerts = alertsFor(s, previewWeek(structuredClone(s))).filter((a) => !alertKeys.has(a.key))
    await log(s, 'week', { week, report: s.lastWeek, events, alertsIgnored: alertKeys.size, state: snapshot(s) })
    const notable = events.filter((e) => e.tone !== 'info' || /designed|ready|breakthrough|complete/.test(e.text))
    say(`week ${week} done.${events.length ? ' ' + events.map((e) => e.text).join(' / ') : ''}`)
    if (s.status === 'won') {
      say(`\n*** WON in week ${s.week} ***`)
      await log(s, 'game_end', { status: s.status, weeks: s.week, stats: s.stats })
      break
    }
    if (notable.length || newAlerts.length) {
      for (const a of newAlerts) say(`  new alert [${a.tone}]: ${a.text}`)
      break
    }
  }
}

// ---------------------------------------------------------------- commands

const HELP = `Commands (slot from --slot <name>, default "claude"):
  new                          start a new game
  status                       everything on screen, plus next week's preview
  presets <resource|strategy|unit|breakthrough>
  propose resource '{"name":"..","description":".."}'
  propose strategy '{"name":"..","description":"..","unitId":"..","inputIds":[],"outputId":".."}'
  propose unit '{"name":"..","description":"..","mind":true,"parts":[],"upkeep":[],"builderId":null,"targetIQ":250,"hardware":"..","software":".."}'
  propose breakthrough '{"name":"..","description":"..","target":{"kind":"unit","id":".."},"changes":[...],"params":[]}'
  verdict | pick <key> <value> | trait <id> on|off | builder <unitId|none>
  pushback '[{"kind":"an advanced component","resourceId":".."} | {"kind":"..","newName":"..","newDescription":".."}]'
  accept | discard
  buy <unitId> <n|max> | buyres <resourceId> <n>
  assign <unitId> <taskId> <n> | rest <unitId> <taskId|none> | all <unitId> <taskId>
  target <strategyId> <n> | overclock <unitId> on|off | teach <strategyId> <unitId>
  next [n]                     run up to n weeks (default 1), stopping when something happens
  log [n]                      the last n log lines`

async function run(args: string[], slot: string): Promise<number> {
  const [cmd = 'help', ...rest] = args
  if (cmd === 'help') {
    say(HELP)
    return 0
  }
  if (cmd === 'new') {
    const state = createInitialState()
    store(slot, { state, verdict: null })
    await log(state, 'game_start', { state: snapshot(state) })
    say(`New game ${state.runId} in slot "${slot}".`)
    printStatus(state)
    return 0
  }
  if (cmd === 'presets') {
    const list = { resource: RESOURCE_PRESETS, strategy: STRATEGY_PRESETS, unit: UNIT_PRESETS, breakthrough: BREAKTHROUGH_PRESETS }[rest[0] as 'unit']
    if (!list) throw new Error('presets resource|strategy|unit|breakthrough')
    for (const p of list) say(JSON.stringify(p, (_, x) => (typeof x === 'function' ? '(fn)' : x instanceof RegExp ? String(x) : x)))
    return 0
  }

  const save = load(slot)
  const s = () => save.state
  const act = async (name: string, data: Record<string, unknown>, fn: (st: GameState) => GameState) => {
    adopt(save, fn(save.state))
    await log(save.state, 'action', { action: name, ...data })
    say(`ok: ${name}`)
  }
  const num = (x: string | undefined) => {
    const n = Number(String(x).replace(/[_,]/g, ''))
    if (!Number.isFinite(n)) throw new Error(`Not a number: ${x}`)
    return n
  }
  const needVerdict = () => {
    if (!save.verdict) throw new Error('No verdict waiting. Propose something first.')
    return save.verdict
  }

  switch (cmd) {
    case 'status':
    case 's':
      printStatus(s())
      break
    case 'log':
      for (const e of s().log.slice(-(Number(rest[0]) || 15))) say(`  W${e.week} ${e.text}`)
      break
    case 'propose': {
      const kind = rest[0] as Verdict['kind']
      const spec = JSON.parse(rest[1] ?? '{}') as never
      const judge = judgeFor(save)
      const st = s()
      const v: Verdict =
        kind === 'resource'
          ? await judgeResource(st, judge, spec as ResourceSpec)
          : kind === 'strategy'
            ? await judgeStrategy(st, judge, spec as StrategySpec)
            : kind === 'unit'
              ? await judgeUnit(st, judge, spec as UnitSpec)
              : await judgeBreakthrough(st, judge, spec as BreakthroughSpec)
      st.stats.proposals[kind]++
      if (v.rejected || v.duplicateOf) st.stats.rejections++
      save.verdict = v
      await log(st, 'proposal', {
        input: { kind, spec },
        plausibility: v.plausibility,
        rejected: v.rejected,
        duplicateOf: v.duplicateOf,
        torn: v.torn.map((t) => t.key),
        missing: 'missing' in v ? v.missing : undefined
      })
      printVerdict(st, v)
      break
    }
    case 'verdict':
      printVerdict(s(), needVerdict())
      break
    case 'pick': {
      const v = needVerdict()
      v.picks[rest[0]!] = rest[1]!
      // As in the browser: who can make a unit decides whether its parts matter.
      if (v.kind === 'unit' && rest[0] === 'availability' && v.pushbackRounds === 0) {
        v.availability = availabilityOf(v)
        v.missing = partsMatter(v) ? missingKinds(v) : []
      }
      printVerdict(s(), v)
      break
    }
    case 'trait': {
      const v = needVerdict()
      if (v.kind !== 'unit') throw new Error('Only unit verdicts have traits to decide.')
      v.traitPicks[rest[0] as TraitId] = rest[1] === 'on'
      printVerdict(s(), v)
      break
    }
    case 'builder': {
      const v = needVerdict()
      if (v.kind !== 'unit') throw new Error('Only unit verdicts have a builder.')
      v.spec.builderId = rest[0] === 'none' ? null : rest[0]!
      if (v.pushbackRounds === 0) v.missing = partsMatter(v) ? missingKinds(v) : []
      printVerdict(s(), v)
      break
    }
    case 'pushback': {
      const v = needVerdict()
      if (v.kind !== 'unit' && v.kind !== 'breakthrough') throw new Error('Nothing to push back on.')
      const replies = JSON.parse(rest[0] ?? '[]') as PushbackReply[]
      const st = s()
      const parts = v.kind === 'unit' ? v.spec.parts : (recipeOf(v.spec)?.parts ?? [])
      const subject = v.kind === 'unit' ? `one ${v.spec.name}` : `one ${targetName(st, v.spec.target)}`
      const result = await answerPushback(st, judgeFor(save), subject, parts, v.missing, replies)
      adopt(save, result.state)
      save.state.stats.pushbacks++
      v.missing = result.missing
      v.pushbackRounds++
      if (v.kind === 'unit') v.spec.parts = result.parts
      else {
        const recipe = recipeOf(v.spec)
        if (recipe) recipe.parts = result.parts
      }
      await log(save.state, 'pushback', { replies, missing: result.missing, failures: result.failures })
      for (const f of result.failures) say(`  not accepted: ${f}`)
      printVerdict(save.state, v)
      break
    }
    case 'accept': {
      const v = needVerdict()
      const st = s()
      const result =
        v.kind === 'resource'
          ? acceptResource(st, v)
          : v.kind === 'strategy'
            ? acceptStrategy(st, v)
            : v.kind === 'unit'
              ? acceptUnit(st, v)
              : acceptBreakthrough(st, v)
      adopt(save, result.state)
      save.verdict = null
      await log(save.state, 'accept', { kind: v.kind, picks: v.picks, outcome: result.outcome })
      say(result.outcome.kind === 'added' ? `added: ${result.outcome.name}` : `project: ${result.outcome.project.id} bar ${result.outcome.project.bar} size ${fmt(result.outcome.project.size)}`)
      break
    }
    case 'discard':
      save.verdict = null
      say('discarded')
      break
    case 'buy': {
      const u = findUnit(s(), rest[0]!)
      if (!u) throw new Error(`No unit ${rest[0]}`)
      const n =
        rest[1] === 'max'
          ? affordable(u, findResource(s(), MONEY_ID)!.amount, moneyUse(previewWeek(structuredClone(s()))))
          : num(rest[1])
      if (n < 1) throw new Error('Can’t afford any.')
      await act('buy', { unitId: u.id, n }, (st) => actions.buyUnits(st, u.id, n))
      say(`bought ${fmtCount(n)} ${u.name}`)
      break
    }
    case 'buyres':
      await act('buy_resource', { resourceId: rest[0], n: num(rest[1]) }, (st) => actions.buyResource(st, rest[0]!, num(rest[1])))
      break
    case 'assign':
      await act('assign', { unitId: rest[0], taskId: rest[1], n: num(rest[2]) }, (st) => actions.assign(st, rest[0]!, rest[1]!, num(rest[2])))
      break
    case 'rest': {
      const task = rest[1] === 'none' ? null : rest[1]!
      await act('assign_rest', { unitId: rest[0], taskId: task }, (st) => actions.assignRest(st, rest[0]!, task))
      break
    }
    case 'all':
      await act('assign_all', { unitId: rest[0], taskId: rest[1] }, (st) => actions.assignAll(st, rest[0]!, rest[1]!))
      break
    case 'target':
      await act('build_target', { strategyId: rest[0], target: num(rest[1]) }, (st) => actions.setBuildTarget(st, rest[0]!, num(rest[1])))
      break
    case 'overclock':
      await act('overclock', { unitId: rest[0], on: rest[1] === 'on' }, (st) => actions.setOverclock(st, rest[0]!, rest[1] === 'on'))
      break
    case 'teach':
      await act('teach', { strategyId: rest[0], unitId: rest[1] }, (st) => actions.teachStrategy(st, rest[0]!, rest[1]!))
      break
    case 'next':
      await advance(save, Number(rest[0]) || 1)
      say('')
      printStatus(save.state)
      break
    default:
      throw new Error(`Unknown command "${cmd}". Try: help`)
  }
  store(slot, save)
  return 0
}

/** Runs one command. Returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  const at = argv.indexOf('--slot')
  const slot = at >= 0 ? (argv[at + 1] ?? 'claude') : 'claude'
  const args = at >= 0 ? argv.filter((_, i) => i !== at && i !== at + 1) : argv
  try {
    return await run(args, slot)
  } catch (err) {
    say(`ERROR: ${(err as Error).message}`)
    return 1
  } finally {
    console.log(out.join('\n'))
    out.length = 0
  }
}

