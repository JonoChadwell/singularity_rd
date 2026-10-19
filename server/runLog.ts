import { appendFile, mkdir } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { join } from 'node:path'
import type { Connect, Plugin } from 'vite'

const RUN_ID = /^[a-z0-9-]{1,40}$/

/** Appends JSON lines to `<dir>/<runId>.jsonl`, one file per game. */
export class RunLog {
  constructor(private readonly dir: string) {}

  async append(runId: string, record: Record<string, unknown>) {
    if (!RUN_ID.test(runId)) return
    try {
      await mkdir(this.dir, { recursive: true })
      const line = JSON.stringify({ at: new Date().toISOString(), ...record })
      await appendFile(join(this.dir, `${runId}.jsonl`), `${line}\n`, 'utf8')
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

/** `POST /api/log` with `{ runId, event, ...data }` appends a game event to the run's log. */
export function runLogPlugin(log: RunLog): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url !== '/api/log' || req.method !== 'POST') return next()
    try {
      const { runId, ...record } = JSON.parse(await readBody(req)) as Record<string, unknown>
      if (typeof runId === 'string') await log.append(runId, record)
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
