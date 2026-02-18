import { test, describe, expect } from '@tests/setup'
import {
  buildEvent,
  buildScaffold,
  buildParticipant,
  buildEventParticipant,
  buildPayment,
} from '@fixtures'
import { TEST_CONFIG } from '@fixtures/config'
import { EventBusiness, calculateNextOccurrence } from '~/business/event'

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
 * Helper to extract command handler registered via transport.onCommand
 */
function getCommandHandler(
  transport: { onCommand: { mock: { calls: MockCalls } } },
  command: string
) {
  const match = transport.onCommand.mock.calls.find((c) => c[0] === command)
  expect(match).toBeDefined()
  return match![1]
}

describe('EventBusiness', () => {
  // ── handleAdd ──────────────────────────────────────────────────────

  describe('handleAdd', () => {
    test('happy path: parses date, creates event, sends success', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_new001', courts: 3 })
      eventRepo.createEvent.mockResolvedValue(event)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(transport, 'event:add')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: '2024-01-20',
        time: '19:00',
        courts: 3,
      })

      expect(eventRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          courts: 3,
          status: 'created',
        })
      )
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Created event')
      )
    })

    test('invalid date → sends error, no event created', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(transport, 'event:add')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: 'not-a-date',
        time: '19:00',
        courts: 2,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Invalid date format')
      )
      expect(eventRepo.createEvent).not.toHaveBeenCalled()
    })

    test('invalid time → sends error', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const transport = container.resolve('transport')

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(transport, 'event:add')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: '2024-01-20',
        time: '25:99',
        courts: 2,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Invalid time format')
      )
      expect(eventRepo.createEvent).not.toHaveBeenCalled()
    })
  })

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

      const handler = getCommandHandler(transport, 'event:list')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
      })

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

      const handler = getCommandHandler(transport, 'event:list')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
      })

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

      const handler = getCommandHandler(transport, 'event:list')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
      })

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

      const handler = getCommandHandler(transport, 'event:announce')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_ann',
      })

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

      const handler = getCommandHandler(transport, 'event:announce')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_missing',
      })

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

      const handler = getCommandHandler(transport, 'event:announce')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_ann',
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('already announced')
      )
    })

    test('unpins previous → calls pinMessage for new announcement', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const settingsRepo = container.resolve('settingsRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_pin', status: 'created' })
      eventRepo.findById.mockResolvedValue(event)
      settingsRepo.getMainChatId.mockResolvedValue(TEST_CONFIG.chatId)
      transport.sendMessage.mockResolvedValue(55)
      eventRepo.updateEvent.mockResolvedValue(
        buildEvent({ id: 'ev_pin', status: 'announced', telegramMessageId: '55' })
      )

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(transport, 'event:announce')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_pin',
      })

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

      const handler = getCommandHandler(transport, 'event:cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_cancel',
      })

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

      const handler = getCommandHandler(transport, 'event:cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_announced',
      })

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

      const handler = getCommandHandler(transport, 'event:cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_created',
      })

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

      const handler = getCommandHandler(transport, 'event:cancel')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        eventId: 'ev_missing',
      })

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

      const handler = getCommandHandler(transport, 'event:add-by-scaffold')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_src',
      })

      expect(eventRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          scaffoldId: 'sc_src',
          courts: 2,
          status: 'created',
        })
      )
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Created event')
      )
    })

    test('scaffold not found → sends error', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.findById.mockResolvedValue(undefined)

      const business = new EventBusiness(container)
      business.init()

      const handler = getCommandHandler(transport, 'event:add-by-scaffold')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_missing',
      })

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

      const handler = getCommandHandler(transport, 'event:add-by-scaffold')
      await handler({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_dup',
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('already exists')
      )
      expect(eventRepo.createEvent).not.toHaveBeenCalled()
    })
  })

  // ── handleJoin ─────────────────────────────────────────────────────

  describe('handleJoin', () => {
    test('new participant → creates participant + event_participant', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_join', status: 'announced', telegramMessageId: '100' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      // Re-fetch for updateAnnouncementMessage
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_new', telegramId: '555' })
      participantRepo.findOrCreateParticipant.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue(undefined)
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

      expect(participantRepo.findOrCreateParticipant).toHaveBeenCalledWith('555', 'alice', 'Alice')
      expect(participantRepo.addToEvent).toHaveBeenCalledWith('ev_join', 'p_new')
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_join')
    })

    test('existing participant → increments participations', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_join2', status: 'announced', telegramMessageId: '101' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_existing' })
      participantRepo.findOrCreateParticipant.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue(undefined)
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
    })

    test('updates announcement → calls editMessage', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_edit', status: 'announced', telegramMessageId: '102' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant()
      participantRepo.findOrCreateParticipant.mockResolvedValue(participant)
      participantRepo.addToEvent.mockResolvedValue(undefined)
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
  })

  // ── handleLeave ────────────────────────────────────────────────────

  describe('handleLeave', () => {
    test('decrements participations', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_leave', status: 'announced', telegramMessageId: '200' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_leave' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.removeFromEvent.mockResolvedValue(undefined)
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

      expect(participantRepo.removeFromEvent).toHaveBeenCalledWith('ev_leave', 'p_leave')
      expect(transport.answerCallback).toHaveBeenCalledWith('cb_leave')
    })

    test('removes at zero → deletes event_participant', async ({ container }) => {
      const eventRepo = container.resolve('eventRepository')
      const participantRepo = container.resolve('participantRepository')
      const transport = container.resolve('transport')

      const event = buildEvent({ id: 'ev_leave2', status: 'announced', telegramMessageId: '201' })
      eventRepo.findByMessageId.mockResolvedValue(event)
      eventRepo.findById.mockResolvedValue(event)

      const participant = buildParticipant({ id: 'p_leave2' })
      participantRepo.findByTelegramId.mockResolvedValue(participant)
      participantRepo.removeFromEvent.mockResolvedValue(undefined)
      // After removal, participant list is empty
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

      expect(participantRepo.removeFromEvent).toHaveBeenCalledWith('ev_leave2', 'p_leave2')
      // Message updated to show no participants
      expect(transport.editMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        201,
        expect.stringContaining('nobody yet'),
        expect.anything()
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

      const handler = getCallbackHandler(transport, 'event:remove-court')
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

      const handler = getCallbackHandler(transport, 'event:remove-court')
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
  })

  // ── Edge cases: event not found for callbacks ──────────────────────

  describe('callbacks: event not found', () => {
    const callbackActions = [
      'event:join',
      'event:leave',
      'event:add-court',
      'event:remove-court',
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
})
