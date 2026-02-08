import { describe, it, expect } from 'vitest'
import { calculateNextOccurrence } from '~/business/event'
import { setupFakeTime } from '@integration/helpers/timeHelpers'
import type { Scaffold, DayOfWeek } from '~/types'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { config } from '~/config'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('calculateNextOccurrence', () => {
  // Set fixed date: Monday, January 15, 2024 at 12:00:00
  const FIXED_DATE = new Date('2024-01-15T12:00:00Z')
  setupFakeTime(FIXED_DATE)

  describe('basic day of week calculation', () => {
    it('should calculate next Tuesday from Monday', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Tue',
        time: '21:00',
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)

      // Should be tomorrow (Tuesday, January 16)
      expect(nextOccurrence.getDay()).toBe(2) // Tuesday = 2

      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('YYYY-MM-DD')).toBe('2024-01-16')
      expect(eventTime.format('HH:mm')).toBe('21:00')
    })

    it('should calculate next Saturday from Monday', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Sat',
        time: '18:00',
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)

      // Should be this Saturday (January 20)
      expect(nextOccurrence.getDay()).toBe(6) // Saturday = 6

      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('YYYY-MM-DD')).toBe('2024-01-20')
      expect(eventTime.format('HH:mm')).toBe('18:00')
    })

    it('should calculate next Monday from Monday (next week)', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Mon',
        time: '11:00', // Earlier than current time (12:00)
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)

      // Should be next Monday (January 22, not today, since time has passed)
      expect(nextOccurrence.getDay()).toBe(1) // Monday = 1

      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('YYYY-MM-DD')).toBe('2024-01-22')
      expect(eventTime.format('HH:mm')).toBe('11:00')
    })

    it('should calculate next Sunday from Monday', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Sun',
        time: '10:00',
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)

      // Should be this Sunday (January 21)
      expect(nextOccurrence.getDay()).toBe(0) // Sunday = 0

      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('YYYY-MM-DD')).toBe('2024-01-21')
      expect(eventTime.format('HH:mm')).toBe('10:00')
    })
  })

  describe('same day time check', () => {
    it('should return next week if same day but time has passed', () => {
      // Current time: Monday 12:00
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Mon',
        time: '11:00', // Earlier than current time
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)

      // Should be next Monday (not today, since time has passed)
      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('YYYY-MM-DD')).toBe('2024-01-22')
      expect(eventTime.format('HH:mm')).toBe('11:00')
    })

    it('should return today if same day and time has not passed', () => {
      // Current time: Monday 12:00
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Mon',
        time: '20:00', // Later than current time
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)

      // Should be today (Monday)
      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('YYYY-MM-DD')).toBe('2024-01-15')
      expect(eventTime.format('HH:mm')).toBe('20:00')
    })
  })

  describe('time format validation', () => {
    it('should accept valid time format HH:MM', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Tue',
        time: '09:30',
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)
      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('HH:mm')).toBe('09:30')
    })

    it('should accept midnight 00:00', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Wed',
        time: '00:00',
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)
      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('HH:mm')).toBe('00:00')
    })

    it('should accept 23:59', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Thu',
        time: '23:59',
        defaultCourts: 2,
        isActive: true,
      }

      const nextOccurrence = calculateNextOccurrence(scaffold)
      const eventTime = dayjs.tz(nextOccurrence, config.timezone)
      expect(eventTime.format('HH:mm')).toBe('23:59')
    })

    it('should reject invalid time format (no colon)', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Fri',
        time: '2100',
        defaultCourts: 2,
        isActive: true,
      }

      expect(() => calculateNextOccurrence(scaffold)).toThrow(
        'Invalid scaffold: invalid time format "2100"'
      )
    })

    it('should reject invalid hour (24:00)', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Fri',
        time: '24:00',
        defaultCourts: 2,
        isActive: true,
      }

      expect(() => calculateNextOccurrence(scaffold)).toThrow(
        'Invalid scaffold: invalid time format "24:00"'
      )
    })

    it('should reject invalid minutes (60)', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Fri',
        time: '12:60',
        defaultCourts: 2,
        isActive: true,
      }

      expect(() => calculateNextOccurrence(scaffold)).toThrow(
        'Invalid scaffold: invalid time format "12:60"'
      )
    })
  })

  describe('day of week validation', () => {
    it('should accept all valid day names', () => {
      const days: { day: string; dayNum: number }[] = [
        { day: 'Mon', dayNum: 1 },
        { day: 'Tue', dayNum: 2 },
        { day: 'Wed', dayNum: 3 },
        { day: 'Thu', dayNum: 4 },
        { day: 'Fri', dayNum: 5 },
        { day: 'Sat', dayNum: 6 },
        { day: 'Sun', dayNum: 0 },
      ]

      days.forEach(({ day, dayNum }) => {
        const scaffold: Scaffold = {
          id: 'sc_test',
          dayOfWeek: day as unknown as DayOfWeek,
          time: '19:00',
          defaultCourts: 2,
          isActive: true,
        }

        const nextOccurrence = calculateNextOccurrence(scaffold)
        expect(nextOccurrence.getDay()).toBe(dayNum)
      })
    })

    it('should reject invalid day of week', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Invalid' as unknown as DayOfWeek,
        time: '19:00',
        defaultCourts: 2,
        isActive: true,
      }

      expect(() => calculateNextOccurrence(scaffold)).toThrow(
        'Invalid scaffold: unknown dayOfWeek "Invalid"'
      )
    })

    it('should reject missing day of week', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: undefined as unknown as DayOfWeek,
        time: '19:00',
        defaultCourts: 2,
        isActive: true,
      }

      expect(() => calculateNextOccurrence(scaffold)).toThrow('Invalid scaffold: missing dayOfWeek')
    })
  })

  describe('missing time field', () => {
    it('should reject missing time', () => {
      const scaffold: Scaffold = {
        id: 'sc_test',
        dayOfWeek: 'Tue',
        time: undefined as unknown as string,
        defaultCourts: 2,
        isActive: true,
      }

      expect(() => calculateNextOccurrence(scaffold)).toThrow('Invalid scaffold: missing time')
    })
  })
})
