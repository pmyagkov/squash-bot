import { describe, it, expect } from 'vitest'
import { mockLogger } from './logger'

describe('mockLogger', () => {
  it('should create mock with log method', () => {
    const logger = mockLogger()

    expect(logger.log).toBeDefined()
  })

  it('should allow overriding log behavior', async () => {
    const logger = mockLogger()
    logger.log.mockResolvedValue(undefined)

    await logger.log('test message', 'info')

    expect(logger.log).toHaveBeenCalledWith('test message', 'info')
  })

  it('should track log calls', async () => {
    const logger = mockLogger()

    await logger.log('error message', 'error')
    await logger.log('info message', 'info')

    expect(logger.log).toHaveBeenCalledTimes(2)
  })
})
