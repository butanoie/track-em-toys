import { fileURLToPath } from 'node:url'
import { buildServer } from './server.js'
import { config } from './config.js'
import { pool } from './db/pool.js'

/**
 * Build the Fastify server, register graceful-shutdown signal handlers, and
 * begin listening on the configured port. Throws if buildServer() fails.
 */
export async function main(): Promise<void> {
  const server = await buildServer()

  if (config.nodeEnv !== 'development' && config.nodeEnv !== 'test' && !config.secureCookies) {
    server.log.warn('secureCookies is disabled in a non-development environment — set SECURE_COOKIES=true')
  }

  // Graceful shutdown: server.close() drains in-flight requests before we end the pool.
  // shuttingDown guard ensures a second signal does not fire pool.end() a second time.
  let shuttingDown = false
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) return
      shuttingDown = true
      // eslint-disable-next-line no-void
      void (async () => {
        server.log.info(`Received ${signal}, shutting down...`)
        try {
          await server.close()
        } catch (closeErr) {
          server.log.error({ err: closeErr }, 'server.close() failed during shutdown')
        }
        try {
          await pool.end()
        } catch (poolErr) {
          server.log.error({ err: poolErr }, 'pool.end() failed during shutdown')
          process.exit(1)
        }
        process.exit(0)
      })()
    })
  }

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' })
    server.log.info(`Server listening on port ${config.port}`)
  } catch (err) {
    server.log.error({ err }, 'Server failed to start')
    process.exit(1)
  }
}

/**
 * Top-level startup wrapper: calls main() and catches any uncaught startup
 * error (e.g. missing env vars evaluated at import time, or buildServer()
 * throwing before a logger is available). Emits a structured JSON fatal line
 * to stderr so log aggregators can parse it, then exits with code 1.
 *
 * Exported so it can be tested directly without triggering the entry-point guard.
 */
export async function startup(): Promise<void> {
  try {
    await main()
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: 'fatal',
        msg: 'Startup failed',
        err:
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : String(err),
      }) + '\n',
    )
    process.exit(1)
  }
}

// Only run when this file is the direct entry point (node dist/index.js / tsx src/index.ts).
// Guarding with import.meta.url prevents the IIFE from firing during test imports.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // eslint-disable-next-line no-void -- top-level async entry point
  void startup()
}
