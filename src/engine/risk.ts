import { readLevel, type JevAnswer, type JevQuestion } from '@/ai/jev'
import * as B from './balance'
import { lossOf } from './losses'
import type { GameState, Risk } from './types'

// Risk, in Phase 2: research that brings the plan's loss condition closer costs weeks off the
// clock, and pays for it.
// So does expanding caps: sourcing contracts and storage, by how much they add.

/** Only Phase 2 has a clock for risk to move. */
export const asksAlarm = (state: GameState) => state.phase.n === 2

/** How far the AI `what` brings the plan's loss condition closer. */
export function alarmQuestion(state: GameState, what = 'doing this'): JevQuestion {
  return {
    type: 'score',
    instructions:
      `The AI works through companies, accounts and contractors, so most of what it does looks like ordinary business. ` +
      `Its plan fails if time runs out on ${lossOf(state).threat}. ` +
      `How much closer would the AI ${what} bring that? Judge the action itself, not the fact that an AI is behind it, and bear in mind the AI's plan.`,
    criteria: B.ALARM.map(([label]) => label)
  }
}

/** The alarm question, when the phase asks it. */
export const alarmQuestions = (state: GameState): Record<string, JevQuestion> =>
  asksAlarm(state) ? { alarm: alarmQuestion(state) } : {}

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
  strategy: `costs half and makes ${B.RISK_OUTPUT}× as much`,
  unit: 'costs half to design, and needs half the parts',
  mind: `costs half and is ${B.RISK_IQ_BONUS} IQ smarter`,
  upgrade: 'costs half'
} as const

export function riskText(risk: Risk, kind: keyof typeof RISK_BONUS): string {
  return `Risky: ${alarmLabel(risk).toLowerCase()}. −${risk.weeks} weeks when you research it; ${RISK_BONUS[kind]}.`
}

// ---------------------------------------------------------------- expansions

/**
 * Weeks humans would take off for an expansion that adds `worth` (units × value, or extra
 * storage × value): a week from EXPANSION_NOTICE_FROM, and one more for every tenfold after.
 * Twice that for a risky one.
 */
export function expansionWeeks(worth: number, risky: boolean): number {
  if (worth < B.EXPANSION_NOTICE_FROM) return 0
  const weeks = 1 + Math.floor(Math.log10(worth / B.EXPANSION_NOTICE_FROM) + 1e-9)
  return weeks * (risky ? 2 : 1)
}

/**
 * The risk of an expansion: how alarming it is, plus how big. Only Phase 2 has a clock. A risky
 * option is at least "it would make the news".
 */
export function expansionRisk(state: GameState, alarm: Risk | null, worth: number, risky: boolean): Risk | null {
  if (!asksAlarm(state)) return null
  const level = Math.max(alarm?.level ?? 0, risky ? 2 : 0)
  const weeks = (alarm && !risky ? alarm.weeks : (B.ALARM[level]?.[1] ?? 0)) + expansionWeeks(worth, risky)
  return weeks > 0 ? { level, weeks } : null
}

/** A risk in words, for an expansion option: "−3 weeks (it would make the news)". */
export const expansionRiskText = (risk: Risk | null) =>
  risk ? `−${risk.weeks} week${risk.weeks === 1 ? '' : 's'} on the clock (${alarmLabel(risk).toLowerCase()})` : 'Nobody notices'
