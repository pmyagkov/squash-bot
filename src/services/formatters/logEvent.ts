import type { LogEvent } from '~/types/logEvent'
import { code } from '~/helpers/format'
import { formatCourts, formatActiveStatus, formatEventStatus, formatPrivacy } from '~/ui/constants'

function ownerSuffix(ownerLabel?: string): string {
  return ownerLabel ? ` | 👑 ${code(ownerLabel)}` : ''
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
      return `📅 Event created\n\n${event.date}${ownerSuffix(event.ownerLabel)}\n${formatCourts(event.courts)} | ${formatEventStatus(event.status)} | ${formatPrivacy(event.isPrivate)} | ${code(event.eventId)}`
    case 'event_announced':
      return `📢 Event announced\n\n${event.date}${ownerSuffix(event.ownerLabel)}\n${formatCourts(event.courts)} | ${formatPrivacy(event.isPrivate)} | ${code(event.eventId)}`
    case 'event_finalized':
      return `✅ Event finalized: ${event.date}, ${event.participantCount} players`
    case 'event_cancelled':
      return `❌ Event cancelled: ${event.date}`
    case 'event_restored':
      return `🔄 Event restored: ${event.date}`
    case 'participant_joined':
      return `👋 ${event.userName} joined ${code(event.eventId)}`
    case 'participant_left':
      return `👋 ${event.userName} left ${code(event.eventId)}`
    case 'court_added':
      return `➕ Court added: ${code(event.eventId)} (now ${event.courts})`
    case 'court_removed':
      return `➖ Court removed: ${code(event.eventId)} (now ${event.courts})`
    case 'payment_received':
      return `💰 Payment received: ${event.amount} din from ${event.userName}`
    case 'payment_check_completed':
      return `🔍 Payment check completed: ${event.eventsChecked} events checked`
    case 'scaffold_created':
      return `📋 Scaffold created\n\n${event.day}, ${event.time}${ownerSuffix(event.ownerLabel)}\n${formatCourts(event.courts)} | ${formatActiveStatus(event.isActive)} | ${formatPrivacy(event.isPrivate)} | ${code(event.scaffoldId)}`
    case 'scaffold_toggled':
      return `🔀 Scaffold ${code(event.scaffoldId)}: ${event.active ? 'activated' : 'deactivated'}`
    case 'scaffold_deleted':
      return `🗑 Scaffold deleted: ${code(event.scaffoldId)}`
  }
}
