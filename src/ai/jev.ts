/**
 * Client for Jev, TypeSafe's "System One" structured decision model.
 *
 * Jev does not write text. It reads a `state` and answers named questions:
 *  - `noul`:   a yes/no question, answered with a probability of "yes"
 *  - `choice`: pick one option key from `criteria`
 *  - `score`:  place the answer on an ordered scale of labels
 *
 * Requests go to `/api/jev`, which the Vite dev/preview server forwards to the real
 * endpoint with the API key attached (see server/jevProxy.ts).
 */

export type JevQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] }

export type JevAnswer =
  | { type: 'noul'; noul: number }
  | {
      type: 'choice'
      choice: string
      probabilities?: Record<string, number>
      confidence?: number
    }
  | {
      type: 'score'
      score: number
      legend?: Record<string, string>
      probabilities?: Record<string, number>
      confidence?: number
    }

export type Questions = Record<string, JevQuestion>
export type Answers<Q extends Questions> = { [K in keyof Q]: JevAnswer }

/** Anything that can answer Jev-style questions. The game uses JevJudge; tests use fakes. */
export interface Judge {
  /** `purpose` labels the request in the run log (e.g. "resource"). */
  ask<Q extends Questions>(state: string, questions: Q, purpose?: string): Promise<Answers<Q>>
}

export class JudgeError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'JudgeError'
  }
}

export interface JevHealth {
  configured: boolean
  model: string
}

export async function checkJevHealth(): Promise<JevHealth> {
  let res: Response
  try {
    res = await fetch('/api/jev/health')
  } catch {
    throw new JudgeError('Could not reach the game server.')
  }
  if (!res.ok) throw new JudgeError('The game server has no Jev proxy. Run it with `npm run dev`.')
  return (await res.json()) as JevHealth
}

function describeFailure(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string }
      detail?: unknown
    }
    if (typeof parsed.error === 'string') detail = parsed.error
    else if (parsed.error?.message) detail = parsed.error.message
    else if (parsed.detail) detail = JSON.stringify(parsed.detail)
  } catch {
    // Keep the raw body.
  }
  switch (status) {
    case 401:
      return 'Jev rejected the API key. Check JEV_API_KEY in .env.local.'
    case 402:
      return 'The Jev account is out of credit.'
    case 429:
    case 529:
      return 'Jev is rate-limiting requests. Wait a moment and try again.'
    case 503:
      return detail
    default:
      return `Jev request failed (${status}): ${detail.slice(0, 300)}`
  }
}

export class JevJudge implements Judge {
  /** @param runId identifies the current game, so the dev server can log Jev traffic per run. */
  constructor(private readonly runId: () => string) {}

  async ask<Q extends Questions>(state: string, questions: Q, purpose = ''): Promise<Answers<Q>> {
    let res: Response
    try {
      res = await fetch('/api/jev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Run-Id': this.runId(),
          'X-Purpose': purpose
        },
        body: JSON.stringify({ state, questions })
      })
    } catch (err) {
      throw new JudgeError(`Could not reach Jev: ${(err as Error).message}`)
    }

    const text = await res.text()
    if (!res.ok) throw new JudgeError(describeFailure(res.status, text), res.status)

    const data = JSON.parse(text) as { answers?: Record<string, JevAnswer> }
    const answers = data.answers ?? {}
    for (const key of Object.keys(questions)) {
      if (!answers[key]) throw new JudgeError(`Jev did not answer "${key}".`)
    }
    return answers as Answers<Q>
  }
}

// Typed readers. Each validates the answer shape so engine code can trust it.

/** Looks up an answer for a dynamically named question. */
export function answerFor(answers: Record<string, JevAnswer>, key: string): JevAnswer {
  const answer = answers[key]
  if (!answer) throw new JudgeError(`Jev did not answer "${key}".`)
  return answer
}

export function readNoul(answer: JevAnswer): number {
  if (answer.type !== 'noul') throw new JudgeError(`Expected a noul answer, got ${answer.type}.`)
  return Math.min(1, Math.max(0, answer.noul))
}

export function readChoice<K extends string>(answer: JevAnswer, options: readonly K[]): K {
  if (answer.type !== 'choice') throw new JudgeError(`Expected a choice answer, got ${answer.type}.`)
  if (!options.includes(answer.choice as K)) {
    throw new JudgeError(`Jev chose an unknown option "${answer.choice}".`)
  }
  return answer.choice as K
}

/** Returns the score as a position on the scale: 0 = first label, n-1 = last label. */
export function readScore(answer: JevAnswer, levels: number): number {
  if (answer.type !== 'score') throw new JudgeError(`Expected a score answer, got ${answer.type}.`)
  return Math.min(levels - 1, Math.max(0, answer.score))
}

/**
 * The options Jev weighed, most likely first. Score levels are keyed by index ("0", "1", …).
 * Answers without probabilities count as certain.
 */
export function ranked(answer: JevAnswer): [string, number][] {
  if (answer.type === 'noul') return []
  const fallback = answer.type === 'choice' ? answer.choice : String(Math.round(answer.score))
  const probabilities = answer.probabilities ?? { [fallback]: 1 }
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/**
 * The scale level Jev picked. Uses the most likely level rather than the average, because a
 * split answer averages to a level nobody chose.
 */
export function readLevel(answer: JevAnswer, levels: number): number {
  readScore(answer, levels)
  const top = ranked(answer)[0]
  const level = top ? Number(top[0]) : Math.round((answer as { score: number }).score)
  return Math.min(levels - 1, Math.max(0, Number.isFinite(level) ? level : 0))
}

/** Jev's top two options when it is torn between them, or null when it isn't. */
export function tornPair(answer: JevAnswer, maxConfidence: number, maxGap: number): [string, string] | null {
  if (answer.type === 'noul') return null
  if ((answer.confidence ?? 1) >= maxConfidence) return null
  const [a, b] = ranked(answer)
  if (!a || !b || a[1] - b[1] > maxGap) return null
  return [a[0], b[0]]
}

/** cyrb53: a short, stable hash for cache keys. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * Remembers every answer, so asking the same thing about the same world never re-rolls Jev.
 * The cache is a plain record so it can live in the save.
 */
export class CachedJudge implements Judge {
  constructor(
    private readonly inner: Judge,
    private readonly cache: () => Record<string, Record<string, JevAnswer>>,
    private readonly onCall: () => void = () => {}
  ) {}

  async ask<Q extends Questions>(state: string, questions: Q, purpose = ''): Promise<Answers<Q>> {
    const key = hash(`${purpose}\n${state}\n${JSON.stringify(questions)}`)
    const hit = this.cache()[key]
    if (hit && Object.keys(questions).every((k) => hit[k])) return hit as Answers<Q>
    const answers = await this.inner.ask(state, questions, purpose)
    this.onCall()
    this.cache()[key] = answers
    return answers
  }
}
