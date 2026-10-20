import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import { CachedJudge, checkJevHealth, JevJudge, type Judge } from '@/ai/jev'
import * as actions from '@/engine/actions'
import { alertsFor } from '@/engine/alerts'
import { runWeek } from '@/engine/cycle'
import { acceptAny, judgeAny, type ProposalInput, type Verdict } from '@/engine/dispatch'
import { previewWeek } from '@/engine/economy'
import { createInitialState } from '@/engine/initialState'
import { cardsFor } from '@/engine/phase'
import { projectGoal } from '@/engine/projection'
import type { Outcome } from '@/engine/proposals'
import type { GameState, UpgradeTarget } from '@/engine/types'
import { answerPushback, type PushbackReply, type UnitVerdict } from '@/engine/unitProposal'
import { acceptUpgrade, judgeUpgrade, type UpgradeOffer } from '@/engine/upgrade'
import { logEvent, snapshot } from '@/telemetry'

export type { ProposalInput, Verdict }

const SAVE_KEY = 'singularity-rd/save/v10'

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    const parsed = raw ? (JSON.parse(raw) as GameState) : null
    return parsed?.version === 10 ? parsed : null
  } catch {
    return null
  }
}

function save(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    // Saving is a convenience; the game works without it.
  }
}

export type JevStatus =
  | { kind: 'checking' }
  | { kind: 'ready'; model: string }
  | { kind: 'unconfigured' }
  | { kind: 'error'; message: string }

