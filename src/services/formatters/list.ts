import type { Scaffold, Event } from '~/types'
import { code } from '~/helpers/format'
import { formatCourts, formatActiveStatus, formatEventStatus, formatPrivacy } from '~/ui/constants'

/**
 * Format a scaffold as a 2-line block:
 * Line 1: day, time [| 👑 owner]
 * Line 2: courts | active | privacy | id
 */
export function formatScaffoldListItem(scaffold: Scaffold, ownerLabel?: string): string {
  const ownerSuffix = ownerLabel ? ` | 👑 ${ownerLabel}` : ''
  const line1 = `${scaffold.dayOfWeek}, ${scaffold.time}${ownerSuffix}`
  const line2 = `${formatCourts(scaffold.defaultCourts)} | ${formatActiveStatus(scaffold.isActive)} | ${formatPrivacy(scaffold.isPrivate)} | ${code(scaffold.id)}`
  return `${line1}\n${line2}`
}

/**
 * Format an event as a 2-line block:
 * Line 1: date [| 👑 owner]
 * Line 2: courts | status | privacy | id
 */
export function formatEventListItem(
  event: Event,
  formattedDate: string,
  ownerLabel?: string
): string {
  const ownerSuffix = ownerLabel ? ` | 👑 ${ownerLabel}` : ''
  const line1 = `${formattedDate}${ownerSuffix}`
  const line2 = `${formatCourts(event.courts)} | ${formatEventStatus(event.status)} | ${formatPrivacy(event.isPrivate)} | ${code(event.id)}`
  return `${line1}\n${line2}`
}
