import { Bot } from 'grammy'
import Fastify, { FastifyInstance } from 'fastify'
import type { AppContainer } from '~/container'

export async function createApiServer(
  _bot: Bot,
  container: AppContainer
): Promise<FastifyInstance> {
  const logger = container.resolve('logger')
  const eventBusiness = container.resolve('eventBusiness')
  const config = container.resolve('config')
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
    await logger.log('POST /check-events called')
    try {
      const notificationService = container.resolve('notificationService')
      const eventsCreated = await eventBusiness.checkAndCreateEventsFromScaffolds()
      const autoAnnounced = await eventBusiness.checkAndAnnounceCreatedEvents()
      const unfinalizedNotifications = await eventBusiness.checkUnfinalizedEvents()
      const processedNotifications = await notificationService.processQueue()
      await logger.log(
        `POST /check-events completed: ${eventsCreated} created, ${autoAnnounced} auto-announced, ${unfinalizedNotifications} unfinalized, ${processedNotifications.length} processed`
      )
      return {
        message: 'Events checked',
        eventsCreated,
        autoAnnounced,
        unfinalizedNotifications,
        processedNotifications: processedNotifications.length,
      }
    } catch (error) {
      await logger.error(
        `POST /check-events failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return { message: 'Error checking events', eventsCreated: 0, error: String(error) }
    }
  })

  // Check payments endpoint
  server.post('/check-payments', async () => {
    await logger.log('POST /check-payments called')
    // TODO: Implement payment checking logic
    return { message: 'Payments checked', remindersSent: 0 }
  })

  return server
}
