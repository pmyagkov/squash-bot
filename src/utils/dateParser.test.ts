import { describe, it, expect } from 'vitest'
import { parseDate } from './dateParser'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

describe('parseDate', () => {
  describe('absolute dates', () => {
    it('should parse absolute date format YYYY-MM-DD', () => {
      const result = parseDate('2024-01-20')
      const expected = dayjs.tz('2024-01-20', 'YYYY-MM-DD', 'Europe/Belgrade').toDate()
      expect(result.getTime()).toBe(expected.getTime())
    })
  })

  describe('relative dates', () => {
    it('should parse "today" as today\'s date', () => {
      const result = parseDate('today')
      const expected = dayjs.tz(new Date(), 'Europe/Belgrade').startOf('day').toDate()
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('should parse "tomorrow" as tomorrow\'s date', () => {
      const result = parseDate('tomorrow')
      const expected = dayjs.tz(new Date(), 'Europe/Belgrade').add(1, 'day').startOf('day').toDate()
      expect(result.getTime()).toBe(expected.getTime())
    })
  })

  describe('day names', () => {
    it('should parse short day name "sat" to next Saturday', () => {
      const result = parseDate('sat')
      const now = dayjs.tz(new Date(), 'Europe/Belgrade')
      const currentDay = now.day()
      const dayOfWeek = 6 // Saturday
      let daysUntil = dayOfWeek - currentDay
      if (daysUntil <= 0) {
        daysUntil += 7
      }
      const expected = now.add(daysUntil, 'day').startOf('day').toDate()
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('should parse full day name "saturday" to next Saturday', () => {
      const result = parseDate('saturday')
      const now = dayjs.tz(new Date(), 'Europe/Belgrade')
      const currentDay = now.day()
      const dayOfWeek = 6 // Saturday
      let daysUntil = dayOfWeek - currentDay
      if (daysUntil <= 0) {
        daysUntil += 7
      }
      const expected = now.add(daysUntil, 'day').startOf('day').toDate()
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('should parse all short day names correctly', () => {
      const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sun']
      const dayNumbers = [1, 2, 3, 4, 5, 0]

      dayNames.forEach((dayName, index) => {
        const result = parseDate(dayName)
        const now = dayjs.tz(new Date(), 'Europe/Belgrade')
        const currentDay = now.day()
        const dayOfWeek = dayNumbers[index]
        let daysUntil = dayOfWeek - currentDay
        if (daysUntil <= 0) {
          daysUntil += 7
        }
        const expected = now.add(daysUntil, 'day').startOf('day').toDate()
        expect(result.getTime()).toBe(expected.getTime())
      })
    })
  })

  describe('next week day names', () => {
    it('should parse "next tue" to 7+ days from now', () => {
      const result = parseDate('next tue')
      const now = dayjs.tz(new Date(), 'Europe/Belgrade')
      const resultDayjs = dayjs.tz(result, 'Europe/Belgrade')
      const daysUntil = resultDayjs.diff(now, 'day')

      // Should always be at least 7 days from now
      expect(daysUntil).toBeGreaterThanOrEqual(7)
      // Should be a Tuesday
      expect(resultDayjs.day()).toBe(2)
    })

    it('should parse "next saturday" to 7+ days from now', () => {
      const result = parseDate('next saturday')
      const now = dayjs.tz(new Date(), 'Europe/Belgrade')
      const resultDayjs = dayjs.tz(result, 'Europe/Belgrade')
      const daysUntil = resultDayjs.diff(now, 'day')

      // Should always be at least 7 days from now
      expect(daysUntil).toBeGreaterThanOrEqual(7)
      // Should be a Saturday
      expect(resultDayjs.day()).toBe(6)
    })
  })

  describe('case insensitivity', () => {
    it('should be case insensitive for "SAT"', () => {
      const result = parseDate('SAT')
      const expected = parseDate('sat')
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('should be case insensitive for "Next TUE"', () => {
      const result = parseDate('Next TUE')
      const expected = parseDate('next tue')
      expect(result.getTime()).toBe(expected.getTime())
    })
  })

  describe('error handling', () => {
    it('should throw error for invalid date string', () => {
      // dayjs throws "Invalid time value" for completely invalid strings
      expect(() => parseDate('invalid-date-string')).toThrow()
    })

    it('should throw error for invalid day name', () => {
      // dayjs throws "Invalid time value" for invalid day names
      expect(() => parseDate('xyz')).toThrow()
    })
  })

  describe('timezone override', () => {
    it('should use custom timezone when provided', () => {
      // Parse the same absolute date in different timezones
      const date = '2024-01-20'
      const resultBelgrade = parseDate(date, 'Europe/Belgrade')
      const resultNewYork = parseDate(date, 'America/New_York')

      // The timestamps should be different because they represent
      // the same wall-clock time in different timezones
      expect(resultBelgrade.getTime()).not.toBe(resultNewYork.getTime())

      // The difference should be the timezone offset between Belgrade and New York
      const diffHours = (resultBelgrade.getTime() - resultNewYork.getTime()) / (1000 * 60 * 60)
      expect(Math.abs(diffHours)).toBeGreaterThan(0)
    })
  })
})
