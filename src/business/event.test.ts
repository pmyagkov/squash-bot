import { test, describe, expect, vi } from '@tests/setup'
import {
  buildEvent,
  buildScaffold,
  buildParticipant,
  buildEventParticipant,
  buildPayment,
  buildNotification,
} from '@fixtures'
import { TEST_CONFIG } from '@fixtures/config'
import { EventBusiness, calculateNextOccurrence, isEligibleForReminder } from '~/business/event'
import type { MockAppContainer } from '@mocks'
import type { SourceContext } from '~/services/command/types'
import type { InlineKeyboard } from 'grammy'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockCalls = [string, (data: any) => Promise<void>][]

/**
 * Helper to extract callback handler registered via transport.onCallback
 */
function getCallbackHandler(
  transport: { onCallback: { mock: { calls: MockCalls } } },
  action: string
) {
  const match = transport.onCallback.mock.calls.find((c) => c[0] === action)
  expect(match).toBeDefined()
  return match![1]
}

/**
 * Helper to extract command handler registered via commandRegistry.register
 */
function getCommandHandler(
  container: MockAppContainer,
  key: string
): (data: unknown, source: SourceContext) => Promise<void> {
  const registry = container.resolve('commandRegistry')
  const call = registry.register.mock.calls.find((c) => c[0] === key)
  expect(call).toBeDefined()
  return call![2] as (data: unknown, source: SourceContext) => Promise<void>
}

function makeSource(overrides?: {
  chat?: SourceContext['chat']
  user?: SourceContext['user']
}): SourceContext {
  return {
    type: 'command',
    chat: overrides?.chat ?? { id: TEST_CONFIG.chatId, type: 'group', title: 'Test Chat' },
    user: overrides?.user ?? {
      id: TEST_CONFIG.userId,
      username: undefined,
      firstName: 'Test',
      lastName: undefined,
    },
  }
}

