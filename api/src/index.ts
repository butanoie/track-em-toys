import { buildServer } from './server.js'
import { config } from './config.js'
import { pool } from './db/pool.js'

async function main() {
  const server = await buildServer()

  // Graceful shutdown: server.close() drains in-flight requests before we end the pool
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
  for (const signal of signals) {
    process.on(signal, () => {
      void (async () => {
        server.log.info(`Received ${signal}, shutting down...`)
        try {
          await server.close()
        } finally {
          await pool.end()
        }
        process.exit(0)
      })()
    })
  }

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' })
    server.log.info(`Server listening on port ${config.port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

void main()
