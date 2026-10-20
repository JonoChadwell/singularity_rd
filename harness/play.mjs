// Entry point for the command-line harness: `npm run play -- <command> [args]`.
// Loads harness/cli.ts through Vite so the engine's TypeScript and `@/` imports work as-is.
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  // No HMR and no WebSocket: several harness commands may run at once.
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  resolve: { alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') } }
})
let code = 0
try {
  const cli = await server.ssrLoadModule('/harness/cli.ts')
  code = await cli.main(process.argv.slice(2))
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err)
  code = 1
} finally {
  await server.close()
}
process.exit(code)
