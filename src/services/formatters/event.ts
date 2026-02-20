import { InlineKeyboard } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { Event, EventStatus } from '~/types'
import { config } from '~/config'
import {
  BTN_JOIN,
  BTN_LEAVE,
  BTN_ADD_COURT,
  BTN_REMOVE_COURT,
  BTN_FINALIZE,
  BTN_CANCEL_EVENT,
  BTN_RESTORE,
  BTN_UNFINALIZE,
  formatDate,
  formatCourts,
} from '~/ui/constants'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Participant with participation count
 */
export interface EventParticipantDisplay {
  participant: {
    id?: string
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
    return new InlineKeyboard().text(BTN_RESTORE, 'event:undo-cancel')
  }

  if (status === 'finalized') {
    return new InlineKeyboard().text(BTN_UNFINALIZE, 'event:undo-finalize')
  }

  // Active event (announced status)
  return new InlineKeyboard()
    .text(BTN_JOIN, 'event:join')
    .text(BTN_LEAVE, 'event:leave')
    .row()
    .text(BTN_ADD_COURT, 'event:add-court')
    .text(BTN_REMOVE_COURT, 'event:remove-court')
    .row()
    .text(BTN_FINALIZE, 'event:finalize')
    .text(BTN_CANCEL_EVENT, 'event:cancel')
}

/**
 * Formats event message for Telegram announcement
 */
export function formatEventMessage(event: Event): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)

  return `🎾 Squash: ${formatDate(eventDate)}
${formatCourts(event.courts)}

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
  cancelled: boolean = false,
  paidParticipantIds: Set<string> = new Set()
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)

  let messageText = `🎾 Squash: ${formatDate(eventDate)}\n${formatCourts(event.courts)}\n\n`

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
        const multiplier = ep.participations > 1 ? ` (×${ep.participations})` : ''
        const paidMark = ep.participant.id && paidParticipantIds.has(ep.participant.id) ? ' ✓' : ''
        return `${username}${multiplier}${paidMark}`
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

  const totalParticipants = participants.reduce((sum, ep) => sum + ep.participations, 0)
  const totalCost = event.courts * courtPrice
  const perPerson = Math.round(totalCost / totalParticipants)

  let messageText = `💰 Payment for Squash ${formatDate(eventDate)}\n\n`
  messageText += `${formatCourts(event.courts)} × ${courtPrice} din = ${totalCost} din\n`
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

/**
 * Formats personal payment DM text for a participant
 */
export function formatPersonalPaymentText(
  event: Event,
  amount: number,
  courts: number,
  courtPrice: number,
  totalParticipants: number,
  chatId: number,
  messageId: string
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const totalCost = courts * courtPrice

  // Convert chatId for t.me link (remove -100 prefix for supergroups)
  const chatIdStr = String(chatId).replace(/^-100/, '')
  const link = `https://t.me/c/${chatIdStr}/${messageId}`

  let text = `💰 Payment for Squash ${formatDate(eventDate)}\n\n`
  text += `${formatCourts(courts)} × ${courtPrice} din = ${totalCost} din\n`
  text += `Participants: ${totalParticipants}\n`
  text += `Full details: ${link}\n\n`
  text += `Your amount: ${amount} din`

  return text
}

/**
 * Formats the paid version of a personal payment DM
 */
export function formatPaidPersonalPaymentText(baseText: string, paidDate: Date): string {
  const paidDayjs = dayjs.tz(paidDate, config.timezone)
  return `${baseText}\n\n✓ Paid on ${formatDate(paidDayjs)}`
}

/**
 * Formats fallback notification for participants who can't receive DMs
 */
export function formatFallbackNotificationText(
  participantNames: string[],
  botUsername: string
): string {
  const mentions = participantNames.join(', ')
  const link = `https://t.me/${botUsername}?start`

  return `⚠️ I can't reach you personally, guys\n\n${mentions}\n\nPlease start a chat with me: ${link}\n\n(Click the link and send /start)`
}
