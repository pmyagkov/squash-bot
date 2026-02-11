import { InlineKeyboard } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { Scaffold, DayOfWeek, Event, EventParticipant, EventStatus, Payment } from '~/types'
import { config } from '~/config'
import { shouldTrigger } from '~/utils/timeOffset'
import { parseDate } from '~/utils/dateParser'
import type { TelegramTransport, CallbackTypes, CommandTypes } from '~/services/transport/telegram'
import type { AppContainer } from '../container'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { Logger } from '~/services/logger'
import type { EventLock } from '~/utils/eventLock'
import {
  buildInlineKeyboard,
  formatAnnouncementText,
  formatEventMessage,
  formatPersonalPaymentText,
  formatPaidPersonalPaymentText,
  formatFallbackNotificationText,
} from '~/services/formatters/event'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

const DAY_OF_WEEK_TO_NUMBER: Record<DayOfWeek, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
}

/**
 * Calculate next occurrence date for a scaffold
 */
export function calculateNextOccurrence(scaffold: Scaffold): Date {
  // Validate scaffold data
  if (!scaffold.dayOfWeek) {
    throw new Error(`Invalid scaffold: missing dayOfWeek`)
  }

  const targetDayOfWeek = DAY_OF_WEEK_TO_NUMBER[scaffold.dayOfWeek]
  if (targetDayOfWeek === undefined) {
    throw new Error(`Invalid scaffold: unknown dayOfWeek "${scaffold.dayOfWeek}"`)
  }

  if (!scaffold.time) {
    throw new Error(`Invalid scaffold: missing time`)
  }

  // Validate time format
  if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(scaffold.time)) {
    throw new Error(
      `Invalid scaffold: invalid time format "${scaffold.time}". Expected HH:MM format`
    )
  }

  const [hours, minutes] = scaffold.time.split(':').map(Number)

  // Validate parsed hours and minutes
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`Invalid scaffold: failed to parse time "${scaffold.time}"`)
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid scaffold: invalid time values (${hours}:${minutes})`)
  }

  const now = dayjs().tz(config.timezone)

  // Find next occurrence of this day
  let daysUntil = targetDayOfWeek - now.day()
  if (daysUntil < 0) {
    daysUntil += 7
  } else if (daysUntil === 0) {
    // Same day - check if time has passed
    const targetTime = now.hour(hours).minute(minutes).second(0).millisecond(0)
    if (now.isAfter(targetTime)) {
      daysUntil = 7 // Next week
    }
  }

  const nextDate = now.add(daysUntil, 'day').hour(hours).minute(minutes).second(0).millisecond(0)

  // Validate resulting date
  if (!nextDate.isValid()) {
    throw new Error(`Invalid scaffold: failed to calculate next occurrence date`)
  }

  const result = nextDate.toDate()

  // Validate Date object
  if (isNaN(result.getTime())) {
    throw new Error(`Invalid scaffold: resulting date is invalid`)
  }

  return result
}

/**
 * Check if it's time to create an event from a scaffold
 */
export async function shouldCreateEvent(
  scaffold: Scaffold,
  nextOccurrence: Date,
  settingsRepository: SettingsRepo
): Promise<boolean> {
  const timezone = await settingsRepository.getTimezone()
  const deadline =
    scaffold.announcementDeadline ?? (await settingsRepository.getAnnouncementDeadline())

  return shouldTrigger(deadline, nextOccurrence, timezone)
}

/**
 * Check if event already exists for a scaffold at a given datetime
 * Events within 1 hour of each other are considered duplicates
 */
export function eventExists(events: Event[], scaffoldId: string, datetime: Date): boolean {
  return events.some(
    (e) =>
      e.scaffoldId === scaffoldId &&
      Math.abs(e.datetime.getTime() - datetime.getTime()) < 1000 * 60 * 60 // Within 1 hour
  )
}

/**
 * Business logic orchestrator for events
 */
export class EventBusiness {
  private eventRepository: EventRepo
  private scaffoldRepository: ScaffoldRepo
  private settingsRepository: SettingsRepo
  private participantRepository: ParticipantRepo
  private paymentRepository: PaymentRepo
  private transport: TelegramTransport
  private logger: Logger
  private eventLock: EventLock

  constructor(container: AppContainer) {
    this.eventRepository = container.resolve('eventRepository')
    this.scaffoldRepository = container.resolve('scaffoldRepository')
    this.settingsRepository = container.resolve('settingsRepository')
    this.participantRepository = container.resolve('participantRepository')
    this.paymentRepository = container.resolve('paymentRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
    this.eventLock = container.resolve('eventLock')
  }

  /**
   * Initialize transport handlers
   */
  init(): void {
    // Register callbacks
    this.transport.onCallback('event:join', (data) => this.handleJoin(data))
    this.transport.onCallback('event:leave', (data) => this.handleLeave(data))
    this.transport.onCallback('event:add_court', (data) => this.handleAddCourt(data))
    this.transport.onCallback('event:rm_court', (data) => this.handleRemoveCourt(data))
    this.transport.onCallback('event:finalize', (data) => this.handleFinalize(data))
    this.transport.onCallback('event:cancel', (data) => this.handleCancel(data))
    this.transport.onCallback('event:restore', (data) => this.handleRestore(data))
    this.transport.onCallback('event:unfinalize', (data) => this.handleUnfinalize(data))
    this.transport.onCallback('payment:mark', (data) => this.handlePaymentMark(data))
    this.transport.onCallback('payment:cancel', (data) => this.handlePaymentCancel(data))

    // Register commands
    this.transport.onCommand('event:list', (data) => this.handleList(data))
    this.transport.onCommand('event:create', (data) => this.handleCreate(data))
    this.transport.onCommand('event:add', (data) => this.handleAdd(data))
    this.transport.onCommand('event:announce', (data) => this.handleAnnounce(data))
    this.transport.onCommand('event:add-by-scaffold', (data) => this.handleAddByScaffold(data))
    this.transport.onCommand('event:cancel', (data) => this.handleCancelCommand(data))
    this.transport.onCommand('admin:pay', (data) => this.handleAdminPay(data))
    this.transport.onCommand('admin:unpay', (data) => this.handleAdminUnpay(data))
  }

  // === Callback Handlers ===

  private async handleJoin(data: CallbackTypes['event:join']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    // Build display name from available data
    const firstName = data.firstName || ''
    const lastName = data.lastName || ''
    const displayName = `${firstName} ${lastName}`.trim() || data.username || `User ${data.userId}`

    // Find or create participant
    const participant = await this.participantRepository.findOrCreateParticipant(
      String(data.userId),
      data.username,
      displayName
    )

    // Add to event
    await this.participantRepository.addToEvent(event.id, participant.id)

    // Update message
    await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId)
    await this.transport.answerCallback(data.callbackId)

    await this.logger.log(`User ${data.userId} joined event ${event.id}`)
    void this.transport.logEvent({
      type: 'participant_joined',
      eventId: event.id,
      userName: displayName,
    })
  }

  private async handleLeave(data: CallbackTypes['event:leave']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    const participant = await this.participantRepository.findByTelegramId(String(data.userId))
    if (!participant) {
      await this.transport.answerCallback(data.callbackId, 'You are not registered')
      return
    }

    await this.participantRepository.removeFromEvent(event.id, participant.id)

    await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId)
    await this.transport.answerCallback(data.callbackId)

    await this.logger.log(`User ${data.userId} left event ${event.id}`)
    void this.transport.logEvent({
      type: 'participant_left',
      eventId: event.id,
      userName: participant.displayName,
    })
  }

  private async handleAddCourt(data: CallbackTypes['event:add_court']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    const newCourts = event.courts + 1
    await this.eventRepository.updateEvent(event.id, { courts: newCourts })

    await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId)
    await this.transport.answerCallback(data.callbackId)

    await this.logger.log(`User ${data.userId} added court to ${event.id} (now ${newCourts})`)
    void this.transport.logEvent({ type: 'court_added', eventId: event.id, courts: newCourts })
  }

  private async handleRemoveCourt(data: CallbackTypes['event:rm_court']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (event.courts <= 1) {
      await this.transport.answerCallback(data.callbackId, 'Cannot remove last court')
      return
    }

    const newCourts = event.courts - 1
    await this.eventRepository.updateEvent(event.id, { courts: newCourts })

    await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId)
    await this.transport.answerCallback(data.callbackId)

    await this.logger.log(`User ${data.userId} removed court from ${event.id} (now ${newCourts})`)
    void this.transport.logEvent({ type: 'court_removed', eventId: event.id, courts: newCourts })
  }

  private async handleFinalize(data: CallbackTypes['event:finalize']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    const participants = await this.participantRepository.getEventParticipants(event.id)
    if (participants.length === 0) {
      await this.transport.answerCallback(data.callbackId, 'No participants to finalize')
      return
    }

    // Acquire lock
    if (!this.eventLock.acquire(event.id)) {
      await this.transport.answerCallback(data.callbackId, '⏳ Operation already in progress')
      return
    }

    try {
      // Create payment records
      const courtPrice = await this.settingsRepository.getCourtPrice()
      const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
      const totalCost = courtPrice * event.courts

      const paymentRecords: Payment[] = []
      for (const ep of participants) {
        const amount = Math.round((totalCost * ep.participations) / totalParticipations)
        const payment = await this.paymentRepository.createPayment(
          event.id,
          ep.participant.id,
          amount
        )
        paymentRecords.push(payment)
      }

      // Update event status
      await this.eventRepository.updateEvent(event.id, { status: 'finalized' })

      // Send personal DMs
      const failedParticipants = await this.sendPersonalPaymentNotifications(
        event,
        participants,
        paymentRecords,
        courtPrice,
        data.chatId
      )

      // Send fallback if needed
      if (failedParticipants.length > 0) {
        await this.sendFallbackNotification(data.chatId, failedParticipants)
      }

      // Update announcement message
      await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId, true)

      await this.transport.answerCallback(data.callbackId)
      await this.logger.log(`User ${data.userId} finalized event ${event.id}`)

      const finalizedDate = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
      void this.transport.logEvent({
        type: 'event_finalized',
        eventId: event.id,
        date: finalizedDate,
        participantCount: participants.length,
      })
    } finally {
      this.eventLock.release(event.id)
    }
  }

  private async handleCancel(data: CallbackTypes['event:cancel']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    await this.eventRepository.updateEvent(event.id, { status: 'cancelled' })

    await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId, false, true)

    // Unpin message
    try {
      await this.transport.unpinMessage(data.chatId, data.messageId)
    } catch {
      // Ignore unpin errors
    }

    await this.transport.answerCallback(data.callbackId)
    await this.logger.log(`User ${data.userId} cancelled event ${event.id}`)

    const cancelledDate = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
    void this.transport.logEvent({
      type: 'event_cancelled',
      eventId: event.id,
      date: cancelledDate,
    })
  }

  private async handleRestore(data: CallbackTypes['event:restore']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    await this.eventRepository.updateEvent(event.id, { status: 'announced' })

    await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId)

    // Pin message
    try {
      await this.transport.pinMessage(data.chatId, data.messageId)
    } catch {
      // Ignore pin errors
    }

    await this.transport.answerCallback(data.callbackId)
    await this.logger.log(`User ${data.userId} restored event ${event.id}`)
    const restoredDate = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
    void this.transport.logEvent({ type: 'event_restored', eventId: event.id, date: restoredDate })
  }

  private async handleUnfinalize(data: CallbackTypes['event:unfinalize']): Promise<void> {
    const event = await this.eventRepository.findByMessageId(String(data.messageId))
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!this.eventLock.acquire(event.id)) {
      await this.transport.answerCallback(data.callbackId, '⏳ Operation already in progress')
      return
    }

    try {
      // Try to delete personal DMs (best effort)
      const payments = await this.paymentRepository.getPaymentsByEvent(event.id)
      for (const payment of payments) {
        if (payment.personalMessageId) {
          const participant = await this.participantRepository.findById(payment.participantId)
          if (participant?.telegramId) {
            try {
              await this.transport.deleteMessage(
                parseInt(participant.telegramId, 10),
                parseInt(payment.personalMessageId, 10)
              )
            } catch {
              // Ignore — message may already be deleted
            }
          }
        }
      }

      // Delete all payment records
      await this.paymentRepository.deleteByEvent(event.id)

      // Update event status
      await this.eventRepository.updateEvent(event.id, { status: 'announced' })

      // Restore announcement message
      await this.updateAnnouncementMessage(event.id, data.chatId, data.messageId, false)

      await this.transport.answerCallback(data.callbackId)
      await this.logger.log(`User ${data.userId} unfinalized event ${event.id}`)
    } finally {
      this.eventLock.release(event.id)
    }
  }

  private async handlePaymentMark(data: CallbackTypes['payment:mark']): Promise<void> {
    const eventId = data.eventId

    if (!this.eventLock.acquire(eventId)) {
      await this.transport.answerCallback(data.callbackId, '⏳ In progress')
      return
    }

    try {
      const participant = await this.participantRepository.findByTelegramId(String(data.userId))
      if (!participant) {
        await this.transport.answerCallback(data.callbackId, 'Participant not found')
        return
      }

      const payment = await this.paymentRepository.findByEventAndParticipant(
        eventId,
        participant.id
      )
      if (!payment) {
        await this.transport.answerCallback(data.callbackId, 'Payment not found')
        return
      }

      const updatedPayment = await this.paymentRepository.markAsPaid(payment.id!)

      // Update personal message
      if (payment.personalMessageId) {
        const event = await this.eventRepository.findById(eventId)
        if (event) {
          const courtPrice = await this.settingsRepository.getCourtPrice()
          const participants = await this.participantRepository.getEventParticipants(eventId)
          const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
          const chatId = await this.settingsRepository.getMainChatId()

          const baseText = formatPersonalPaymentText(
            event,
            payment.amount,
            event.courts,
            courtPrice,
            totalParticipations,
            chatId!,
            event.telegramMessageId!
          )
          const paidText = formatPaidPersonalPaymentText(baseText, updatedPayment.paidAt!)
          const undoKeyboard = new InlineKeyboard().text('↩️ Undo', `payment:cancel:${eventId}`)

          try {
            await this.transport.editMessage(
              data.userId,
              parseInt(payment.personalMessageId, 10),
              paidText,
              undoKeyboard
            )
          } catch {
            // Best effort — message might be deleted
          }
        }
      }

      // Update announcement with checkmark
      await this.updateAnnouncementWithPayments(eventId)

      await this.transport.answerCallback(data.callbackId)

      void this.transport.logEvent({
        type: 'payment_received',
        eventId,
        userName: participant.telegramUsername ?? participant.displayName,
        amount: payment.amount,
      })
    } finally {
      this.eventLock.release(eventId)
    }
  }

  private async handlePaymentCancel(data: CallbackTypes['payment:cancel']): Promise<void> {
    const eventId = data.eventId

    if (!this.eventLock.acquire(eventId)) {
      await this.transport.answerCallback(data.callbackId, '⏳ Operation already in progress')
      return
    }

    try {
      const participant = await this.participantRepository.findByTelegramId(String(data.userId))
      if (!participant) {
        await this.transport.answerCallback(data.callbackId, 'Participant not found')
        return
      }

      const payment = await this.paymentRepository.findByEventAndParticipant(
        eventId,
        participant.id
      )
      if (!payment) {
        await this.transport.answerCallback(data.callbackId, 'Payment not found')
        return
      }

      await this.paymentRepository.markAsUnpaid(payment.id!)

      // Update personal message — revert to unpaid state
      if (payment.personalMessageId) {
        const event = await this.eventRepository.findById(eventId)
        if (event) {
          const courtPrice = await this.settingsRepository.getCourtPrice()
          const participants = await this.participantRepository.getEventParticipants(eventId)
          const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
          const chatId = await this.settingsRepository.getMainChatId()

          const baseText = formatPersonalPaymentText(
            event,
            payment.amount,
            event.courts,
            courtPrice,
            totalParticipations,
            chatId!,
            event.telegramMessageId!
          )
          const paidKeyboard = new InlineKeyboard().text('✅ I paid', `payment:mark:${eventId}`)

          try {
            await this.transport.editMessage(
              data.userId,
              parseInt(payment.personalMessageId, 10),
              baseText,
              paidKeyboard
            )
          } catch {
            // Best effort
          }
        }
      }

      // Update announcement — remove checkmark
      await this.updateAnnouncementWithPayments(eventId)

      await this.transport.answerCallback(data.callbackId)
    } finally {
      this.eventLock.release(eventId)
    }
  }

  // === Admin Command Handlers ===

  private async handleAdminPay(data: CommandTypes['admin:pay']): Promise<void> {
    const adminId = await this.settingsRepository.getAdminId()
    if (String(data.userId) !== adminId) {
      await this.transport.sendMessage(
        data.chatId,
        '❌ This command is only available to administrators'
      )
      return
    }

    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(data.chatId, `❌ Event ${data.eventId} not found`)
      return
    }
    if (event.status !== 'finalized') {
      await this.transport.sendMessage(data.chatId, `❌ Event ${data.eventId} is not finalized`)
      return
    }

    const participant = await this.participantRepository.findByUsername(data.username)
    if (!participant) {
      await this.transport.sendMessage(data.chatId, `❌ Participant @${data.username} not found`)
      return
    }

    const payment = await this.paymentRepository.findByEventAndParticipant(event.id, participant.id)
    if (!payment) {
      await this.transport.sendMessage(
        data.chatId,
        `❌ No payment found for @${data.username} in ${event.id}`
      )
      return
    }

    const updatedPayment = await this.paymentRepository.markAsPaid(payment.id!)

    // Update personal DM if exists
    if (payment.personalMessageId && participant.telegramId) {
      const courtPrice = await this.settingsRepository.getCourtPrice()
      const participants = await this.participantRepository.getEventParticipants(event.id)
      const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
      const chatId = await this.settingsRepository.getMainChatId()

      const baseText = formatPersonalPaymentText(
        event,
        payment.amount,
        event.courts,
        courtPrice,
        totalParticipations,
        chatId!,
        event.telegramMessageId!
      )
      const paidText = formatPaidPersonalPaymentText(baseText, updatedPayment.paidAt!)
      const undoKeyboard = new InlineKeyboard().text('↩️ Undo', `payment:cancel:${event.id}`)

      try {
        await this.transport.editMessage(
          parseInt(participant.telegramId, 10),
          parseInt(payment.personalMessageId, 10),
          paidText,
          undoKeyboard
        )
      } catch {
        // Best effort
      }
    }

    await this.updateAnnouncementWithPayments(event.id)

    await this.transport.sendMessage(
      data.chatId,
      `✅ @${data.username} marked as paid for ${event.id}`
    )

    void this.transport.logEvent({
      type: 'payment_received',
      eventId: event.id,
      userName: participant.telegramUsername ?? participant.displayName,
      amount: payment.amount,
    })
  }

  private async handleAdminUnpay(data: CommandTypes['admin:unpay']): Promise<void> {
    const adminId = await this.settingsRepository.getAdminId()
    if (String(data.userId) !== adminId) {
      await this.transport.sendMessage(
        data.chatId,
        '❌ This command is only available to administrators'
      )
      return
    }

    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(data.chatId, `❌ Event ${data.eventId} not found`)
      return
    }
    if (event.status !== 'finalized') {
      await this.transport.sendMessage(data.chatId, `❌ Event ${data.eventId} is not finalized`)
      return
    }

    const participant = await this.participantRepository.findByUsername(data.username)
    if (!participant) {
      await this.transport.sendMessage(data.chatId, `❌ Participant @${data.username} not found`)
      return
    }

    const payment = await this.paymentRepository.findByEventAndParticipant(event.id, participant.id)
    if (!payment) {
      await this.transport.sendMessage(
        data.chatId,
        `❌ No payment found for @${data.username} in ${event.id}`
      )
      return
    }

    await this.paymentRepository.markAsUnpaid(payment.id!)

    // Update personal DM if exists
    if (payment.personalMessageId && participant.telegramId) {
      const courtPrice = await this.settingsRepository.getCourtPrice()
      const participants = await this.participantRepository.getEventParticipants(event.id)
      const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
      const chatId = await this.settingsRepository.getMainChatId()

      const baseText = formatPersonalPaymentText(
        event,
        payment.amount,
        event.courts,
        courtPrice,
        totalParticipations,
        chatId!,
        event.telegramMessageId!
      )
      const paidKeyboard = new InlineKeyboard().text('✅ I paid', `payment:mark:${event.id}`)

      try {
        await this.transport.editMessage(
          parseInt(participant.telegramId, 10),
          parseInt(payment.personalMessageId, 10),
          baseText,
          paidKeyboard
        )
      } catch {
        // Best effort
      }
    }

    await this.updateAnnouncementWithPayments(event.id)

    await this.transport.sendMessage(
      data.chatId,
      `✅ @${data.username} marked as unpaid for ${event.id}`
    )
  }

  // === Command Handlers ===

  private async handleList(data: CommandTypes['event:list']): Promise<void> {
    const events = await this.eventRepository.getEvents()
    // Include all non-cancelled events (created, announced, finalized)
    const activeEvents = events.filter((e) => e.status !== 'cancelled')

    if (activeEvents.length === 0) {
      await this.transport.sendMessage(data.chatId, '📋 Event list\n\nNo events found')
      return
    }

    const list = activeEvents
      .map((e) => {
        const date = dayjs.tz(e.datetime, config.timezone).format('ddd DD MMM HH:mm')
        return `• ${e.id} | ${date} | ${e.courts} courts | ${e.status}`
      })
      .join('\n')

    await this.transport.sendMessage(data.chatId, `📋 Event list\n\n${list}`)
  }

  private async handleCreate(data: CommandTypes['event:create']): Promise<void> {
    await this.handleAddEvent(data.chatId, data.day, data.time, data.courts)
  }

  private async handleAdd(data: CommandTypes['event:add']): Promise<void> {
    await this.handleAddEvent(data.chatId, data.day, data.time, data.courts)
  }

  private async handleAddEvent(
    chatId: number,
    day: string,
    time: string,
    courts: number
  ): Promise<void> {
    // Validate time format (HH:mm)
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      await this.transport.sendMessage(chatId, '❌ Invalid time format. Use HH:mm (e.g., 19:00)')
      return
    }

    // Parse date
    let eventDate: Date
    try {
      eventDate = parseDate(day)
    } catch {
      await this.transport.sendMessage(
        chatId,
        '❌ Invalid date format. Use: YYYY-MM-DD, day name (sat, tue), today, tomorrow, or next <day>'
      )
      return
    }

    // Apply time to date
    const [hours, minutes] = time.split(':').map(Number)
    eventDate = dayjs.tz(eventDate, config.timezone).hour(hours).minute(minutes).second(0).toDate()

    // Create event
    const event = await this.eventRepository.createEvent({
      datetime: eventDate,
      courts,
      status: 'created',
    })

    // Format success message
    const dateFormatted = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
    const message = `✅ Created event ${event.id} (${dateFormatted}, ${courts} courts). To announce: /event announce ${event.id}`
    await this.transport.sendMessage(chatId, message)
    void this.transport.logEvent({
      type: 'event_created',
      eventId: event.id,
      date: dateFormatted,
      courts,
    })
  }

  private async handleAnnounce(data: CommandTypes['event:announce']): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(data.chatId, `❌ Event ${data.eventId} not found`)
      return
    }

    if (event.status === 'announced') {
      await this.transport.sendMessage(data.chatId, `ℹ️ Event ${event.id} is already announced`)
      return
    }

    try {
      await this.announceEvent(event.id)
      await this.transport.sendMessage(data.chatId, `✅ Event ${event.id} announced`)
    } catch (error) {
      await this.transport.sendMessage(
        data.chatId,
        `❌ Failed to announce event: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async handleAddByScaffold(data: CommandTypes['event:add-by-scaffold']): Promise<void> {
    const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
    if (!scaffold) {
      await this.transport.sendMessage(data.chatId, `❌ Scaffold ${data.scaffoldId} not found`)
      return
    }

    // Calculate next occurrence
    const nextOccurrence = calculateNextOccurrence(scaffold)

    // Check for duplicate
    const events = await this.eventRepository.getEvents()
    if (eventExists(events, scaffold.id, nextOccurrence)) {
      await this.transport.sendMessage(
        data.chatId,
        `❌ Event already exists for scaffold ${scaffold.id}`
      )
      return
    }

    // Create event
    const event = await this.eventRepository.createEvent({
      scaffoldId: scaffold.id,
      datetime: nextOccurrence,
      courts: scaffold.defaultCourts,
      status: 'created',
    })

    // Format success message
    const dateFormatted = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
    const message = `✅ Created event ${event.id} from ${scaffold.id} (${dateFormatted}, ${scaffold.defaultCourts} courts). To announce: /event announce ${event.id}`
    await this.transport.sendMessage(data.chatId, message)
    void this.transport.logEvent({
      type: 'event_created',
      eventId: event.id,
      date: dateFormatted,
      courts: scaffold.defaultCourts,
    })
  }

  private async handleCancelCommand(data: CommandTypes['event:cancel']): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(data.chatId, `❌ Event ${data.eventId} not found`)
      return
    }

    // Cancel the event
    await this.eventRepository.updateEvent(event.id, { status: 'cancelled' })

    await this.transport.sendMessage(data.chatId, `✅ Event ${event.id} cancelled`)

    // If event was announced, send cancellation notification to the main chat
    if (event.status === 'announced') {
      const chatId = await this.settingsRepository.getMainChatId()
      if (chatId) {
        await this.transport.sendMessage(chatId, `❌ Event ${event.id} has been cancelled.`)
      }
    }

    const cancelledDate = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
    void this.transport.logEvent({
      type: 'event_cancelled',
      eventId: event.id,
      date: cancelledDate,
    })
  }

  // === Helper Methods ===

  private async updateAnnouncementMessage(
    eventId: string,
    chatId: number,
    messageId: number,
    finalized: boolean = false,
    cancelled: boolean = false
  ): Promise<void> {
    const event = await this.eventRepository.findById(eventId)
    if (!event) {
      return
    }

    const participants = await this.participantRepository.getEventParticipants(eventId)
    const messageText = formatAnnouncementText(event, participants, finalized, cancelled)
    const keyboard = buildInlineKeyboard(
      event.status === 'cancelled'
        ? 'cancelled'
        : event.status === 'finalized'
          ? 'finalized'
          : 'announced'
    )

    try {
      await this.transport.editMessage(chatId, messageId, messageText, keyboard)
    } catch (error) {
      await this.logger.error(
        `Error updating announcement: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async sendPersonalPaymentNotifications(
    event: Event,
    participants: EventParticipant[],
    payments: Payment[],
    courtPrice: number,
    chatId: number
  ): Promise<EventParticipant[]> {
    const failedParticipants: EventParticipant[] = []
    const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)

    for (let i = 0; i < participants.length; i++) {
      const ep = participants[i]
      const payment = payments[i]

      if (!ep.participant.telegramId) {
        failedParticipants.push(ep)
        continue
      }

      const telegramId = parseInt(ep.participant.telegramId, 10)
      const messageText = formatPersonalPaymentText(
        event,
        payment.amount,
        event.courts,
        courtPrice,
        totalParticipations,
        chatId,
        event.telegramMessageId!
      )
      const keyboard = new InlineKeyboard().text('✅ I paid', `payment:mark:${event.id}`)

      try {
        const msgId = await this.transport.sendMessage(telegramId, messageText, keyboard)
        await this.paymentRepository.updatePersonalMessageId(payment.id!, String(msgId))
      } catch {
        failedParticipants.push(ep)
      }
    }

    return failedParticipants
  }

  private async sendFallbackNotification(
    chatId: number,
    failedParticipants: EventParticipant[]
  ): Promise<void> {
    const names = failedParticipants.map((ep) =>
      ep.participant.telegramUsername
        ? `@${ep.participant.telegramUsername}`
        : ep.participant.displayName
    )
    const botInfo = this.transport.getBotInfo()
    const text = formatFallbackNotificationText(names, botInfo.username ?? '')
    await this.transport.sendMessage(chatId, text)
  }

  private async updateAnnouncementWithPayments(eventId: string): Promise<void> {
    const event = await this.eventRepository.findById(eventId)
    if (!event?.telegramMessageId) return

    const chatId = await this.settingsRepository.getMainChatId()
    if (!chatId) return

    const participants = await this.participantRepository.getEventParticipants(eventId)
    const payments = await this.paymentRepository.getPaymentsByEvent(eventId)
    const paidParticipantIds = new Set(payments.filter((p) => p.isPaid).map((p) => p.participantId))

    const messageText = formatAnnouncementText(
      event,
      participants,
      event.status === 'finalized',
      false,
      paidParticipantIds
    )
    const keyboard = buildInlineKeyboard(event.status as EventStatus)

    try {
      await this.transport.editMessage(
        chatId,
        parseInt(event.telegramMessageId, 10),
        messageText,
        keyboard
      )
    } catch (error) {
      await this.logger.error(
        `Error updating announcement: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Announces an event to Telegram and updates its status
   */
  async announceEvent(id: string): Promise<Event> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    const chatId = await this.settingsRepository.getMainChatId()
    if (!chatId) {
      throw new Error('Chat ID not configured')
    }

    // Send announcement via transport layer
    const messageText = formatEventMessage(event)
    const keyboard = buildInlineKeyboard('announced')
    const messageId = await this.transport.sendMessage(chatId, messageText, keyboard)

    // Pin the message
    try {
      await this.transport.pinMessage(chatId, messageId)
    } catch {
      // Ignore pin errors
    }

    // Update event with telegram_message_id and status
    const updatedEvent = await this.eventRepository.updateEvent(id, {
      telegramMessageId: String(messageId),
      status: 'announced',
    })

    const announcedDate = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
    void this.transport.logEvent({ type: 'event_announced', eventId: id, date: announcedDate })

    return updatedEvent
  }

  /**
   * Cancels an event and optionally sends notification
   */
  async cancelEvent(id: string, sendNotification: boolean = true): Promise<Event> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    const updatedEvent = await this.eventRepository.updateEvent(id, { status: 'cancelled' })

    // Update message if event was announced
    if (sendNotification && event.status === 'announced' && event.telegramMessageId) {
      const chatId = await this.settingsRepository.getMainChatId()
      if (chatId) {
        const messageId = parseInt(event.telegramMessageId, 10)
        await this.updateAnnouncementMessage(id, chatId, messageId, false, true)
      }
    }

    return updatedEvent
  }

  /**
   * Checks all active scaffolds and creates events that are due
   * Returns the number of events created
   */
  async checkAndCreateEventsFromScaffolds(): Promise<number> {
    const scaffolds = await this.scaffoldRepository.getScaffolds()
    const activeScaffolds = scaffolds.filter((s) => s.isActive)

    let createdCount = 0

    for (const scaffold of activeScaffolds) {
      try {
        const nextOccurrence = calculateNextOccurrence(scaffold)

        // Check if event already exists
        const allEvents = await this.eventRepository.getEvents()
        const exists = eventExists(allEvents, scaffold.id, nextOccurrence)
        if (exists) {
          continue
        }

        // Check if it's time to create
        if (!(await shouldCreateEvent(scaffold, nextOccurrence, this.settingsRepository))) {
          continue
        }

        // Create event
        const event = await this.eventRepository.createEvent({
          scaffoldId: scaffold.id,
          datetime: nextOccurrence,
          courts: scaffold.defaultCourts,
          status: 'created',
        })

        // Immediately announce
        await this.announceEvent(event.id)

        createdCount++
        await this.logger.log(
          `Created and announced event ${event.id} from scaffold ${scaffold.id}`
        )

        const createdDate = dayjs.tz(event.datetime, config.timezone).format('ddd D MMM HH:mm')
        void this.transport.logEvent({
          type: 'event_created',
          eventId: event.id,
          date: createdDate,
          courts: event.courts,
        })
      } catch (error) {
        await this.logger.error(
          `Failed to create event from scaffold ${scaffold.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return createdCount
  }
}
