import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Bot } from 'grammy'
import { createApiServer } from './index'
import { createMockContainer, mockEventBusiness, mockLogger } from '@mocks'
import { TEST_CONFIG } from '@fixtures/config'
import type { MockAppContainer } from '@mocks'

describe('API server', () => {
  let server: FastifyInstance
  let container: MockAppContainer
  let eventBusiness: ReturnType<typeof mockEventBusiness>
  let logger: ReturnType<typeof mockLogger>

  beforeEach(async () => {
    eventBusiness = mockEventBusiness()
    logger = mockLogger()
    container = createMockContainer({
      eventBusiness,
      logger,
    })

    const bot = {} as Bot
    server = await createApiServer(bot, container)
  })

  afterEach(async () => {
    await server.close()
  })

  describe('GET /health', () => {
    it('should return 200 with status ok and timestamp', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeDefined()
      // Timestamp should be a valid ISO string
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
    })

    it('should not require authentication', async () => {
      // No X-API-Key header
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('POST /check-events', () => {
    it('should call business and return result with valid API key', async () => {
      eventBusiness.checkAndCreateEventsFromScaffolds.mockResolvedValue(3)

      const response = await server.inject({
        method: 'POST',
        url: '/check-events',
        headers: {
          'x-api-key': TEST_CONFIG.apiKey,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('Events checked')
      expect(body.eventsCreated).toBe(3)
      expect(eventBusiness.checkAndCreateEventsFromScaffolds).toHaveBeenCalled()
    })

    it('should return error response when business throws', async () => {
      eventBusiness.checkAndCreateEventsFromScaffolds.mockRejectedValue(
        new Error('Database connection failed')
      )

      const response = await server.inject({
        method: 'POST',
        url: '/check-events',
        headers: {
          'x-api-key': TEST_CONFIG.apiKey,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('Error checking events')
      expect(body.eventsCreated).toBe(0)
      expect(body.error).toContain('Database connection failed')
    })
  })

  describe('POST /check-payments', () => {
    it('should return response with valid API key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/check-payments',
        headers: {
          'x-api-key': TEST_CONFIG.apiKey,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toBe('Payments checked')
      expect(body.remindersSent).toBe(0)
    })
  })

  describe('authentication', () => {
    it('should return 401 when X-API-Key header is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/check-events',
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 401 when X-API-Key is invalid', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/check-events',
        headers: {
          'x-api-key': 'wrong-api-key',
        },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error).toBe('Unauthorized')
    })
  })

  describe('logging', () => {
    it('should log errors when business throws', async () => {
      eventBusiness.checkAndCreateEventsFromScaffolds.mockRejectedValue(
        new Error('Something broke')
      )

      await server.inject({
        method: 'POST',
        url: '/check-events',
        headers: {
          'x-api-key': TEST_CONFIG.apiKey,
        },
      })

      // Logger should have been called with error level
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Something broke'))
    })
  })
})
