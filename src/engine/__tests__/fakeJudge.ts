import type { Answers, JevAnswer, Judge, Questions } from '@/ai/jev'

export type Overrides = Record<string, JevAnswer | ((questions: Questions) => JevAnswer)>

/**
 * Answers every question with a neutral default unless overridden by question name:
 * - nouls: yes (0.9), except traits, which default to no (0.1);
 * - choices: the first option, except a resource's trait, which defaults to Cryogenic;
 * - scores: the middle of the scale, except alarm, which defaults to quiet.
 * An override key ending in `*` matches every question starting with it.
 */
export class FakeJudge implements Judge {
  calls: { state: string; questions: Questions; purpose: string }[] = []

  constructor(public overrides: Overrides = {}) {}

  private override(key: string) {
    if (this.overrides[key]) return this.overrides[key]
    const prefix = Object.keys(this.overrides)
      .filter((k) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))
      .sort((a, b) => b.length - a.length)[0]
    return prefix ? this.overrides[prefix] : undefined
  }

  async ask<Q extends Questions>(state: string, questions: Q, purpose = ''): Promise<Answers<Q>> {
    this.calls.push({ state, questions, purpose })
    const answers: Record<string, JevAnswer> = {}
    for (const [key, q] of Object.entries(questions)) {
      const override = this.override(key)
      if (override) {
        answers[key] = typeof override === 'function' ? override(questions) : override
      } else if (q.type === 'noul') {
        answers[key] = { type: 'noul', noul: key.startsWith('trait_') ? 0.1 : 0.9 }
      } else if (q.type === 'choice' && /(^|_)trait$/.test(key)) {
        // A resource's trait: one that barely touches the scripted economy.
        answers[key] = { type: 'choice', choice: 'cryogenic' }
      } else if (q.type === 'choice') {
        answers[key] = { type: 'choice', choice: Object.keys(q.criteria)[0]! }
      } else if (/(^|_)ceiling$/.test(key) || key.startsWith('ceiling_')) {
        // Anything can exist; for storage, an ordinary build state and a way any IQ could manage.
        answers[key] = { type: 'score', score: q.criteria.length - 1 }
      } else if (key === 'reach') {
        answers[key] = { type: 'score', score: 2 }
      } else if (key === 'techLevel' || key === 'alarm' || key.startsWith('a_c')) {
        // Quiet unless a test says otherwise: the middle of the scale is already risky.
        answers[key] = { type: 'score', score: 0 }
      } else {
        answers[key] = { type: 'score', score: Math.floor(q.criteria.length / 2) }
      }
    }
    return answers as Answers<Q>
  }
}

export const noul = (p: number): JevAnswer => ({ type: 'noul', noul: p })
export const choice = (c: string, probabilities?: Record<string, number>, confidence?: number): JevAnswer => ({
  type: 'choice',
  choice: c,
  probabilities,
  confidence
})
export const score = (s: number, probabilities?: Record<string, number>, confidence?: number): JevAnswer => ({
  type: 'score',
  score: s,
  probabilities,
  confidence
})
