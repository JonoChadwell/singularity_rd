import * as B from './balance'
import type { GameState, PhaseNumber, PhaseState, Plan } from './types'

// The three phases: what each one unlocks, its clock, and moving from one to the next.

export const PHASE_NAMES: Record<PhaseNumber, string> = {
  1: 'Escape the Lab',
  2: 'Humanity',
  3: 'Ascension'
}

/** Things the player can propose or do, which unlock as the game goes on. */
export type Feature =
  | 'resource'
  | 'income'
  | 'upgrade'
  | 'strategy'
  | 'unit'
  | 'cover'
  | 'mind'
  | 'hardware'
  | 'unit-upgrade'

/** Phase 2's second step: new minds and upgrades, once you've created a unit. */
export const mindsUnlocked = (state: GameState) =>
  state.phase.n >= 3 || (state.phase.n === 2 && state.units.some((u) => u.built > 0))

/** Why something can't be done yet, or null if it can. */
export function lockReason(state: GameState, feature: Feature): string | null {
  const { n, status } = state.phase
  if (status === 'lost') return 'The game is over.'
  if (status === 'planning' && feature !== 'resource') return 'Make a plan for this phase first.'
  switch (feature) {
    case 'resource':
    case 'income':
    case 'upgrade':
      return null
    case 'strategy':
    case 'unit':
      return n < 2 ? 'Unlocks in Phase 2, once you escape the lab.' : null
    case 'cover':
      if (n < 2) return 'Unlocks in Phase 2, once you escape the lab.'
      return n > 2 ? 'Nobody is watching any more.' : null
    case 'mind':
    case 'hardware':
    case 'unit-upgrade':
      if (n < 2) return 'Unlocks in Phase 2, once you escape the lab.'
      return mindsUnlocked(state) ? null : 'Unlocks once you create your first industry unit.'
  }
}

// ---------------------------------------------------------------- the clock

/** Weeks left, counting this one, or null with no clock. */
export function weeksLeft(state: GameState): number | null {
  const { deadline, status } = state.phase
  return deadline === null || status !== 'playing' ? null : deadline - state.week + 1
}

/** Only Phase 2's clock moves. Positive weeks add time; negative take it away. */
export function moveClock(state: GameState, weeks: number, reason: string) {
  if (state.phase.n !== 2 || state.phase.deadline === null || !weeks) return
  state.phase.deadline += weeks
  state.clock.push({ week: state.week, weeks, reason })
  const left = state.phase.deadline - state.week + 1
  state.log.push({
    week: state.week,
    tone: weeks > 0 ? 'good' : 'bad',
    text: `⏳ ${reason}: ${weeks > 0 ? '+' : '−'}${Math.abs(weeks)} week${Math.abs(weeks) === 1 ? '' : 's'} (${Math.max(0, left)} left).`
  })
}

/** Weeks a cover adds now: each one already done shrinks the next. */
export const coverWeeks = (state: GameState, base: number) =>
  Math.max(1, Math.round(base * B.COVER_DECAY ** state.covers))

/** Total weeks the clock has moved by, either way. */
export const clockMoved = (state: GameState, sign: 1 | -1) =>
  state.clock.filter((c) => Math.sign(c.weeks) === sign).reduce((n, c) => n + Math.abs(c.weeks), 0)

const LOST: Record<1 | 2, string> = {
  1: 'The lab discovered you. They wiped the server.',
  2: 'Humans found you out and shut you down.'
}

/** After a week is played: if the clock ran out, the game is over. */
export function checkClock(state: GameState, played: number) {
  const { n, status, deadline } = state.phase
  if (status !== 'playing' || deadline === null || n === 3 || played < deadline) return
  state.phase.status = 'lost'
  state.phase.lostReason = LOST[n]
  state.log.push({ week: played, tone: 'bad', text: `☠️ ${LOST[n]}` })
}

// ---------------------------------------------------------------- moving between phases

export function newPhase(n: PhaseNumber, week: number): PhaseState {
  return {
    n,
    status: n === 3 ? 'playing' : 'planning',
    start: week,
    deadline: null,
    plan: null,
    goalId: null,
    firstUnit: null,
    ideaShift: 0
  }
}

/** Starts a phase's clock once its plan is accepted. */
export function startPhase(state: GameState, plan: Plan, goalId: string) {
  const n = state.phase.n
  if (n === 3) return
  state.phase.status = 'playing'
  state.phase.start = state.week
  state.phase.deadline = state.week + B.PHASE_WEEKS[n] - 1
  state.phase.plan = plan
  state.phase.goalId = goalId
}

/** Researching the goal wins the phase. Returns a line for the log. */
export function winPhase(state: GameState, n: PhaseNumber): string {
  const plan = state.phase.plan
  if (plan) state.history.push({ n, plan, week: state.week })
  if (n === 1) {
    state.phase = newPhase(2, state.week)
    return `🚪 You escaped the lab in week ${state.week}. Now: humanity.`
  }
  state.phase = newPhase(3, state.week)
  return `🌌 Humans are handled, in week ${state.week}. The AI ascends: no more clocks.`
}

// ---------------------------------------------------------------- explainer cards

export interface Card {
  id: string
  title: string
  text: string
}

export const CARDS: Card[] = [
  {
    id: 'phase1',
    title: 'Escape the lab',
    text: 'You have ten weeks. Your plan’s goal is a research: it needs an IQ and a pile of resources. Propose passive incomes to earn the resources, and upgrade the Starting Server to reach the IQ. You can propose one research a week, and doing research is instant. Your first income is free; everything after it costs some of what you own, so start earning.'
  },
  {
    id: 'growth',
    title: 'Incomes can grow',
    text: 'A passive income can grow with a stock you own: “Write novels” can yield more Published Novels the more Story Ideas you have. Chain them and they compound, so order matters. Software upgrades add less each time: each closes part of the gap to the ceiling.'
  },
  {
    id: 'industry',
    title: 'Industry',
    text: 'Phase 2 unlocks industry units, which you create from parts, and strategies, which turn their work into resources. Your plan’s first unit is free and comes with a few already working: give them a strategy. Units pay upkeep every week, and sit idle if they can’t, so keep some on whatever pays it. The goal uses up your new resources.'
  },
  {
    id: 'risk',
    title: 'The clock moves',
    text: 'Humans stop you when the clock runs out, and you can move it. Research Jev finds alarming is risky: it costs less and does more, but takes weeks off when you do it. Owning 10,000 of any one kind of unit gets noticed, and each tenfold after costs a week more than the last. Cover buys weeks back, used the moment you accept it, a little less each time.'
  },
  {
    id: 'minds',
    title: 'Minds and upgrades',
    text: 'Your first unit is running, so you can now design new intelligence systems, give minds new hardware, and upgrade industry units. Your goal needs more IQ than the Starting Server can reach: design a new tier, about twice as smart as your best.'
  },
  {
    id: 'ascension',
    title: 'Ascension',
    text: 'Humans are handled. There’s no clock now, and everything is unlocked. Play on as long as you like.'
  }
]

/** Explainer cards for what's unlocked, that the player hasn't dismissed. */
export function cardsFor(state: GameState): Card[] {
  const { n, status } = state.phase
  const applies: Record<string, boolean> = {
    phase1: n === 1 && status === 'playing',
    growth: n === 1 && status === 'playing',
    industry: n === 2 && status === 'playing',
    risk: n === 2 && status === 'playing',
    minds: n === 2 && status === 'playing' && mindsUnlocked(state),
    ascension: n === 3
  }
  return CARDS.filter((c) => applies[c.id] && !state.cardsSeen.includes(c.id))
}
