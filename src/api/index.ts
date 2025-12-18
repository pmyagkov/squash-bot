import Fastify, { FastifyInstance } from 'fastify'
import { config } from '../config'
import { logToTelegram } from '../utils/logger'

export async function createApiServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
  })

  // Health check (no auth required)
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // API key authentication middleware (for all routes except /health)
  server.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') {
      return // Skip auth for health check
    }
    const apiKey = request.headers['x-api-key']
    if (apiKey !== config.server.apiKey) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }
  })

  // Check events endpoint
  server.post('/check-events', async () => {
    await logToTelegram('POST /check-events called', 'info')
    // TODO: Implement event checking logic
    return { message: 'Events checked', eventsCreated: 0 }
  })

  // Check payments endpoint
  server.post('/check-payments', async () => {
    await logToTelegram('POST /check-payments called', 'info')
    // TODO: Implement payment checking logic
    return { message: 'Payments checked', remindersSent: 0 }
  })

  return server
}
