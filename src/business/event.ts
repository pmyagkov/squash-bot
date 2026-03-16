import { InlineKeyboard, type Context } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { Scaffold, DayOfWeek, Event, EventParticipant, EventStatus, Payment } from '~/types'
import { code } from '~/helpers/format'
import { config } from '~/config'
import { shouldTrigger } from '~/utils/timeOffset'
import { parseDate } from '~/utils/dateParser'
import { isOwnerOrAdmin } from '~/utils/environment'
import { formatDate } from '~/ui/constants'
import { formatEventListItem } from '~/services/formatters/list'
import { formatParticipantLabel } from '~/services/formatters/participant'
import type { TelegramTransport, CallbackTypes } from '~/services/transport/telegram'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { SourceContext } from '~/services/command/types'
import type { WizardService } from '~/services/wizard/wizardService'
import type { WizardStep } from '~/services/wizard/types'
import type { HydratedStep } from '~/services/wizard/types'
import { WizardCancelledError } from '~/services/wizard/types'
import type { ParticipantBusiness } from './participant'
import type { AppContainer } from '../container'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { NotificationRepo } from '~/storage/repo/notification'
import type { EventAnnouncementRepo } from '~/storage/repo/eventAnnouncement'
import type { Logger } from '~/services/logger'
import type { Notification } from '~/types'

const OWNER_ONLY_CALLBACK = 'Only the event owner can do this'
const OWNER_ONLY_MESSAGE = '❌ Only the owner or admin can do this'
const unfinalizeBlockedMsg = (paidCount: number) =>
  `Can't undo: ${paidCount} ${paidCount === 1 ? 'payment' : 'payments'} already received`
import { EventLock } from '~/utils/eventLock'
import {
  buildInlineKeyboard,
  buildReminderKeyboard,
  formatAnnouncementText,
  formatEventMessage,
  formatPersonalPaymentText,
  formatPaidPersonalPaymentText,
  formatFallbackNotificationText,
  formatNotFinalizedReminder,
  formatOwnerNotification,
  formatDebtSummary,
  formatAdminDebtSummary,
} from '~/services/formatters/event'
import type { DebtEntry, AdminDebtGroup } from '~/services/formatters/event'
import type { HandlerResult } from '~/services/notification'
import { eventJoinDef } from '~/commands/event/join'
import { eventActionDef } from '~/commands/event/eventAction'
import { eventCreateDef } from '~/commands/event/create'
import {
  eventListDef,
  eventAnnounceDef,
  eventCancelDef,
  eventSpawnDef,
  eventTransferDef,
  eventDeleteDef,
  eventUndoDeleteDef,
  eventMenuDef,
} from '~/commands/event/defs'
import { adminPaymentMarkPaidDef, adminPaymentUndoMarkPaidDef } from '~/commands/event/adminDefs'
import { paymentDebtDef, paymentMenuDef, type PaymentDebtData } from '~/commands/payment/defs'
import { eventDateStep, eventTimeStep } from '~/commands/event/steps'
import { formatEventEditMenu, buildEventEditKeyboard } from '~/services/formatters/editMenu'

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
 * Checks whether an event is eligible for a "not finalized" reminder notification.
 * An event qualifies when it is still in 'announced' status and its start time
 * is at least `thresholdHours` in the past.
 */
export function isEligibleForReminder(event: Event, thresholdHours: number, now: Date): boolean {
  if (event.status !== 'announced') {
    return false
  }
  const hoursSinceStart = (now.getTime() - event.datetime.getTime()) / (1000 * 60 * 60)
  return hoursSinceStart >= thresholdHours
}

/**
 * Builds a Telegram deep link URL for an announcement message.
 * Format: https://t.me/c/{channelId}/{messageId}
 * channelId = chatId without the -100 prefix.
 */
