import type { ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { readBody, type RunLog } from './runLog'

export interface JevProxyOptions {
  apiKey?: string
  baseUrl: string
  model: string
  /** If set, every request and response is appended to the run's log. */
  log?: RunLog
}

const ROUTE = '/api/jev'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Forwards `POST /api/jev` to `${baseUrl}/v1/systemone`, adding the API key and model
 * server-side so neither ends up in the browser bundle. `GET /api/jev/health` reports
 * whether a key is configured without spending any tokens.
 */
export function jevProxy(options: JevProxyOptions): Plugin {
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/v1/systemone`

  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(ROUTE)) return next()

    if (req.method === 'GET' && url.startsWith(`${ROUTE}/health`)) {
      return sendJson(res, 200, { configured: Boolean(options.apiKey), model: options.model })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
    if (!options.apiKey) {
      return sendJson(res, 503, {
        error: 'JEV_API_KEY is not set. Add it to .env.local and restart the dev server.'
      })
    }

    const runId = String(req.headers['x-run-id'] ?? '')
    const purpose = String(req.headers['x-purpose'] ?? '')
    const started = Date.now()
    let request: Record<string, unknown> = {}
    try {
      request = { model: options.model, ...JSON.parse((await readBody(req)) || '{}') }
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      })
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
      const retryAfter = upstream.headers.get('retry-after')
      if (retryAfter) res.setHeader('Retry-After', retryAfter)
      res.end(text)

      let response: unknown = text
      try {
        response = JSON.parse(text)
      } catch {
        // Log the raw text.
      }
      await options.log?.append(runId, {
        event: 'jev',
        purpose,
        status: upstream.status,
        ms: Date.now() - started,
        request,
        response
      })
    } catch (err) {
      sendJson(res, 502, { error: `Could not reach Jev: ${(err as Error).message}` })
      await options.log?.append(runId, {
        event: 'jev',
        purpose,
        status: 502,
        error: (err as Error).message,
        request
      })
    }
  }

  return {
    name: 'jev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    }
  }
}
