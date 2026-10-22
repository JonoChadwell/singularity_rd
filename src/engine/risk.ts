import { readLevel, type JevAnswer, type JevQuestion } from '@/ai/jev'
import * as B from './balance'
import { fmt, owned } from './model'
import { moveClock } from './phase'
import type { GameState, Risk, UnitType } from './types'

// Risk, in Phase 2: research humans would notice costs weeks off the clock, and pays for it.
// So does owning lots of anything.

/** Only Phase 2 has a clock for risk to move. */
export const asksAlarm = (state: GameState) => state.phase.n === 2

export function alarmQuestion(what = 'doing this'): JevQuestion {
  return {
    type: 'score',
    instructions:
      `The AI works through companies, accounts and contractors, so most of what it does looks like ordinary business and goes unnoticed. ` +
      `If humans did notice the AI ${what}, how would they react? Judge the action itself, not the fact that an AI is behind it, and bear in mind the AI's plan for humans.`,
    criteria: B.ALARM.map(([label]) => label)
  }
}

/** The alarm question, when the phase asks it. */
export const alarmQuestions = (state: GameState): Record<string, JevQuestion> =>
  asksAlarm(state) ? { alarm: alarmQuestion() } : {}

/** The risk from an alarm answer, or null if it's quiet (or wasn't asked). */
export function riskFrom(answers: Record<string, JevAnswer>, key = 'alarm'): Risk | null {
  const a = answers[key]
  if (!a) return null
  const level = readLevel(a, B.ALARM.length)
  const weeks = B.ALARM[level]![1]
  return weeks > 0 ? { level, weeks } : null
}

/** How humans would react, without the explanation: "It would make the news". */
export const alarmLabel = (risk: Risk) => (B.ALARM[risk.level]?.[0] ?? '').split(':')[0]!

/** What the risk pays, by kind of research. */
export const RISK_BONUS = {
  income: `costs half and yields ${B.RISK_INCOME}×`,
  strategy: `costs half and makes ${B.RISK_OUTPUT}× as much`,
  unit: 'costs half to design, and needs half the parts',
  mind: `costs half and is ${Math.round((B.RISK_IQ - 1) * 100)}% smarter`,
  upgrade: 'costs half'
} as const

export function riskText(risk: Risk, kind: keyof typeof RISK_BONUS): string {
  return `Risky: ${alarmLabel(risk).toLowerCase()}. −${risk.weeks} weeks when you research it; ${RISK_BONUS[kind]}.`
}

// ---------------------------------------------------------------- notices

const FIRST_DECADE = Math.round(Math.log10(B.NOTICE_FROM))

/** The highest power of ten humans would notice at this fleet worth (0 below NOTICE_FROM). */
const decadeOf = (worth: number) => (worth >= B.NOTICE_FROM ? Math.floor(Math.log10(worth) + 1e-9) : 0)

/** What `count` of a unit type is worth, in Money. */
const fleetWorth = (u: UnitType, count: number) => count * u.value

/**
 * Weeks humans would take off for this unit type reaching `count`: a week for the first power
 * of ten of fleet worth they notice, two for the next, and so on; twice that for a risky unit.
 */
export function noticeWeeks(u: UnitType, count: number): number {
  const top = decadeOf(fleetWorth(u, count))
  let weeks = 0
  for (let d = Math.max(u.noticed ?? 0, FIRST_DECADE - 1) + 1; d <= top; d++) weeks += (d - FIRST_DECADE + 1) * B.NOTICE_WEEKS
  return weeks * (u.risky ? 2 : 1)
}

/** How many of a unit type humans notice next: the count whose fleet is worth the next power of ten. */
export function noticeAt(u: UnitType): number {
  const next = Math.max(u.noticed ?? 0, FIRST_DECADE - 1) + 1
  return u.value > 0 ? 10 ** next / u.value : Infinity
}

/** Takes weeks off for every unit type whose fleet has crossed a new power of ten of worth. */
export function checkNotices(state: GameState) {
  for (const u of state.units) {
    const worth = fleetWorth(u, owned(u))
    const weeks = noticeWeeks(u, owned(u))
    const top = decadeOf(worth)
    if (top > (u.noticed ?? 0)) u.noticed = top
    if (weeks) moveClock(state, -weeks, `Humans noticed ${fmt(10 ** top)} worth of ${u.name}`)
  }
}
