import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { config } from '../config'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const DAY_NAMES: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 0,
  sunday: 0,
}

/**
 * Parse date string in various formats
 * @param dateStr - Date string to parse
 * @param timezoneOverride - Optional timezone override (defaults to config.timezone)
 * @returns Date object
 */
export function parseDate(dateStr: string, timezoneOverride?: string): Date {
  const tz = timezoneOverride || config.timezone
  const normalized = dateStr.toLowerCase().trim()

  // Absolute date: 2024-01-20
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dayjs.tz(dateStr, 'YYYY-MM-DD', tz).toDate()
  }

  // Relative: tomorrow
  if (normalized === 'tomorrow') {
    return dayjs.tz(new Date(), tz).add(1, 'day').startOf('day').toDate()
  }

  // Relative: today
  if (normalized === 'today') {
    return dayjs.tz(new Date(), tz).startOf('day').toDate()
  }

  // Day name: sat, tue, mon (next occurrence)
  if (DAY_NAMES[normalized] !== undefined) {
    const dayOfWeek = DAY_NAMES[normalized]
    const now = dayjs.tz(new Date(), tz)
    const currentDay = now.day()
    let daysUntil = dayOfWeek - currentDay

    // If day is today or already passed this week, get next week's occurrence
    if (daysUntil <= 0) {
      daysUntil += 7
    }

    return now.add(daysUntil, 'day').startOf('day').toDate()
  }

  // Next week: next tue, next sat
  const nextMatch = normalized.match(/^next\s+(\w+)$/)
  if (nextMatch) {
    const dayName = nextMatch[1]
    if (DAY_NAMES[dayName] !== undefined) {
      const dayOfWeek = DAY_NAMES[dayName]
      const now = dayjs.tz(new Date(), tz)
      const currentDay = now.day()
      let daysUntil = dayOfWeek - currentDay

      // Always get next week's occurrence (add 7 days minimum)
      if (daysUntil <= 0) {
        daysUntil += 7 // If day already passed this week, add 7 to get next week
      } else {
        daysUntil += 7 // If day is coming this week, add 7 to get next week
      }

      return now.add(daysUntil, 'day').startOf('day').toDate()
    }
  }

  // Try to parse as ISO date
  const parsed = dayjs.tz(dateStr, tz)
  if (parsed.isValid()) {
    return parsed.toDate()
  }

  throw new Error(`Unable to parse date: ${dateStr}`)
}
