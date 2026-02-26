import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { crashProcess } from './crashProcess'

describe('crashProcess', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('logs reason to stderr', () => {
    expect(() => crashProcess('transport failed')).toThrow('transport failed')
    expect(consoleSpy).toHaveBeenCalledWith('[FATAL] transport failed')
  })

  it('throws an error with the reason', () => {
    expect(() => crashProcess('409 Conflict')).toThrow('409 Conflict')
  })

  it('schedules force exit after 3 seconds', () => {
    expect(() => crashProcess('test')).toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits via logger promise when logger succeeds', async () => {
    const mockLogger = { error: vi.fn().mockResolvedValue(undefined) }

    expect(() => crashProcess('test', mockLogger as never)).toThrow()
    expect(mockLogger.error).toHaveBeenCalledWith('FATAL: test')

    // flush .catch(() => {}).then(() => process.exit(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits even when logger fails', async () => {
    const mockLogger = { error: vi.fn().mockRejectedValue(new Error('send failed')) }

    expect(() => crashProcess('test', mockLogger as never)).toThrow()

    // .catch(() => {}) swallows the rejection, .then() still fires
    await vi.advanceTimersByTimeAsync(0)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits without logger (logger undefined)', () => {
    expect(() => crashProcess('no logger')).toThrow()
    // Promise.resolve().then(() => exit) — microtask
    // With fake timers, advanceTimersByTime triggers the setTimeout
    vi.advanceTimersByTime(3000)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
