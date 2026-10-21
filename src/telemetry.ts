import type { GameState } from '@/engine/types'

/** Which file of the run's log an event goes to. Matches `STREAMS` in server/runLog.ts. */
export type LogStream = 'game' | 'ui' | 'errors'

/**
 * Sends an event to the dev server, which appends it to logs/runs/<runId>/<stream>.jsonl.
 * Fire-and-forget: logging failures never affect the game.
 */
export function logEvent(runId: string, stream: LogStream, event: string, data: Record<string, unknown> = {}) {
  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, stream, event, ...data }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // No fetch, or no server: ignore.
  }
}

/** Whatever was thrown, as something JSON can carry. */
export function describeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack }
  return { name: typeof err, message: String(err) }
}

/** The state without its long, derivable parts: the log and Jev's cached answers. */
export function snapshot(state: GameState): Omit<GameState, 'log' | 'jevCache'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { log, jevCache, ...rest } = state
  return rest
}
