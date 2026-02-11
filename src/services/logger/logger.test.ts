import { describe, it, expect, vi } from 'vitest'
import { Logger } from './logger'
import type { LogLevel, LogProvider } from './types'

/**
 * Creates a fake LogProvider with vitest spies.
 * @param acceptedLevels - Which log levels this provider accepts
 */
function createFakeProvider(acceptedLevels: LogLevel[]): LogProvider {
  const levels = new Set(acceptedLevels)
  return {
    shouldLog: vi.fn((level: LogLevel) => levels.has(level)),
    log: vi.fn(async () => {}),
  }
}

describe('Logger', () => {
  it('should route to matching providers (shouldLog=true)', async () => {
    const provider = createFakeProvider(['info', 'warn', 'error'])
    const logger = new Logger([provider])

    await logger.log('test message')

    expect(provider.shouldLog).toHaveBeenCalledWith('info')
    expect(provider.log).toHaveBeenCalledWith('test message', 'info')
  })

  it('should skip non-matching providers (shouldLog=false)', async () => {
    const provider = createFakeProvider(['error'])
    const logger = new Logger([provider])

    await logger.log('test message')

    expect(provider.shouldLog).toHaveBeenCalledWith('info')
    expect(provider.log).not.toHaveBeenCalled()
  })

  it('should route to multiple matching providers', async () => {
    const provider1 = createFakeProvider(['info', 'warn', 'error'])
    const provider2 = createFakeProvider(['info', 'warn', 'error'])
    const logger = new Logger([provider1, provider2])

    await logger.warn('broadcast message')

    expect(provider1.log).toHaveBeenCalledWith('broadcast message', 'warn')
    expect(provider2.log).toHaveBeenCalledWith('broadcast message', 'warn')
  })

  it('should route info level only to info-level providers', async () => {
    const infoProvider = createFakeProvider(['info'])
    const warnProvider = createFakeProvider(['warn'])
    const errorProvider = createFakeProvider(['error'])
    const logger = new Logger([infoProvider, warnProvider, errorProvider])

    await logger.log('info message')

    expect(infoProvider.log).toHaveBeenCalledWith('info message', 'info')
    expect(warnProvider.log).not.toHaveBeenCalled()
    expect(errorProvider.log).not.toHaveBeenCalled()
  })

  it('should route warn level only to warn-level providers', async () => {
    const infoProvider = createFakeProvider(['info'])
    const warnProvider = createFakeProvider(['warn'])
    const errorProvider = createFakeProvider(['error'])
    const logger = new Logger([infoProvider, warnProvider, errorProvider])

    await logger.warn('warn message')

    expect(infoProvider.log).not.toHaveBeenCalled()
    expect(warnProvider.log).toHaveBeenCalledWith('warn message', 'warn')
    expect(errorProvider.log).not.toHaveBeenCalled()
  })

  it('should route error level only to error-level providers', async () => {
    const infoProvider = createFakeProvider(['info'])
    const warnProvider = createFakeProvider(['warn'])
    const errorProvider = createFakeProvider(['error'])
    const logger = new Logger([infoProvider, warnProvider, errorProvider])

    await logger.error('error message')

    expect(infoProvider.log).not.toHaveBeenCalled()
    expect(warnProvider.log).not.toHaveBeenCalled()
    expect(errorProvider.log).toHaveBeenCalledWith('error message', 'error')
  })
})
