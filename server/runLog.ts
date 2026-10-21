import { appendFile, mkdir } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'

const RUN_ID = /^[a-z0-9-]{1,40}$/

/**
 * A run's log is split into streams, one file each, so each can be read on its own:
 * - `game`: game state and the player's moves (`game_start`, `week`, `proposal`, `accept`, `action`…)
 * - `jev`: Jev requests and responses, which are long
 * - `ui`: dialogs opening and closing, verdicts shown, tabs, notices
 * - `errors`: crashes (Vue, window, unhandled promises) and actions that threw
 */
export const STREAMS = ['game', 'jev', 'ui', 'errors'] as const
export type Stream = (typeof STREAMS)[number]
export const isStream = (s: unknown): s is Stream => STREAMS.includes(s as Stream)

/** Appends JSON lines to `<dir>/<runId>/<stream>.jsonl`: a folder per game, a file per stream. */
export class RunLog {
  constructor(private readonly dir: string) {}

  async append(runId: string, stream: Stream, record: Record<string, unknown>) {
    if (!RUN_ID.test(runId) || !isStream(stream)) return
    try {
      const dir = join(this.dir, runId)
      await mkdir(dir, { recursive: true })
      const line = JSON.stringify({ at: new Date().toISOString(), ...record })
      await appendFile(join(dir, `${stream}.jsonl`), `${line}\n`, 'utf8')
    } catch (err) {
      console.warn(`[run-log] could not write: ${(err as Error).message}`)
    }
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** `POST /api/log` with `{ runId, stream, event, ...data }` appends an event to that stream of the run's log. */
export function runLogPlugin(log: RunLog): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url !== '/api/log' || req.method !== 'POST') return next()
    try {
      const { runId, stream, ...record } = JSON.parse(await readBody(req)) as Record<string, unknown>
      if (typeof runId === 'string' && isStream(stream)) await log.append(runId, stream, record)
    } catch {
      // Logging must never break the game.
    }
    res.statusCode = 204
    res.end()
  }
  return {
    name: 'run-log',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    }
  }
}
