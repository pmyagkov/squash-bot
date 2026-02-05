import { InlineKeyboard } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { Event, EventStatus } from '~/types'
import { config } from '~/config'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Builds inline keyboard based on event status
 */
export function buildInlineKeyboard(status: EventStatus): InlineKeyboard {
  if (status === 'cancelled') {
    // Show only Restore button
    return new InlineKeyboard().text('🔄 Restore', 'event:restore')
  }

  if (status === 'finalized') {
    // No buttons for finalized events
    return new InlineKeyboard()
  }

  // Active event (announced status)
  return new InlineKeyboard()
    .text("I'm in", 'event:join')
    .text("I'm out", 'event:leave')
    .row()
    .text('+court', 'event:add_court')
    .text('-court', 'event:rm_court')
    .row()
    .text('✅ Finalize', 'event:finalize')
    .text('❌ Cancel', 'event:cancel')
}

/**
 * Formats event message for Telegram announcement
 */
export function formatEventMessage(event: Event): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const dayName = eventDate.format('dddd')
  const dateStr = eventDate.format('D MMMM')
  const timeStr = eventDate.format('HH:mm')

  return `🎾 Squash: ${dayName}, ${dateStr}, ${timeStr}
Courts: ${event.courts}

Participants:
(nobody yet)`
}
