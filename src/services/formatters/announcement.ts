import type { DayOfWeek } from '~/types'
import { parseOffsetNotation } from '~/utils/timeOffset'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function formatAnnouncementDeadline(
  notation: string | null | undefined,
  defaultNotation?: string
): string {
  const effective = notation ?? defaultNotation ?? ''
  const parsed = parseOffsetNotation(effective)

  const days = parsed.offset?.days ? Math.abs(parsed.offset.days) : 0
  const dayLabel = days === 1 ? 'a day before' : `${days} days before`

  const h = parsed.absolute?.hours ?? 0
  const m = parsed.absolute?.minutes ?? 0
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

  return `📣 Announcement: ${dayLabel}, ${time}`
}

export function dayNameBefore(scaffoldDay: string, offset: number): string {
  const index = DAYS.indexOf(scaffoldDay as DayOfWeek)
  const targetIndex = (((index - offset) % 7) + 7) % 7
  return DAYS[targetIndex]
}
