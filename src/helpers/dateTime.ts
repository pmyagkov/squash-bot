import type { DayOfWeek } from '~/types'

/**
 * Parse day of week string to DayOfWeek type
 * @param dayStr - String representation of day (e.g., "mon", "monday", "Mon")
 * @returns DayOfWeek or null if invalid
 */
export function parseDayOfWeek(dayStr: string): DayOfWeek | null {
  const normalized = dayStr.toLowerCase()
  const dayMap: Record<string, DayOfWeek> = {
    mon: 'Mon',
    monday: 'Mon',
    tue: 'Tue',
    tuesday: 'Tue',
    wed: 'Wed',
    wednesday: 'Wed',
    thu: 'Thu',
    thursday: 'Thu',
    fri: 'Fri',
    friday: 'Fri',
    sat: 'Sat',
    saturday: 'Sat',
    sun: 'Sun',
    sunday: 'Sun',
  }
  return dayMap[normalized] ?? null
}
