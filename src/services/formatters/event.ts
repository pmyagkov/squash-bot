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
  BTN_ADD_PARTICIPANT,
  BTN_REMOVE_PARTICIPANT,
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
export function buildInlineKeyboard(
  status: EventStatus,
  isPrivate?: boolean,
  eventId?: string
): InlineKeyboard {
  if (status === 'cancelled') {
    return new InlineKeyboard().text(BTN_RESTORE, 'event:undo-cancel')
  }

  if (status === 'finalized') {
    return new InlineKeyboard().text(BTN_UNFINALIZE, 'event:undo-finalize')
  }

  // Private event — owner manages participants manually
  if (isPrivate && eventId) {
    return new InlineKeyboard()
      .text(BTN_ADD_PARTICIPANT, `edit:event:+participant:${eventId}`)
      .text(BTN_REMOVE_PARTICIPANT, `edit:event:-participant:${eventId}`)
      .row()
      .text(BTN_ADD_COURT, 'event:add-court')
      .text(BTN_REMOVE_COURT, 'event:delete-court')
      .row()
      .text(BTN_FINALIZE, 'event:finalize')
      .text(BTN_CANCEL_EVENT, 'event:cancel')
  }

  // Public event — self-serve join/leave
  return new InlineKeyboard()
    .text(BTN_JOIN, 'event:join')
    .text(BTN_LEAVE, 'event:leave')
    .row()
    .text(BTN_ADD_COURT, 'event:add-court')
    .text(BTN_REMOVE_COURT, 'event:delete-court')
    .row()
    .text(BTN_FINALIZE, 'event:finalize')
    .text(BTN_CANCEL_EVENT, 'event:cancel')
}

/**
 * Formats event message for Telegram announcement
 */
export function formatEventMessage(event: Event): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const icon = event.isPrivate ? '🔒' : '🎾'

  return `${icon} Squash: ${formatDate(eventDate)}
${formatCourts(event.courts)}

Participants:
(nobody yet)`
}

/**
 * Formats participant section shared by announcement and reminder.
 */
function formatParticipantSection(
  participants: EventParticipantDisplay[],
  paidParticipantIds: Set<string> = new Set()
): string {
  if (participants.length === 0) {
    return 'Participants:\n(nobody yet)'
  }

  const totalCount = participants.reduce((sum, ep) => sum + ep.participations, 0)
  let text = `Participants — ${totalCount}:\n`

  const names = participants
    .map((ep) => {
      const username = ep.participant.telegramUsername
        ? `@${ep.participant.telegramUsername}`
        : ep.participant.displayName
      const multiplier = ep.participations > 1 ? ` (×${ep.participations})` : ''
      const paidMark = ep.participant.id && paidParticipantIds.has(ep.participant.id) ? ' ✓' : ''
      return `${username}${multiplier}${paidMark}`
    })
    .join(', ')

  text += names
  return text
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
  const icon = event.isPrivate ? '🔒' : '🎾'

  let messageText = `${icon} Squash: ${formatDate(eventDate)}\n${formatCourts(event.courts)}\n\n`
  messageText += formatParticipantSection(participants, paidParticipantIds)

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
  messageId: string,
  collectorPaymentInfo?: string
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)
  const totalCost = courts * courtPrice

  let text = `💰 Payment for Squash ${formatDate(eventDate)}\n\n`
  text += `${formatCourts(courts)} × ${courtPrice} din = ${totalCost} din\n`
  text += `Participants: ${totalParticipants}\n`

  // Private events have no group message to link to
  if (!event.isPrivate) {
    const chatIdStr = String(chatId).replace(/^-100/, '')
    const link = `tg://privatepost?channel=${chatIdStr}&post=${messageId}`
    text += `<a href="${link}">Full details</a>\n`
  }

  text += `\nYour amount: ${amount} din`

  if (collectorPaymentInfo) {
    text += `\n\n💳 ${collectorPaymentInfo}`
  }

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
 * Formats not-finalized event reminder for admin.
 * Uses the same participant formatting as announcements.
 */
export function formatNotFinalizedReminder(
  event: Event,
  participants: EventParticipantDisplay[]
): string {
  const eventDate = dayjs.tz(event.datetime, config.timezone)

  let text = `⏰ ${formatDate(eventDate)} — not finalized\n${formatCourts(event.courts)}\n\n`
  text += formatParticipantSection(participants)
  text += '\n\nHit "✅ Finalize" if details are right, otherwise — change the details.'

  return text
}

