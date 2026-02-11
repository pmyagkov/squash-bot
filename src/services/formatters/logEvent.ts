import type { LogEvent } from '~/types/logEvent'

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
    case 'event_finalized':
      return `✅ Event finalized: ${event.date}, ${event.participantCount} players`
    case 'event_cancelled':
      return `❌ Event cancelled: ${event.date}`
    case 'payment_received':
      return `💰 Payment received: ${event.amount} din from ${event.userName}`
    case 'payment_check_completed':
      return `🔍 Payment check completed: ${event.eventsChecked} events checked`
  }
}
