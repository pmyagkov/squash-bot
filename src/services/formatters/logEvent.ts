import type { LogEvent } from '~/types/logEvent'
import { code } from '~/helpers/format'

export function formatLogEvent(event: LogEvent): string {
  switch (event.type) {
    case 'bot_started':
      return `🟢 Bot started as @${event.botUsername}`
    case 'bot_stopped':
      return '🔴 Bot stopped'
    case 'unhandled_error':
      return `❌ Unhandled error: ${event.error}`
    case 'event_created':
      return `📅 Event created: ${event.date}, ${event.courts} courts`
    case 'event_announced':
      return `📢 Event announced: ${event.date}`
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
      return `📋 Scaffold created: ${event.day} ${event.time}, ${event.courts} courts`
    case 'scaffold_toggled':
      return `🔀 Scaffold ${code(event.scaffoldId)}: ${event.active ? 'activated' : 'deactivated'}`
    case 'scaffold_deleted':
      return `🗑 Scaffold deleted: ${code(event.scaffoldId)}`
    case 'not_finalized_reminder':
      return `⏰ Not-finalized reminder: ${code(event.eventId)} (${event.date})`
  }
}
