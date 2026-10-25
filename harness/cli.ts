/**
 * A command-line harness for playing Singularity R&D without the browser. It runs the same
 * engine and asks the real Jev, saves the game between commands, and writes the same run log
 * as the browser (logs/runs/<runId>/game.jsonl and jev.jsonl), so a harness game can be analysed
 * like any other.
 *
 *   npm run play -- help
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from 'vite'
import { CachedJudge, JudgeError, type Answers, type Judge, type JevAnswer, type Questions } from '@/ai/jev'
import * as actions from '@/engine/actions'
import * as B from '@/engine/balance'
import { alertsFor } from '@/engine/alerts'
import { runWeek } from '@/engine/cycle'
import { previewWeek } from '@/engine/economy'
import { coverBlocker, draftCover } from '@/engine/coverProposal'
import { acceptAny, judgeAny, type ProposalInput, type Verdict } from '@/engine/dispatch'
import { describeOption, optionBlocker, overflowOf } from '@/engine/createProposal'
import { createInitialState } from '@/engine/initialState'
import { computeTrait } from '@/engine/computeTraits'
import { draftMind } from '@/engine/mindProposal'
import {
  allocation,
  capOf,
  contractsFor,
  creatable,
  bestIQ,
  costShortfall,
  currentIQ,
  describeCost,
  describeDelivery,
  describeFlows,
  efficiencyWord,
  findResource,
  findSourcing,
  findUnit,
  fmt,
  fmtCount,
  openSlots,
  partsFor,
  softwareLabel,
  tasksFor,
  tierFit,
  tierLabel,
  unitCap,
  unitValueText,
  weeklyUse
} from '@/engine/model'
import {
  CREATE_PRESETS,
  COVER_PRESETS,
  MIND_PRESETS,
  RESOURCE_PRESETS,
  SOURCING_PRESETS,
  STORAGE_PRESETS,
  STRATEGY_PRESETS,
  UNIT_PRESETS
} from '@/engine/presets'
import { lossOf } from '@/engine/losses'
import { cardsFor, clockMoved, lockReason, PHASE_NAMES, weeksLeft, type Feature } from '@/engine/phase'
import { plansFor, planIdeas } from '@/engine/planPresets'
import { draftPlan } from '@/engine/planProposal'
import { goalOf, projectGoal, projectionText } from '@/engine/projection'
import { alarmLabel, alarmQuestions, expansionRiskText, RISK_BONUS, riskFrom, riskText } from '@/engine/risk'
import { resourceTrait, traitLine } from '@/engine/resourceTraits'
import { iqTag } from '@/engine/sourcingProposal'
import { describeCatch } from '@/engine/storageProposal'
import { proposalText } from '@/engine/stateText'
import { catchesOf, complicationName, draftResource, payOptions } from '@/engine/proposals'
import { draftStrategy } from '@/engine/strategyProposal'
import { TRAITS, type TraitId } from '@/engine/traits'
import type { GameState, Strategy, UpgradeTarget } from '@/engine/types'
import { draftUnit } from '@/engine/unitProposal'
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
      await runLog.append(this.runId(), 'jev', { event: 'jev', purpose, status: res.status, ms: Date.now() - started, request, response })
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
  if (save.state.version !== 16) throw new Error(`The game in slot "${slot}" is from an older version. Start a new one with: new`)
  // Saves from before repeat ideas were tracked.
  save.state.ideas ??= []
  return save
}

function store(slot: string, save: Save) {
  mkdirSync(SAVES, { recursive: true })
  writeFileSync(savePath(slot), JSON.stringify(save))
}

const log = (s: GameState, event: string, data: Record<string, unknown> = {}) =>
  runLog.append(s.runId, 'game', { event, week: s.week, harness: true, ...data })

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

const FEATURES: Feature[] = ['create', 'storage', 'upgrade', 'strategy', 'unit', 'sourcing', 'cover', 'mind', 'unit-upgrade']

/** A platform's traits with their rules. */
const computeTraitText = (ids: string[]) =>
  ids.map((id) => `${computeTrait(id).name} [${computeTrait(id).kind}] (${computeTrait(id).rule})`).join('; ')

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
    if (s.clock.length) say(`Clock: −${clockMoved(s, -1)} weeks to risk and expansions, +${clockMoved(s, 1)} from cover.`)
    say(`Invented: ${s.inventions.map((i) => `${i.icon} ${i.name}`).join(', ') || 'nothing'}`)
    return
  }
  if (p.status === 'planning') {
    say(`Make a plan: \`plans\` shows ideas; \`propose plan '<json>'\`.`)
    return
  }
  if (p.plan) say(`Plan: ${p.plan.goal}. ${p.n === 1 ? 'How' : 'Humans'}: ${p.plan.means} Fails if time runs out: ${lossOf(s).name}.`)
  const proj = projectGoal(s)
  if (proj) {
    say(
      `GOAL "${proj.goal.name}" [${proj.goal.id}] needs IQ ${proj.goal.minIQ} (${proj.iqOk ? 'OK' : `you: ${Math.round(bestIQ(s))}`}) · uses up ${describeCost(s, proj.goal.cost)}`
    )
    say(`  ${projectionText(s, proj)}${proj.week === null ? '' : ' (if you build nothing more)'}`)
  }
  if (p.firstUnit) {
    say(`FIRST UNIT waiting (designed free, tier 0, with a starter batch of ${B.STARTER_CONTRACT}): ${p.firstUnit.name}: ${p.firstUnit.description} → propose unit with "first": true`)
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
  say(`WEEK ${s.week} · Jev calls ${s.stats.jevCalls}`)
  say(
    `Best IQ ${Math.round(bestIQ(s))}${lockReason(s, 'mind') ? '' : ` · a new platform can be up to ${B.MAX_IQ_STEP} IQ smarter (steps ${B.PLATFORM_STEPS.join('/')}) and replaces this one for good`} · ` +
      (s.proposedThisWeek ? 'action TAKEN this week' : 'one action this week (a research proposal or Create)')
  )
  say('\nRESOURCES')
  for (const r of s.resources) {
    const sources = (preview.flows[r.id] ?? []).map((f) => `${f.label} ${f.amount >= 0 ? '+' : ''}${fmt(f.amount)}`).join(', ')
    const share = preview.shares[r.id]
    const wasted = preview.wasted[r.id]
    say(
      `  ${r.id} "${r.name}" tier ${r.tier} worth ${fmt(r.value)}${r.traits.length ? ` [${r.traits.map((t) => resourceTrait(t).name).join(', ')}]` : ''} · have ${fmt(r.amount)} of ${fmt(capOf(s, r))} storage · net ${fmt(net(r.id))}` +
        `${share !== undefined && share < 1 ? ` · SHORT: ${pct(share)} met` : ''}` +
        `${wasted ? ` · OVERFLOWS ${fmt(wasted)}` : ''}` +
        `${r.expansions.length ? `\n      storage: ${r.expansions.map((e) => `${e.name} +${fmt(e.added)}${e.catch ? ` (${describeCatch(s, e.catch)})` : ''}`).join('; ')}` : ''}` +
        `${sources ? `\n      ${sources}` : ''}`
    )
  }
  say('\nPLATFORM')
  for (const m of s.minds) {
    say(
      `  ${m.id} "${m.name}"${m.tier ? ` Generation ${m.tier}` : ''} IQ ${Math.round(currentIQ(m))} · hardware ${m.hardware.name} (${m.hardware.iq}) · software ${softwareLabel(m)}` +
        `${m.software.upgraded ? ` (+${m.software.iq}, its one upgrade used)` : ' (one upgrade left)'}` +
        `${m.traits.length ? `\n      traits: ${computeTraitText(m.traits)}` : ''}`
    )
  }
  if (s.units.length) {
    say('\nINDUSTRY')
    for (const u of s.units) {
      const w = preview.units[u.id]
      const { byTask, free } = allocation(s, u)
      say(`  ${u.id} "${u.name}" ${tierLabel(u.tier)} ×${fmtCount(u.count)} of ${fmtCount(unitCap(s, u.id))} allowed (built ${fmtCount(u.built)})`)
      say(
        `      upkeep ${u.upkeep.length ? describeFlows(s, u.upkeep) : 'none'} · value ${fmt(u.value)} (${unitValueText(u.value)})` +
          `${u.crew ? ` · crew ${u.crew.per} ${u.crew.unitId}` : ''}`
      )
      const contracts = contractsFor(s, u.id)
      if (!contracts.length) say('      NO SOURCING: propose sourcing to own any')
      for (const c of contracts) {
        say(
          `      contract ${c.id} "${c.name}" ${fmtCount(c.used)}/${fmtCount(c.total)}${c.risky ? ' RISKY' : ''}` +
            (c.parts.length ? ` · parts ${describeFlows(s, partsFor(u, c))} each · create up to ${fmtCount(creatable(s, c, weeklyUse(preview)))} now` : ' · made by Creates')
        )
      }
      if (u.traits.length) say(`      traits: ${traitText(u.traits)}`)
      say(
        `      upgrades done: ${s.upgrades.filter((x) => x.targetId === u.id).map((x) => x.name.split(': ').pop()).join(', ') || 'none'}`
      )
      const tasks = Object.entries(byTask).map(([t, n]) => `${t}=${fmtCount(n)}${t === u.rest ? '(rest)' : ''}`)
      say(`      tasks: ${tasks.join(', ') || 'none'}${free ? ` · ${fmtCount(free)} UNASSIGNED` : ''} · can do: ${tasksFor(s, u).join(', ') || 'nothing'}`)
      if (w && (w.unpaid || w.resting || w.built || w.lost)) {
        say(`      next week: ${w.unpaid ? `${fmtCount(w.unpaid)} unpaid (${w.unpaidFor}) ` : ''}${w.resting ? 'resting ' : ''}${w.built ? `${fmtCount(w.built)} delivered ` : ''}${w.lost ? `loses ${fmtCount(w.lost)}` : ''}`)
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
          `${st.quirk ? ` · quirk ${st.quirk}` : ''}` +
          `${strategyTags(s, st)}` +
          `${run ? ` · next week ${fmtCount(run.units)} running at ${pct(run.fraction)}${run.limitedBy ? ` (short of ${run.limitedBy})` : ''}` : ''}`
      )
    }
  }
  if (s.deliveries.length) say(`\nSTILL TO COME FROM CREATE: ${s.deliveries.map((d) => `${d.name}: ${describeDelivery(s, d)}`).join(' · ')}`)
  say('\nRESEARCH')
  if (!s.research.length) say('  none')
  for (const r of s.research) {
    const blocker = actions.researchBlocker(s, r.id)
    const e = r.effect
    const what =
      e.kind === 'sourcing'
        ? ` · a contract for ${fmt(e.sourcing.total)}, parts ${describeFlows(s, e.sourcing.parts)} each`
        : e.kind === 'storage'
          ? ` · room for ${fmt(e.expansion.added)} more${e.expansion.catch ? ` (${describeCatch(s, e.expansion.catch)})` : ''}`
          : e.kind === 'cover'
            ? ` · adds ${e.weeks} weeks before decay`
            : e.kind === 'goal'
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

/** A strategy's quality in words, as the player sees it: Jev's efficiency, and how its unit's tier fits. */
function strategyTags(s: GameState, st: Strategy): string {
  const unit = findUnit(s, st.unitId)
  const target = st.kind === 'make' ? findResource(s, st.outputId) : undefined
  const fit = unit && target ? tierFit(unit.tier, target.tier) : null
  const tags = [efficiencyWord(st), fit?.text].filter(Boolean)
  return tags.length ? ` · ${tags.join(', ')}` : ''
}

function printVerdict(s: GameState, v: Verdict) {
  say(`VERDICT (${v.kind}): plausibility ${pct(v.plausibility)} vs bar ${pct(v.bar)}`)
  if (v.rejected) say(`  REJECTED: ${v.rejected}`)
  if (v.duplicateOf) say(`  DUPLICATE of ${v.duplicateOf}`)
  if (v.repeatOf) say(`  REPEAT of ${v.repeatOf}: one step less effective`)
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
    say(`  → fails if time runs out: ${v.loss.name} (${v.loss.threat})`)
    say(`  → new resources: ${d.added.map((r) => `${r.id === d.top.id ? 'GOAL ' : ''}${r.name} (tier ${r.tier}, worth ${fmt(r.value)}, holds ${fmt(r.cap)}; ${r.traits.map((t) => resourceTrait(t).name).join(', ')})`).join(', ')}`)
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
  if (v.kind === 'create') {
    const c = v.scalars
    say(`  factors: Industry ×${fmt(c.industry)} · IQ ×${fmt(c.iq)} · Efficiency ×${fmt(c.efficiency)}${c.reach < 1 ? ` · Reach ×${fmt(c.reach)} (${c.short.toFixed(1)} tiers over)` : ''}`)
    say(`  Jev's offers [option <n>] (taking one uses this week's action):`)
    v.options.forEach((o, i) => {
      const blocked = optionBlocker(s, o)
      const over = overflowOf(s, v, o)
      say(
        `    ${i}${i === v.choice ? ' *' : ''}: ${describeOption(s, v, o)} · uses ${o.inputs.length ? describeFlows(s, o.inputs) : 'nothing'}` +
          `${blocked ? ` · CAN’T: ${blocked}` : over ? ` · ${fmt(over)} WON’T FIT in storage` : ''}`
      )
    })
    return
  }
  if (v.kind === 'sourcing') {
    say(`  contracts [option <n>]:`)
    v.options.forEach((o, i) => {
      const tag = iqTag(o.iqEfficiency)
      say(
        `    ${i}${i === v.choice ? ' *' : ''}: ${o.label}: up to ${fmt(o.total)}${o.risky ? ' RISKY' : ''} · parts ${describeFlows(s, o.parts)} each · needs IQ ${o.minIQ}, uses up ${describeCost(s, o.cost)}` +
          ` · ${expansionRiskText(o.risk)}${tag ? ` · ${tag}` : ''}`
      )
    })
    return
  }
  if (v.kind === 'storage') {
    const c = v.scalars
    say(`  factors: Industry ×${fmt(c.industry)} · IQ ×${fmt(c.iq)} · Efficiency ×${fmt(c.efficiency)}`)
    say(`  expansions [option <n>]:`)
    v.options.forEach((o, i) => {
      const tag = iqTag(o.iqEfficiency)
      say(
        `    ${i}${i === v.choice ? ' *' : ''}: ${o.label}: room for ${fmt(o.added)} more${o.risky ? ' RISKY' : ''} · ${describeCatch(s, o.catch)} · needs IQ ${o.minIQ}, uses up ${describeCost(s, o.cost)}` +
          ` · ${expansionRiskText(o.risk)} · needs ${B.HOLDERS[o.holder]![0].toLowerCase()}${o.blocked ? ' (BLOCKED at your IQ)' : ''}${tag ? ` · ${tag}` : ''}`
      )
    })
    return
  }
  if (v.kind === 'resource') {
    const r = draftResource(s, v)
    say(`  → ${r.name}: tier ${r.tier}, worth ${fmt(r.value)}, holds ${fmt(r.cap)} to start`)
    say(`  Its nature [option <n>]:`)
    v.options.forEach((ids, i) => say(`    ${i}${i === v.choice ? ' *' : ''}: ${ids.map(traitLine).join(' · ')}`))
  } else if (v.kind === 'strategy') {
    say(`  ways to do it [option <n>]:`)
    v.options.forEach((o, i) => {
      const od = draftStrategy(s, { ...v, choice: i })
      const made = `${fmt(od.strategy.amount)} ${findResource(s, od.strategy.outputId)?.name} per unit`
      say(`    ${i}${i === v.choice ? ' *' : ''}: ${od.strategy.inputs.length ? `${describeFlows(s, od.strategy.inputs)} → ` : 'no inputs → '}${made}${strategyTags(s, od.strategy)}`)
    })
    const d = draftStrategy(s, v)
    if (d.strategy.quirk) say(`  quirk ${d.strategy.quirk}`)
    say(d.minIQ ? research(d) : '  → ready at once')
  } else if (v.kind === 'unit') {
    const d = draftUnit(s, v)
    const u = d.unit
    say(v.spec.first ? `  → the plan’s first unit: designed at once, free, with a starter batch of ${B.STARTER_CONTRACT}` : research(d))
    say(`  Jev's takes [option <n>]:`)
    v.options.forEach((o, i) => {
      const od = draftUnit(s, { ...v, choice: i })
      say(
        `    ${i}${i === v.choice ? ' *' : ''}: ${tierLabel(o.tier)} · ${unitValueText(od.unit.value)} · runs on ${findResource(s, o.upkeepId)?.name} · traits: ${o.traits.length ? o.traits.map((t) => TRAITS[t].name).join(', ') : 'none'}` +
          (v.spec.first ? '' : ` · needs IQ ${od.minIQ}, uses up ${describeCost(s, od.cost)}`)
      )
    })
    say(`  → ${tierLabel(u.tier)}, value ${fmt(u.value)}, upkeep ${describeFlows(s, u.upkeep)}${v.spec.first ? '' : ' · room for none until you propose sourcing'}`)
    say(`  → traits: ${u.traits.length ? traitText(u.traits) : 'none'}`)
  } else if (v.kind === 'mind') {
    say(`  Jev's takes [option <n>]:`)
    v.options.forEach((o, i) => {
      const od = draftMind(s, { ...v, choice: i })
      say(
        `    ${i}${i === v.choice ? ' *' : ''}: ${o.step ? `+${o.step} IQ` : 'same IQ'} → IQ ${od.mind.hardware.iq} · ${computeTraitText([o.perk])} · but ${computeTraitText([o.drawback])} · needs IQ ${od.minIQ}, uses up ${describeCost(s, od.cost)}`
      )
    })
    const d = draftMind(s, v)
    say(`  → IQ ${d.mind.hardware.iq} (${d.mind.hardware.name}, ${softwareLabel(d.mind)}), replacing the current platform for good`)
  }
  const extra = catchesOf(v)
  if (extra.length) say(`  catches taken: ${extra.map((c) => complicationName(c).name).join(', ')}`)
  const pays = v.kind === 'mind' || v.kind === 'strategy' ? [] : payOptions(v).filter((p) => p.p > 0)
  if (pays.length > 1) {
    const now = v.picks.pay ?? pays[0]!.resourceId
    say(`  paid in [pick pay <resourceId>]: ${pays.map((p) => `${p.resourceId}${p.resourceId === now ? ' (chosen)' : ''} ${pct(p.p)}`).join(', ')}`)
  }
}

function printOffer(s: GameState, offer: UpgradeOffer) {
  say(`UPGRADE OPTIONS for ${offer.target.kind} ${offer.target.id} [choose <n>]`)
  offer.options.forEach((o, i) => {
    say(`  ${i + 1}. ${o.name} (Jev ${pct(o.p)}): ${describeChanges(s, offer.target, o.changes)}`)
    if (o.sizes) {
      say(`     sizes [choose ${i + 1} <size>]: ${o.sizes.map((z) => `+${z.step} IQ uses up ${describeCost(s, z.cost) || 'nothing'}`).join(' · ')}`)
      say(`     needs IQ ${o.minIQ}${o.risk ? ` · ⚠ ${riskText(o.risk, 'upgrade')}` : ''}`)
      return
    }
    say(`     ${o.tier !== undefined ? `Tier ${o.tier} technology · ` : ''}needs IQ ${o.minIQ} · uses up ${describeCost(s, o.cost)}${o.risk ? ` · ⚠ ${riskText(o.risk, 'upgrade')}` : ''}`)
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
  propose plan '{"goal":"..","means":"..","resources":[{"name":"..","description":".."}],"firstUnit":{"name":"..","description":".."}}'
                               (firstUnit only in Phase 2; Jev picks which resource the goal is built from and uses up)
  presets <resource|strategy|unit|mind|create|sourcing|storage|cover>
  propose resource '{"name":"..","description":".."}'
  propose create '{"target":{"kind":"resource","id":".."},"name":"..","description":".."}'
                               (the week's action: make something now; target kind "unit" makes units with cap. Pick an offer with option <n>)
  propose storage '{"resourceId":"..","name":"..","description":".."}'   (three expansions; pick with option <n>)
  propose strategy '{"name":"..","description":"..","unitId":"..","outputId":".."}'
                               (Jev offers three ways, each using up different resources: none allowed for tier 0-1 outputs, 1+ for tier 2, two different for tier 3+; pick with option <n>)
  propose unit '{"name":"..","description":"..","first":false}'   (Jev picks its tier, value and what it runs on)
  propose sourcing '{"unitId":"..","name":"..","description":".."}'   (a contract: how many you may own, and their parts; pick with option <n>)
  propose mind '{"name":"..","description":".."}'
                               (replaces your platform for good; Jev offers three takes, each a perk+drawback pair at its own IQ step (25-100) and payer, pick with option <n>)
  propose cover '{"name":"..","description":".."}'
  dismiss <cardId|all>         dismiss explainer cards
  verdict | pick <key> <value> | option <n> (a unit's take, a platform's perk+drawback pair, a Create offer, a contract or an expansion)
  accept | discard
  upgrade <unit|mind> <id>      ask Jev for three ways to improve it (a platform gets one software upgrade, ever)
  choose <n> [size]            take upgrade option n as research (a platform upgrade also takes a size: 25/50/75/100 IQ, default 100)
  research <researchId>        do a research now (any number a week; proposing is the week's one action)
  drop <researchId>            drop a research
  create <contractId> <n|max>   create units from a sourcing contract's parts (no action; up to its open slots)
  assign <unitId> <strategyId> <n> | rest <unitId> <strategyId|none> | all <unitId> <strategyId>
  overclock <unitId> on|off
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
      'proposes a software upgrade to itself, from IQ 100 to 150',
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
      create: CREATE_PRESETS,
      sourcing: SOURCING_PRESETS,
      storage: STORAGE_PRESETS,
      cover: COVER_PRESETS
    }[rest[0] as 'unit']
    if (!list) throw new Error('presets resource|strategy|unit|mind|create|sourcing|storage|cover')
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
        options: 'options' in v ? v.options : undefined,
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
    case 'option': {
      const v = needVerdict()
      if (!('options' in v)) throw new Error('This verdict has no options.')
      const choice = Number(rest[0])
      if (!v.options[choice]) throw new Error(`Choose 0 to ${v.options.length - 1}.`)
      v.choice = choice
      printVerdict(s(), v)
      break
    }
    case 'accept': {
      const v = needVerdict()
      const result = acceptAny(s(), v)
      adopt(save, result.state)
      save.verdict = null
      await log(save.state, 'accept', { kind: v.kind, picks: v.picks, outcome: result.outcome })
      say(result.outcome.kind === 'added' ? `added: ${result.outcome.name}` : `research: ${result.outcome.research.id} needs IQ ${result.outcome.research.minIQ}`)
      if (v.kind === 'unit' && v.spec.first) say('Next: create some from its starter batch, and give them something to do with `propose strategy`.')
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
      const step = rest[1] ? num(rest[1]) : undefined
      const result = acceptUpgrade(s(), offer, index, step)
      adopt(save, result.state)
      save.offer = null
      await log(save.state, 'accept', { kind: 'upgrade', option: offer.options[index]?.key, step, outcome: result.outcome })
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
      const c = findSourcing(s(), rest[0]!)
      const u = c && findUnit(s(), c.unitId)
      if (!c || !u) throw new Error(`No contract ${rest[0]}. Contracts are listed under each unit in status.`)
      const n = rest[1] === 'max' ? creatable(s(), c, weeklyUse(previewWeek(structuredClone(s())))) : num(rest[1])
      if (n < 1) throw new Error(openSlots(c) ? 'Can’t afford any.' : `${c.name} is full.`)
      await act('create', { sourcingId: c.id, n }, (st) => actions.createUnits(st, c.id, n))
      say(`created ${fmtCount(n)} ${u.name} from ${c.name}`)
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
