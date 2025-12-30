import { vi, beforeEach, afterEach } from 'vitest'

/**
 * Helper to manage fake timers in tests
 * Usage:
 *   const timeHelper = useFakeTime(new Date('2024-01-15T12:00:00'))
 *   // ... test code ...
 *   timeHelper.restore()
 */
export function useFakeTime(date: Date) {
  vi.useFakeTimers()
  vi.setSystemTime(date)

  return {
    /**
     * Advance time by specified milliseconds
     */
    advanceTime: (ms: number) => {
      vi.advanceTimersByTime(ms)
    },

    /**
     * Set system time to a new date
     */
    setTime: (newDate: Date) => {
      vi.setSystemTime(newDate)
    },

    /**
     * Get current fake time
     */
    getTime: () => {
      return new Date()
    },

    /**
     * Restore real timers
     */
    restore: () => {
      vi.useRealTimers()
    },
  }
}

/**
 * Setup fake time before each test and restore after
 * Usage in describe block:
 *   setupFakeTime(new Date('2024-01-15T12:00:00'))
 */
export function setupFakeTime(date: Date) {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(date)
  })

  afterEach(() => {
    vi.useRealTimers()
  })
}
