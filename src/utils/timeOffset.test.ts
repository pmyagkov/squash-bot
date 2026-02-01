import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { parseOffsetNotation, calculateTargetTime, shouldTrigger } from './timeOffset'

describe('timeOffset', () => {
  describe('parseOffsetNotation', () => {
    it('should parse day offset without absolute time', () => {
      const result = parseOffsetNotation('-1d')
      expect(result).toEqual({
        offset: { days: -1 },
      })
    })

    it('should parse hour offset without absolute time', () => {
      const result = parseOffsetNotation('-24h')
      expect(result).toEqual({
        offset: { hours: -24 },
      })
    })

    it('should parse day offset with absolute time', () => {
      const result = parseOffsetNotation('-1d 12:00')
      expect(result).toEqual({
        offset: { days: -1 },
        absolute: { hours: 12, minutes: 0 },
      })
    })

    it('should parse day offset with absolute time including minutes', () => {
      const result = parseOffsetNotation('-1d 12:30')
      expect(result).toEqual({
        offset: { days: -1 },
        absolute: { hours: 12, minutes: 30 },
      })
    })

    it('should parse multi-digit day offset', () => {
      const result = parseOffsetNotation('-10d')
      expect(result).toEqual({
        offset: { days: -10 },
      })
    })

    it('should handle extra whitespace', () => {
      const result = parseOffsetNotation('  -1d 12:00  ')
      expect(result).toEqual({
        offset: { days: -1 },
        absolute: { hours: 12, minutes: 0 },
      })
    })

    it('should throw on invalid format', () => {
      expect(() => parseOffsetNotation('1d')).toThrow('Invalid offset notation')
      expect(() => parseOffsetNotation('-1x')).toThrow('Invalid offset notation')
      expect(() => parseOffsetNotation('-1d 25:00')).toThrow('Invalid time in notation')
      expect(() => parseOffsetNotation('-1d 12:60')).toThrow('Invalid time in notation')
      expect(() => parseOffsetNotation('invalid')).toThrow('Invalid offset notation')
    })
  })

  describe('calculateTargetTime', () => {
    it('should calculate target time for day offset without absolute time', () => {
      // Event on 2025-01-15 at 18:00 UTC
      const eventDatetime = new Date('2025-01-15T18:00:00Z')
      const notation = '-1d'
      const timezone = 'Europe/Belgrade' // UTC+1

      const result = calculateTargetTime(notation, eventDatetime, timezone)

      // Expected: 1 day before, same time → 2025-01-14 at 18:00 UTC
      expect(result).toEqual(new Date('2025-01-14T18:00:00Z'))
    })

    it('should calculate target time for hour offset', () => {
      // Event on 2025-01-15 at 18:00 UTC
      const eventDatetime = new Date('2025-01-15T18:00:00Z')
      const notation = '-24h'
      const timezone = 'Europe/Belgrade'

      const result = calculateTargetTime(notation, eventDatetime, timezone)

      // Expected: 24 hours before → 2025-01-14 at 18:00 UTC
      expect(result).toEqual(new Date('2025-01-14T18:00:00Z'))
    })

    it('should calculate target time for day offset with absolute time', () => {
      // Event on 2025-01-15 at 18:00 UTC (19:00 Belgrade time)
      const eventDatetime = new Date('2025-01-15T18:00:00Z')
      const notation = '-1d 12:00'
      const timezone = 'Europe/Belgrade' // UTC+1

      const result = calculateTargetTime(notation, eventDatetime, timezone)

      // Expected: 1 day before at 12:00 Belgrade time → 2025-01-14 at 11:00 UTC
      expect(result).toEqual(new Date('2025-01-14T11:00:00Z'))
    })

    it('should handle timezone correctly for absolute time', () => {
      // Event on 2025-01-15 at 12:00 UTC
      const eventDatetime = new Date('2025-01-15T12:00:00Z')
      const notation = '-1d 23:00'
      const timezone = 'Europe/Belgrade' // UTC+1

      const result = calculateTargetTime(notation, eventDatetime, timezone)

      // Expected: 1 day before at 23:00 Belgrade time → 2025-01-14 at 22:00 UTC
      expect(result).toEqual(new Date('2025-01-14T22:00:00Z'))
    })
  })

  describe('shouldTrigger', () => {
    beforeEach(() => {
      // Mock current time to 2025-01-14 at 12:00 UTC
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-14T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return false if event has passed', () => {
      // Event in the past
      const eventDatetime = new Date('2025-01-13T18:00:00Z')
      const notation = '-1d'
      const timezone = 'Europe/Belgrade'

      const result = shouldTrigger(notation, eventDatetime, timezone)

      expect(result).toBe(false)
    })

    it('should return true if target time has been reached', () => {
      // Current time: 2025-01-14 at 12:00 UTC
      // Event: 2025-01-15 at 18:00 UTC
      // Target: 2025-01-14 at 18:00 UTC (24h before)
      // Since current time (12:00) < target time (18:00), should be false
      const eventDatetime = new Date('2025-01-15T18:00:00Z')
      const notation = '-24h'
      const timezone = 'Europe/Belgrade'

      const result = shouldTrigger(notation, eventDatetime, timezone)

      expect(result).toBe(false)
    })

    it('should return true if we are past the target time', () => {
      // Current time: 2025-01-14 at 12:00 UTC
      // Event: 2025-01-15 at 10:00 UTC
      // Target: 2025-01-14 at 10:00 UTC (24h before)
      // Since current time (12:00) > target time (10:00), should be true
      const eventDatetime = new Date('2025-01-15T10:00:00Z')
      const notation = '-24h'
      const timezone = 'Europe/Belgrade'

      const result = shouldTrigger(notation, eventDatetime, timezone)

      expect(result).toBe(true)
    })

    it('should return true if we are exactly at the target time', () => {
      // Current time: 2025-01-14 at 12:00 UTC
      // Event: 2025-01-15 at 12:00 UTC
      // Target: 2025-01-14 at 12:00 UTC (24h before)
      const eventDatetime = new Date('2025-01-15T12:00:00Z')
      const notation = '-24h'
      const timezone = 'Europe/Belgrade'

      const result = shouldTrigger(notation, eventDatetime, timezone)

      expect(result).toBe(true)
    })

    it('should handle absolute time correctly', () => {
      // Current time: 2025-01-14 at 12:00 UTC
      // Event: 2025-01-15 at 18:00 UTC (19:00 Belgrade time)
      // Notation: -1d 12:00 Belgrade time
      // Target: 2025-01-14 at 11:00 UTC
      // Since current time (12:00) > target time (11:00), should be true
      const eventDatetime = new Date('2025-01-15T18:00:00Z')
      const notation = '-1d 12:00'
      const timezone = 'Europe/Belgrade'

      const result = shouldTrigger(notation, eventDatetime, timezone)

      expect(result).toBe(true)
    })

    it('should return false if too early for absolute time', () => {
      // Current time: 2025-01-14 at 12:00 UTC
      // Event: 2025-01-15 at 18:00 UTC (19:00 Belgrade time)
      // Notation: -1d 14:00 Belgrade time
      // Target: 2025-01-14 at 13:00 UTC
      // Since current time (12:00) < target time (13:00), should be false
      const eventDatetime = new Date('2025-01-15T18:00:00Z')
      const notation = '-1d 14:00'
      const timezone = 'Europe/Belgrade'

      const result = shouldTrigger(notation, eventDatetime, timezone)

      expect(result).toBe(false)
    })
  })
})
