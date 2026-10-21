import { watch, type App } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { describeError } from '@/telemetry'

// Wires the errors and ui streams of the run log. Game events are logged by the game store.

/** Sends crashes to the errors stream: Vue errors (render, computed, handlers), uncaught errors
 *  and unhandled promise rejections. Each distinct crash is logged once per page load, since a
 *  broken computed throws again on every render. */
function logCrashes(app: App) {
  const game = useGameStore()
  const seen = new Set<string>()
  const crash = (source: string, err: unknown, data: Record<string, unknown> = {}) => {
    const error = describeError(err)
    const key = `${source}|${error.message}|${JSON.stringify(data)}`
    if (seen.has(key)) return
    seen.add(key)
    game.logTo('errors', 'crash', { source, ...data, error })
  }

  app.config.errorHandler = (err, instance, info) => {
    // Setting a handler stops Vue printing the error, so keep it in the console too.
    console.error(err)
    crash('vue', err, { info, component: instance?.$options.name ?? instance?.$options.__name ?? null })
  }
  window.addEventListener('error', (e) => crash('window', e.error ?? e.message, { file: e.filename, line: e.lineno }))
  window.addEventListener('unhandledrejection', (e) => crash('promise', e.reason))
}

/** Sends UI transitions to the ui stream: which dialog is open, the tab, notices, focus. */
function logUi() {
  const game = useGameStore()
  const ui = useUiStore()
  const log = (event: string, data: Record<string, unknown>) => game.logTo('ui', event, data)

  // Mirrors the dialog choice in App.vue.
  const dialog = () => {
    const { status, n } = game.state.phase
    if (status === 'lost') return 'game_over'
    if (status === 'planning') return `plan_${n}`
    return ui.invent ? `invent_${ui.invent.kind}` : null
  }
  watch(dialog, (to, from) => log('dialog', { from, to, request: to?.startsWith('invent') ? ui.invent : undefined }), {
    immediate: true
  })
  watch(
    () => ui.tab,
    (to, from) => log('tab', { from, to })
  )
  watch(
    () => ui.notice,
    (notice) => notice && log('notice', notice)
  )
  watch(
    () => ui.focus,
    (unitId) => unitId && log('focus', { unitId })
  )
  watch(
    () => game.lastError,
    (message) => message && log('error_shown', { message })
  )
}

export function installLogging(app: App) {
  logCrashes(app)
  logUi()
}
