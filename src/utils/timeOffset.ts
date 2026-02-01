import { toZonedTime, fromZonedTime } from 'date-fns-tz'

export interface ParsedOffset {
  offset?: {
    days?: number
    hours?: number
  }
  absolute?: {
    hours: number
    minutes?: number
  }
}

/**
 * Parses time offset notation like "-1d", "-24h", or "-1d 12:00"
 *
 * @param notation - Time offset string (e.g., "-1d", "-24h", "-1d 12:00")
 * @returns Parsed offset structure
 * @throws Error if notation format is invalid
 */
export function parseOffsetNotation(notation: string): ParsedOffset {
  const trimmed = notation.trim()

  // Pattern: -<number><unit> with optional HH:MM
  const match = trimmed.match(/^-(\d+)(d|h)(?:\s+(\d{1,2}):(\d{2}))?$/)

  if (!match) {
    throw new Error(`Invalid offset notation: ${notation}`)
  }

  const [, value, unit, hours, minutes] = match
  const numValue = parseInt(value, 10)

  const result: ParsedOffset = {}

  // Parse offset
  if (unit === 'd') {
    result.offset = { days: -numValue }
  } else if (unit === 'h') {
    result.offset = { hours: -numValue }
  }

  // Parse absolute time if present
  if (hours !== undefined) {
    const h = parseInt(hours, 10)
    const m = minutes ? parseInt(minutes, 10) : 0

    if (h < 0 || h > 23 || m < 0 || m > 59) {
      throw new Error(`Invalid time in notation: ${notation}`)
    }

    result.absolute = { hours: h, minutes: m }
  }

  return result
}

/**
 * Calculates the target datetime based on offset notation and event datetime
 *
 * @param notation - Time offset string (e.g., "-1d 12:00")
 * @param eventDatetime - The event's datetime
 * @param timezone - Timezone string (e.g., "Europe/Belgrade")
 * @returns Target datetime
 */
export function calculateTargetTime(notation: string, eventDatetime: Date, timezone: string): Date {
  const parsed = parseOffsetNotation(notation)

  // Convert event time to the target timezone
  const eventInTz = toZonedTime(eventDatetime, timezone)

  const targetInTz = new Date(eventInTz)

  // Apply offset
  if (parsed.offset?.days) {
    targetInTz.setDate(targetInTz.getDate() + parsed.offset.days)
  }
  if (parsed.offset?.hours) {
    targetInTz.setHours(targetInTz.getHours() + parsed.offset.hours)
  }

  // Apply absolute time if specified
  if (parsed.absolute) {
    targetInTz.setHours(parsed.absolute.hours)
    targetInTz.setMinutes(parsed.absolute.minutes ?? 0)
    targetInTz.setSeconds(0)
    targetInTz.setMilliseconds(0)
  }

  // Convert back to UTC
  return fromZonedTime(targetInTz, timezone)
}

/**
 * Determines if an action should be triggered based on offset notation
 *
 * Logic:
 * - If event has passed → false
 * - If current time >= target time → true
 * - Otherwise → false
 *
 * @param notation - Time offset string (e.g., "-1d 12:00")
 * @param eventDatetime - The event's datetime
 * @param timezone - Timezone string (e.g., "Europe/Belgrade")
 * @returns Whether the action should be triggered
 */
export function shouldTrigger(notation: string, eventDatetime: Date, timezone: string): boolean {
  const now = new Date()

  // If event has passed, don't trigger
  if (eventDatetime < now) {
    return false
  }

  const targetTime = calculateTargetTime(notation, eventDatetime, timezone)

  // Trigger if we've reached or passed the target time
  return now >= targetTime
}
