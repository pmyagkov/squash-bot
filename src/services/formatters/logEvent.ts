import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { LogEvent } from '~/types/logEvent'
import type { Participant } from '~/types'
import { config } from '~/config'
import { formatDate } from '~/ui/constants'
import { formatParticipantLabel } from '~/services/formatters/participant'

dayjs.extend(utc)
dayjs.extend(timezone)

const full = { full: true } as const

function pl(p: Participant): string {
  return formatParticipantLabel(p, full)
}

function ed(datetime: Date): string {
  return formatDate(dayjs.tz(datetime, config.timezone))
}

function privacy(v: boolean): string {
  return v ? 'private' : 'public'
}

function active(v: boolean): string {
  return v ? 'yes' : 'no'
}

export function formatLogEvent(event: LogEvent): string {
  switch (event.type) {
    // --- System (untagged) ---
    case 'bot_started':
      return `🟢 Bot started as @${event.botUsername}`
    case 'bot_stopped':
      return '🔴 Bot stopped'
    // --- Event lifecycle ---
    case 'event_created': {
      const owner = event.owner ? ` · 👑 ${pl(event.owner)}` : ''
      return `[${event.event.id}] 📅 Created · ${ed(event.event.datetime)} · 🏸 ${event.event.courts}${owner}`
    }
    case 'event_announced': {
      const owner = event.owner ? ` · 👑 ${pl(event.owner)}` : ''
      return `[${event.event.id}] 📢 Announced · ${ed(event.event.datetime)}${owner}`
    }
    case 'event_finalized':
      return `[${event.event.id}] ✅ Finalized · ${event.participants.length} players`
    case 'event_cancelled':
      return `[${event.event.id}] ❌ Cancelled`
    case 'event_restored':
      return `[${event.event.id}] 🔄 Restored`
    case 'event_unfinalized':
      return `[${event.event.id}] ↩️ Unfinalized`
    case 'event_deleted':
      return `[${event.event.id}] 🗑 Deleted`
    case 'event_undeleted':
      return `[${event.event.id}] ♻️ Undeleted`
    case 'event_transferred':
      return `[${event.event.id}] 🔄 Transferred: ${pl(event.from)} → ${pl(event.to)}`

    // --- Event updates ---
    case 'event_updated':
      switch (event.field) {
        case 'courts':
          return `[${event.event.id}] 📝 Courts: ${event.oldValue} → ${event.newValue}`
        case 'date':
          return `[${event.event.id}] 📝 Date: ${ed(event.oldValue)} → ${ed(event.newValue)}`
        case 'privacy':
          return `[${event.event.id}] 📝 Privacy: ${privacy(event.oldValue)} → ${privacy(event.newValue)}`
        case 'participant_added':
          return `[${event.event.id}] 📝 +${pl(event.participant)}`
        case 'participant_removed':
          return `[${event.event.id}] 📝 −${pl(event.participant)}`
      }
      break

    // --- Participants ---
    case 'participant_joined':
      return `[${event.event.id}] 👋 ${pl(event.participant)} joined`
    case 'participant_left':
      return `[${event.event.id}] 👋 ${pl(event.participant)} left`
    case 'participant_registered':
      return `👤 New participant: ${pl(event.participant)} (${event.participant.id})`

    // --- Payments ---
    case 'payment_received':
      return `[${event.event.id}] 💰 Payment: ${event.amount} din from ${pl(event.participant)}`
    case 'payment_cancelled':
      return `[${event.event.id}] 💸 Payment cancelled: ${pl(event.participant)}`
    case 'info_payment_updated':
      return `💳 Payment info: ${pl(event.participant)} → ${event.paymentInfo}`

    // --- Scaffolds ---
    case 'scaffold_created': {
      const owner = event.owner ? ` · 👑 ${pl(event.owner)}` : ''
      return `[${event.scaffold.id}] 📋 Created · ${event.scaffold.dayOfWeek}, ${event.scaffold.time} · 🏸 ${event.scaffold.defaultCourts}${owner}`
    }
    case 'scaffold_deleted':
      return `[${event.scaffold.id}] 🗑 Deleted`
    case 'scaffold_restored':
      return `[${event.scaffold.id}] ♻️ Restored`
    case 'scaffold_transferred':
      return `[${event.scaffold.id}] 🔄 Transferred: ${pl(event.from)} → ${pl(event.to)}`

    // --- Scaffold updates ---
    case 'scaffold_updated':
      switch (event.field) {
        case 'courts':
          return `[${event.scaffold.id}] 📝 Courts: ${event.oldValue} → ${event.newValue}`
        case 'day':
          return `[${event.scaffold.id}] 📝 Day: ${event.oldValue} → ${event.newValue}`
        case 'time':
          return `[${event.scaffold.id}] 📝 Time: ${event.oldValue} → ${event.newValue}`
        case 'privacy':
          return `[${event.scaffold.id}] 📝 Privacy: ${privacy(event.oldValue)} → ${privacy(event.newValue)}`
        case 'active':
          return `[${event.scaffold.id}] 📝 Active: ${active(event.oldValue)} → ${active(event.newValue)}`
        case 'deadline': {
          const old = event.oldValue ?? 'default'
          return `[${event.scaffold.id}] 📝 Deadline: ${old} → ${event.newValue}`
        }
        case 'participant_added':
          return `[${event.scaffold.id}] 📝 +${pl(event.participant)}`
        case 'participant_removed':
          return `[${event.scaffold.id}] 📝 −${pl(event.participant)}`
      }
      break

    // --- Notifications ---
    case 'event-not-finalized-reminder':
      return `[${event.event.id}] ⏰ Not finalized reminder`
  }
}
