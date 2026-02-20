import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-participants', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let participantRepository: ParticipantRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    // Initialize ALL business classes (registers handlers in transport)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    // Set up mock transformer to intercept all API requests
    api = mockBot(bot)

    // Resolve dependencies
    eventRepository = container.resolve('eventRepository')
    participantRepository = container.resolve('participantRepository')
    eventBusiness = container.resolve('eventBusiness')

    // Initialize bot (needed for handleUpdate)
    await bot.init()
  })

  /**
   * Helper: create an event, announce it, return event and messageId
   */
  async function setupAnnouncedEvent(courts = 2) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })

    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    return { event: announcedEvent!, messageId }
  }

  describe('join (callback)', () => {
    it('adds participant to event on first join', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const callbackUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      })

      await bot.handleUpdate(callbackUpdate)

      // Verify participant was created and added to event
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participant?.telegramUsername).toBe('testuser')
      expect(participants[0].participant?.displayName).toBe('Test User')
      expect(participants[0].participations).toBe(1)

      // Verify announcement message was updated
      const editCalls = api.editMessageText.mock.calls.filter(
        ([, msgId]) => msgId === messageId
      )
      expect(editCalls.length).toBeGreaterThanOrEqual(1)
      const lastEdit = editCalls[editCalls.length - 1]
      expect(lastEdit?.[2]).toContain('Participants (1):')
      expect(lastEdit?.[2]).toContain('@testuser')
    })

    it('increments participations counter on second join by same user', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const callbackUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
      })

      // Join twice
      await bot.handleUpdate(callbackUpdate)
      await bot.handleUpdate(callbackUpdate)

      // Should have one record with participations = 2
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participations).toBe(2)

      // Verify announcement message shows counter
      const editCalls = api.editMessageText.mock.calls.filter(
        ([, msgId]) => msgId === messageId
      )
      expect(editCalls.length).toBeGreaterThanOrEqual(2) // Two joins = two edits

      const lastEdit = editCalls[editCalls.length - 1]
      expect(lastEdit?.[2]).toContain('Participants (2):')
      expect(lastEdit?.[2]).toContain('@testuser (×2)')
    })

    it('allows different users to join the same event', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const joinAlice = createCallbackQueryUpdate({
        userId: 111,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'alice',
        firstName: 'Alice',
      })

      const joinBob = createCallbackQueryUpdate({
        userId: 222,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'bob',
        firstName: 'Bob',
      })

      await bot.handleUpdate(joinAlice)
      await bot.handleUpdate(joinBob)

      // Verify both participants are registered
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(2)

      const usernames = participants.map((p) => p.participant?.telegramUsername).sort()
      expect(usernames).toEqual(['alice', 'bob'])
      expect(participants.every((p) => p.participations === 1)).toBe(true)

      // Verify announcement message shows both users
      const editCalls = api.editMessageText.mock.calls.filter(
        ([, msgId]) => msgId === messageId
      )
      const lastEdit = editCalls[editCalls.length - 1]
      expect(lastEdit?.[2]).toContain('Participants (2):')
      expect(lastEdit?.[2]).toContain('@alice')
      expect(lastEdit?.[2]).toContain('@bob')
    })
  })

  describe('leave (callback)', () => {
    it('removes participant when participations goes to 0', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      // First join
      const joinUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(joinUpdate)

      // Verify participant exists
      let participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)

      // Leave event
      const leaveUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:leave',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(leaveUpdate)

      // Verify participant was removed (participations = 0 means record is removed/filtered)
      participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(0)

      // Verify announcement message was updated to show no participants
      const editCalls = api.editMessageText.mock.calls.filter(
        ([, msgId]) => msgId === messageId
      )
      const lastEdit = editCalls[editCalls.length - 1]
      expect(lastEdit?.[2]).toContain('Participants:')
      expect(lastEdit?.[2]).toContain('(nobody yet)')
    })

    it('decrements participations counter when user leaves', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const joinUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:join',
        username: 'testuser',
        firstName: 'Test',
      })

      // Join twice (participations = 2)
      await bot.handleUpdate(joinUpdate)
      await bot.handleUpdate(joinUpdate)

      let participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participations).toBe(2)

      // Leave once (participations = 1)
      const leaveUpdate = createCallbackQueryUpdate({
        userId: 123456,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:leave',
        username: 'testuser',
        firstName: 'Test',
      })

      await bot.handleUpdate(leaveUpdate)

      participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participations).toBe(1)

      // Verify message shows decremented counter
      let editCalls = api.editMessageText.mock.calls.filter(
        ([, msgId]) => msgId === messageId
      )
      let afterFirstLeave = editCalls[editCalls.length - 1]
      expect(afterFirstLeave?.[2]).toContain('Participants (1):')
      expect(afterFirstLeave?.[2]).toContain('@testuser')
      expect(afterFirstLeave?.[2]).not.toContain('×')

      // Leave again (participations = 0, record removed)
      await bot.handleUpdate(leaveUpdate)

      participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(0)

      // Verify message shows no participants
      editCalls = api.editMessageText.mock.calls.filter(
        ([, msgId]) => msgId === messageId
      )
      const afterSecondLeave = editCalls[editCalls.length - 1]
      expect(afterSecondLeave?.[2]).toContain('(nobody yet)')
    })

    it('handles leave by unregistered user without crashing', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      // Try to leave without having joined first
      const leaveUpdate = createCallbackQueryUpdate({
        userId: 999999,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:leave',
        username: 'unknownuser',
        firstName: 'Unknown',
      })

      // Should not throw
      await bot.handleUpdate(leaveUpdate)

      // Verify no participants exist
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(0)
    })
  })

  describe('join (command)', () => {
    it('event:join is registered in CommandRegistry after init()', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('event:join')).toBeDefined()
    })

    it('joins event when eventId provided as argument', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-06-15T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })

      const update = createTextMessageUpdate(`/event join ${event.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
        username: 'player1',
        firstName: 'Player',
        lastName: 'One',
      })

      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Joined event <code>${event.id}</code>`),
        expect.anything()
      )

      const participants = await container
        .resolve('participantRepository')
        .getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
    })

    it('shows error when event not found', async () => {
      const update = createTextMessageUpdate('/event join ev_nonexistent', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('not found'),
        expect.anything()
      )
    })

    it('wizard flow: no args → select event → joined', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-06-15T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })

      // Step 1: /event join (no args) → wizard shows event picker
      const commandDone = bot.handleUpdate(
        createTextMessageUpdate('/event join', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'player1',
          firstName: 'Player',
        })
      )
      await tick()

      // Verify event select prompt
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Choose an event'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining(event.id),
                  callback_data: `wizard:select:${event.id}`,
                }),
              ]),
            ]),
          }),
        })
      )

      // Step 2: Select event → handler runs
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `wizard:select:${event.id}`,
        })
      )

      await commandDone
      await tick()

      // Verify joined
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Joined event <code>${event.id}</code>`),
        expect.anything()
      )

      // Verify participant in DB
      const participants = await container
        .resolve('participantRepository')
        .getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
    })
  })

  describe('leave (command)', () => {
    it('should leave event via command', async () => {
      // Create an announced event
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-06-15T19:00:00Z'),
        courts: 2,
        status: 'announced',
        ownerId: String(ADMIN_ID),
      })

      // Add participant directly via repo
      const participant = await participantRepository.findOrCreateParticipant(
        String(NON_ADMIN_ID),
        'player1',
        'Player One'
      )
      await participantRepository.addToEvent(event.id, participant.id)

      const update = createTextMessageUpdate(`/event leave ${event.id}`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
        username: 'player1',
        firstName: 'Player',
        lastName: 'One',
      })

      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Left event'),
        expect.anything()
      )
    })

    it('should report error for non-existent event', async () => {
      const update = createTextMessageUpdate('/event leave ev_nonexistent', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('not found'),
        expect.anything()
      )
    })
  })
})
