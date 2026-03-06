import { InlineKeyboard } from 'grammy'

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

export function buildAnnouncementDayKeyboard(
  scaffoldDay: string,
  scaffoldId: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  for (let i = 1; i <= 3; i++) {
    const dayName = dayNameBefore(scaffoldDay, i)
    keyboard.text(dayName, `edit:scaffold:ann-date:-${i}d:${scaffoldId}`)
  }
  return keyboard
}

export function buildAnnouncementTimeKeyboard(
  dayOffset: string,
  scaffoldId: string
): InlineKeyboard {
  return new InlineKeyboard()
    .text('10:00', `edit:scaffold:ann-time:${dayOffset}-10-00:${scaffoldId}`)
    .text('18:00', `edit:scaffold:ann-time:${dayOffset}-18-00:${scaffoldId}`)
    .row()
    .text('✏️ Custom', `edit:scaffold:ann-custom:${dayOffset}:${scaffoldId}`)
}

export function parseAnnTimeCallback(value: string): string {
  const match = value.match(/^(-\d+d)-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid ann-time value: ${value}`)
  }
  return `${match[1]} ${match[2]}:${match[3]}`
}
