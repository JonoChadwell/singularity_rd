import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import { CachedJudge, checkJevHealth, JevJudge, type JevExchange, type Judge } from '@/ai/jev'
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
import { applyUpgrade, applyVerdict, bankUpgrade, bankVerdict, type BankableVerdict } from '@/engine/banking'
import { acceptUpgrade, judgeUpgrade, type UpgradeOffer } from '@/engine/upgrade'
import { describeError, logEvent, snapshot, type LogStream } from '@/telemetry'

export type { ProposalInput, Verdict }

const SAVE_KEY = 'singularity-rd/save/v20'

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    const parsed = raw ? (JSON.parse(raw) as GameState) : null
    if (parsed?.version !== 20) return null
    // Saves from before repeat ideas were tracked.
    parsed.ideas ??= []
    return parsed
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
  /** Jev's exchanges for each verdict or upgrade offer, for its Judgement Report. Not saved. */
  const reports = new WeakMap<object, JevExchange[]>()
  /** The exchanges of the judgement running now, if any. */
  let collecting: JevExchange[] | null = null
  const cachedJudge = (inner: Judge) =>
    new CachedJudge(
      inner,
      () => raw().jevCache,
      () => raw().stats.jevCalls++,
      (x) => collecting?.push(x)
    )
  let judge: Judge = cachedJudge(new JevJudge(() => state.value.runId))
  /** Runs one judgement, filing every Jev exchange it made under what it returns. */
  async function judged<T extends object>(fn: () => Promise<T>): Promise<T> {
    const exchanges: JevExchange[] = []
    collecting = exchanges
    try {
      const result = await fn()
      reports.set(result, exchanges)
      return result
    } finally {
      collecting = null
    }
  }
  /** The Jev exchanges behind a verdict or upgrade offer: none for one judged before this page loaded. */
  const reportFor = (judgement: object): JevExchange[] => reports.get(toRaw(judgement)) ?? []
  const busy = ref(false)
  const jev = ref<JevStatus>({ kind: 'checking' })
  const lastError = ref('')

  watch(state, save, { deep: true })
  /** Logs to one stream of this run's log, stamped with the week. */
  const logTo = (stream: LogStream, event: string, data: Record<string, unknown> = {}) =>
    logEvent(state.value.runId, stream, event, { week: state.value.week, ...data })
  const log = (event: string, data: Record<string, unknown> = {}) => logTo('game', event, data)
  /** An action that threw. The player sees `lastError`; the errors stream keeps the stack. */
  function fail(action: string, err: unknown, data: Record<string, unknown> = {}) {
    lastError.value = (err as Error)?.message ?? String(err)
    logTo('errors', 'action_failed', { action, ...data, error: describeError(err) })
  }
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
      fail(name, err, data)
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
      logTo('errors', 'jev_health_failed', { error: describeError(err) })
    }
  }

  function nextWeek() {
    lastError.value = ''
    const week = state.value.week
    try {
      adopt(runWeek(raw()))
    } catch (err) {
      fail('next_week', err)
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

  const createUnits = (sourcingId: string, n: number) =>
    act('create', { sourcingId, n }, (s) => actions.createUnits(s, sourcingId, n))
  const buildDepots = (depotId: string, n: number) =>
    act('build_depots', { depotId, n }, (s) => actions.buildDepots(s, depotId, n))
  const assign = (unitId: string, taskId: string, n: number) =>
    act('assign', { unitId, taskId, n }, (s) => actions.assign(s, unitId, taskId, n))
  const assignRest = (unitId: string, taskId: string | null) =>
    act('assign_rest', { unitId, taskId }, (s) => actions.assignRest(s, unitId, taskId))
  const assignAll = (unitId: string, taskId: string) =>
    act('assign_all', { unitId, taskId }, (s) => actions.assignAll(s, unitId, taskId))
  const setOverclock = (unitId: string, on: boolean) =>
    act('overclock', { unitId, on }, (s) => actions.setOverclock(s, unitId, on))
  const research = (researchId: string) => {
    const before = state.value.phase.n
    const done = act('research', { researchId }, (s) => actions.doResearch(s, researchId))
    if (done && state.value.phase.n !== before) log('phase_won', { phase: before, history: state.value.history })
    return done
  }
  /** For testing: wins the phase without meeting its goal's IQ or cost. */
  const skipGoal = (researchId: string) => {
    const before = state.value.phase.n
    const done = act('skip_goal', { researchId }, (s) => actions.skipGoal(s, researchId))
    if (done && state.value.phase.n !== before) log('phase_won', { phase: before, history: state.value.history, skipped: true })
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
      const verdict = await judged(() => judgeAny(raw(), judge, input))
      state.value.stats.proposals[input.kind]++
      if (verdict.rejected || verdict.duplicateOf) state.value.stats.rejections++
      log('proposal', {
        input,
        plausibility: verdict.plausibility,
        rejected: verdict.rejected,
        duplicateOf: verdict.duplicateOf,
        torn: verdict.torn.map((t) => t.key),
        options: 'options' in verdict ? verdict.options : undefined,
        risk: verdict.risk
      })
      return verdict
    } catch (err) {
      fail('proposal', err, { input })
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
      fail('accept', err, { kind: reactiveVerdict.kind })
    }
  }

  /** Saves a verdict's options to Research (all of them, or just `only`), or with `now`, researches that one at once. */
  function bank(reactiveVerdict: BankableVerdict, only?: number, now = false): Outcome | undefined {
    lastError.value = ''
    try {
      const verdict = JSON.parse(JSON.stringify(reactiveVerdict)) as BankableVerdict
      const result = now ? applyVerdict(raw(), verdict, only!) : bankVerdict(raw(), verdict, only)
      adopt(result.state)
      log('accept', { kind: verdict.kind, banked: only ?? 'all', now, outcome: result.outcome })
      return result.outcome
    } catch (err) {
      fail('bank', err, { kind: reactiveVerdict.kind })
    }
  }

  /** The same for an upgrade offer. */
  function bankOffer(reactiveOffer: UpgradeOffer, only?: number, now = false): Outcome | undefined {
    lastError.value = ''
    try {
      const offer = JSON.parse(JSON.stringify(reactiveOffer)) as UpgradeOffer
      const result = now ? applyUpgrade(raw(), offer, only!) : bankUpgrade(raw(), offer, only)
      adopt(result.state)
      log('accept', { kind: 'upgrade', banked: only ?? 'all', now, outcome: result.outcome })
      return result.outcome
    } catch (err) {
      fail('bank_upgrade', err, { index: only })
    }
  }

  /** Asks Jev for three ways to improve a unit or mind. */
  async function requestUpgrade(target: UpgradeTarget): Promise<UpgradeOffer | undefined> {
    if (!canPropose.value) return
    busy.value = true
    lastError.value = ''
    try {
      const offer = await judged(() => judgeUpgrade(raw(), judge, target))
      state.value.stats.proposals.upgrade++
      log('upgrade_offer', { target, options: offer.options.map((o) => ({ key: o.key, p: o.p, minIQ: o.minIQ, cost: o.cost })) })
      return offer
    } catch (err) {
      fail('upgrade', err, { target })
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
      log('accept', { kind: 'upgrade', option: offer.options[index]?.key, step: offer.options[index]?.step, outcome: result.outcome })
      return result.outcome
    } catch (err) {
      fail('choose_upgrade', err, { index })
    }
  }

  /** Swaps the proposal judge (used by tests). Keeps the cache. */
  function setJudge(next: Judge) {
    judge = cachedJudge(next)
  }

  function newGame() {
    log('game_abandoned', { stats: state.value.stats })
    const next = createInitialState()
    next.stats.jevCalls = state.value.stats.jevCalls
    state.value = next
    lastError.value = ''
    log('game_start', { state: snapshot(state.value) })
  }

  return {
    state,
    logTo,
    busy,
    jev,
    lastError,
    canPropose,
    preview,
    alerts,
    checkJev,
    nextWeek,
    createUnits,
    buildDepots,
    assign,
    assignRest,
    assignAll,
    setOverclock,
    research,
    skipGoal,
    dropResearch,
    dismissCard,
    shuffleIdeas,
    cards,
    projection,
    propose,
    reportFor,
    accept,
    bank,
    bankOffer,
    requestUpgrade,
    chooseUpgrade,
    setJudge,
    newGame
  }
})
