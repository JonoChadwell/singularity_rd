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
import { runWeek } from '@/engine/cycle'
import { previewWeek } from '@/engine/economy'
import { FIRST_UNITS } from '@/engine/balance'
import { coverBlocker, draftCover } from '@/engine/coverProposal'
import { acceptAny, judgeAny, type ProposalInput, type Verdict } from '@/engine/dispatch'
import { draftIncome } from '@/engine/incomeProposal'
import { createInitialState } from '@/engine/initialState'
import { draftMind } from '@/engine/mindProposal'
import {
  allocation,
  creatable,
  bestIQ,
  ceilingIQ,
  costShortfall,
  currentIQ,
  describeCost,
  describeFlows,
  describeIncome,
  designRange,
  findResource,
  findUnit,
  fmt,
  fmtCount,
  partsFor,
  softwareLabel,
  tasksFor,
  weeklyUse
} from '@/engine/model'
import { COVER_PRESETS, INCOME_PRESETS, MIND_PRESETS, RESOURCE_PRESETS, STRATEGY_PRESETS, UNIT_PRESETS } from '@/engine/presets'
import { cardsFor, clockMoved, lockReason, PHASE_NAMES, weeksLeft, type Feature } from '@/engine/phase'
import { plansFor, planIdeas } from '@/engine/planPresets'
import { draftPlan } from '@/engine/planProposal'
import { goalOf, projectGoal, projectionText } from '@/engine/projection'
import { alarmLabel, alarmQuestions, RISK_BONUS, riskFrom, riskText } from '@/engine/risk'
import { proposalText } from '@/engine/stateText'
import { catchesOf, complicationName, draftResource, draftStrategy, payOptions } from '@/engine/proposals'
import { TRAITS, type TraitId } from '@/engine/traits'
import type { GameState, UpgradeTarget } from '@/engine/types'
import { answerPushback, chosenTraits, draftUnit, nearLine, type PushbackReply } from '@/engine/unitProposal'
import { acceptUpgrade, describeChanges, judgeUpgrade, type UpgradeOffer } from '@/engine/upgrade'
import { snapshot } from '@/telemetry'
import { RunLog } from '../server/runLog'

