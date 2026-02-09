import { test, describe, expect } from './setup'

describe('test context', () => {
  test('should provide container in context', ({ container }) => {
    expect(container).toBeDefined()
    expect(container.resolve).toBeDefined()
  })

  test('should have all dependencies in container', ({ container }) => {
    expect(container.resolve('logger')).toBeDefined()
    expect(container.resolve('eventRepository')).toBeDefined()
    expect(container.resolve('eventBusiness')).toBeDefined()
  })

  test('should create fresh container for each test', ({ container }) => {
    // Each test gets a fresh container
    const logger = container.resolve('logger')

    // Verify mock is configured
    expect(logger.log).toBeDefined()
    expect(logger.log).toHaveBeenCalledTimes(0)
  })
})