export const useGameStore = defineStore('game', () => {
  const loaded = load()
  const state = ref<GameState>(loaded ?? createInitialState())
  const raw = () => toRaw(state.value)
  let judge: Judge = new CachedJudge(
    new JevJudge(() => state.value.runId),
    () => raw().jevCache,
    () => raw().stats.jevCalls++
  )
  const busy = ref(false)
  const jev = ref<JevStatus>({ kind: 'checking' })
  const lastError = ref('')

  watch(state, save, { deep: true })
  const log = (event: string, data: Record<string, unknown> = {}) =>
    logEvent(state.value.runId, event, { week: state.value.week, ...data })
  if (!loaded) log('game_start', { state: snapshot(state.value) })

  const canPropose = computed(() => jev.value.kind === 'ready' && !busy.value)
  /** Next week, exactly, if nothing changes. The JSON round-trip reads every field, so Vue
   *  recomputes on any change, and yields a plain copy. */
  const preview = computed(() => previewWeek(JSON.parse(JSON.stringify(state.value)) as GameState))
  const alerts = computed(() => alertsFor(state.value, preview.value))
  const cards = computed(() => cardsFor(state.value))
  /** When the goal would be affordable at today's rates. Runs weeks ahead on a copy. */
  const projection = computed(() => projectGoal(JSON.parse(JSON.stringify(state.value)) as GameState))

  /** Takes a new state, keeping Jev's answers and call count from the current one. */
  function adopt(next: GameState) {
    next.jevCache = raw().jevCache
    next.stats.jevCalls = raw().stats.jevCalls
    state.value = next
  }

  function act(name: string, data: Record<string, unknown>, fn: (s: GameState) => GameState): boolean {
    lastError.value = ''
    try {
      adopt(fn(raw()))
      log('action', { action: name, ...data })
      return true
    } catch (err) {
      lastError.value = (err as Error).message
      return false
    }
  }

  async function checkJev() {
    jev.value = { kind: 'checking' }
    try {
      const health = await checkJevHealth()
      jev.value = health.configured ? { kind: 'ready', model: health.model } : { kind: 'unconfigured' }
    } catch (err) {
      jev.value = { kind: 'error', message: (err as Error).message }
    }
  }

  function nextWeek() {
    lastError.value = ''
    const week = state.value.week
    try {
      adopt(runWeek(raw()))
    } catch (err) {
      lastError.value = (err as Error).message
      return
    }
    const s = state.value
    if (s.phase.status === 'lost') log('game_end', { lost: true, phase: s.phase.n, reason: s.phase.lostReason, stats: s.stats })
    log('week', {
      week,
      report: s.lastWeek,
      events: s.log.filter((e) => e.week === week),
      alertsIgnored: alerts.value.length,
      state: snapshot(s)
    })
  }

  const createUnits = (unitId: string, n: number) =>
    act('create', { unitId, n }, (s) => actions.createUnits(s, unitId, n))
  const assign = (unitId: string, taskId: string, n: number) =>
    act('assign', { unitId, taskId, n }, (s) => actions.assign(s, unitId, taskId, n))
  const assignRest = (unitId: string, taskId: string | null) =>
    act('assign_rest', { unitId, taskId }, (s) => actions.assignRest(s, unitId, taskId))
  const assignAll = (unitId: string, taskId: string) =>
    act('assign_all', { unitId, taskId }, (s) => actions.assignAll(s, unitId, taskId))
  const setBuildTarget = (strategyId: string, target: number) =>
    act('build_target', { strategyId, target }, (s) => actions.setBuildTarget(s, strategyId, target))
  const setOverclock = (unitId: string, on: boolean) =>
    act('overclock', { unitId, on }, (s) => actions.setOverclock(s, unitId, on))
  const research = (researchId: string) => {
    const before = state.value.phase.n
    const done = act('research', { researchId }, (s) => actions.doResearch(s, researchId))
    if (done && state.value.phase.n !== before) log('phase_won', { phase: before, history: state.value.history })
    return done
  }
  const dismissCard = (id: string) => act('dismiss_card', { id }, (s) => actions.dismissCard(s, id))
  const shuffleIdeas = () => act('shuffle_ideas', {}, (s) => actions.shuffleIdeas(s))
  const dropResearch = (researchId: string) =>
    act('drop_research', { researchId }, (s) => actions.dropResearch(s, researchId))

  /** Asks Jev about a proposal. Returns its verdict for the player to review. */
  async function propose(reactiveInput: ProposalInput): Promise<Verdict | undefined> {
    if (!canPropose.value) return
    busy.value = true
    lastError.value = ''
    const input = JSON.parse(JSON.stringify(reactiveInput)) as ProposalInput
    try {
      const verdict = await judgeAny(raw(), judge, input)
      state.value.stats.proposals[input.kind]++
      if (verdict.rejected || verdict.duplicateOf) state.value.stats.rejections++
      log('proposal', {
        input,
        plausibility: verdict.plausibility,
        rejected: verdict.rejected,
        duplicateOf: verdict.duplicateOf,
        torn: verdict.torn.map((t) => t.key),
        missing: 'missing' in verdict ? verdict.missing : undefined,
        risk: verdict.risk
      })
      return verdict
    } catch (err) {
      lastError.value = (err as Error).message
      log('error', { action: 'proposal', input, message: lastError.value })
    } finally {
      busy.value = false
    }
  }

  /** Accepts a verdict, with the player's picks. */
  function accept(reactiveVerdict: Verdict): Outcome | undefined {
    lastError.value = ''
    try {
      // A plain copy, so no reactive proxies end up inside the game state.
      const verdict = JSON.parse(JSON.stringify(reactiveVerdict)) as Verdict
      const result = acceptAny(raw(), verdict)
      adopt(result.state)
      log('accept', { kind: verdict.kind, picks: verdict.picks, outcome: result.outcome })
      return result.outcome
    } catch (err) {
      lastError.value = (err as Error).message
    }
  }

  /** Asks Jev for three ways to improve a unit or mind. */
  async function requestUpgrade(target: UpgradeTarget): Promise<UpgradeOffer | undefined> {
    if (!canPropose.value) return
    busy.value = true
    lastError.value = ''
    try {
      const offer = await judgeUpgrade(raw(), judge, target)
      state.value.stats.proposals.upgrade++
      log('upgrade_offer', { target, options: offer.options.map((o) => ({ key: o.key, p: o.p, minIQ: o.minIQ, cost: o.cost })) })
      return offer
    } catch (err) {
      lastError.value = (err as Error).message
      log('error', { action: 'upgrade', target, message: lastError.value })
    } finally {
      busy.value = false
    }
  }

  /** Takes one of Jev's upgrade options as research. */
  function chooseUpgrade(reactiveOffer: UpgradeOffer, index: number): Outcome | undefined {
    lastError.value = ''
    try {
      const offer = JSON.parse(JSON.stringify(reactiveOffer)) as UpgradeOffer
      const result = acceptUpgrade(raw(), offer, index)
      adopt(result.state)
      log('accept', { kind: 'upgrade', option: offer.options[index]?.key, outcome: result.outcome })
      return result.outcome
    } catch (err) {
      lastError.value = (err as Error).message
    }
  }

  /** One pushback round. Returns the updated verdict and any replies Jev didn't accept. */
  async function pushback(
    verdict: UnitVerdict,
    replies: PushbackReply[]
  ): Promise<{ verdict: UnitVerdict; failures: string[] } | undefined> {
    if (!canPropose.value) return
    busy.value = true
    lastError.value = ''
    try {
      const s = raw()
      const result = await answerPushback(s, judge, `one ${verdict.spec.name}`, verdict.spec.parts, verdict.missing, replies)
      adopt(result.state)
      state.value.stats.pushbacks++
      const next = JSON.parse(JSON.stringify(verdict)) as UnitVerdict
      next.missing = result.missing
      next.pushbackRounds++
      next.spec.parts = result.parts
      log('pushback', { replies, missing: result.missing, failures: result.failures })
      return { verdict: next, failures: result.failures }
    } catch (err) {
      lastError.value = (err as Error).message
    } finally {
      busy.value = false
    }
  }

  /** Swaps the proposal judge (used by tests). Keeps the cache. */
  function setJudge(next: Judge) {
    judge = new CachedJudge(next, () => raw().jevCache, () => raw().stats.jevCalls++)
  }

  function newGame() {
    log('game_abandoned', { stats: state.value.stats })
    state.value = createInitialState()
    lastError.value = ''
    log('game_start', { state: snapshot(state.value) })
  }

  return {
    state,
    busy,
    jev,
    lastError,
    canPropose,
    preview,
    alerts,
    checkJev,
    nextWeek,
    createUnits,
    assign,
    assignRest,
    assignAll,
    setBuildTarget,
    setOverclock,
    research,
    dropResearch,
    dismissCard,
    shuffleIdeas,
    cards,
    projection,
    propose,
    accept,
    requestUpgrade,
    chooseUpgrade,
    pushback,
    setJudge,
    newGame
  }
})