describe('EventBusiness', () => {
  // ── handleList ─────────────────────────────────────────────────────

  describe('handleList', () => {
    test('with events → sends formatted list', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const events = [
        buildEvent({ id: 'ev_001', status: 'announced', courts: 2 }),
        buildEvent({ id: 'ev_002', status: 'created', courts: 3 }),
      ]
      eventRepo.getEvents.mockResolvedValue(events)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:list')
      await handler({}, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Event list')
      )
      const message = transport.sendMessage.mock.calls[0][1]
      expect(message).toContain('ev_001')
      expect(message).toContain('ev_002')
    })

    test('empty → sends "no events"', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      eventRepo.getEvents.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:list')
      await handler({}, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('No events found')
      )
    })

    test('filters cancelled events', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const events = [
        buildEvent({ id: 'ev_active', status: 'announced' }),
        buildEvent({ id: 'ev_cancelled', status: 'cancelled' }),
      ]
      eventRepo.getEvents.mockResolvedValue(events)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:list')
      await handler({}, makeSource())

      const message = transport.sendMessage.mock.calls[0][1]
      expect(message).toContain('ev_active')
      expect(message).not.toContain('ev_cancelled')
    })
  })

  // ── handleAnnounce ─────────────────────────────────────────────────

  describe('handleAnnounce', () => {
    test('happy path → sends announcement, pins, updates status', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_ann', status: 'created' })
      eventRepo.findById.mockResolvedValue(event)
      settingsRepo.getMainChatId.mockResolvedValue(TEST_CONFIG.chatId)
      transport.sendMessage.mockResolvedValue(42)
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_ann', status: 'announced', telegramMessageId: '42' })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:announce')
      await handler({ eventId: 'ev_ann' }, makeSource())

      // announceEvent sends message, pins it, updates event
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Squash'),
        expect.anything()
      )
      expect(transport.pinMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 42)
      expect(eventRepo.updateEvent).toHaveBeenCalledWith(
        'ev_ann',
        expect.objectContaining({
          status: 'announced',
          telegramMessageId: '42',
        })
      )
    })

    test('not found → sends error', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      eventRepo.findById.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:announce')
      await handler({ eventId: 'ev_missing' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
      )
    })

    test('already announced → sends info message', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_ann', status: 'announced' })
      eventRepo.findById.mockResolvedValue(event)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:announce')
      await handler({ eventId: 'ev_ann' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('already announced')
      )
    })

    test('unpins previous announcement before pinning new one (B12)', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const announcementRepo = container.resolve('eventAnnouncementRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_pin', status: 'created' })
      eventRepo.findById.mockResolvedValue(event)
      settingsRepo.getMainChatId.mockResolvedValue(TEST_CONFIG.chatId)
      transport.sendMessage.mockResolvedValue(55)
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_pin', status: 'announced', telegramMessageId: '55' })
      )

      // Previous announcements exist in this chat
      announcementRepo.getAllByChatId.mockResolvedValue([
        {
          id: 1,
          eventId: 'ev_old',
          telegramMessageId: '30',
          telegramChatId: String(TEST_CONFIG.chatId),
          pinned: true,
        },
        {
          id: 2,
          eventId: 'ev_older',
          telegramMessageId: '20',
          telegramChatId: String(TEST_CONFIG.chatId),
          pinned: true,
        },
      ])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:announce')
      await handler({ eventId: 'ev_pin' }, makeSource())

      // Should unpin all previous announcements, then pin the new one
      expect(transport.unpinMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 30)
      expect(transport.unpinMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 20)
      expect(transport.unpinMessage).toHaveBeenCalledTimes(2)
      expect(transport.pinMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 55)
    })
  })

  // ── handleCancelCommand ────────────────────────────────────────────

  describe('handleCancel (command)', () => {
    test('happy path → updates status, sends confirmation', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_cancel', status: 'created' })
      eventRepo.findById.mockResolvedValue(event)
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_cancel', status: 'cancelled' }))

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:cancel')
      await handler({ eventId: 'ev_cancel' }, makeSource())

      expect(eventRepo.updateEvent).toHaveBeenCalledWith('ev_cancel', { status: 'cancelled' })
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('cancelled')
      )
    })

    test('announced event → sends cancellation notification', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_announced', status: 'announced' })
      eventRepo.findById.mockResolvedValue(event)
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_announced', status: 'cancelled' })
      )
      settingsRepo.getMainChatId.mockResolvedValue(TEST_CONFIG.chatId)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:cancel')
      await handler({ eventId: 'ev_announced' }, makeSource())

      // Should send both confirmation and notification
      expect(transport.sendMessage).toHaveBeenCalledTimes(2)
      // Second call is the notification to the main chat
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('has been cancelled')
      )
    })

    test('non-announced → no notification', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_created', status: 'created' })
      eventRepo.findById.mockResolvedValue(event)
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_created', status: 'cancelled' }))

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:cancel')
      await handler({ eventId: 'ev_created' }, makeSource())

      // Only the confirmation message, no notification
      expect(transport.sendMessage).toHaveBeenCalledTimes(1)
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('cancelled')
      )
    })

    test('not found → sends error', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      eventRepo.findById.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:cancel')
      await handler({ eventId: 'ev_missing' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
      )
    })
  })

  // ── handleAddByScaffold ────────────────────────────────────────────

  describe('handleAddByScaffold', () => {
    test('happy path → creates event from scaffold', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({
        id: 'sc_src',
        dayOfWeek: 'Tue',
        time: '18:00',
        defaultCourts: 2,
        ownerId: String(TEST_CONFIG.adminId),
      })
      scaffoldRepo.findById.mockResolvedValue(scaffold)
      eventRepo.getEvents.mockResolvedValue([]) // No existing events
      const createdEvent = buildEvent({ id: 'ev_from_sc', scaffoldId: 'sc_src', courts: 2 })
      eventRepo.createEvent.mockResolvedValue(createdEvent)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:spawn')
      await handler({ scaffoldId: 'sc_src' }, makeSource())

      expect(eventRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          scaffoldId: 'sc_src',
          courts: 2,
          status: 'created',
        })
      )
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Event created')
      )
    })

    test('scaffold not found → sends error', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.findById.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:spawn')
      await handler({ scaffoldId: 'sc_missing' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
      )
    })

    test('duplicate event → sends error', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_dup', dayOfWeek: 'Tue', time: '18:00' })
      scaffoldRepo.findById.mockResolvedValue(scaffold)

      // Use calculateNextOccurrence to get the exact datetime the handler will compute
      const nextTue = calculateNextOccurrence(scaffold)

      const duplicateEvent = buildEvent({
        id: 'ev_existing',
        scaffoldId: 'sc_dup',
        datetime: nextTue,
      })
      eventRepo.getEvents.mockResolvedValue([duplicateEvent])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'event:spawn')
      await handler({ scaffoldId: 'sc_dup' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('already exists')
      )
      expect(eventRepo.createEvent).not.toHaveBeenCalled()
    })
  })

  // ── handleJoin ─────────────────────────────────────────────────────

  describe('handleJoin', () => {
    test('registered participant → looks up and adds to event', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_join', status: 'announced', telegramMessageId: '100' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      // Re-fetch for updateAnnouncementMessage
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_new', telegramId: '555' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue({ participations: 1 })
      participantRepo.findEventParticipant.mockResolvedValue(null)
      participantRepo.getEventParticipants.mockResolvedValue([
        buildEventParticipant({ eventId: 'ev_join', participantId: 'p_new', participant }),
      ])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:join')
      await handler({
        userId: 555,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 100,
        callbackId: 'cb_join',
        firstName: 'Alice',
        username: 'alice',
      })

      expect(participantRepo.findByTelegramId).toHaveBeenCalledWith('555')
      expect(participantRepo.addToEvent).toHaveBeenCalledWith('ev_join', 'p_new')
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_join', 'Joined ✋')
    })

    test('existing participant → adds to event', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_join2', status: 'announced', telegramMessageId: '101' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_existing' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue({ participations: 2 })
      participantRepo.findEventParticipant.mockResolvedValue(
        buildEventParticipant({
          eventId: 'ev_join2',
          participantId: 'p_existing',
          participations: 1,
        })
      )
      participantRepo.getEventParticipants.mockResolvedValue([
        buildEventParticipant({
          eventId: 'ev_join2',
          participantId: 'p_existing',
          participations: 2,
        }),
      ])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:join')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 101,
        callbackId: 'cb_join2',
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
      })

      expect(participantRepo.addToEvent).toHaveBeenCalledWith('ev_join2', 'p_existing')
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_join2', 'Joined (×2) ✋')
    })

    test('updates announcement → calls editMessage', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_edit', status: 'announced', telegramMessageId: '102' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant()
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue({ participations: 1 })
      participantRepo.findEventParticipant.mockResolvedValue(null)
      participantRepo.getEventParticipants.mockResolvedValue([
        buildEventParticipant({ eventId: 'ev_edit' }),
      ])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:join')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 102,
        callbackId: 'cb_edit',
        firstName: 'Test',
      })

      expect(transport.editMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        102,
        expect.stringContaining('Squash'),
        expect.anything()
      )
    })

    test('refreshes reminder after join', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_join_r', status: 'announced', telegramMessageId: '100' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_r', telegramId: '555' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue({ participations: 1 })
      participantRepo.findEventParticipant.mockResolvedValue(null)
      participantRepo.getEventParticipants.mockResolvedValue([])
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:join')
      await handler({
        userId: 555,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 100,
        callbackId: 'cb_join_r',
        firstName: 'Alice',
        username: 'alice',
      })

      expect(notificationRepo.findSentByTypeAndEventId).toHaveBeenCalledWith(
        'event-not-finalized',
        'ev_join_r'
      )
    })
  })

  // ── handleLeave ────────────────────────────────────────────────────

  describe('handleLeave', () => {
    test('registered participant leaves → marks as out', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_leave', status: 'announced', telegramMessageId: '200' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_leave' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.findEventParticipant.mockResolvedValue(
        buildEventParticipant({
          eventId: 'ev_leave',
          participantId: 'p_leave',
          status: 'in',
          participant,
        })
      )
      participantRepo.markAsOut.mockResolvedValue(undefined)
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:leave')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 200,
        callbackId: 'cb_leave',
      })

      expect(participantRepo.markAsOut).toHaveBeenCalledWith('ev_leave', 'p_leave')
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_leave', "You're out 😢")
    })

    test('unregistered participant leaves → marks as out with noted message', async ({
      container,
    }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_leave2', status: 'announced', telegramMessageId: '201' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_leave2' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.findEventParticipant.mockResolvedValue(null)
      participantRepo.markAsOut.mockResolvedValue(undefined)
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:leave')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 201,
        callbackId: 'cb_leave2',
      })

      expect(participantRepo.markAsOut).toHaveBeenCalledWith('ev_leave2', 'p_leave2')
      expect(transport.answerCallback).toHaveBeenCalledWith(
        'cb_leave2',
        "Noted, you're skipping 😢"
      )
    })

    test('not registered → sends error', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_leave3', status: 'announced', telegramMessageId: '202' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      participantRepo.findByTelegramId.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:leave')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 202,
        callbackId: 'cb_leave3',
      })

      expect(transport.answerCallback).toHaveBeenCalledWith('cb_leave3', 'You are not registered')
    })

    test('refreshes reminder after leave', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_leave_r', status: 'announced', telegramMessageId: '100' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_lr', telegramId: String(TEST_CONFIG.userId) })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.removeFromEvent.mockResolvedValue(undefined)
      participantRepo.getEventParticipants.mockResolvedValue([])
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '300', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:leave')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 100,
        callbackId: 'cb_leave_r',
        firstName: 'Test',
        username: 'test',
      })

      expect(notificationRepo.findSentByTypeAndEventId).toHaveBeenCalledWith(
        'event-not-finalized',
        'ev_leave_r'
      )
    })
  })

  // ── handleAddCourt ─────────────────────────────────────────────────

  describe('handleAddCourt', () => {
    test('increments courts + updates message', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_court',
        status: 'announced',
        courts: 2,
        telegramMessageId: '300',
      })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_court', status: 'announced', courts: 3 })
      )
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_court', courts: 3 }))
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:add-court')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 300,
        callbackId: 'cb_addcourt',
      })

      expect(eventRepo.updateEvent).toHaveBeenCalledWith('ev_court', { courts: 3 })
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_addcourt')
    })
  })

  // ── handleRemoveCourt ──────────────────────────────────────────────

  describe('handleRemoveCourt', () => {
    test('decrements courts + updates message', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_rmcourt',
        status: 'announced',
        courts: 3,
        telegramMessageId: '400',
      })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_rmcourt', status: 'announced', courts: 2 })
      )
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_rmcourt', courts: 2 }))
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:delete-court')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 400,
        callbackId: 'cb_rmcourt',
      })

      expect(eventRepo.updateEvent).toHaveBeenCalledWith('ev_rmcourt', { courts: 2 })
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_rmcourt')
    })

    test('cannot go below 1', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_mincourt',
        status: 'announced',
        courts: 1,
        telegramMessageId: '401',
      })
      eventRepo.findByMessageId.mockResolvedValue(event)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:delete-court')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 401,
        callbackId: 'cb_mincourt',
      })

      expect(transport.answerCallback).toHaveBeenCalledWith(
        'cb_mincourt',
        'Cannot remove last court'
      )
      expect(eventRepo.updateEvent).not.toHaveBeenCalled()
    })
  })

  // ── handleFinalize ─────────────────────────────────────────────────

  describe('handleFinalize', () => {
    test('happy path → creates payments, updates status', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const paymentRepo = container.resolve('paymentRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_fin',
        status: 'announced',
        courts: 2,
        telegramMessageId: '500',
      })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_fin', status: 'finalized', courts: 2 })
      )
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_fin', status: 'finalized' }))

      const participants = [
        buildEventParticipant({
          eventId: 'ev_fin',
          participantId: 'p_1',
          participations: 1,
          participant: buildParticipant({ id: 'p_1', displayName: 'Alice', telegramId: '101' }),
        }),
        buildEventParticipant({
          eventId: 'ev_fin',
          participantId: 'p_2',
          participations: 1,
          participant: buildParticipant({ id: 'p_2', displayName: 'Bob', telegramId: '102' }),
        }),
      ]
      participantRepo.getEventParticipants.mockResolvedValue(participants)
      settingsRepo.getCourtPrice.mockResolvedValue(2000)
      paymentRepo.createPayment.mockImplementation(async (_eventId, _participantId, amount) =>
        buildPayment({ eventId: _eventId, participantId: _participantId, amount })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:finalize')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 500,
        callbackId: 'cb_fin',
      })

      expect(eventRepo.updateEvent).toHaveBeenCalledWith('ev_fin', { status: 'finalized' })
      expect(paymentRepo.createPayment).toHaveBeenCalledTimes(2)
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_fin')
    })

    test('payment calculation → correct cost split', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const paymentRepo = container.resolve('paymentRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_pay',
        status: 'announced',
        courts: 2,
        telegramMessageId: '501',
      })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_pay', status: 'finalized', courts: 2 })
      )
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_pay', status: 'finalized' }))

      // 2 courts * 2000 = 4000 total, split among 4 participations (2+2) = 1000 each
      const participants = [
        buildEventParticipant({
          participantId: 'p_a',
          participations: 2,
          participant: buildParticipant({
            id: 'p_a',
            telegramUsername: 'alice',
            telegramId: '201',
          }),
        }),
        buildEventParticipant({
          participantId: 'p_b',
          participations: 2,
          participant: buildParticipant({ id: 'p_b', telegramUsername: 'bob', telegramId: '202' }),
        }),
      ]
      participantRepo.getEventParticipants.mockResolvedValue(participants)
      settingsRepo.getCourtPrice.mockResolvedValue(2000)
      paymentRepo.createPayment.mockImplementation(async (_eventId, _participantId, amount) =>
        buildPayment({ eventId: _eventId, participantId: _participantId, amount })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:finalize')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 501,
        callbackId: 'cb_pay',
      })

      // createPayment called with correct amounts (1000 each for 2 participations)
      expect(paymentRepo.createPayment).toHaveBeenCalledWith('ev_pay', 'p_a', 2000)
      expect(paymentRepo.createPayment).toHaveBeenCalledWith('ev_pay', 'p_b', 2000)

      // Personal DMs sent to each participant
      const dmCalls = transport.sendMessage.mock.calls.filter(
        (c) => typeof c[1] === 'string' && c[1].includes('Your amount')
      )
      expect(dmCalls).toHaveLength(2)
      expect(dmCalls[0][1]).toContain('2000 din')
    })

    test('no participants → sends error', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_nopart', status: 'announced', telegramMessageId: '502' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:finalize')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 502,
        callbackId: 'cb_nopart',
      })

      expect(transport.answerCallback).toHaveBeenCalledWith(
        'cb_nopart',
        'No participants to finalize'
      )
      expect(eventRepo.updateEvent).not.toHaveBeenCalled()
    })

    test('sends personal payment DMs', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const paymentRepo = container.resolve('paymentRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_payMsg',
        status: 'announced',
        courts: 1,
        telegramMessageId: '503',
      })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_payMsg', status: 'finalized', courts: 1 })
      )
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_payMsg', status: 'finalized' }))

      const participants = [
        buildEventParticipant({
          participantId: 'p_x',
          participations: 1,
          participant: buildParticipant({
            id: 'p_x',
            telegramUsername: 'player1',
            telegramId: '301',
          }),
        }),
      ]
      participantRepo.getEventParticipants.mockResolvedValue(participants)
      settingsRepo.getCourtPrice.mockResolvedValue(2000)
      paymentRepo.createPayment.mockImplementation(async (_eventId, _participantId, amount) =>
        buildPayment({ eventId: _eventId, participantId: _participantId, amount })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:finalize')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 503,
        callbackId: 'cb_payMsg',
      })

      // Personal DM sent to participant's telegramId
      const dmCall = transport.sendMessage.mock.calls.find(
        (c) => c[0] === 301 && typeof c[1] === 'string' && c[1].includes('Your amount')
      )
      expect(dmCall).toBeDefined()
      expect(dmCall![1]).toContain('2000 din')
    })
  })

  // ── handleCancel (callback) ────────────────────────────────────────

  describe('handleCancel (callback)', () => {
    test('changes status → cancelled, updates message', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_cbcancel', status: 'announced', telegramMessageId: '600' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(buildEvent({ id: 'ev_cbcancel', status: 'cancelled' }))
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_cbcancel', status: 'cancelled' })
      )
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 600,
        callbackId: 'cb_cancel',
      })

      expect(eventRepo.updateEvent).toHaveBeenCalledWith('ev_cbcancel', { status: 'cancelled' })
      expect(transport.unpinMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 600)
      expect(transport.editMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        600,
        expect.stringContaining('cancelled'),
        expect.anything()
      )
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_cancel')
    })

    test('refreshes reminder after cancel', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_cancel_r', status: 'announced', telegramMessageId: '100' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)
      participantRepo.getEventParticipants.mockResolvedValue([])
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 100,
        callbackId: 'cb_cancel_r',
      })

      expect(notificationRepo.findSentByTypeAndEventId).toHaveBeenCalledWith(
        'event-not-finalized',
        'ev_cancel_r'
      )
    })
  })

  // ── handleRestore ──────────────────────────────────────────────────

  describe('handleRestore', () => {
    test('restores → announced, restores buttons', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_restore', status: 'cancelled', telegramMessageId: '700' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(buildEvent({ id: 'ev_restore', status: 'announced' }))
      eventRepo.updateEvent.mockResolvedValue(buildEvent({ id: 'ev_restore', status: 'announced' }))
      participantRepo.getEventParticipants.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCallbackHandler(transport, 'event:undo-cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        messageId: 700,
        callbackId: 'cb_restore',
      })

      expect(eventRepo.updateEvent).toHaveBeenCalledWith('ev_restore', { status: 'announced' })
      expect(transport.pinMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 700)
      expect(transport.editMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        700,
        expect.any(String),
        expect.anything()
      )
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_restore')
    })
  })

  // ── checkAndCreateEventsFromScaffolds ──────────────────────────────

  describe('checkAndCreateEventsFromScaffolds', () => {
    test('creates due events → checks scaffolds, creates + announces', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({
        id: 'sc_auto',
        dayOfWeek: 'Tue',
        time: '18:00',
        defaultCourts: 2,
        isActive: true,
        ownerId: String(TEST_CONFIG.adminId),
      })
      scaffoldRepo.getScaffolds.mockResolvedValue([scaffold])
      eventRepo.getEvents.mockResolvedValue([]) // No existing events

      const createdEvent = buildEvent({
        id: 'ev_auto',
        scaffoldId: 'sc_auto',
        courts: 2,
        status: 'created',
      })
      eventRepo.createEvent.mockResolvedValue(createdEvent)

      // For announceEvent
      eventRepo.findById.mockResolvedValue(createdEvent)
      settingsRepo.getMainChatId.mockResolvedValue(TEST_CONFIG.chatId)
      transport.sendMessage.mockResolvedValue(999)
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_auto', status: 'announced', telegramMessageId: '999' })
      )

      // shouldCreateEvent depends on shouldTrigger which depends on current time
      // We mock the settingsRepository to return values that will make shouldTrigger return true
      settingsRepo.getTimezone.mockResolvedValue('Europe/Belgrade')
      settingsRepo.getAnnouncementDeadline.mockResolvedValue('-7d 12:00') // 7 days before = always triggers for next week's event

      const business = new EventBusiness(container)

      const count = await business.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(1)
      expect(eventRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          scaffoldId: 'sc_auto',
          courts: 2,
          status: 'created',
        })
      )
    })

    test('skips duplicates', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')

      const scaffold = buildScaffold({
        id: 'sc_dup2',
        dayOfWeek: 'Wed',
        time: '19:00',
        isActive: true,
      })
      scaffoldRepo.getScaffolds.mockResolvedValue([scaffold])

      // Use calculateNextOccurrence to get the exact datetime the handler will compute
      const nextWed = calculateNextOccurrence(scaffold)

      const existingEvent = buildEvent({
        id: 'ev_exists',
        scaffoldId: 'sc_dup2',
        datetime: nextWed,
      })
      eventRepo.getEvents.mockResolvedValue([existingEvent])

      settingsRepo.getTimezone.mockResolvedValue('Europe/Belgrade')
      settingsRepo.getAnnouncementDeadline.mockResolvedValue('-7d 12:00')

      const business = new EventBusiness(container)

      const count = await business.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(0)
      expect(eventRepo.createEvent).not.toHaveBeenCalled()
    })

    test('skips inactive scaffolds', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const eventRepo = container.resolve('eventRepository')

      const inactiveScaffold = buildScaffold({ id: 'sc_inactive', isActive: false })
      scaffoldRepo.getScaffolds.mockResolvedValue([inactiveScaffold])

      const business = new EventBusiness(container)

      const count = await business.checkAndCreateEventsFromScaffolds()

      expect(count).toBe(0)
      expect(eventRepo.createEvent).not.toHaveBeenCalled()
    })

    test('event inherits collectorId from scaffold', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({
        id: 'sc_col',
        collectorId: 'pt_collector1',
        isActive: true,
        ownerId: String(TEST_CONFIG.adminId),
      })
      scaffoldRepo.getScaffolds.mockResolvedValue([scaffold])
      eventRepo.getEvents.mockResolvedValue([])

      const createdEvent = buildEvent({ id: 'ev_col', collectorId: 'pt_collector1' })
      eventRepo.createEvent.mockResolvedValue(createdEvent)

      // For announceEvent
      eventRepo.findById.mockResolvedValue(createdEvent)
      settingsRepo.getMainChatId.mockResolvedValue(TEST_CONFIG.chatId)
      transport.sendMessage.mockResolvedValue(999)
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_col', status: 'announced', telegramMessageId: '999' })
      )

      settingsRepo.getTimezone.mockResolvedValue('Europe/Belgrade')
      settingsRepo.getAnnouncementDeadline.mockResolvedValue('-7d 12:00')

      const business = new EventBusiness(container)

      await business.checkAndCreateEventsFromScaffolds()

      expect(eventRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ collectorId: 'pt_collector1' })
      )
    })
  })

  // ── notifyOwner ─────────────────────────────────────────────────────

  describe('notifyOwner', () => {
    test('sends DM to owner', async ({ container }) => {
      const transport = container.resolve('transport')
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
      settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)

      const business = new EventBusiness(container)
      business.init()

      await business.notifyOwner(
        buildEvent({ id: 'ev_1', ownerId: '111' }),
        'participant-joined',
        '@vasya',
        {
          totalParticipations: 5,
          courts: 2,
        }
      )

      expect(transport.sendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('👤 @vasya joined'),
        undefined
      )
    })

    test('skips notification when actor is the owner for announce/finalize', async ({
      container,
    }) => {
      const transport = container.resolve('transport')
      const business = new EventBusiness(container)
      business.init()

      await business.notifyOwner(
        buildEvent({ id: 'ev_1', ownerId: '111' }),
        'event-announced',
        undefined,
        { actorUserId: 111 }
      )

      await business.notifyOwner(
        buildEvent({ id: 'ev_1', ownerId: '111' }),
        'event-finalized',
        '@owner',
        { actorUserId: 111 }
      )

      expect(transport.sendMessage).not.toHaveBeenCalled()
    })

    test('still notifies owner for join/leave/court even if actor is owner', async ({
      container,
    }) => {
      const transport = container.resolve('transport')
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
      settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)

      const business = new EventBusiness(container)
      business.init()

      await business.notifyOwner(
        buildEvent({ id: 'ev_1', ownerId: '111' }),
        'participant-joined',
        '@owner',
        { totalParticipations: 3, courts: 2, actorUserId: 111 }
      )

      expect(transport.sendMessage).toHaveBeenCalledWith(
        111,
        expect.stringContaining('👤 @owner joined'),
        undefined
      )
    })

    test('falls back to main chat with standard message on BotBlockedError', async ({
      container,
    }) => {
      const { BotBlockedError } = await import('~/services/transport/telegram')
      const transport = container.resolve('transport')
      const settingsRepo = container.resolve('settingsRepository')
      const participantRepo = container.resolve('participantRepository')
      settingsRepo.getMainChatId.mockResolvedValue(-100123)
      settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
      settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)
      participantRepo.findByTelegramId.mockResolvedValue(
        buildParticipant({ telegramUsername: 'owner_user' })
      )
      transport.getBotInfo.mockReturnValue({ username: 'test_bot' } as ReturnType<
        typeof transport.getBotInfo
      >)

      transport.sendMessage.mockRejectedValueOnce(new BotBlockedError(111)).mockResolvedValueOnce(1)

      const business = new EventBusiness(container)
      business.init()

      await business.notifyOwner(
        buildEvent({ id: 'ev_1', ownerId: '111' }),
        'participant-joined',
        '@vasya',
        {
          totalParticipations: 5,
          courts: 2,
        }
      )

      expect(transport.sendMessage).toHaveBeenCalledTimes(2)
      // Fallback sends the standard "I can't reach you" message, not the original notification
      expect(transport.sendMessage).toHaveBeenLastCalledWith(
        -100123,
        expect.stringContaining("can't reach")
      )
    })

    test('does not fall back on non-BotBlockedError', async ({ container }) => {
      const transport = container.resolve('transport')
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getMaxPlayersPerCourt.mockResolvedValue(4)
      settingsRepo.getMinPlayersPerCourt.mockResolvedValue(2)

      transport.sendMessage.mockRejectedValueOnce(new Error('Network error'))

      const business = new EventBusiness(container)
      business.init()

      await business.notifyOwner(
        buildEvent({ id: 'ev_1', ownerId: '111' }),
        'participant-joined',
        '@vasya',
        {
          totalParticipations: 5,
          courts: 2,
        }
      )

      // Only one call (the failed DM), no fallback
      expect(transport.sendMessage).toHaveBeenCalledTimes(1)
    })
  })

  // ── Edge cases: event not found for callbacks ──────────────────────

  describe('callbacks: event not found', () => {
    const callbackActions = [
      'event:join',
      'event:leave',
      'event:add-court',
      'event:delete-court',
      'event:finalize',
      'event:cancel',
      'event:undo-cancel',
    ] as const

    for (const action of callbackActions) {
      test(`${action}: event not found → answers with error`, async ({ container }) => {
        const eventRepo = container.resolve('eventRepository')
        const transport = container.resolve('transport')

        eventRepo.findByMessageId.mockResolvedValue(undefined)

        const business = new EventBusiness(container)
        business.init()

        const handler = getCallbackHandler(transport, action)
        await handler({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          chatType: 'group' as const,
          messageId: 999,
          callbackId: `cb_${action}`,
          // Include optional fields for join/leave
          ...(action === 'event:join' || action === 'event:leave'
            ? { firstName: 'Test', username: 'test' }
            : {}),
        })

        expect(transport.answerCallback).toHaveBeenCalledWith(`cb_${action}`, 'Event not found')
      })
    }
  })

  describe('isEligibleForReminder', () => {
    test('returns true for announced event past threshold', () => {
      const event = buildEvent({
        status: 'announced',
        datetime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      })
      expect(isEligibleForReminder(event, 1.5, new Date())).toBe(true)
    })

    test('returns false for announced event before threshold', () => {
      const event = buildEvent({
        status: 'announced',
        datetime: new Date(Date.now() - 0.5 * 60 * 60 * 1000), // 30min ago
      })
      expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
    })

    test('returns false for finalized event', () => {
      const event = buildEvent({
        status: 'finalized',
        datetime: new Date(Date.now() - 5 * 60 * 60 * 1000),
      })
      expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
    })

    test('returns false for cancelled event', () => {
      const event = buildEvent({
        status: 'cancelled',
        datetime: new Date(Date.now() - 5 * 60 * 60 * 1000),
      })
      expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
    })

    test('returns false for future event', () => {
      const event = buildEvent({
        status: 'announced',
        datetime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h from now
      })
      expect(isEligibleForReminder(event, 1.5, new Date())).toBe(false)
    })
  })

  // ── notificationHandler ──────────────────────────────────────────────

  describe('notificationHandler', () => {
    test('returns rich message with keyboard for event-not-finalized', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')

      const event = buildEvent({
        id: 'ev_test',
        status: 'announced',
        telegramMessageId: '100',
        telegramChatId: '-1001234567890',
      })
      eventRepo.findById.mockResolvedValue(event)
      participantRepo.getEventParticipants.mockResolvedValue([
        buildEventParticipant({
          participantId: 'p1',
          participations: 1,
          participant: buildParticipant({ id: 'p1', displayName: 'Alice' }),
        }),
      ])

      const notification = buildNotification({
        type: 'event-not-finalized',
        params: { eventId: 'ev_test' },
      })

      const business = new EventBusiness(container)
      business.init()
      const result = await business.notificationHandler(notification)

      expect(result.action).toBe('send')
      if (result.action === 'send') {
        expect(result.message).toContain('@testuser')
        expect(result.message).toContain('not finalized')
        expect(result.keyboard).toBeDefined()
      }
    })

    test('cancels if event is already finalized', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')

      eventRepo.findById.mockResolvedValue(buildEvent({ id: 'ev_fin', status: 'finalized' }))

      const notification = buildNotification({
        type: 'event-not-finalized',
        params: { eventId: 'ev_fin' },
      })

      const business = new EventBusiness(container)
      business.init()
      const result = await business.notificationHandler(notification)

      expect(result.action).toBe('cancel')
    })

    test('cancels if event not found', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')

      eventRepo.findById.mockResolvedValue(undefined)

      const notification = buildNotification({
        type: 'event-not-finalized',
        params: { eventId: 'ev_missing' },
      })

      const business = new EventBusiness(container)
      business.init()
      const result = await business.notificationHandler(notification)

      expect(result.action).toBe('cancel')
    })

    test('includes announce URL in keyboard when event has telegram refs', async ({
      container,
    }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')

      const event = buildEvent({
        id: 'ev_url',
        status: 'announced',
        telegramMessageId: '456',
        telegramChatId: '-1001234567890',
      })
      eventRepo.findById.mockResolvedValue(event)
      participantRepo.getEventParticipants.mockResolvedValue([])

      const notification = buildNotification({
        type: 'event-not-finalized',
        params: { eventId: 'ev_url' },
      })

      const business = new EventBusiness(container)
      business.init()
      const result = await business.notificationHandler(notification)

      expect(result.action).toBe('send')
      if (result.action === 'send' && result.keyboard) {
        // Check that keyboard has a URL button
        const rows = result.keyboard.inline_keyboard
        const urlButton = rows.flat().find((btn) => 'url' in btn)
        expect(urlButton).toBeDefined()
      }
    })
  })

  // ── refreshReminder ──────────────────────────────────────────────────

  describe('refreshReminder', () => {
    test('updates reminder message when sent notification exists', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_test',
        status: 'announced',
        telegramMessageId: '100',
        telegramChatId: '-1001234567890',
      })
      eventRepo.findById.mockResolvedValue(event)
      participantRepo.getEventParticipants.mockResolvedValue([
        buildEventParticipant({
          eventId: 'ev_test',
          participantId: 'p1',
          participant: buildParticipant({ id: 'p1', displayName: 'Alice' }),
        }),
      ])
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      await business.refreshReminder('ev_test')

      expect(notificationRepo.findSentByTypeAndEventId).toHaveBeenCalledWith(
        'event-not-finalized',
        'ev_test'
      )
      expect(transport.editMessage).toHaveBeenCalledWith(
        999,
        200,
        expect.stringContaining('@testuser'),
        expect.anything()
      )
    })

    test('does nothing when no sent notification exists', async ({ container }) => {
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      await business.refreshReminder('ev_test')

      expect(transport.editMessage).not.toHaveBeenCalled()
    })

    test('does nothing when notification has no messageId', async ({ container }) => {
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: undefined, chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      await business.refreshReminder('ev_test')

      expect(transport.editMessage).not.toHaveBeenCalled()
    })

    test('updates reminder with finalized status text when event is finalized', async ({
      container,
    }) => {
      const eventRepo = container.resolve('eventRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_fin', status: 'finalized' })
      eventRepo.findById.mockResolvedValue(event)
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      await business.refreshReminder('ev_fin')

      expect(transport.editMessage).toHaveBeenCalledWith(
        999,
        200,
        expect.stringContaining('finalized'),
        undefined
      )
    })

    test('updates reminder with cancelled status text when event is cancelled', async ({
      container,
    }) => {
      const eventRepo = container.resolve('eventRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_can', status: 'cancelled' })
      eventRepo.findById.mockResolvedValue(event)
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      await business.refreshReminder('ev_can')

      expect(transport.editMessage).toHaveBeenCalledWith(
        999,
        200,
        expect.stringContaining('cancelled'),
        undefined
      )
    })

    test('includes announcement URL in keyboard when event has chat and message IDs', async ({
      container,
    }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({
        id: 'ev_url',
        status: 'announced',
        telegramMessageId: '456',
        telegramChatId: '-1001234567890',
      })
      eventRepo.findById.mockResolvedValue(event)
      participantRepo.getEventParticipants.mockResolvedValue([])
      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )

      const business = new EventBusiness(container)
      business.init()

      await business.refreshReminder('ev_url')

      // The keyboard should contain a URL button
      const keyboard = transport.editMessage.mock.calls[0][3] as InlineKeyboard
      expect(keyboard).toBeDefined()
      const rows = keyboard.inline_keyboard
      const urlButton = rows.flat().find((btn) => 'url' in btn)
      expect(urlButton).toBeDefined()
    })

    test('logs error and does not throw on failure', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const notificationRepo = container.resolve('notificationRepository')
      const transport = container.resolve('transport')
      const logger = container.resolve('logger')

      notificationRepo.findSentByTypeAndEventId.mockResolvedValue(
        buildNotification({ messageId: '200', chatId: '999', status: 'sent' })
      )
      eventRepo.findById.mockResolvedValue(buildEvent({ id: 'ev_err', status: 'announced' }))
      participantRepo.getEventParticipants.mockResolvedValue([])
      transport.editMessage.mockRejectedValue(new Error('Telegram error'))

      const business = new EventBusiness(container)
      business.init()

      await expect(business.refreshReminder('ev_err')).resolves.not.toThrow()
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Telegram error'))
    })
  })

  // ── checkAndAnnounceCreatedEvents ────────────────────────────────

  describe('checkAndAnnounceCreatedEvents', () => {
    test('announces manual event past announcement deadline', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const transport = container.resolve('transport')

      // Fix time to 15:00 UTC so the test is deterministic
      // Event tomorrow at 21:00, deadline (-1d 12:00) = today 12:00 → 15:00 > 12:00 → triggers
      const now = new Date()
      now.setHours(15, 0, 0, 0)
      vi.useFakeTimers()
      vi.setSystemTime(now)

      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(21, 0, 0, 0)

      const event = buildEvent({
        id: 'ev_manual1',
        status: 'created',
        scaffoldId: undefined,
        datetime: tomorrow,
        ownerId: '111',
        telegramMessageId: undefined,
      })

      eventRepo.getEvents.mockResolvedValue([event])
      settingsRepo.getAnnouncementDeadline.mockResolvedValue('-1d 12:00')
      settingsRepo.getTimezone.mockResolvedValue('UTC')
      settingsRepo.getMainChatId.mockResolvedValue(-100123)

      // announceEvent internals
      eventRepo.findById.mockResolvedValue(event)
      transport.sendMessage.mockResolvedValue(456)
      eventRepo.updateEvent.mockResolvedValue({
        ...event,
        status: 'announced',
        telegramMessageId: '456',
      })

      const business = new EventBusiness(container)
      business.init()

      const count = await business.checkAndAnnounceCreatedEvents()

      expect(count).toBe(1)
      expect(transport.sendMessage).toHaveBeenCalled()

      vi.useRealTimers()
    })

    test('skips already announced events', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')

      eventRepo.getEvents.mockResolvedValue([buildEvent({ id: 'ev_ann', status: 'announced' })])

      const business = new EventBusiness(container)
      business.init()

      const count = await business.checkAndAnnounceCreatedEvents()

      expect(count).toBe(0)
    })

    test('skips created event before announcement deadline', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')

      const farFuture = new Date()
      farFuture.setDate(farFuture.getDate() + 30)

      const event = buildEvent({
        id: 'ev_future',
        status: 'created',
        datetime: farFuture,
      })

      eventRepo.getEvents.mockResolvedValue([event])
      settingsRepo.getAnnouncementDeadline.mockResolvedValue('-1d 12:00')
      settingsRepo.getTimezone.mockResolvedValue('UTC')

      const business = new EventBusiness(container)
      business.init()

      const count = await business.checkAndAnnounceCreatedEvents()

      expect(count).toBe(0)
    })
  })

  // ── handlePaymentDebt ─────────────────────────────────────────────────

  describe('handlePaymentDebt', () => {
    test('shows unpaid debts for current user', async ({ container }) => {
      const transport = container.resolve('transport')
      const participantRepo = container.resolve('participantRepository')
      const paymentRepo = container.resolve('paymentRepository')
      const eventRepo = container.resolve('eventRepository')

      const participant = buildParticipant({ id: 'pt_me', telegramId: '555' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)

      paymentRepo.getUnpaidByParticipantId.mockResolvedValue([
        buildPayment({ eventId: 'ev_1', amount: 1000 }),
      ])

      const event = buildEvent({
        id: 'ev_1',
        datetime: new Date('2024-01-21T21:00:00Z'),
        collectorId: 'pt_collector',
      })
      eventRepo.findById.mockResolvedValue(event)

      const collector = buildParticipant({
        id: 'pt_collector',
        paymentInfo: 'Card: 1234',
      })
      participantRepo.findById.mockResolvedValue(collector)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({}, makeSource({ user: { id: 555, firstName: 'Test' } }))

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('💰 Your unpaid debts:')
      )
    })

    test('shows no-debts message when all paid', async ({ container }) => {
      const transport = container.resolve('transport')
      const participantRepo = container.resolve('participantRepository')
      const paymentRepo = container.resolve('paymentRepository')

      const participant = buildParticipant({ id: 'pt_me', telegramId: '555' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      paymentRepo.getUnpaidByParticipantId.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({}, makeSource({ user: { id: 555, firstName: 'Test' } }))

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('✅ No unpaid debts!')
      )
    })
  })

  // ── handlePaymentDebt (sudo) ─────────────────────────────────────────────

  describe('handlePaymentDebt (sudo)', () => {
    function makeSudoSource(overrides?: Parameters<typeof makeSource>[0]): SourceContext {
      const base = makeSource(overrides)
      return { ...base, sudo: true }
    }

    test('shows all debts grouped by event', async ({ container }) => {
      const transport = container.resolve('transport')
      const paymentRepo = container.resolve('paymentRepository')
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')

      paymentRepo.getUnpaidPayments.mockResolvedValue([
        buildPayment({ eventId: 'ev_1', participantId: 'pt_1', amount: 1000 }),
        buildPayment({ eventId: 'ev_1', participantId: 'pt_2', amount: 1000 }),
      ])

      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_1', datetime: new Date('2024-01-21T21:00:00Z') })
      )

      participantRepo.findById
        .mockResolvedValueOnce(buildParticipant({ id: 'pt_1', telegramUsername: 'vasya' }))
        .mockResolvedValueOnce(buildParticipant({ id: 'pt_2', telegramUsername: 'petya' }))

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({}, makeSudoSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('💰 Outstanding debts:')
      )

      // Verify both users are shown in the response
      const message = transport.sendMessage.mock.calls[0][1] as string
      expect(message).toContain('@vasya')
      expect(message).toContain('@petya')
    })

    test('shows debts for specific user', async ({ container }) => {
      const transport = container.resolve('transport')
      const participantRepo = container.resolve('participantRepository')
      const paymentRepo = container.resolve('paymentRepository')
      const eventRepo = container.resolve('eventRepository')

      const participant = buildParticipant({ id: 'pt_vasya', telegramUsername: 'vasya' })
      participantRepo.findByUsername.mockResolvedValue(participant)

      paymentRepo.getUnpaidByParticipantId.mockResolvedValue([
        buildPayment({ eventId: 'ev_1', amount: 1000 }),
      ])

      eventRepo.findById.mockResolvedValue(
        buildEvent({ id: 'ev_1', datetime: new Date('2024-01-21T21:00:00Z') })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({ targetUsername: 'vasya' }, makeSudoSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('💰 Debts for @vasya:')
      )
    })

    test('shows no-debts message when no outstanding payments', async ({ container }) => {
      const transport = container.resolve('transport')
      const paymentRepo = container.resolve('paymentRepository')

      paymentRepo.getUnpaidPayments.mockResolvedValue([])

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({}, makeSudoSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('✅ All payments received!')
      )
    })

    test('user not found sends error', async ({ container }) => {
      const transport = container.resolve('transport')
      const participantRepo = container.resolve('participantRepository')

      participantRepo.findByUsername.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({ targetUsername: 'unknown' }, makeSudoSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('not found')
      )
    })
  })

  // ── handlePaymentDebt: user sees only own debts ─────────────────────

  describe('handlePaymentDebt: user isolation', () => {
    test('user sees only their own debts, not others', async ({ container }) => {
      const transport = container.resolve('transport')
      const participantRepo = container.resolve('participantRepository')
      const paymentRepo = container.resolve('paymentRepository')
      const eventRepo = container.resolve('eventRepository')

      // The calling user
      const myParticipant = buildParticipant({
        id: 'pt_me',
        telegramId: '555',
        telegramUsername: 'me',
      })
      participantRepo.findByTelegramId.mockResolvedValue(myParticipant)

      // Only return payments for the calling user (the repo is called with their participant id)
      paymentRepo.getUnpaidByParticipantId.mockResolvedValue([
        buildPayment({ eventId: 'ev_1', participantId: 'pt_me', amount: 500 }),
      ])

      const event = buildEvent({
        id: 'ev_1',
        datetime: new Date('2024-01-21T21:00:00Z'),
      })
      eventRepo.findById.mockResolvedValue(event)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(container, 'payment:debt')
      await handler({}, makeSource({ user: { id: 555, firstName: 'Me' } }))

      // Should call getUnpaidByParticipantId with the calling user's participant id
      expect(paymentRepo.getUnpaidByParticipantId).toHaveBeenCalledWith('pt_me')
      // Should NOT call getUnpaidPayments (all-debts admin mode)
      expect(paymentRepo.getUnpaidPayments).not.toHaveBeenCalled()

      expect(transport.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('💰 Your unpaid debts:')
      )
    })
  })
})
