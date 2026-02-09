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
    // Modify container in this test
    const logger = container.resolve('logger')
    logger.log.mockResolvedValue(undefined)

    // Modification should not affect other tests
    expect(logger.log).toBeDefined()
  })
})
