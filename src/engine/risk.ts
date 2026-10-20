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
    instructions: `If humans noticed the AI ${what}, how would they react? Bear in mind the AI's plan for humans.`,
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

export const alarmLabel = (risk: Risk) => B.ALARM[risk.level]?.[0] ?? ''

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

/** The highest power of ten humans would notice at this count (0 below NOTICE_FROM). */
const decadeOf = (count: number) => (count >= B.NOTICE_FROM ? Math.floor(Math.log10(count) + 1e-9) : 0)

/** Weeks humans would take off for this unit type reaching `count`. */
export function noticeWeeks(u: UnitType, count: number): number {
  const top = decadeOf(count)
  const from = Math.max(u.noticed ?? 0, FIRST_DECADE - 1)
  if (top <= from) return 0
  return (top - from) * B.NOTICE_WEEKS * (u.risky ? 2 : 1)
}

/** Takes weeks off for every unit type that has crossed a new power of ten. */
export function checkNotices(state: GameState) {
  for (const u of state.units) {
    const count = owned(u)
    const weeks = noticeWeeks(u, count)
    const top = decadeOf(count)
    if (top > (u.noticed ?? 0)) u.noticed = top
    if (weeks) moveClock(state, -weeks, `Humans noticed ${fmt(10 ** top)} ${u.name}`)
  }
}
