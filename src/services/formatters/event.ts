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
 * Participant with participation count
 */
export interface EventParticipantDisplay {
  participant: {
    telegramUsername?: string
    displayName: string
  }
  participations: number
}

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

/**
 * Formats announcement message with participants and status
 */
export function formatAnnouncementText(
  event: Event,
  participants: EventParticipantDisplay[],
  finalized: boolean = false,
  cancelled: boolean = false
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const dayName = eventDate.format('dddd')
  const dateStr = eventDate.format('D MMMM')
  const timeStr = eventDate.format('HH:mm')

  let messageText = `🎾 Squash: ${dayName}, ${dateStr}, ${timeStr}\nCourts: ${event.courts}\n\n`

  // Add participants
  if (participants.length === 0) {
    messageText += 'Participants:\n(nobody yet)'
  } else {
    const totalCount = participants.reduce((sum, ep) => sum + ep.participations, 0)
    messageText += `Participants (${totalCount}):\n`

    const participantNames = participants
      .map((ep) => {
        const username = ep.participant.telegramUsername
          ? `@${ep.participant.telegramUsername}`
          : ep.participant.displayName
        return ep.participations > 1 ? `${username} (×${ep.participations})` : username
      })
      .join(', ')

    messageText += participantNames
  }

  // Add status indicators
  if (finalized) {
    messageText += '\n\n✅ Finalized'
  } else if (cancelled) {
    messageText += '\n\n❌ Event cancelled'
  }

  return messageText
}

/**
 * Formats payment message with breakdown
 */
export function formatPaymentText(
  event: Event,
  participants: EventParticipantDisplay[],
  courtPrice: number
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const dateStr = eventDate.format('D.MM')
  const timeStr = eventDate.format('HH:mm')

  const totalParticipants = participants.reduce((sum, ep) => sum + ep.participations, 0)
  const totalCost = event.courts * courtPrice
  const perPerson = Math.round(totalCost / totalParticipants)

  let messageText = `💰 Payment for Squash ${dateStr} ${timeStr}\n\n`
  messageText += `Courts: ${event.courts} × ${courtPrice} din = ${totalCost} din\n`
  messageText += `Participants: ${totalParticipants}\n\n`
  messageText += `Each pays: ${perPerson} din\n\n`

  // List participants with their amounts
  for (const ep of participants) {
    const username = ep.participant.telegramUsername
      ? `@${ep.participant.telegramUsername}`
      : ep.participant.displayName
    const amount = perPerson * ep.participations
    const suffix = ep.participations > 1 ? ` (×${ep.participations})` : ''
    messageText += `${username} — ${amount} din${suffix}\n`
  }

  return messageText
}