export function buildAnnouncementUrl(chatId: string, messageId: string): string {
  const channelId = chatId.replace(/^-100/, '')
  return `https://t.me/c/${channelId}/${messageId}`
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
  private notificationRepository: NotificationRepo
  private eventAnnouncementRepository: EventAnnouncementRepo
  private transport: TelegramTransport
  private logger: Logger
  private participantBusiness: ParticipantBusiness
  private commandRegistry: CommandRegistry
  private wizardService: WizardService
  private container: AppContainer
  private eventLock = new EventLock()

  constructor(container: AppContainer) {
    this.eventRepository = container.resolve('eventRepository')
    this.scaffoldRepository = container.resolve('scaffoldRepository')
    this.settingsRepository = container.resolve('settingsRepository')
    this.participantRepository = container.resolve('participantRepository')
    this.paymentRepository = container.resolve('paymentRepository')
    this.notificationRepository = container.resolve('notificationRepository')
    this.eventAnnouncementRepository = container.resolve('eventAnnouncementRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
    this.participantBusiness = container.resolve('participantBusiness')
    this.commandRegistry = container.resolve('commandRegistry')
    this.wizardService = container.resolve('wizardService')
    this.container = container
  }

  /**
   * Initialize transport handlers
   */
  init(): void {
    // Register menu command for bare /event
    this.commandRegistry.registerMenu('event', eventMenuDef, (data) => `event:${data.subcommand}`)

    // Register callbacks
    this.transport.onCallback('event:join', (data) => this.handleJoin(data))
    this.transport.onCallback('event:leave', (data) => this.handleLeave(data))
    this.transport.onCallback('event:add-court', (data) => this.handleAddCourt(data))
    this.transport.onCallback('event:delete-court', (data) => this.handleRemoveCourt(data))
    this.transport.onCallback('event:finalize', (data) => this.handleFinalize(data))
    this.transport.onCallback('event:cancel', (data) => this.handleCancel(data))
    this.transport.onCallback('event:undo-cancel', (data) => this.handleRestore(data))
    this.transport.onCallback('event:undo-finalize', (data) => this.handleUnfinalize(data))
    this.transport.onCallback('payment:mark-paid', (data) => this.handlePaymentMark(data))
    this.transport.onCallback('payment:undo-mark-paid', (data) => this.handlePaymentCancel(data))

    // Register commands via CommandRegistry
    this.commandRegistry.register('event:join', eventJoinDef, async (data, source) => {
      await this.handleJoinFromDef(data, source)
    })

    this.commandRegistry.register('event:create', eventCreateDef, async (data, source) => {
      await this.handleCreateFromDef(data, source)
    })

    this.commandRegistry.register('event:leave', eventActionDef, async (data, source) => {
      await this.handleLeaveFromDef(data, source)
    })

    this.commandRegistry.register('event:create-court', eventActionDef, async (data, source) => {
      await this.handleAddCourtFromDef(data, source)
    })

    this.commandRegistry.register('event:delete-court', eventActionDef, async (data, source) => {
      await this.handleRemoveCourtFromDef(data, source)
    })

    this.commandRegistry.register('event:finalize', eventActionDef, async (data, source) => {
      await this.handleFinalizeFromDef(data, source)
    })

    this.commandRegistry.register('event:undo-cancel', eventActionDef, async (data, source) => {
      await this.handleRestoreFromDef(data, source)
    })

    this.commandRegistry.register('event:undo-finalize', eventActionDef, async (data, source) => {
      await this.handleUnfinalizeFromDef(data, source)
    })

    this.commandRegistry.register('payment:mark-paid', eventActionDef, async (data, source) => {
      await this.handlePaymentMarkFromDef(data, source)
    })

    this.commandRegistry.register(
      'payment:undo-mark-paid',
      eventActionDef,
      async (data, source) => {
        await this.handlePaymentCancelFromDef(data, source)
      }
    )

    this.commandRegistry.register('event:list', eventListDef, async (_data, source) => {
      await this.handleListFromDef(source)
    })

    this.commandRegistry.register('event:announce', eventAnnounceDef, async (data, source) => {
      await this.handleAnnounceFromDef(data, source)
    })

    this.commandRegistry.register('event:spawn', eventSpawnDef, async (data, source) => {
      await this.handleSpawnFromDef(data, source)
    })

    this.commandRegistry.register('event:cancel', eventCancelDef, async (data, source) => {
      await this.handleCancelCommandFromDef(data, source)
    })

    this.commandRegistry.register('event:transfer', eventTransferDef, async (data, source) => {
      await this.handleTransferFromDef(data, source)
    })

    this.commandRegistry.register('event:delete', eventDeleteDef, async (data, source) => {
      await this.handleDeleteFromDef(data, source)
    })

    this.commandRegistry.register('event:undo-delete', eventUndoDeleteDef, async (data, source) => {
      await this.handleUndoDeleteFromDef(data, source)
    })

    this.commandRegistry.register(
      'admin:payment:mark-paid',
      adminPaymentMarkPaidDef,
      async (data, source) => {
        await this.handleAdminPayFromDef(data, source)
      }
    )

    this.commandRegistry.register(
      'admin:payment:undo-mark-paid',
      adminPaymentUndoMarkPaidDef,
      async (data, source) => {
        await this.handleAdminUnpayFromDef(data, source)
      }
    )

    this.commandRegistry.register('event:update', eventActionDef, async (data, source) => {
      await this.handleEventEditMenu(data, source)
    })

    this.commandRegistry.registerMenu(
      'payment',
      paymentMenuDef,
      (data) => `payment:${data.subcommand}`
    )
    this.commandRegistry.register('payment:debt', paymentDebtDef, async (data, source) => {
      await this.handlePaymentDebt(data as PaymentDebtData, source)
    })

    this.transport.onEdit('event', (action, entityId, ctx) =>
      this.handleEventEditAction(action, entityId, ctx)
    )

    this.transport.ensureBaseCommand('event')
    this.transport.ensureBaseCommand('admin')
    this.transport.ensureBaseCommand('payment')
  }

  /**
   * Resolve event by message ID — checks announcement first, then notification.
   */
  private async resolveEventByMessageId(messageId: number): Promise<Event | undefined> {
    // Try event_announcements first (new table)
    const eventId = await this.eventAnnouncementRepository.findEventByMessageId(String(messageId))
    if (eventId) {
      const event = await this.eventRepository.findById(eventId)
      if (event) {
        return event
      }
    }
    // Fallback to legacy field on event
    const event = await this.eventRepository.findByMessageId(String(messageId))
    if (event) {
      return event
    }
    // Fallback to notification
    const notification = await this.notificationRepository.findByMessageId(String(messageId))
    if (notification) {
      const notifEventId = notification.params.eventId as string
      return this.eventRepository.findById(notifEventId)
    }
    return undefined
  }

  /**
   * Resolve collector payment info for an event.
   * Uses event.collectorId if set, otherwise falls back to default collector.
   */
  private async resolveCollectorPaymentInfo(event: Event): Promise<string | undefined> {
    const collectorId =
      event.collectorId ?? (await this.participantBusiness.resolveDefaultCollectorId())
    if (!collectorId) {
      return undefined
    }
    const collector = await this.participantRepository.findById(collectorId)
    return collector?.paymentInfo
  }

  // === Callback Handlers ===

  private async handleJoin(data: CallbackTypes['event:join']): Promise<void> {
    console.log(`[JOIN] START cb=${data.callbackId} user=${data.userId}`)
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    // Participant was registered by middleware
    const participant = await this.participantRepository.findByTelegramId(String(data.userId))
    if (!participant) {
      await this.transport.answerCallback(data.callbackId, 'Registration failed. Please try again.')
      return
    }

    const lockKey = `${event.id}:${data.userId}`
    if (!this.eventLock.acquire(lockKey)) {
      console.log(`[JOIN] BLOCKED by lock cb=${data.callbackId}`)
      await this.transport.answerCallback(data.callbackId, '⏳ In progress')
      return
    }

    console.log(`[JOIN] LOCK ACQUIRED cb=${data.callbackId}`)
    try {
      // Check current status to determine callback text
      const existing = await this.participantRepository.findEventParticipant(
        event.id,
        participant.id
      )

      // addToEvent returns new participations count via RETURNING clause
      const result = await this.participantRepository.addToEvent(event.id, participant.id)
      const count = result.participations
      let callbackText: string

      if (existing?.status === 'out') {
        callbackText = 'Welcome back! ✋'
      } else {
        callbackText = count > 1 ? `Joined (×${count}) ✋` : 'Joined ✋'
      }

      // Update message and answer callback concurrently (editMessage is slow on test server)
      await Promise.all([
        this.updateAnnouncementMessage(event.id, data.chatId, data.messageId),
        this.refreshReminder(event.id),
        this.transport.answerCallback(data.callbackId, callbackText),
      ])

      void this.logger.log(`User ${data.userId} joined event ${event.id}`)
      void this.transport.logEvent({
        type: 'participant_joined',
        event,
        participant,
      })

      // Notify owner (fire-and-forget)
      const joinParticipants = await this.participantRepository.getEventParticipants(event.id)
      const joinTotal = joinParticipants
        .filter((ep) => ep.status === 'in')
        .reduce((sum, ep) => sum + ep.participations, 0)
      void this.notifyOwner(event, 'participant-joined', participant.displayName, {
        totalParticipations: joinTotal,
        courts: event.courts,
        actorUserId: data.userId,
      })
    } finally {
      console.log(`[JOIN] RELEASING lock cb=${data.callbackId}`)
      this.eventLock.release(lockKey)
    }
  }

  private async handleLeave(data: CallbackTypes['event:leave']): Promise<void> {
    console.log(`[LEAVE] START cb=${data.callbackId} user=${data.userId}`)
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    const participant = await this.participantRepository.findByTelegramId(String(data.userId))
    if (!participant) {
      await this.transport.answerCallback(data.callbackId, 'You are not registered')
      return
    }

    const lockKey = `${event.id}:${data.userId}`
    if (!this.eventLock.acquire(lockKey)) {
      console.log(`[LEAVE] BLOCKED by lock cb=${data.callbackId}`)
      await this.transport.answerCallback(data.callbackId, '⏳ In progress')
      return
    }

    console.log(`[LEAVE] LOCK ACQUIRED cb=${data.callbackId}`)
    try {
      // Check current status
      const existing = await this.participantRepository.findEventParticipant(
        event.id,
        participant.id
      )
      let callbackText: string

      if (existing?.status === 'out') {
        await this.transport.answerCallback(data.callbackId, "You're already skipping")
        return
      } else if (existing?.status === 'in') {
        await this.participantRepository.markAsOut(event.id, participant.id)
        callbackText = "You're out 😢"
      } else {
        // Not in event at all — create as 'out'
        await this.participantRepository.markAsOut(event.id, participant.id)
        callbackText = "Noted, you're skipping 😢"
      }

      await Promise.all([
        this.updateAnnouncementMessage(event.id, data.chatId, data.messageId),
        this.refreshReminder(event.id),
        this.transport.answerCallback(data.callbackId, callbackText),
      ])

      void this.logger.log(`User ${data.userId} left event ${event.id}`)
      void this.transport.logEvent({
        type: 'participant_left',
        event,
        participant,
      })

      // Notify owner (fire-and-forget)
      const leaveParticipants = await this.participantRepository.getEventParticipants(event.id)
      const leaveTotal = leaveParticipants
        .filter((ep) => ep.status === 'in')
        .reduce((sum, ep) => sum + ep.participations, 0)
      void this.notifyOwner(event, 'participant-left', participant.displayName, {
        totalParticipations: leaveTotal,
        courts: event.courts,
        actorUserId: data.userId,
      })
    } finally {
      console.log(`[LEAVE] RELEASING lock cb=${data.callbackId}`)
      this.eventLock.release(lockKey)
    }
  }

  private async handleAddCourt(data: CallbackTypes['event:add-court']): Promise<void> {
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!(await isOwnerOrAdmin(data.userId, event.ownerId, this.settingsRepository))) {
      await this.transport.answerCallback(data.callbackId, OWNER_ONLY_CALLBACK)
      return
    }

    const newCourts = event.courts + 1
    await this.eventRepository.updateEvent(event.id, { courts: newCourts })

    await Promise.all([
      this.refreshAnnouncement(event.id),
      this.refreshReminder(event.id),
      this.transport.answerCallback(data.callbackId),
    ])

    void this.logger.log(`User ${data.userId} added court to ${event.id} (now ${newCourts})`)
    void this.transport.logEvent({ type: 'court_added', event: { ...event, courts: newCourts } })

    // Notify owner (fire-and-forget)
    const addCourtParticipants = await this.participantRepository.getEventParticipants(event.id)
    const addCourtTotal = addCourtParticipants.reduce((sum, ep) => sum + ep.participations, 0)
    void this.notifyOwner(event, 'event-court-added', undefined, {
      totalParticipations: addCourtTotal,
      courts: newCourts,
      actorUserId: data.userId,
    })
  }

  private async handleRemoveCourt(data: CallbackTypes['event:delete-court']): Promise<void> {
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!(await isOwnerOrAdmin(data.userId, event.ownerId, this.settingsRepository))) {
      await this.transport.answerCallback(data.callbackId, OWNER_ONLY_CALLBACK)
      return
    }

    if (event.courts <= 1) {
      await this.transport.answerCallback(data.callbackId, 'Cannot remove last court')
      return
    }

    const newCourts = event.courts - 1
    await this.eventRepository.updateEvent(event.id, { courts: newCourts })

    await Promise.all([
      this.refreshAnnouncement(event.id),
      this.refreshReminder(event.id),
      this.transport.answerCallback(data.callbackId),
    ])

    void this.logger.log(`User ${data.userId} removed court from ${event.id} (now ${newCourts})`)
    void this.transport.logEvent({ type: 'court_removed', event: { ...event, courts: newCourts } })

    // Notify owner (fire-and-forget)
    const removeCourtParticipants = await this.participantRepository.getEventParticipants(event.id)
    const removeCourtTotal = removeCourtParticipants.reduce((sum, ep) => sum + ep.participations, 0)
    void this.notifyOwner(event, 'event-court-removed', undefined, {
      totalParticipations: removeCourtTotal,
      courts: newCourts,
      actorUserId: data.userId,
    })
  }

  private async handleFinalize(data: CallbackTypes['event:finalize']): Promise<void> {
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!(await isOwnerOrAdmin(data.userId, event.ownerId, this.settingsRepository))) {
      await this.transport.answerCallback(data.callbackId, OWNER_ONLY_CALLBACK)
      return
    }

    const allParticipants = await this.participantRepository.getEventParticipants(event.id)
    const participants = allParticipants.filter((ep) => ep.status === 'in')
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
        await this.sendFallbackNotification(event, data.chatId, failedParticipants)
      }

      // Update announcement and reminder messages
      await Promise.all([
        this.refreshAnnouncement(event.id),
        this.refreshReminder(event.id),
        this.transport.answerCallback(data.callbackId),
      ])

      void this.logger.log(`User ${data.userId} finalized event ${event.id}`)

      void this.transport.logEvent({
        type: 'event_finalized',
        event,
        participants: participants.map((ep) => ep.participant),
      })

      // Notify owner (fire-and-forget)
      const actor = await this.participantRepository.findByTelegramId(String(data.userId))
      void this.notifyOwner(event, 'event-finalized', actor?.displayName ?? 'Unknown', {
        actorUserId: data.userId,
      })
    } finally {
      this.eventLock.release(event.id)
    }
  }

  private async handleCancel(data: CallbackTypes['event:cancel']): Promise<void> {
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!(await isOwnerOrAdmin(data.userId, event.ownerId, this.settingsRepository))) {
      await this.transport.answerCallback(data.callbackId, OWNER_ONLY_CALLBACK)
      return
    }

    await this.eventRepository.updateEvent(event.id, { status: 'cancelled' })

    const tasks: Promise<void>[] = [
      this.updateAnnouncementMessage(event.id, data.chatId, data.messageId, false, true),
      this.refreshReminder(event.id),
      this.transport.answerCallback(data.callbackId),
    ]
    if (!event.isPrivate) {
      tasks.push(this.transport.unpinMessage(data.chatId, data.messageId).catch(() => {}))
    }
    await Promise.all(tasks)

    void this.logger.log(`User ${data.userId} cancelled event ${event.id}`)

    void this.transport.logEvent({
      type: 'event_cancelled',
      event,
    })
  }

  private async handleRestore(data: CallbackTypes['event:undo-cancel']): Promise<void> {
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!(await isOwnerOrAdmin(data.userId, event.ownerId, this.settingsRepository))) {
      await this.transport.answerCallback(data.callbackId, OWNER_ONLY_CALLBACK)
      return
    }

    await this.eventRepository.updateEvent(event.id, { status: 'announced' })

    const restoreTasks: Promise<void>[] = [
      this.updateAnnouncementMessage(event.id, data.chatId, data.messageId),
      this.transport.answerCallback(data.callbackId),
    ]
    if (!event.isPrivate) {
      restoreTasks.push(this.transport.pinMessage(data.chatId, data.messageId).catch(() => {}))
    }
    await Promise.all(restoreTasks)

    void this.logger.log(`User ${data.userId} restored event ${event.id}`)
    void this.transport.logEvent({ type: 'event_restored', event })
  }

  private async handleUnfinalize(data: CallbackTypes['event:undo-finalize']): Promise<void> {
    const event = await this.resolveEventByMessageId(data.messageId)
    if (!event) {
      await this.transport.answerCallback(data.callbackId, 'Event not found')
      return
    }

    if (!(await isOwnerOrAdmin(data.userId, event.ownerId, this.settingsRepository))) {
      await this.transport.answerCallback(data.callbackId, OWNER_ONLY_CALLBACK)
      return
    }

    if (!this.eventLock.acquire(event.id)) {
      await this.transport.answerCallback(data.callbackId, '⏳ Operation already in progress')
      return
    }

    try {
      // Check for already-paid payments
      const payments = await this.paymentRepository.getPaymentsByEvent(event.id)
      const paidCount = payments.filter((p) => p.paidAt).length
      if (paidCount > 0) {
        await this.transport.answerCallback(data.callbackId, unfinalizeBlockedMsg(paidCount))
        return
      }

      // Try to delete personal DMs (best effort)
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
      await Promise.all([
        this.updateAnnouncementMessage(event.id, data.chatId, data.messageId, false),
        this.transport.answerCallback(data.callbackId),
      ])

      void this.logger.log(`User ${data.userId} unfinalized event ${event.id}`)
      void this.transport.logEvent({ type: 'event_unfinalized', event })
    } finally {
      this.eventLock.release(event.id)
    }
  }

  private async handlePaymentMark(data: CallbackTypes['payment:mark-paid']): Promise<void> {
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

      // Fetch event once for personal message update and logEvent
      const paymentEvent = await this.eventRepository.findById(eventId)

      // Update personal message
      if (payment.personalMessageId && paymentEvent) {
        const courtPrice = await this.settingsRepository.getCourtPrice()
        const participants = await this.participantRepository.getEventParticipants(eventId)
        const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
        const chatId = await this.settingsRepository.getMainChatId()

        const baseText = formatPersonalPaymentText(
          paymentEvent,
          payment.amount,
          paymentEvent.courts,
          courtPrice,
          totalParticipations,
          chatId!,
          paymentEvent.telegramMessageId!
        )
        const paidText = formatPaidPersonalPaymentText(baseText, updatedPayment.paidAt!)
        const undoKeyboard = new InlineKeyboard().text(
          '↩️ Undo',
          `payment:undo-mark-paid:${eventId}`
        )

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

      // Update announcement with checkmark
      await this.updateAnnouncementWithPayments(eventId)

      await this.transport.answerCallback(data.callbackId)

      if (paymentEvent) {
        void this.transport.logEvent({
          type: 'payment_received',
          event: paymentEvent,
          participant,
          amount: payment.amount,
        })
      }
    } finally {
      this.eventLock.release(eventId)
    }
  }

  private async handlePaymentCancel(data: CallbackTypes['payment:undo-mark-paid']): Promise<void> {
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

      // Fetch event once for personal message update and logEvent
      const paymentEvent = await this.eventRepository.findById(eventId)

      // Update personal message — revert to unpaid state
      if (payment.personalMessageId && paymentEvent) {
        const courtPrice = await this.settingsRepository.getCourtPrice()
        const participants = await this.participantRepository.getEventParticipants(eventId)
        const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
        const chatId = await this.settingsRepository.getMainChatId()

        const baseText = formatPersonalPaymentText(
          paymentEvent,
          payment.amount,
          paymentEvent.courts,
          courtPrice,
          totalParticipations,
          chatId!,
          paymentEvent.telegramMessageId!
        )
        const paidKeyboard = new InlineKeyboard().text('✅ I paid', `payment:mark-paid:${eventId}`)

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

      // Update announcement — remove checkmark
      await this.updateAnnouncementWithPayments(eventId)

      await this.transport.answerCallback(data.callbackId)

      if (paymentEvent) {
        void this.transport.logEvent({
          type: 'payment_cancelled',
          event: paymentEvent,
          participant,
        })
      }
    } finally {
      this.eventLock.release(eventId)
    }
  }

  // === CommandDef Handlers (Phase 1 stubs) ===

  private async handleJoinFromDef(data: { eventId: string }, source: SourceContext): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    // Participant was registered by middleware
    const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
    if (!participant) {
      await this.transport.sendMessage(source.chat.id, 'Registration failed. Please try again.')
      return
    }

    // Add to event
    await this.participantRepository.addToEvent(event.id, participant.id)

    // Update announcement and reminder if they exist
    await this.refreshAnnouncement(event.id)
    await this.refreshReminder(event.id)

    // Reply
    if (source.type === 'callback') {
      await this.transport.answerCallback(source.callbackId)
    } else {
      await this.transport.sendMessage(source.chat.id, `✅ Joined event ${code(event.id)}`)
    }

    await this.logger.log(`User ${source.user.id} joined event ${event.id}`)
    void this.transport.logEvent({
      type: 'participant_joined',
      event,
      participant,
    })
  }

  private async handleLeaveFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
    if (!participant) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, 'You are not registered')
      } else {
        await this.transport.sendMessage(source.chat.id, '❌ You are not registered')
      }
      return
    }

    await this.participantRepository.removeFromEvent(event.id, participant.id)
    await this.refreshAnnouncement(event.id)
    await this.refreshReminder(event.id)

    if (source.type === 'callback') {
      await this.transport.answerCallback(source.callbackId)
    } else {
      await this.transport.sendMessage(source.chat.id, `✅ Left event ${code(event.id)}`)
    }

    await this.logger.log(`User ${source.user.id} left event ${event.id}`)
    void this.transport.logEvent({
      type: 'participant_left',
      event,
      participant,
    })
  }

  private async handleAddCourtFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, OWNER_ONLY_CALLBACK)
      } else {
        await this.transport.sendMessage(source.chat.id, OWNER_ONLY_MESSAGE)
      }
      return
    }

    const newCourts = event.courts + 1
    await this.eventRepository.updateEvent(event.id, { courts: newCourts })
    await this.refreshAnnouncement(event.id)
    await this.refreshReminder(event.id)

    if (source.type === 'callback') {
      await this.transport.answerCallback(source.callbackId)
    } else {
      await this.transport.sendMessage(
        source.chat.id,
        `✅ Added court to ${code(event.id)} (now ${newCourts})`
      )
    }

    await this.logger.log(`User ${source.user.id} added court to ${event.id} (now ${newCourts})`)
    void this.transport.logEvent({ type: 'court_added', event: { ...event, courts: newCourts } })
  }

  private async handleRemoveCourtFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, OWNER_ONLY_CALLBACK)
      } else {
        await this.transport.sendMessage(source.chat.id, OWNER_ONLY_MESSAGE)
      }
      return
    }

    if (event.courts <= 1) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, 'Cannot remove last court')
      } else {
        await this.transport.sendMessage(source.chat.id, '❌ Cannot remove last court')
      }
      return
    }

    const newCourts = event.courts - 1
    await this.eventRepository.updateEvent(event.id, { courts: newCourts })
    await this.refreshAnnouncement(event.id)
    await this.refreshReminder(event.id)

    if (source.type === 'callback') {
      await this.transport.answerCallback(source.callbackId)
    } else {
      await this.transport.sendMessage(
        source.chat.id,
        `✅ Removed court from ${code(event.id)} (now ${newCourts})`
      )
    }

    await this.logger.log(
      `User ${source.user.id} removed court from ${event.id} (now ${newCourts})`
    )
    void this.transport.logEvent({ type: 'court_removed', event: { ...event, courts: newCourts } })
  }

  private async handleFinalizeFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, OWNER_ONLY_CALLBACK)
      } else {
        await this.transport.sendMessage(source.chat.id, OWNER_ONLY_MESSAGE)
      }
      return
    }

    const allFinalizeParticipants = await this.participantRepository.getEventParticipants(event.id)
    const participants = allFinalizeParticipants.filter((ep) => ep.status === 'in')
    if (participants.length === 0) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, 'No participants to finalize')
      } else {
        await this.transport.sendMessage(source.chat.id, '❌ No participants to finalize')
      }
      return
    }

    if (!this.eventLock.acquire(event.id)) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, '⏳ Operation already in progress')
      } else {
        await this.transport.sendMessage(source.chat.id, '⏳ Operation already in progress')
      }
      return
    }

    try {
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

      await this.eventRepository.updateEvent(event.id, { status: 'finalized' })

      const chatId = await this.settingsRepository.getMainChatId()
      const failedParticipants = await this.sendPersonalPaymentNotifications(
        event,
        participants,
        paymentRecords,
        courtPrice,
        chatId ?? source.chat.id
      )

      if (failedParticipants.length > 0) {
        await this.sendFallbackNotification(event, source.chat.id, failedParticipants)
      }

      await this.refreshAnnouncement(event.id)
      await this.refreshReminder(event.id)

      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId)
      } else {
        await this.transport.sendMessage(source.chat.id, `✅ Finalized event ${code(event.id)}`)
      }

      await this.logger.log(`User ${source.user.id} finalized event ${event.id}`)

      void this.transport.logEvent({
        type: 'event_finalized',
        event,
        participants: participants.map((ep) => ep.participant),
      })
    } finally {
      this.eventLock.release(event.id)
    }
  }

  private async handleRestoreFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, OWNER_ONLY_CALLBACK)
      } else {
        await this.transport.sendMessage(source.chat.id, OWNER_ONLY_MESSAGE)
      }
      return
    }

    await this.eventRepository.updateEvent(event.id, { status: 'announced' })
    await this.refreshAnnouncement(event.id)
    await this.refreshReminder(event.id)

    // Re-pin if possible (only for public events)
    if (!event.isPrivate && event.telegramMessageId) {
      const announceChatId = await this.getAnnouncementChatId(event)
      if (announceChatId) {
        try {
          await this.transport.pinMessage(announceChatId, parseInt(event.telegramMessageId, 10))
        } catch {
          // Ignore pin errors
        }
      }
    }

    if (source.type === 'callback') {
      await this.transport.answerCallback(source.callbackId)
    } else {
      await this.transport.sendMessage(source.chat.id, `✅ Restored event ${code(event.id)}`)
    }

    await this.logger.log(`User ${source.user.id} restored event ${event.id}`)
    void this.transport.logEvent({ type: 'event_restored', event })
  }

  private async handleUnfinalizeFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, OWNER_ONLY_CALLBACK)
      } else {
        await this.transport.sendMessage(source.chat.id, OWNER_ONLY_MESSAGE)
      }
      return
    }

    if (!this.eventLock.acquire(event.id)) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, '⏳ Operation already in progress')
      } else {
        await this.transport.sendMessage(source.chat.id, '⏳ Operation already in progress')
      }
      return
    }

    try {
      // Check for already-paid payments
      const payments = await this.paymentRepository.getPaymentsByEvent(event.id)
      const paidCount = payments.filter((p) => p.paidAt).length
      if (paidCount > 0) {
        if (source.type === 'callback') {
          await this.transport.answerCallback(source.callbackId, unfinalizeBlockedMsg(paidCount))
        } else {
          await this.transport.sendMessage(source.chat.id, `❌ ${unfinalizeBlockedMsg(paidCount)}`)
        }
        return
      }

      // Try to delete personal DMs (best effort)
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

      await this.paymentRepository.deleteByEvent(event.id)
      await this.eventRepository.updateEvent(event.id, { status: 'announced' })
      await this.refreshAnnouncement(event.id)
      await this.refreshReminder(event.id)

      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId)
      } else {
        await this.transport.sendMessage(source.chat.id, `✅ Unfinalized event ${code(event.id)}`)
      }

      await this.logger.log(`User ${source.user.id} unfinalized event ${event.id}`)
      void this.transport.logEvent({ type: 'event_unfinalized', event })
    } finally {
      this.eventLock.release(event.id)
    }
  }

  private async handlePaymentMarkFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    if (!this.eventLock.acquire(data.eventId)) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, '⏳ In progress')
      } else {
        await this.transport.sendMessage(source.chat.id, '⏳ Operation already in progress')
      }
      return
    }

    try {
      const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
      if (!participant) {
        if (source.type === 'callback') {
          await this.transport.answerCallback(source.callbackId, 'Participant not found')
        } else {
          await this.transport.sendMessage(source.chat.id, '❌ Participant not found')
        }
        return
      }

      const payment = await this.paymentRepository.findByEventAndParticipant(
        data.eventId,
        participant.id
      )
      if (!payment) {
        if (source.type === 'callback') {
          await this.transport.answerCallback(source.callbackId, 'Payment not found')
        } else {
          await this.transport.sendMessage(source.chat.id, '❌ Payment not found')
        }
        return
      }

      const updatedPayment = await this.paymentRepository.markAsPaid(payment.id!)

      // Update personal DM message if exists
      if (payment.personalMessageId) {
        const event = await this.eventRepository.findById(data.eventId)
        if (event) {
          const courtPrice = await this.settingsRepository.getCourtPrice()
          const participants = await this.participantRepository.getEventParticipants(data.eventId)
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
          const undoKeyboard = new InlineKeyboard().text(
            '↩️ Undo',
            `payment:undo-mark-paid:${data.eventId}`
          )

          try {
            await this.transport.editMessage(
              source.user.id,
              parseInt(payment.personalMessageId, 10),
              paidText,
              undoKeyboard
            )
          } catch {
            // Best effort
          }
        }
      }

      await this.updateAnnouncementWithPayments(data.eventId)

      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId)
      } else {
        await this.transport.sendMessage(source.chat.id, `✅ Payment marked as paid`)
      }

      const paymentEvent = await this.eventRepository.findById(data.eventId)
      if (paymentEvent) {
        void this.transport.logEvent({
          type: 'payment_received',
          event: paymentEvent,
          participant,
          amount: payment.amount,
        })
      }
    } finally {
      this.eventLock.release(data.eventId)
    }
  }

  private async handlePaymentCancelFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    if (!this.eventLock.acquire(data.eventId)) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, '⏳ Operation already in progress')
      } else {
        await this.transport.sendMessage(source.chat.id, '⏳ Operation already in progress')
      }
      return
    }

    try {
      const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
      if (!participant) {
        if (source.type === 'callback') {
          await this.transport.answerCallback(source.callbackId, 'Participant not found')
        } else {
          await this.transport.sendMessage(source.chat.id, '❌ Participant not found')
        }
        return
      }

      const payment = await this.paymentRepository.findByEventAndParticipant(
        data.eventId,
        participant.id
      )
      if (!payment) {
        if (source.type === 'callback') {
          await this.transport.answerCallback(source.callbackId, 'Payment not found')
        } else {
          await this.transport.sendMessage(source.chat.id, '❌ Payment not found')
        }
        return
      }

      await this.paymentRepository.markAsUnpaid(payment.id!)

      // Fetch event once for personal message update and logEvent
      const paymentEvent = await this.eventRepository.findById(data.eventId)

      // Revert personal DM to unpaid state
      if (payment.personalMessageId && paymentEvent) {
        const courtPrice = await this.settingsRepository.getCourtPrice()
        const participants = await this.participantRepository.getEventParticipants(data.eventId)
        const totalParticipations = participants.reduce((sum, ep) => sum + ep.participations, 0)
        const chatId = await this.settingsRepository.getMainChatId()

        const baseText = formatPersonalPaymentText(
          paymentEvent,
          payment.amount,
          paymentEvent.courts,
          courtPrice,
          totalParticipations,
          chatId!,
          paymentEvent.telegramMessageId!
        )
        const paidKeyboard = new InlineKeyboard().text(
          '✅ I paid',
          `payment:mark-paid:${data.eventId}`
        )

        try {
          await this.transport.editMessage(
            source.user.id,
            parseInt(payment.personalMessageId, 10),
            baseText,
            paidKeyboard
          )
        } catch {
          // Best effort
        }
      }

      await this.updateAnnouncementWithPayments(data.eventId)

      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId)
      } else {
        await this.transport.sendMessage(source.chat.id, `✅ Payment marked as unpaid`)
      }

      if (paymentEvent) {
        void this.transport.logEvent({
          type: 'payment_cancelled',
          event: paymentEvent,
          participant,
        })
      }
    } finally {
      this.eventLock.release(data.eventId)
    }
  }

  private async handleCreateFromDef(
    data: { day: string; time: string; courts: number; isPrivate: boolean },
    source: SourceContext
  ): Promise<void> {
    // Parser already validated day and time — parseDate won't throw
    const eventDate = parseDate(data.day)

    // Apply time to date
    const [hours, minutes] = data.time.split(':').map(Number)
    const datetime = dayjs
      .tz(eventDate, config.timezone)
      .hour(hours)
      .minute(minutes)
      .second(0)
      .toDate()

    // Create event
    const defaultCollectorId = await this.participantBusiness.resolveDefaultCollectorId()
    const event = await this.eventRepository.createEvent({
      datetime,
      courts: data.courts,
      status: 'created',
      ownerId: String(source.user.id),
      isPrivate: data.isPrivate,
      collectorId: defaultCollectorId ?? undefined,
    })

    // Format success message
    const dateFormatted = formatDate(dayjs.tz(event.datetime, config.timezone))
    const entityText = formatEventListItem(event, dateFormatted)
    await this.transport.sendMessage(
      source.chat.id,
      `📅 Event created\n\n${entityText}\n\nTo announce: ${code(`/event announce ${event.id}`)}`
    )
    const owner = await this.participantRepository.findByTelegramId(String(source.user.id))
    void this.transport.logEvent({
      type: 'event_created',
      event,
      owner: owner ?? undefined,
    })
  }

  // === Admin Command Handlers ===

  private async handleAdminPayFromDef(
    data: { eventId: string; targetUsername: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }
    if (event.status !== 'finalized') {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Event ${code(data.eventId)} is not finalized`
      )
      return
    }

    const participant = await this.participantRepository.findByUsername(data.targetUsername)
    if (!participant) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Participant @${data.targetUsername} not found`
      )
      return
    }

    const payment = await this.paymentRepository.findByEventAndParticipant(event.id, participant.id)
    if (!payment) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ No payment found for @${data.targetUsername} in ${code(event.id)}`
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
      const undoKeyboard = new InlineKeyboard().text(
        '↩️ Undo',
        `payment:undo-mark-paid:${event.id}`
      )

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
      source.chat.id,
      `✅ @${data.targetUsername} marked as paid for ${code(event.id)}`
    )

    void this.transport.logEvent({
      type: 'payment_received',
      event,
      participant,
      amount: payment.amount,
    })
  }

  private async handleAdminUnpayFromDef(
    data: { eventId: string; targetUsername: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }
    if (event.status !== 'finalized') {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Event ${code(data.eventId)} is not finalized`
      )
      return
    }

    const participant = await this.participantRepository.findByUsername(data.targetUsername)
    if (!participant) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Participant @${data.targetUsername} not found`
      )
      return
    }

    const payment = await this.paymentRepository.findByEventAndParticipant(event.id, participant.id)
    if (!payment) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ No payment found for @${data.targetUsername} in ${code(event.id)}`
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
      const paidKeyboard = new InlineKeyboard().text('✅ I paid', `payment:mark-paid:${event.id}`)

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
      source.chat.id,
      `✅ @${data.targetUsername} marked as unpaid for ${code(event.id)}`
    )
    void this.transport.logEvent({ type: 'payment_cancelled', event, participant })
  }

  private async handlePaymentDebt(data: PaymentDebtData, source: SourceContext): Promise<void> {
    // Sudo mode: show all debts or per-user debts
    if (source.sudo) {
      if (data.targetUsername) {
        // Per-user mode
        const participant = await this.participantRepository.findByUsername(data.targetUsername)
        if (!participant) {
          await this.transport.sendMessage(source.chat.id, `User @${data.targetUsername} not found`)
          return
        }

        const unpaidPayments = await this.paymentRepository.getUnpaidByParticipantId(participant.id)
        const debts: DebtEntry[] = []
        for (const payment of unpaidPayments) {
          const event = await this.eventRepository.findById(payment.eventId)
          if (!event) {
            continue
          }
          const eventDate = dayjs.tz(event.datetime, config.timezone)
          debts.push({ eventDateStr: formatDate(eventDate), amount: payment.amount })
        }

        if (debts.length === 0) {
          await this.transport.sendMessage(
            source.chat.id,
            `✅ @${data.targetUsername} has no debts!`
          )
          return
        }

        let text = `💰 Debts for @${data.targetUsername}:\n`
        let total = 0
        for (const debt of debts) {
          text += `\nSquash ${debt.eventDateStr} — ${debt.amount} din`
          total += debt.amount
        }
        text += `\n\nTotal: ${total} din`
        await this.transport.sendMessage(source.chat.id, text)
        return
      }

      // All debts mode
      const unpaidPayments = await this.paymentRepository.getUnpaidPayments()
      if (unpaidPayments.length === 0) {
        await this.transport.sendMessage(source.chat.id, '✅ All payments received!')
        return
      }

      // Group by event
      const eventMap = new Map<
        string,
        { event: Event; debts: { participantName: string; amount: number }[] }
      >()

      for (const payment of unpaidPayments) {
        if (!eventMap.has(payment.eventId)) {
          const event = await this.eventRepository.findById(payment.eventId)
          if (!event) {
            continue
          }
          eventMap.set(payment.eventId, { event, debts: [] })
        }

        const participant = await this.participantRepository.findById(payment.participantId)
        const name = participant?.telegramUsername
          ? `@${participant.telegramUsername}`
          : (participant?.displayName ?? 'Unknown')

        eventMap.get(payment.eventId)!.debts.push({
          participantName: name,
          amount: payment.amount,
        })
      }

      const groups: AdminDebtGroup[] = Array.from(eventMap.values()).map(({ event, debts }) => ({
        eventDateStr: formatDate(dayjs.tz(event.datetime, config.timezone)),
        debts,
      }))

      const message = formatAdminDebtSummary(groups)
      await this.transport.sendMessage(source.chat.id, message)
      return
    }

    // Regular user mode: show only own debts
    const participant = await this.participantRepository.findByTelegramId(String(source.user.id))
    if (!participant) {
      await this.transport.sendMessage(source.chat.id, '✅ No unpaid debts!')
      return
    }

    const unpaidPayments = await this.paymentRepository.getUnpaidByParticipantId(participant.id)
    if (unpaidPayments.length === 0) {
      await this.transport.sendMessage(source.chat.id, '✅ No unpaid debts!')
      return
    }

    const debts: DebtEntry[] = []
    for (const payment of unpaidPayments) {
      const event = await this.eventRepository.findById(payment.eventId)
      if (!event) {
        continue
      }

      const eventDate = dayjs.tz(event.datetime, config.timezone)
      const eventDateStr = formatDate(eventDate)

      const collectorPaymentInfo = await this.resolveCollectorPaymentInfo(event)

      debts.push({ eventDateStr, amount: payment.amount, collectorPaymentInfo })
    }

    const message = formatDebtSummary(debts)
    await this.transport.sendMessage(source.chat.id, message)
  }

  // === Command Handlers ===

  private async handleListFromDef(source: SourceContext): Promise<void> {
    const events = await this.eventRepository.getEvents()
    const activeEvents = events.filter((e) => e.status !== 'cancelled')

    if (activeEvents.length === 0) {
      await this.transport.sendMessage(source.chat.id, '📋 Event list\n\nNo events found')
      return
    }

    const list = await Promise.all(
      activeEvents.map(async (e) => {
        const date = formatDate(dayjs.tz(e.datetime, config.timezone))
        const owner = await this.participantRepository.findByTelegramId(e.ownerId)
        const ownerLabel = owner ? formatParticipantLabel(owner) : undefined
        return formatEventListItem(e, date, ownerLabel)
      })
    )

    await this.transport.sendMessage(source.chat.id, `📋 Event list\n\n${list.join('\n\n')}`)
  }

  private async handleAnnounceFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (event.status === 'announced') {
      await this.transport.sendMessage(
        source.chat.id,
        `ℹ️ Event ${code(event.id)} is already announced`
      )
      return
    }

    try {
      await this.announceEvent(event.id, source.user.id)
      const updatedEvent = await this.eventRepository.findById(event.id)
      const announcedDate = formatDate(dayjs.tz(event.datetime, config.timezone))
      const entityText = formatEventListItem(updatedEvent ?? event, announcedDate)
      await this.transport.sendMessage(source.chat.id, `📢 Event announced\n\n${entityText}`)
    } catch (error) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Failed to announce event: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async handleSpawnFromDef(
    data: { scaffoldId: string },
    source: SourceContext
  ): Promise<void> {
    const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
    if (!scaffold) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Scaffold ${code(data.scaffoldId)} not found`
      )
      return
    }

    // Calculate next occurrence
    const nextOccurrence = calculateNextOccurrence(scaffold)

    // Check for duplicate
    const events = await this.eventRepository.getEvents()
    if (eventExists(events, scaffold.id, nextOccurrence)) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ Event already exists for scaffold ${code(scaffold.id)}`
      )
      return
    }

    // Owner: inherit from scaffold, fallback to global admin
    const ownerId = scaffold.ownerId ?? (await this.settingsRepository.getAdminId())
    if (!ownerId) {
      await this.transport.sendMessage(
        source.chat.id,
        '❌ Cannot determine event owner. Set scaffold owner or global admin.'
      )
      return
    }

    // Create event
    const event = await this.eventRepository.createEvent({
      scaffoldId: scaffold.id,
      datetime: nextOccurrence,
      courts: scaffold.defaultCourts,
      status: 'created',
      ownerId,
      collectorId: scaffold.collectorId,
    })

    // Format success message
    const dateFormatted = formatDate(dayjs.tz(event.datetime, config.timezone))
    const entityText = formatEventListItem(event, dateFormatted)
    await this.transport.sendMessage(
      source.chat.id,
      `📅 Event created from ${code(scaffold.id)}\n\n${entityText}\n\nTo announce: ${code(`/event announce ${event.id}`)}`
    )
    const owner = await this.participantRepository.findByTelegramId(ownerId)
    void this.transport.logEvent({
      type: 'event_created',
      event,
      owner: owner ?? undefined,
    })
  }

  private async handleCancelCommandFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      if (source.type === 'callback') {
        await this.transport.answerCallback(source.callbackId, OWNER_ONLY_CALLBACK)
      } else {
        await this.transport.sendMessage(source.chat.id, OWNER_ONLY_MESSAGE)
      }
      return
    }

    // Cancel the event
    await this.eventRepository.updateEvent(event.id, { status: 'cancelled' })

    await this.transport.sendMessage(source.chat.id, `✅ Event ${code(event.id)} cancelled`)

    // If event was announced, send cancellation notification to the announcement chat
    if (event.status === 'announced') {
      const chatId = await this.getAnnouncementChatId(event)
      if (chatId) {
        await this.transport.sendMessage(chatId, `❌ Event ${code(event.id)} has been cancelled.`)
      }
    }

    void this.transport.logEvent({
      type: 'event_cancelled',
      event,
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

    if (event.isPrivate) {
      // Private events: update ALL announcement messages via refreshAnnouncement
      await this.refreshAnnouncement(eventId)
      return
    }

    // Public event: update single group message
    const participants = await this.participantRepository.getEventParticipants(eventId)
    const messageText = formatAnnouncementText(event, participants, finalized, cancelled)
    const status =
      event.status === 'cancelled'
        ? 'cancelled'
        : event.status === 'finalized'
          ? 'finalized'
          : 'announced'
    const keyboard = buildInlineKeyboard(status as EventStatus, event.isPrivate, event.id)

    try {
      await this.transport.editMessage(chatId, messageId, messageText, keyboard)
    } catch (error) {
      await this.logger.error(
        `Error updating announcement: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async notifyOwner(
    event: Event,
    type:
      | 'participant-joined'
      | 'participant-left'
      | 'event-court-added'
      | 'event-court-removed'
      | 'event-announced'
      | 'event-finalized',
    actorName: string | undefined,
    opts: {
      totalParticipations?: number
      courts?: number
      actorUserId?: number
      announceUrl?: string
    } = {}
  ): Promise<void> {
    try {
      // Skip self-notification for announce/finalize only
      // Join/leave/court changes always notify owner (capacity info is useful)
      if (
        (type === 'event-announced' || type === 'event-finalized') &&
        opts.actorUserId &&
        String(opts.actorUserId) === event.ownerId
      ) {
        return
      }

      const eventDate = dayjs.tz(event.datetime, config.timezone)
      const eventDateStr = eventDate.format('ddd D MMM HH:mm')

      const totalParticipations = opts.totalParticipations ?? 0
      const courts = opts.courts ?? event.courts

      const maxPerCourt = await this.settingsRepository.getMaxPlayersPerCourt()
      const minPerCourt = await this.settingsRepository.getMinPlayersPerCourt()

      const message = formatOwnerNotification(
        type,
        actorName,
        eventDateStr,
        totalParticipations,
        courts,
        { maxPerCourt, minPerCourt }
      )

      const ownerTelegramId = parseInt(event.ownerId, 10)
      const keyboard = opts.announceUrl
        ? new InlineKeyboard().url('🔗 Go to announcement', opts.announceUrl)
        : undefined

      try {
        await this.transport.sendMessage(ownerTelegramId, message, keyboard)
      } catch {
        // Fallback to main chat
        const mainChatId = await this.settingsRepository.getMainChatId()
        if (mainChatId) {
          await this.transport.sendMessage(mainChatId, message, keyboard)
        }
      }
    } catch (error) {
      await this.logger.error(
        `Error notifying owner for event ${event.id}: ${error instanceof Error ? error.message : String(error)}`
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

    // Resolve collector's payment info
    const collectorPaymentInfo = await this.resolveCollectorPaymentInfo(event)

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
        event.telegramMessageId!,
        collectorPaymentInfo
      )
      const keyboard = new InlineKeyboard().text('✅ I paid', `payment:mark-paid:${event.id}`)

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
    event: Event,
    fallbackChatId: number,
    failedParticipants: EventParticipant[]
  ): Promise<void> {
    const names = failedParticipants.map((ep) =>
      ep.participant.telegramUsername
        ? `@${ep.participant.telegramUsername}`
        : ep.participant.displayName
    )
    const botInfo = this.transport.getBotInfo()
    const text = formatFallbackNotificationText(names, botInfo.username ?? '')

    // 3-tier fallback: 1) Owner DM (private events) → 2) Main chat → 3) fallbackChatId
    if (event.isPrivate) {
      try {
        await this.transport.sendMessage(parseInt(event.ownerId, 10), text)
        return
      } catch {
        // Fall through to main chat
      }
    }

    const mainChatId = await this.settingsRepository.getMainChatId()
    if (mainChatId) {
      try {
        await this.transport.sendMessage(mainChatId, text)
        return
      } catch {
        // Fall through to fallback
      }
    }

    await this.transport.sendMessage(fallbackChatId, text)
  }

  private async updateAnnouncementWithPayments(eventId: string): Promise<void> {
    const event = await this.eventRepository.findById(eventId)
    if (!event?.telegramMessageId) {
      return
    }

    const chatId = await this.getAnnouncementChatId(event)
    if (!chatId) {
      return
    }

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
    const keyboard = buildInlineKeyboard(event.status as EventStatus, event.isPrivate, event.id)

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

  private async getAnnouncementChatId(event: Event): Promise<number | null> {
    if (event.telegramChatId) {
      return parseInt(event.telegramChatId, 10)
    }
    return this.settingsRepository.getMainChatId()
  }

  private async refreshAnnouncement(eventId: string): Promise<void> {
    const announcements = await this.eventAnnouncementRepository.getByEventId(eventId)

    // Fallback to legacy fields if no announcement rows exist
    if (announcements.length === 0) {
      const event = await this.eventRepository.findById(eventId)
      if (!event?.telegramMessageId) {
        return
      }

      const chatId = await this.getAnnouncementChatId(event)
      if (!chatId) {
        return
      }

      const participants = await this.participantRepository.getEventParticipants(eventId)
      let paidParticipantIds: Set<string> | undefined
      if (event.status === 'finalized') {
        const payments = await this.paymentRepository.getPaymentsByEvent(eventId)
        paidParticipantIds = new Set(payments.filter((p) => p.isPaid).map((p) => p.participantId))
      }

      const messageText = formatAnnouncementText(
        event,
        participants,
        event.status === 'finalized',
        event.status === 'cancelled',
        paidParticipantIds
      )
      const keyboard = buildInlineKeyboard(event.status as EventStatus, event.isPrivate, event.id)

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
      return
    }

    const event = await this.eventRepository.findById(eventId)
    if (!event) {
      return
    }

    const participants = await this.participantRepository.getEventParticipants(eventId)

    let paidParticipantIds: Set<string> | undefined
    if (event.status === 'finalized') {
      const payments = await this.paymentRepository.getPaymentsByEvent(eventId)
      paidParticipantIds = new Set(payments.filter((p) => p.isPaid).map((p) => p.participantId))
    }

    const messageText = formatAnnouncementText(
      event,
      participants,
      event.status === 'finalized',
      event.status === 'cancelled',
      paidParticipantIds
    )

    for (const ann of announcements) {
      const chatId = parseInt(ann.telegramChatId, 10)
      const messageId = parseInt(ann.telegramMessageId, 10)
      const isOwner = ann.telegramChatId === event.ownerId
      const keyboard = buildInlineKeyboard(
        event.status as EventStatus,
        event.isPrivate,
        event.id,
        isOwner
      )
      try {
        await this.transport.editMessage(chatId, messageId, messageText, keyboard)
      } catch (error) {
        await this.logger.error(
          `Error updating announcement ${ann.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  /**
   * Announces an event to Telegram and updates its status
   */
  async announceEvent(id: string, actorUserId?: number): Promise<Event> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    if (event.isPrivate) {
      // Private event: send personal DM to each participant + owner
      const messageText = formatEventMessage(event)
      const eventParticipants = await this.participantRepository.getEventParticipants(event.id)
      const playingParticipants = eventParticipants.filter((ep) => ep.status === 'in')

      let firstMessageId: number | undefined
      let firstChatId: number | undefined

      for (const ep of playingParticipants) {
        if (!ep.participant.telegramId) {
          continue
        }
        const participantChatId = parseInt(ep.participant.telegramId, 10)
        const isOwner = ep.participant.telegramId === event.ownerId
        const keyboard = buildInlineKeyboard('announced', true, event.id, isOwner)
        try {
          const msgId = await this.transport.sendMessage(participantChatId, messageText, keyboard)
          await this.eventAnnouncementRepository.create(
            event.id,
            String(msgId),
            String(participantChatId)
          )
          if (!firstMessageId) {
            firstMessageId = msgId
            firstChatId = participantChatId
          }
        } catch (error) {
          await this.logger.error(
            `Failed to send private announcement to ${ep.participant.displayName}: ${error}`
          )
        }
      }

      // Also send to owner if not already a participant
      const ownerIsParticipant = playingParticipants.some(
        (ep) => ep.participant.telegramId === event.ownerId
      )
      if (!ownerIsParticipant) {
        const ownerChatId = parseInt(event.ownerId, 10)
        const keyboard = buildInlineKeyboard('announced', true, event.id, true)
        try {
          const msgId = await this.transport.sendMessage(ownerChatId, messageText, keyboard)
          await this.eventAnnouncementRepository.create(
            event.id,
            String(msgId),
            String(ownerChatId)
          )
          if (!firstMessageId) {
            firstMessageId = msgId
            firstChatId = ownerChatId
          }
        } catch (error) {
          await this.logger.error(`Failed to send private announcement to owner: ${error}`)
        }
      }

      // Update event status (keep legacy fields for backward compatibility)
      const updatedEvent = await this.eventRepository.updateEvent(id, {
        telegramMessageId: firstMessageId ? String(firstMessageId) : undefined,
        telegramChatId: firstChatId ? String(firstChatId) : undefined,
        status: 'announced',
      })

      const owner = await this.participantRepository.findByTelegramId(event.ownerId)
      void this.transport.logEvent({
        type: 'event_announced',
        event: updatedEvent,
        owner: owner ?? undefined,
      })

      void this.notifyOwner(updatedEvent, 'event-announced', undefined, {
        actorUserId,
      })

      return updatedEvent
    }

    // Public event
    const mainChatId = await this.settingsRepository.getMainChatId()
    if (!mainChatId) {
      throw new Error('Chat ID not configured')
    }
    const chatId = mainChatId

    // Send announcement via transport layer
    const messageText = formatEventMessage(event)
    const keyboard = buildInlineKeyboard('announced', event.isPrivate, event.id)
    const messageId = await this.transport.sendMessage(chatId, messageText, keyboard)

    // Pin the message
    try {
      await this.transport.pinMessage(chatId, messageId)
    } catch {
      // Ignore pin errors
    }

    // Store announcement in event_announcements table
    await this.eventAnnouncementRepository.create(event.id, String(messageId), String(chatId))

    // Update event status (keep legacy fields for backward compatibility)
    const updatedEvent = await this.eventRepository.updateEvent(id, {
      telegramMessageId: String(messageId),
      telegramChatId: String(chatId),
      status: 'announced',
    })

    const owner = await this.participantRepository.findByTelegramId(event.ownerId)
    void this.transport.logEvent({
      type: 'event_announced',
      event: updatedEvent,
      owner: owner ?? undefined,
    })

    // Notify owner (fire-and-forget)
    const announceUrl =
      updatedEvent.telegramChatId && updatedEvent.telegramMessageId
        ? buildAnnouncementUrl(updatedEvent.telegramChatId, updatedEvent.telegramMessageId)
        : undefined
    void this.notifyOwner(updatedEvent, 'event-announced', undefined, {
      announceUrl,
      actorUserId,
    })

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
      const chatId = await this.getAnnouncementChatId(event)
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

        // Owner: inherit from scaffold, fallback to global admin
        const ownerId = scaffold.ownerId ?? (await this.settingsRepository.getAdminId())
        if (!ownerId) {
          await this.logger.error(`Cannot determine owner for scaffold ${scaffold.id}, skipping`)
          continue
        }

        // Create event
        const event = await this.eventRepository.createEvent({
          scaffoldId: scaffold.id,
          datetime: nextOccurrence,
          courts: scaffold.defaultCourts,
          status: 'created',
          ownerId,
          isPrivate: scaffold.isPrivate,
          collectorId: scaffold.collectorId,
        })

        // Copy scaffold participants to private event
        if (scaffold.isPrivate) {
          const withParticipants = await this.scaffoldRepository.findByIdWithParticipants(
            scaffold.id
          )
          if (withParticipants) {
            for (const participant of withParticipants.participants) {
              await this.participantRepository.addToEvent(event.id, participant.id)
            }
          }
        }

        // Immediately announce
        await this.announceEvent(event.id)

        createdCount++
        await this.logger.log(
          `Created and announced event ${event.id} from scaffold ${scaffold.id}`
        )

        const owner = await this.participantRepository.findByTelegramId(event.ownerId)
        void this.transport.logEvent({
          type: 'event_created',
          event,
          owner: owner ?? undefined,
        })
      } catch (error) {
        await this.logger.error(
          `Failed to create event from scaffold ${scaffold.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return createdCount
  }

  /**
   * Auto-announces manual events in 'created' status when their datetime
   * is within the announcement deadline threshold.
   */
  async checkAndAnnounceCreatedEvents(): Promise<number> {
    const allEvents = await this.eventRepository.getEvents()
    const createdEvents = allEvents.filter((e) => e.status === 'created')

    if (createdEvents.length === 0) {
      return 0
    }

    const timezone = await this.settingsRepository.getTimezone()
    const defaultDeadline = await this.settingsRepository.getAnnouncementDeadline()

    let count = 0

    for (const event of createdEvents) {
      try {
        const deadline = event.announcementDeadline ?? defaultDeadline

        if (!shouldTrigger(deadline, event.datetime, timezone)) {
          continue
        }

        await this.announceEvent(event.id)
        count++
        await this.logger.log(`Auto-announced created event ${event.id}`)
      } catch (error) {
        await this.logger.error(
          `Failed to auto-announce event ${event.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return count
  }

  private async handleDeleteFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    try {
      const event = await this.eventRepository.findById(data.eventId)
      if (!event) {
        await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
        return
      }

      if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          source.chat.id,
          '❌ Only the owner or admin can delete this event'
        )
        return
      }

      await this.eventRepository.remove(data.eventId)

      await this.transport.sendMessage(source.chat.id, `✅ Event ${code(data.eventId)} deleted`)
      await this.logger.log(`User ${source.user.id} deleted event ${data.eventId}`)
      void this.transport.logEvent({ type: 'event_deleted', event })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error deleting event from user ${source.user.id}: ${errorMessage}`)
    }
  }

  private async handleUndoDeleteFromDef(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    try {
      const event = await this.eventRepository.findByIdIncludingDeleted(data.eventId)
      if (!event) {
        await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
        return
      }
      if (!event.deletedAt) {
        await this.transport.sendMessage(
          source.chat.id,
          `❌ Event ${code(data.eventId)} is not deleted`
        )
        return
      }
      if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          source.chat.id,
          '❌ Only the owner or admin can restore this event'
        )
        return
      }
      await this.eventRepository.restore(data.eventId)
      await this.transport.sendMessage(source.chat.id, `✅ Event ${code(data.eventId)} restored`)
      await this.logger.log(`User ${source.user.id} restored event ${data.eventId}`)
      void this.transport.logEvent({ type: 'event_undeleted', event })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error restoring event from user ${source.user.id}: ${errorMessage}`)
    }
  }

  private async handleTransferFromDef(
    data: { eventId: string; targetUsername: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }

    if (!(await isOwnerOrAdmin(source.user.id, event.ownerId, this.settingsRepository))) {
      await this.transport.sendMessage(
        source.chat.id,
        '❌ Only the owner or admin can transfer ownership'
      )
      return
    }

    const target = await this.participantRepository.findByUsername(data.targetUsername)
    if (!target || !target.telegramId) {
      await this.transport.sendMessage(
        source.chat.id,
        `❌ User @${data.targetUsername} not found. They need to interact with the bot first.`
      )
      return
    }

    const from = await this.participantRepository.findByTelegramId(event.ownerId)

    await this.eventRepository.updateEvent(event.id, { ownerId: target.telegramId })

    await this.transport.sendMessage(
      source.chat.id,
      `✅ Event ${code(event.id)} transferred to @${data.targetUsername}`
    )
    await this.logger.log(
      `User ${source.user.id} transferred event ${event.id} to @${data.targetUsername}`
    )
    if (from) {
      void this.transport.logEvent({ type: 'event_transferred', event, from, to: target })
    } else {
      void this.logger.warn(`Cannot find owner participant for event ${event.id} during transfer`)
    }
  }

  // === Edit Menu ===

  private async handleEventEditMenu(
    data: { eventId: string },
    source: SourceContext
  ): Promise<void> {
    const event = await this.eventRepository.findById(data.eventId)
    if (!event) {
      await this.transport.sendMessage(source.chat.id, `❌ Event ${code(data.eventId)} not found`)
      return
    }
    await this.transport.sendMessage(
      source.chat.id,
      formatEventEditMenu(event),
      buildEventEditKeyboard(data.eventId, event.isPrivate, event.status)
    )
  }

  private async handleEventEditAction(
    action: string,
    entityId: string,
    ctx: Context
  ): Promise<void> {
    const event = await this.eventRepository.findById(entityId)
    if (!event) {
      return
    }

    const chatId = ctx.chat!.id
    const messageId = ctx.callbackQuery!.message!.message_id

    // Only allow editing events in editable statuses
    if (['cancelled', 'finalized', 'paid'].includes(event.status)) {
      if (action !== 'done') {
        return
      }
    }

    switch (action) {
      case '+court':
        await this.eventRepository.updateEvent(entityId, { courts: event.courts + 1 })
        break
      case '-court':
        if (event.courts <= 1) {
          return
        }
        await this.eventRepository.updateEvent(entityId, { courts: event.courts - 1 })
        break
      case 'date': {
        const hydratedDay = this.hydrateStep(eventDateStep)
        try {
          const newDay = await this.wizardService.collect(hydratedDay, ctx)
          const newDate = parseDate(newDay)
          const existingTime = dayjs(event.datetime)
          const combined = dayjs(newDate)
            .hour(existingTime.hour())
            .minute(existingTime.minute())
            .toDate()
          await this.eventRepository.updateEvent(entityId, { datetime: combined })
        } catch (e) {
          if (e instanceof WizardCancelledError) {
            break
          }
          throw e
        }
        break
      }
      case 'time': {
        const hydratedTime = this.hydrateStep(eventTimeStep)
        try {
          const newTime = await this.wizardService.collect(hydratedTime, ctx)
          const [h, m] = newTime.split(':').map(Number)
          const combined = dayjs(event.datetime).hour(h).minute(m).toDate()
          await this.eventRepository.updateEvent(entityId, { datetime: combined })
        } catch (e) {
          if (e instanceof WizardCancelledError) {
            break
          }
          throw e
        }
        break
      }
      case 'privacy': {
        if (event.isPrivate && event.status !== 'created') {
          await ctx.answerCallbackQuery({
            text: '❌ Cannot make public: event already announced in private chat',
          })
          return
        }
        await this.eventRepository.updateEvent(entityId, { isPrivate: !event.isPrivate })
        break
      }
      case '+participant': {
        const currentParticipants = await this.participantRepository.getEventParticipants(entityId)
        const currentIds = new Set(currentParticipants.map((p) => p.participantId))
        const addStep: HydratedStep<string> = {
          param: 'participantId',
          type: 'select',
          prompt: 'Choose a participant to add:',
          emptyMessage: `No participants available. Ask them to <a href="https://t.me/${ctx.me.username}">start a chat with me</a>.`,
          load: async () => {
            const all = await this.participantRepository.getParticipants()
            return all
              .filter((p) => !currentIds.has(p.id))
              .map((p) => ({
                value: p.id,
                label: p.telegramUsername ? `@${p.telegramUsername}` : p.displayName,
              }))
          },
          parse: (v: string) => v,
        }
        try {
          const participantId = await this.wizardService.collect(addStep, ctx)
          await this.participantRepository.addToEvent(entityId, participantId)

          // For private events, send a personal DM to the newly added participant
          if (event.isPrivate) {
            const newParticipant = await this.participantRepository.findById(participantId)
            if (newParticipant?.telegramId) {
              const participants = await this.participantRepository.getEventParticipants(entityId)
              const messageText = formatAnnouncementText(event, participants)
              const keyboard = buildInlineKeyboard('announced', true, entityId, false)
              try {
                const participantChatId = parseInt(newParticipant.telegramId, 10)
                const msgId = await this.transport.sendMessage(
                  participantChatId,
                  messageText,
                  keyboard
                )
                await this.eventAnnouncementRepository.create(
                  entityId,
                  String(msgId),
                  String(participantChatId)
                )
              } catch {
                await this.logger.error(`Failed to send DM to ${newParticipant.displayName}`)
              }
            }
          }
        } catch (e) {
          if (!(e instanceof WizardCancelledError)) {
            throw e
          }
        }
        await this.refreshAnnouncement(entityId)
        await this.refreshReminder(entityId)
        return
      }
      case '-participant': {
        const participantsForRemove =
          await this.participantRepository.getEventParticipants(entityId)
        if (participantsForRemove.length === 0) {
          return
        }
        const removeStep: HydratedStep<string> = {
          param: 'participantId',
          type: 'select',
          prompt: 'Choose a participant to remove:',
          emptyMessage: 'No participants to remove.',
          load: async () =>
            participantsForRemove.map((p) => ({
              value: p.participantId,
              label: p.participant.telegramUsername
                ? `@${p.participant.telegramUsername}`
                : p.participant.displayName,
            })),
          parse: (v: string) => v,
        }
        try {
          const participantId = await this.wizardService.collect(removeStep, ctx)
          await this.participantRepository.removeFromEvent(entityId, participantId)
        } catch (e) {
          if (!(e instanceof WizardCancelledError)) {
            throw e
          }
        }
        await this.refreshAnnouncement(entityId)
        await this.refreshReminder(entityId)
        return
      }
      case 'done':
        await this.transport.editMessage(chatId, messageId, formatEventEditMenu(event))
        return // Don't re-render with keyboard
    }

    // Re-render edit menu with updated data
    const updated = await this.eventRepository.findById(entityId)
    if (updated) {
      await this.transport.editMessage(
        chatId,
        messageId,
        formatEventEditMenu(updated),
        buildEventEditKeyboard(entityId, updated.isPrivate, updated.status)
      )
    }
  }

  private hydrateStep<T>(step: WizardStep<T>): HydratedStep<T> {
    const { createLoader, ...rest } = step
    return { ...rest, load: createLoader?.(this.container) }
  }

  // === Notification Methods ===

  async checkUnfinalizedEvents(): Promise<number> {
    const thresholdHours = config.notifications.reminderThresholdHours

    const allEvents = await this.eventRepository.getEvents()
    const now = new Date()

    const unfinalizedEvents = allEvents.filter((e) => isEligibleForReminder(e, thresholdHours, now))

    let count = 0

    for (const event of unfinalizedEvents) {
      try {
        const pending = await this.notificationRepository.findPendingByTypeAndEventId(
          'event-not-finalized',
          event.id
        )
        if (pending) {
          continue
        }

        // Already sent and being kept up-to-date by refreshReminder
        const sent = await this.notificationRepository.findSentByTypeAndEventId(
          'event-not-finalized',
          event.id
        )
        if (sent) {
          continue
        }

        await this.notificationRepository.create({
          type: 'event-not-finalized',
          status: 'pending',
          recipientId: event.ownerId,
          params: { eventId: event.id },
          scheduledAt: now,
        })

        count++
      } catch (error) {
        await this.logger.error(
          `Failed to create not-finalized notification for ${event.id}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return count
  }

  /**
   * Refreshes the reminder DM message with current event data.
   * Best-effort: catches and logs errors, never throws.
   */
  async refreshReminder(eventId: string): Promise<void> {
    try {
      void this.logger.log(`[refreshReminder] called for ${eventId}`)
      const notification = await this.notificationRepository.findSentByTypeAndEventId(
        'event-not-finalized',
        eventId
      )
      if (!notification?.messageId || !notification?.chatId) {
        void this.logger.log(
          `[refreshReminder] no sent notification found for ${eventId} (notification=${JSON.stringify(notification)})`
        )
        return
      }

      void this.logger.log(
        `[refreshReminder] found notification id=${notification.id} messageId=${notification.messageId} chatId=${notification.chatId}`
      )

      const event = await this.eventRepository.findById(eventId)
      if (!event) {
        void this.logger.log(`[refreshReminder] event ${eventId} not found`)
        return
      }

      const chatId = parseInt(notification.chatId, 10)
      const messageId = parseInt(notification.messageId, 10)

      // For finalized/cancelled events, replace reminder with status text (no keyboard)
      if (event.status === 'finalized' || event.status === 'cancelled') {
        const statusText =
          event.status === 'finalized' ? '✅ Event finalized' : '❌ Event cancelled'
        await this.transport.editMessage(chatId, messageId, statusText, undefined)
        return
      }

      // Refresh with current participant data
      const eventParticipants = await this.participantRepository.getEventParticipants(eventId)
      const participants = eventParticipants.map((ep) => ({
        participant: {
          id: ep.participant.id,
          telegramUsername: ep.participant.telegramUsername,
          displayName: ep.participant.displayName,
        },
        participations: ep.participations,
        status: ep.status,
      }))
      const message = formatNotFinalizedReminder(event, participants)

      const isGroupChat = event.telegramChatId?.startsWith('-')
      const announceUrl =
        isGroupChat && event.telegramChatId && event.telegramMessageId
          ? buildAnnouncementUrl(event.telegramChatId, event.telegramMessageId)
          : undefined

      const keyboard = buildReminderKeyboard(event.id, announceUrl)

      void this.logger.log(
        `[refreshReminder] editing message chatId=${chatId} messageId=${messageId}`
      )
      await this.transport.editMessage(chatId, messageId, message, keyboard)
      void this.logger.log(`[refreshReminder] success for ${eventId}`)
    } catch (error) {
      await this.logger.error(
        `[refreshReminder] error for ${eventId}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async notificationHandler(notification: Notification): Promise<HandlerResult> {
    const eventId = notification.params.eventId as string
    const event = await this.eventRepository.findById(eventId)

    if (!event) {
      return { action: 'cancel' }
    }

    if (notification.type === 'event-not-finalized') {
      if (event.status !== 'announced') {
        return { action: 'cancel' }
      }

      const eventParticipants = await this.participantRepository.getEventParticipants(eventId)
      const participants = eventParticipants.map((ep) => ({
        participant: {
          id: ep.participant.id,
          telegramUsername: ep.participant.telegramUsername,
          displayName: ep.participant.displayName,
        },
        participations: ep.participations,
        status: ep.status,
      }))
      const message = formatNotFinalizedReminder(event, participants)

      const isGroupChat = event.telegramChatId?.startsWith('-')
      const announceUrl =
        isGroupChat && event.telegramChatId && event.telegramMessageId
          ? buildAnnouncementUrl(event.telegramChatId, event.telegramMessageId)
          : undefined

      const keyboard = buildReminderKeyboard(event.id, announceUrl)

      void this.transport.logEvent({
        type: 'event-not-finalized-reminder',
        event,
      })

      return { action: 'send', message, keyboard }
    }

    return { action: 'cancel' }
  }
}
