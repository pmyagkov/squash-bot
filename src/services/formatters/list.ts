import type { Scaffold, Event } from '~/types'
import { code } from '~/helpers/format'
import { formatCourts, formatActiveStatus, formatEventStatus, formatPrivacy } from '~/ui/constants'

/**
 * Format a scaffold as a pipe-separated list item for /scaffold list
 */
export function formatScaffoldListItem(scaffold: Scaffold, ownerLabel?: string): string {
  const ownerSuffix = ownerLabel ? ` | 👑 ${ownerLabel}` : ''
  return `${code(scaffold.id)} | ${scaffold.dayOfWeek}, ${scaffold.time} | ${formatCourts(scaffold.defaultCourts)} | ${formatActiveStatus(scaffold.isActive)} | ${formatPrivacy(scaffold.isPrivate)}${ownerSuffix}`
}

/**
 * Format an event as a pipe-separated list item for /event list
 */
export function formatEventListItem(
  event: Event,
  formattedDate: string,
  ownerLabel?: string
): string {
  const ownerSuffix = ownerLabel ? ` | 👑 ${ownerLabel}` : ''
  return `${code(event.id)} | ${formattedDate} | ${formatCourts(event.courts)} | ${formatEventStatus(event.status)} | ${formatPrivacy(event.isPrivate)}${ownerSuffix}`
}
