import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { jevProxy } from './server/jevProxy'
import { RunLog, runLogPlugin } from './server/runLog'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix loads every variable (not just VITE_*) for server-side use only.
  const env = loadEnv(mode, process.cwd(), '')
  const log = new RunLog(fileURLToPath(new URL('./logs/runs', import.meta.url)))

  return {
    plugins: [
      vue(),
      runLogPlugin(log),
      jevProxy({
        apiKey: env.JEV_API_KEY || undefined,
        baseUrl: env.JEV_BASE_URL || 'https://openrouter.ai/api',
        model: env.JEV_MODEL || 'jev-latest',
        log
      })
    ],
    server: {
      // Don't reload the page when run logs are written.
      watch: { ignored: ['**/logs/**'] }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
})