/**
 * Builds inline keyboard for event reminder message
 */
export function buildReminderKeyboard(eventId: string, announceUrl?: string): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(BTN_ADD_PARTICIPANT, `edit:event:+participant:${eventId}`)
    .text(BTN_REMOVE_PARTICIPANT, `edit:event:-participant:${eventId}`)
    .row()
    .text(BTN_ADD_COURT, `event:add-court:${eventId}`)
    .text(BTN_REMOVE_COURT, `event:delete-court:${eventId}`)
    .row()
    .text(BTN_FINALIZE, `event:finalize:${eventId}`)

  if (announceUrl) {
    kb.row().url('🔗 Go to announcement', announceUrl)
  }

  return kb
}

type OwnerNotificationType =
  | 'participant-joined'
  | 'participant-left'
  | 'event-court-added'
  | 'event-court-removed'
  | 'event-announced'
  | 'event-finalized'

interface CapacityLimits {
  maxPerCourt?: number
  minPerCourt?: number
}

/**
 * Formats notification message for event owner about a change
 */
export function formatOwnerNotification(
  type: OwnerNotificationType,
  actorName: string | undefined,
  eventDateStr: string,
  totalParticipations: number,
  courts: number,
  capacityLimits?: CapacityLimits
): string {
  let text: string

  switch (type) {
    case 'participant-joined':
      text = `👤 ${actorName} joined ${eventDateStr}`
      break
    case 'participant-left':
      text = `👤 ${actorName} left ${eventDateStr}`
      break
    case 'event-court-added':
      text = `🏟 Court added for ${eventDateStr}`
      break
    case 'event-court-removed':
      text = `🏟 Court removed for ${eventDateStr}`
      break
    case 'event-announced':
      text = `🎾 Your event announced: ${eventDateStr}`
      return text
    case 'event-finalized':
      text = `✅ ${eventDateStr} finalized by ${actorName}`
      return text
  }

  // Balance line for join/leave/court changes
  text += `\n   Participants: ${totalParticipations} · Courts: ${courts}`

  // Capacity warning
  if (capacityLimits) {
    if (capacityLimits.maxPerCourt && totalParticipations > courts * capacityLimits.maxPerCourt) {
      text += '\n   ⚠️ Over capacity'
    } else if (
      capacityLimits.minPerCourt &&
      totalParticipations < courts * capacityLimits.minPerCourt
    ) {
      text += '\n   ⚠️ Low attendance'
    }
  }

  return text
}

/**
 * Debt entry for the debt summary formatter
 */
export interface DebtEntry {
  eventDateStr: string
  amount: number
  collectorPaymentInfo?: string
}

/**
 * Formats a summary of unpaid debts for a participant
 */
export function formatDebtSummary(debts: DebtEntry[]): string {
  if (debts.length === 0) {
    return '\u2705 No unpaid debts!'
  }

  let text = '\u{1F4B0} Your unpaid debts:\n'
  let total = 0

  for (const debt of debts) {
    text += `\nSquash ${debt.eventDateStr} \u2014 ${debt.amount} din`
    if (debt.collectorPaymentInfo) {
      text += `\n\u{1F4B3} ${debt.collectorPaymentInfo}`
    }
    total += debt.amount
  }

  text += `\n\nTotal: ${total} din`
  return text
}

/**
 * Group of debts for one event, used by admin debt summary
 */
export interface AdminDebtGroup {
  eventDateStr: string
  debts: { participantName: string; amount: number }[]
}

/**
 * Formats a summary of all outstanding debts grouped by event (admin view)
 */
export function formatAdminDebtSummary(groups: AdminDebtGroup[]): string {
  const allDebts = groups.flatMap((g) => g.debts)
  if (allDebts.length === 0) {
    return '\u2705 All payments received!'
  }

  let text = '\u{1F4B0} Outstanding debts:\n'
  let total = 0

  for (const group of groups) {
    text += `\nSquash ${group.eventDateStr}:`
    for (const debt of group.debts) {
      text += `\n  ${debt.participantName} \u2014 ${debt.amount} din`
      total += debt.amount
    }
  }

  text += `\n\nTotal: ${total} din (${allDebts.length} unpaid)`
  return text
}

/**
 * Formats fallback notification for participants who can't receive DMs
 */
export function formatFallbackNotificationText(
  participantNames: string[],
  botUsername: string
): string {
  const mentions = participantNames.join(', ')

  return `⚠️ I can't reach you personally, guys\n\n${mentions}\n\nPlease write to @${botUsername} and send /start`
}