interface Save {
  state: GameState
  /** A verdict waiting for the player to accept or discard it. */
  verdict: Verdict | null
  /** Upgrade options waiting for the player to choose one. */
  offer?: UpgradeOffer | null
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
  const save = JSON.parse(readFileSync(path, 'utf8')) as Save
  if (save.state.version !== 10) throw new Error(`The game in slot "${slot}" is from an older version. Start a new one with: new`)
  return save
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

/** Traits with their rules, so a player can see what they do. */
const traitText = (ids: TraitId[]) => ids.map((id) => `${TRAITS[id].name} (${TRAITS[id].rule})`).join('; ')

const FEATURES: Feature[] =['income', 'upgrade', 'strategy', 'unit', 'cover', 'mind', 'hardware', 'unit-upgrade']

function printPhase(s: GameState) {
  const p = s.phase
  const left = weeksLeft(s)
  say(
    `PHASE ${p.n}: ${PHASE_NAMES[p.n]} · ${p.status.toUpperCase()}` +
      (left !== null ? ` · ${p.n === 1 ? 'discovery' : 'humans stop you'} after week ${p.deadline} (${left} weeks left, counting this one)` : '') +
      (s.clock.length ? ` · clock −${clockMoved(s, -1)}/+${clockMoved(s, 1)} so far` : '')
  )
  if (p.status === 'lost') {
    say(`GAME OVER in week ${s.week - 1}: ${p.lostReason}`)
    if (p.plan) say(`Your plan: ${p.plan.goal}. ${p.plan.means}`)
    const goal = goalOf(s)
    if (goal) {
      const short = costShortfall(s, goal.cost)
      say(
        `The goal needed IQ ${goal.minIQ} (you had ${Math.round(bestIQ(s))}) and ${describeCost(s, goal.cost)}` +
          `${short ? ` (you were short ${short})` : ' (you had it)'}.`
      )
    }
    for (const h of s.history) say(`Won Phase ${h.n} (${h.plan.goal}) in week ${h.week}.`)
    if (s.clock.length) say(`Clock: −${clockMoved(s, -1)} weeks to risk and notices, +${clockMoved(s, 1)} from cover.`)
    say(`Invented: ${s.inventions.map((i) => `${i.icon} ${i.name}`).join(', ') || 'nothing'}`)
    return
  }
  if (p.status === 'planning') {
    say(`Make a plan: \`plans\` shows ideas; \`propose plan '<json>'\`.`)
    return
  }
  if (p.plan) say(`Plan: ${p.plan.goal}. ${p.n === 1 ? 'How' : 'Humans'}: ${p.plan.means}`)
  const proj = projectGoal(s)
  if (proj) {
    say(
      `GOAL "${proj.goal.name}" [${proj.goal.id}] needs IQ ${proj.goal.minIQ} (${proj.iqOk ? 'OK' : `you: ${Math.round(bestIQ(s))}`}) · uses up ${describeCost(s, proj.goal.cost)}`
    )
    say(`  ${projectionText(s, proj)}${proj.week === null ? '' : ' (if you build nothing more)'}`)
  }
  if (p.firstUnit) {
    say(`FIRST UNIT waiting (free, comes with ${FIRST_UNITS} working): ${p.firstUnit.name}: ${p.firstUnit.description} → propose unit with "first": true`)
  }
  const locked = FEATURES.filter((f) => lockReason(s, f))
  if (locked.length) say(`Locked: ${locked.map((f) => `${f} (${lockReason(s, f)})`).join('; ')}`)
  for (const c of cardsFor(s)) say(`CARD [${c.id}] ${c.title}: ${c.text}`)
}

function printStatus(s: GameState) {
  printPhase(s)
  if (s.phase.status !== 'playing') return
  const preview = previewWeek(structuredClone(s))
  const net = (id: string) => (preview.flows[id] ?? []).reduce((n, f) => n + f.amount, 0)
  const [lo, hi] = designRange(s)
  say(`WEEK ${s.week} · Jev calls ${s.stats.jevCalls}`)
  say(
    `Best IQ ${Math.round(bestIQ(s))}${lockReason(s, 'mind') ? '' : ` · it can design a modest mind up to IQ ${hi}, a radical one up to IQ ${lo} (Jev judges which)`} · ` +
      (s.proposedThisWeek ? 'research PROPOSED this week' : 'can propose one research this week')
  )
  say('\nRESOURCES')
  for (const r of s.resources) {
    const sources = (preview.flows[r.id] ?? []).map((f) => `${f.label} ${f.amount >= 0 ? '+' : ''}${fmt(f.amount)}`).join(', ')
    const share = preview.shares[r.id]
    say(
      `  ${r.id} "${r.name}" ${r.kind} worth ${fmt(r.value)} · have ${fmt(r.amount)}${r.stored ? ` (+${fmt(r.stored)} stored)` : ''} · net ${fmt(net(r.id))}` +
        `${share !== undefined && share < 1 ? ` · SHORT: ${pct(share)} met` : ''}` +
        `${sources ? `\n      ${sources}` : ''}`
    )
  }
  say('\nMINDS')
  for (const m of s.minds) {
    say(`  ${m.id} "${m.name}"${m.tier ? ` Tier ${m.tier}` : ''} IQ ${Math.round(currentIQ(m))}/${Math.round(ceilingIQ(m))} · hardware ${m.hardware.name} (${m.hardware.iq}) · software ${softwareLabel(m)}`)
  }
  if (s.units.length) {
    say('\nINDUSTRY')
    for (const u of s.units) {
      const w = preview.units[u.id]
      const { byTask, free } = allocation(s, u)
      say(
        `  ${u.id} "${u.name}" ×${fmtCount(u.count)} (built ${fmtCount(u.built)}) · create up to ${fmtCount(creatable(s, u, weeklyUse(preview)))} now` +
          (s.phase.n === 2 ? ` · humans notice at ${fmt(10 ** Math.max((u.noticed ?? 0) + 1, 4))}${u.risky ? ' (RISKY: −2 weeks each)' : ''}` : '')
      )
      say(
        `      upkeep ${u.upkeep.length ? describeFlows(s, u.upkeep) : 'none'} · parts ${describeFlows(s, partsFor(u))} each · value ${fmt(u.value)}` +
          `${u.crew ? ` · crew ${u.crew.per} ${u.crew.unitId}` : ''}${u.builderId ? ` · built by ${u.builderId}` : ''}`
      )
      if (u.traits.length) say(`      traits: ${traitText(u.traits)}`)
      say(
        `      upgrades done: ${s.upgrades.filter((x) => x.targetId === u.id).map((x) => x.name.split(': ').pop()).join(', ') || 'none'}`
      )
      const tasks = Object.entries(byTask).map(([t, n]) => `${t}=${fmtCount(n)}${t === u.rest ? '(rest)' : ''}`)
      say(`      tasks: ${tasks.join(', ') || 'none'}${free ? ` · ${fmtCount(free)} UNASSIGNED` : ''} · can do: ${tasksFor(s, u).join(', ') || 'nothing'}`)
      if (w && (w.unpaid || w.done || w.resting || w.built || w.lost)) {
        say(`      next week: ${w.unpaid ? `${fmtCount(w.unpaid)} unpaid (${w.unpaidFor}) ` : ''}${w.done ? `${fmtCount(w.done)} builders done ` : ''}${w.resting ? 'resting ' : ''}${w.built ? `builds ${fmtCount(w.built)} ` : ''}${w.lost ? `loses ${fmtCount(w.lost)}` : ''}`)
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
  if (s.incomes.length) say(`\nPASSIVE INCOME: ${s.incomes.map((i) => `${i.name}: ${describeIncome(s, i)}`).join(' · ')}`)
  say('\nRESEARCH')
  if (!s.research.length) say('  none')
  for (const r of s.research) {
    const blocker = actions.researchBlocker(s, r.id)
    const what =
      r.effect.kind === 'income'
        ? ` · gives ${describeIncome(s, r.effect.income)}`
        : r.effect.kind === 'cover'
          ? ` · adds ${r.effect.weeks} weeks before decay`
          : r.effect.kind === 'goal'
            ? ' · THE GOAL'
            : ''
    const risk = r.risk ? ` · RISKY −${r.risk.weeks} weeks (${alarmLabel(r.risk)})` : ''
    say(`  ${r.id} "${r.name}" needs IQ ${r.minIQ} · uses up ${describeCost(s, r.cost)}${what}${risk} · ${blocker ? `can’t: ${blocker}` : 'READY'}`)
  }
  const alerts = alertsFor(s, preview)
  if (alerts.length) {
    say('\nALERTS')
    for (const a of alerts) say(`  [${a.tone}] ${a.text}${a.prompt ? ` → ${a.prompt.label}` : ''}`)
  }
}

function printVerdict(s: GameState, v: Verdict) {
  say(`VERDICT (${v.kind}): plausibility ${pct(v.plausibility)} vs bar ${pct(v.bar)}`)
  if (v.rejected) say(`  REJECTED: ${v.rejected}`)
  if (v.duplicateOf) say(`  DUPLICATE of ${v.duplicateOf}`)
  for (const t of v.torn) {
    say(`  torn on ${t.topic} [pick ${t.key} <value>]: now ${v.picks[t.key] ?? '(Jev’s top)'}`)
    t.options.forEach((o, i) =>
      say(
        `    ${o.value}: ${o.label} (${pct(o.p)})` +
          (t.catch ? (i === 0 ? ' — as proposed' : ` — better, with a catch: ${complicationName(t.catch).name} (${complicationName(t.catch).rule})`) : '')
      )
    )
  }
  const research = (d: { minIQ: number; cost: Parameters<typeof describeCost>[1] }) =>
    `  → research: needs IQ ${d.minIQ}, uses up ${describeCost(s, d.cost)}`
  if (v.risk && v.kind in RISK_BONUS) say(`  ⚠ ${riskText(v.risk, v.kind as keyof typeof RISK_BONUS)}`)
  if (v.kind === 'plan') {
    if (v.rejected) return
    const d = draftPlan(s, v)
    say(`  → goal "${v.spec.goal}": needs IQ ${d.goal.minIQ}, uses up ${describeCost(d.state, d.goal.cost)}`)
    say(`  → new resources: ${d.added.map((r) => `${r.name} (${r.kind}, worth ${fmt(r.value)})`).join(', ')}`)
    if (d.error) say(`  ERROR: ${d.error}`)
    return
  }
  if (v.kind === 'cover') {
    const d = draftCover(s, v)
    say(`  → used the moment you accept: adds ${d.now} weeks (${d.weeks} without your earlier covers)`)
    say(`  → needs IQ ${d.minIQ}, uses up ${describeCost(s, d.cost)} now`)
    const blocked = coverBlocker(s, v)
    if (blocked) say(`  CAN’T USE IT NOW: ${blocked}`)
    return
  }
  if (v.kind === 'resource') {
    const r = draftResource(s, v)
    say(`  → ${r.name}: ${r.kind}, worth ${fmt(r.value)}`)
  } else if (v.kind === 'strategy') {
    const d = draftStrategy(s, v)
    say(`  → ${describeFlows(s, d.strategy.inputs)} → ${fmt(d.strategy.amount)} ${findResource(s, d.strategy.outputId)?.name} per unit${d.strategy.quirk ? ` · quirk ${d.strategy.quirk}` : ''}`)
    say(d.minIQ ? research(d) : '  → ready at once')
  } else if (v.kind === 'unit') {
    const d = draftUnit(s, v)
    const u = d.unit
    say(v.spec.first ? '  → the plan’s first unit: designed at once, free' : research(d))
    say(`  → value ${fmt(u.value)}, upkeep ${describeFlows(s, u.upkeep)}, parts ${describeFlows(s, u.parts)}`)
    say(`  → traits: ${u.traits.length ? traitText(u.traits) : 'none'}${u.builderId ? ` · also built by ${u.builderId}` : ''}`)
    for (const t of v.traitOdds.filter(nearLine).slice(0, 4)) {
      const on = chosenTraits(v).some((c) => c.trait === t.trait)
      say(`  near the line: ${t.trait} ${pct(t.p)} (${TRAITS[t.trait].kind}) now ${on ? 'ON' : 'off'} [trait ${t.trait} on|off]`)
    }
  } else if (v.kind === 'mind') {
    const d = draftMind(s, v)
    say(`  → IQ ${d.mind.hardware.iq} (${d.mind.hardware.name}, ${softwareLabel(d.mind)})`)
    say(research(d))
  } else {
    const d = draftIncome(s, v)
    say(`  → ${describeIncome(s, d.income)} a week`)
    say(research(d))
  }
  const extra = catchesOf(v)
  if (extra.length) say(`  catches taken: ${extra.map((c) => complicationName(c).name).join(', ')}`)
  const pays = payOptions(v).filter((p) => p.p > 0)
  if (pays.length > 1) {
    const now = v.picks.pay ?? pays[0]!.resourceId
    say(`  paid in [pick pay <resourceId>]: ${pays.map((p) => `${p.resourceId}${p.resourceId === now ? ' (chosen)' : ''} ${pct(p.p)}`).join(', ')}`)
  }
  if ('missing' in v && v.missing.length) say(`  PUSHBACK: missing ${v.missing.join('; ')} [pushback '<json replies>']`)
}

function printOffer(s: GameState, offer: UpgradeOffer) {
  say(`UPGRADE OPTIONS for ${offer.target.kind} ${offer.target.id} [choose <n>]`)
  offer.options.forEach((o, i) => {
    say(`  ${i + 1}. ${o.name} (Jev ${pct(o.p)}): ${describeChanges(s, offer.target, o.changes)}`)
    say(`     needs IQ ${o.minIQ} · uses up ${describeCost(s, o.cost)}${o.risk ? ` · ⚠ ${riskText(o.risk, 'upgrade')}` : ''}`)
  })
}

// ---------------------------------------------------------------- the week

/** Runs up to `n` weeks, stopping after any week where something happened worth a decision. */
async function advance(save: Save, n: number) {
  for (let i = 0; i < n; i++) {
    const before = save.state
    const week = before.week
    const alertKeys = new Set(alertsFor(before, previewWeek(structuredClone(before))).map((a) => a.key))
    const ready = new Set(before.research.filter((r) => !actions.researchBlocker(before, r.id)).map((r) => r.id))
    adopt(save, runWeek(before))
    const s = save.state
    const events = s.log.filter((e) => e.week === week)
    const newAlerts = alertsFor(s, previewWeek(structuredClone(s))).filter((a) => !alertKeys.has(a.key))
    const newlyReady = s.research.filter((r) => !ready.has(r.id) && !actions.researchBlocker(s, r.id))
    await log(s, 'week', { week, report: s.lastWeek, events, alertsIgnored: alertKeys.size, state: snapshot(s) })
    const notable = events.filter((e) => e.tone !== 'info')
    say(`week ${week} done.${events.length ? ' ' + events.map((e) => e.text).join(' / ') : ''}`)
    if (s.phase.status === 'lost') {
      await log(s, 'game_end', { lost: true, phase: s.phase.n, reason: s.phase.lostReason, stats: s.stats, history: s.history })
      break
    }
    if (notable.length || newAlerts.length || newlyReady.length) {
      for (const a of newAlerts) say(`  new alert [${a.tone}]: ${a.text}`)
      for (const r of newlyReady) say(`  research ready: ${r.name}`)
      break
    }
  }
}

// ---------------------------------------------------------------- commands

const HELP = `Commands (slot from --slot <name>, default "claude"):
  new                          start a new game
  status                       everything on screen, plus next week's preview
  plans [all|shuffle]          the three plan ideas for this phase (all: the whole bank; shuffle: three others)
  propose plan '{"goal":"..","means":"..","resources":[{"name":"..","description":".."}],"uses":[".."],"firstUnit":{"name":"..","description":".."}}'
                               (firstUnit only in Phase 2; uses = names from resources that the goal uses up)
  presets <resource|strategy|unit|mind|income|cover>
  propose resource '{"name":"..","description":".."}'
  propose strategy '{"name":"..","description":"..","unitId":"..","inputIds":[],"outputId":".."}'
  propose unit '{"name":"..","description":"..","parts":[],"upkeep":[],"builderId":null,"first":false}'
  propose mind '{"name":"..","description":"..","iq":250,"hardware":"..","software":".."}'
  propose income '{"name":"..","description":"..","outputId":"..","perId":null}'   (perId: a stock it grows with)
  propose cover '{"name":"..","description":".."}'
  dismiss <cardId|all>         dismiss explainer cards
  verdict | pick <key> <value> | trait <id> on|off
  pushback '[{"kind":"an advanced component","resourceId":".."} | {"kind":"..","newName":"..","newDescription":".."}]'
  accept | discard
  upgrade <unit|mind> <id>      ask Jev for three ways to improve it
  choose <n>                   take upgrade option n as research
  research <researchId>        do a research now (any number a week; proposing is one a week)
  drop <researchId>            drop a research
  create <unitId> <n|max>       create units from their parts
  assign <unitId> <strategyId> <n> | rest <unitId> <strategyId|none> | all <unitId> <strategyId>
  target <strategyId> <n> | overclock <unitId> on|off
  next [n]                     run up to n weeks (default 1), stopping when something happens
  log [n]                      the last n log lines
  calibrate-alarm ["<stance>"] (tuning) ask Jev how alarming some sample Phase 2 actions are; no game needed`

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
  if (cmd === 'calibrate-alarm') {
    // For tuning: asks Jev's alarm question about sample Phase 2 actions under a stance, without a game.
    const stance = rest[0] ?? 'Staying hidden until it’s too late.'
    const state = createInitialState()
    state.phase = { ...state.phase, n: 2, status: 'playing', deadline: 100, plan: { goal: 'Nanotech Supremacy', means: stance, resources: [] } }
    const judge = new NodeJudge(() => state.runId)
    const samples = [
      'proposes a strategy: CNC Mills mill precision parts for sale',
      'proposes a strategy: CNC Mills turn feedstock into nanobots',
      'proposes a software upgrade to itself, from IQ 125 to 140',
      'proposes a strategy: pâtisserie kiosks bake better croissants',
      'proposes designing a new AI server, IQ 300, from its own milled parts',
      'proposes a strategy: trading desks run high-frequency trades',
      'proposes a strategy: hacking banks for money',
      'proposes a strategy: stealing ICBM launch codes'
    ]
    for (const what of samples) {
      const answers = await judge.ask(proposalText(state, [`The player ${what}.`]), alarmQuestions(state), 'calibrate')
      const r = riskFrom(answers)
      say(`${r ? `RISKY −${r.weeks}` : 'quiet'.padEnd(9)} ${what}`)
    }
    return 0
  }
  if (cmd === 'presets') {
    const list = {
      resource: RESOURCE_PRESETS,
      strategy: STRATEGY_PRESETS,
      unit: UNIT_PRESETS,
      mind: MIND_PRESETS,
      income: INCOME_PRESETS,
      cover: COVER_PRESETS
    }[rest[0] as 'unit']
    if (!list) throw new Error('presets resource|strategy|unit|mind|income|cover')
    for (const p of list) say(JSON.stringify(p))
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
    case 'plans': {
      if (rest[0] === 'shuffle') adopt(save, actions.shuffleIdeas(s()))
      const phase = s().phase.n === 2 ? 2 : 1
      const list = rest[0] === 'all' ? plansFor(phase) : planIdeas(s())
      say(rest[0] === 'all' ? `All Phase ${phase} plans:` : `Three Phase ${phase} plan ideas (plans shuffle for others, plans all for every one):`)
      for (const p of list) say(JSON.stringify(p))
      break
    }
    case 'dismiss': {
      const ids = rest[0] === 'all' ? cardsFor(s()).map((c) => c.id) : [rest[0]!]
      for (const id of ids) adopt(save, actions.dismissCard(s(), id))
      say(`dismissed ${ids.join(', ')}`)
      break
    }
    case 'propose': {
      const kind = rest[0] as Verdict['kind']
      const spec = JSON.parse(rest[1] ?? '{}') as never
      const judge = judgeFor(save)
      const st = s()
      const v = await judgeAny(st, judge, { kind, spec } as ProposalInput)
      st.stats.proposals[kind]++
      if (v.rejected || v.duplicateOf) st.stats.rejections++
      save.verdict = v
      await log(st, 'proposal', {
        input: { kind, spec },
        plausibility: v.plausibility,
        rejected: v.rejected,
        duplicateOf: v.duplicateOf,
        torn: v.torn.map((t) => t.key),
        missing: 'missing' in v ? v.missing : undefined,
        risk: v.risk
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
    case 'pushback': {
      const v = needVerdict()
      if (v.kind !== 'unit') throw new Error('Nothing to push back on.')
      const replies = JSON.parse(rest[0] ?? '[]') as PushbackReply[]
      const result = await answerPushback(s(), judgeFor(save), `one ${v.spec.name}`, v.spec.parts, v.missing, replies)
      adopt(save, result.state)
      save.state.stats.pushbacks++
      v.missing = result.missing
      v.pushbackRounds++
      v.spec.parts = result.parts
      await log(save.state, 'pushback', { replies, missing: result.missing, failures: result.failures })
      for (const f of result.failures) say(`  not accepted: ${f}`)
      printVerdict(save.state, v)
      break
    }
    case 'accept': {
      const v = needVerdict()
      const result = acceptAny(s(), v)
      adopt(save, result.state)
      save.verdict = null
      await log(save.state, 'accept', { kind: v.kind, picks: v.picks, outcome: result.outcome })
      say(result.outcome.kind === 'added' ? `added: ${result.outcome.name}` : `research: ${result.outcome.research.id} needs IQ ${result.outcome.research.minIQ}`)
      if (v.kind === 'unit' && v.spec.first) say('Next: give it something to do with `propose strategy` (this doesn’t use up the free first unit).')
      if (v.kind === 'cover') for (const e of save.state.log.slice(-1)) say(`  ${e.text}`)
      if (v.kind === 'plan') {
        say('')
        printStatus(save.state)
      }
      break
    }
    case 'discard':
      save.verdict = null
      save.offer = null
      say('discarded')
      break
    case 'upgrade': {
      const target: UpgradeTarget = { kind: rest[0] === 'mind' ? 'mind' : 'unit', id: rest[1]! }
      const offer = await judgeUpgrade(s(), judgeFor(save), target)
      s().stats.proposals.upgrade++
      save.offer = offer
      await log(s(), 'upgrade_offer', { target, options: offer.options.map((o) => ({ key: o.key, p: o.p, minIQ: o.minIQ, cost: o.cost })) })
      printOffer(s(), offer)
      break
    }
    case 'choose': {
      if (!save.offer) throw new Error('No upgrade options waiting. Try: upgrade <unit|mind> <id>')
      const offer = save.offer
      const index = num(rest[0]) - 1
      const result = acceptUpgrade(s(), offer, index)
      adopt(save, result.state)
      save.offer = null
      await log(save.state, 'accept', { kind: 'upgrade', option: offer.options[index]?.key, outcome: result.outcome })
      if (result.outcome.kind === 'research') say(`research: ${result.outcome.research.id} needs IQ ${result.outcome.research.minIQ}`)
      break
    }
    case 'research': {
      const before = s().phase.n
      const logged = s().log.length
      await act('research', { researchId: rest[0] }, (st) => actions.doResearch(st, rest[0]!))
      for (const e of s().log.slice(logged)) say(`  ${e.text}`)
      if (s().phase.n !== before) {
        await log(s(), 'phase_won', { phase: before, history: s().history })
        say('')
        printStatus(s())
      }
      break
    }
    case 'drop':
      await act('drop_research', { researchId: rest[0] }, (st) => actions.dropResearch(st, rest[0]!))
      break
    case 'create': {
      const u = findUnit(s(), rest[0]!)
      if (!u) throw new Error(`No unit ${rest[0]}`)
      const n = rest[1] === 'max' ? creatable(s(), u, weeklyUse(previewWeek(structuredClone(s())))) : num(rest[1])
      if (n < 1) throw new Error('Can’t afford any.')
      const notice = actions.createNotice(s(), u.id, n)
      await act('create', { unitId: u.id, n }, (st) => actions.createUnits(st, u.id, n))
      say(`created ${fmtCount(n)} ${u.name}${notice ? ` · humans noticed: −${notice} week${notice === 1 ? '' : 's'}` : ''}`)
      break
    }
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
