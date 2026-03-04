import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { LogEvent } from '~/types/logEvent'
import type { Participant } from '~/types'
import { code } from '~/helpers/format'
import { config } from '~/config'
import {
  formatDate,
  formatCourts,
  formatActiveStatus,
  formatEventStatus,
  formatPrivacy,
} from '~/ui/constants'
import { formatParticipantLabel } from '~/services/formatters/participant'

dayjs.extend(utc)
dayjs.extend(timezone)

function ownerSuffix(owner?: Participant): string {
  return owner ? ` | 👑 ${code(formatParticipantLabel(owner))}` : ''
}

function eventDate(datetime: Date): string {
  return formatDate(dayjs.tz(datetime, config.timezone))
}

export function formatLogEvent(event: LogEvent): string {
  switch (event.type) {
    case 'bot_started':
      return `🟢 Bot started as @${event.botUsername}`
    case 'bot_stopped':
      return '🔴 Bot stopped'
    case 'unhandled_error':
      return `❌ Unhandled error: ${event.error}`
    case 'event_created':
      return `📅 Event created\n\n${eventDate(event.event.datetime)}${ownerSuffix(event.owner)}\n${formatCourts(event.event.courts)} | ${formatEventStatus(event.event.status)} | ${formatPrivacy(event.event.isPrivate)} | ${code(event.event.id)}`
    case 'event_announced':
      return `📢 Event announced\n\n${eventDate(event.event.datetime)}${ownerSuffix(event.owner)}\n${formatCourts(event.event.courts)} | ${formatPrivacy(event.event.isPrivate)} | ${code(event.event.id)}`
    case 'event_finalized':
      return `✅ Event finalized: ${eventDate(event.event.datetime)}, ${event.participants.length} players`
    case 'event_cancelled':
      return `❌ Event cancelled: ${eventDate(event.event.datetime)}`
    case 'event_restored':
      return `🔄 Event restored: ${eventDate(event.event.datetime)}`
    case 'event_unfinalized':
      return `↩️ Event unfinalized: ${eventDate(event.event.datetime)}`
    case 'event_deleted':
      return `🗑 Event deleted: ${code(event.event.id)}`
    case 'event_undeleted':
      return `♻️ Event undeleted: ${code(event.event.id)}`
    case 'event_transferred':
      return `🔄 Event ${code(event.event.id)} transferred: ${formatParticipantLabel(event.from)} → ${formatParticipantLabel(event.to)}`
    case 'participant_joined':
      return `👋 ${formatParticipantLabel(event.participant)} joined ${code(event.event.id)}`
    case 'participant_left':
      return `👋 ${formatParticipantLabel(event.participant)} left ${code(event.event.id)}`
    case 'participant_registered':
      return `👤 New participant: ${event.participant.displayName} (${code(event.participant.id)})`
    case 'court_added':
      return `➕ Court added: ${code(event.event.id)} (now ${event.event.courts})`
    case 'court_removed':
      return `➖ Court removed: ${code(event.event.id)} (now ${event.event.courts})`
    case 'payment_received':
      return `💰 Payment received: ${event.amount} din from ${formatParticipantLabel(event.participant)}`
    case 'payment_cancelled':
      return `💸 Payment cancelled: ${formatParticipantLabel(event.participant)} in ${code(event.event.id)}`
    case 'payment_check_completed':
      return `🔍 Payment check completed: ${event.eventsChecked} events checked`
    case 'info_payment_updated':
      return `💳 Payment info updated: ${formatParticipantLabel(event.participant)} → ${event.paymentInfo}`
    case 'scaffold_created':
      return `📋 Scaffold created\n\n${event.scaffold.dayOfWeek}, ${event.scaffold.time}${ownerSuffix(event.owner)}\n${formatCourts(event.scaffold.defaultCourts)} | ${formatActiveStatus(event.scaffold.isActive)} | ${formatPrivacy(event.scaffold.isPrivate)} | ${code(event.scaffold.id)}`
    case 'scaffold_toggled':
      return `🔀 Scaffold ${code(event.scaffold.id)}: ${event.scaffold.isActive ? 'activated' : 'deactivated'}`
    case 'scaffold_deleted':
      return `🗑 Scaffold deleted: ${code(event.scaffold.id)}`
    case 'scaffold_restored':
      return `♻️ Scaffold restored: ${code(event.scaffold.id)}`
    case 'scaffold_transferred':
      return `🔄 Scaffold ${code(event.scaffold.id)} transferred: ${formatParticipantLabel(event.from)} → ${formatParticipantLabel(event.to)}`
    case 'event-not-finalized-reminder':
      return `⏰ Event not-finalized reminder: ${code(event.event.id)} (${eventDate(event.event.datetime)})`
  }
}
