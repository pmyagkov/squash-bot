import { describe, it, expect } from 'vitest'
import { createMockContainer } from './container'
import { mockEventRepo } from './repos'
import { buildEvent } from '@fixtures'

describe('createMockContainer', () => {
  it('should create container with all dependencies', () => {
    const container = createMockContainer()

    expect(container.resolve('bot')).toBeDefined()
    expect(container.resolve('config')).toBeDefined()
    expect(container.resolve('transport')).toBeDefined()
    expect(container.resolve('logger')).toBeDefined()
    expect(container.resolve('eventRepository')).toBeDefined()
    expect(container.resolve('scaffoldRepository')).toBeDefined()
    expect(container.resolve('eventBusiness')).toBeDefined()
  })

  it('should use default mocks', () => {
    const container = createMockContainer()

    const logger = container.resolve('logger')
    expect(logger.log).toBeDefined()
  })

  it('should allow overriding specific dependencies', () => {
    const customRepo = mockEventRepo()
    customRepo.findById.mockResolvedValue(buildEvent({ id: 'custom' }))

    const container = createMockContainer({
      eventRepository: customRepo,
    })

    const repo = container.resolve('eventRepository')
    expect(repo).toBe(customRepo)
  })

  it('should preserve non-overridden defaults', () => {
    const customRepo = mockEventRepo()

    const container = createMockContainer({
      eventRepository: customRepo,
    })

    // Other dependencies should still be defaults
    expect(container.resolve('logger')).toBeDefined()
    expect(container.resolve('transport')).toBeDefined()
  })
})
