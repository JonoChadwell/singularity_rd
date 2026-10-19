import type { GameState } from '@/engine/types'

/**
 * Sends a game event to the dev server, which appends it to logs/runs/<runId>.jsonl.
 * Fire-and-forget: logging failures never affect the game.
 */
export function logEvent(runId: string, event: string, data: Record<string, unknown> = {}) {
  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, event, ...data }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // No fetch, or no server: ignore.
  }
}

/** The state without its long, derivable parts: the log and Jev's cached answers. */
export function snapshot(state: GameState): Omit<GameState, 'log' | 'jevCache'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { log, jevCache, ...rest } = state
  return rest
}
