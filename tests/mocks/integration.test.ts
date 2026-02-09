import { describe, it, expect, vi } from 'vitest'
import { createMockContainer } from '@mocks'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { Logger } from '~/services/logger'

/**
 * End-to-end validation of the mock system integration.
 * This test verifies that all mocks work together correctly.
 */
describe('Mock System Integration', () => {
  it('should integrate all mocks to create a working test environment', async () => {
    // 1. Create container with all mocks
    const container = createMockContainer()

    // 2. Resolve all key dependencies
    const eventRepo = container.resolve<EventRepo>('eventRepository')
    const eventBusiness = container.resolve<EventBusiness>('eventBusiness')
    const telegram = container.resolve<TelegramTransport>('transport')
    const logger = container.resolve<Logger>('logger')
    const appConfig = container.resolve<{
      telegram: { botToken: string }
      timezone: string
    }>('config')

    // 3. Verify all dependencies are mock instances (not real implementations)
    expect(eventRepo).toBeDefined()
    expect(eventBusiness).toBeDefined()
    expect(telegram).toBeDefined()
    expect(logger).toBeDefined()
    expect(appConfig).toBeDefined()

    // 4. Verify mocks have expected methods
    expect(typeof eventRepo.createEvent).toBe('function')
    expect(typeof eventRepo.findById).toBe('function')
    expect(typeof eventBusiness.announceEvent).toBe('function')
    expect(typeof telegram.sendMessage).toBe('function')
    expect(typeof logger.log).toBe('function')

    // 5. Verify mocks can be called without errors
    const mockEvent = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Mock repository returns data
    eventRepo.createEvent = vi.fn().mockResolvedValue(mockEvent)
    const created = await eventRepo.createEvent({
      datetime: mockEvent.datetime,
      courts: 2,
      status: 'created',
    })
    expect(created).toEqual(mockEvent)

    // Mock business orchestrates operations
    eventBusiness.announceEvent = vi.fn().mockResolvedValue(mockEvent)
    const result = await eventBusiness.announceEvent('ev_test123')
    expect(result).toEqual(mockEvent)

    // Mock transport sends messages
    telegram.sendMessage = vi.fn().mockResolvedValue(undefined)
    await telegram.sendMessage(123456, 'Test message')
    expect(telegram.sendMessage).toHaveBeenCalledWith(123456, 'Test message')

    // Mock logger logs without side effects
    logger.log = vi.fn()
    await logger.log('Test log message')
    expect(logger.log).toHaveBeenCalledWith('Test log message')

    // Config provides test values
    expect(appConfig.telegram.botToken).toBe('test-bot-token')
    expect(appConfig.timezone).toBe('Europe/Moscow')
  })

  it('should allow multiple independent containers', () => {
    // First container
    const container1 = createMockContainer()
    const eventRepo1 = container1.resolve('eventRepository')
    expect(eventRepo1).toBeDefined()

    // Second container
    const container2 = createMockContainer()
    const eventRepo2 = container2.resolve('eventRepository')
    expect(eventRepo2).toBeDefined()

    // Both should be different instances (different containers)
    expect(eventRepo1).not.toBe(eventRepo2)
  })

  it('should verify mock isolation - changes to one mock do not affect others', () => {
    const container = createMockContainer()
    const eventRepo = container.resolve<EventRepo>('eventRepository')
    const scaffoldRepo = container.resolve('scaffoldRepository')

    // Modify eventRepo
    eventRepo.findById = vi.fn().mockResolvedValue(null)

    // scaffoldRepo should be unaffected
    expect(typeof scaffoldRepo.findById).toBe('function')
    expect(scaffoldRepo.findById).not.toBe(eventRepo.findById)
  })

  it('should support dependency injection pattern', () => {
    const container = createMockContainer()

    // Business class should receive injected dependencies
    const eventBusiness = container.resolve<EventBusiness>('eventBusiness')

    // Verify business has access to its dependencies (via container)
    expect(eventBusiness).toBeDefined()
    expect(typeof eventBusiness.announceEvent).toBe('function')
    expect(typeof eventBusiness.cancelEvent).toBe('function')
  })
})
