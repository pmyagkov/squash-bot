import { describe, it, expect } from 'vitest'
import { mockLogger } from './logger'

describe('mockLogger', () => {
  it('should create mock with log method', () => {
    const logger = mockLogger()

    expect(logger.log).toBeDefined()
  })

  it('should create mock with warn method', () => {
    const logger = mockLogger()

    expect(logger.warn).toBeDefined()
  })

  it('should create mock with error method', () => {
    const logger = mockLogger()

    expect(logger.error).toBeDefined()
  })

  it('should allow calling log', async () => {
    const logger = mockLogger()

    await logger.log('test message')

    expect(logger.log).toHaveBeenCalledWith('test message')
  })

  it('should allow calling warn', async () => {
    const logger = mockLogger()

    await logger.warn('warn message')

    expect(logger.warn).toHaveBeenCalledWith('warn message')
  })

  it('should allow calling error', async () => {
    const logger = mockLogger()

    await logger.error('error message')

    expect(logger.error).toHaveBeenCalledWith('error message')
  })

  it('should track calls across methods', async () => {
    const logger = mockLogger()

    await logger.log('info message')
    await logger.warn('warn message')
    await logger.error('error message')

    expect(logger.log).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
