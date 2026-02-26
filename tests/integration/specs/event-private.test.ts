import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-private', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let participantRepository: ParticipantRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    eventRepository = container.resolve('eventRepository')
    participantRepository = container.resolve('participantRepository')
    eventBusiness = container.resolve('eventBusiness')
    await bot.init()
  })

  /**
   * Helper: create a private event, announce it, return event + messageId
   */
  async function setupPrivateAnnouncedEvent(courts = 2) {
    // Pre-create participants so wizard has options
    const alice = await participantRepository.findOrCreateParticipant('555555555', 'alice', 'Alice')
    const bob = await participantRepository.findOrCreateParticipant('666666666', 'bob', 'Bob')

    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
      isPrivate: true,
    })

    await eventBusiness.announceEvent(event.id)

    const announced = await eventRepository.findById(event.id)
    const messageId = parseInt(announced!.telegramMessageId!, 10)

    return { event: announced!, messageId, alice, bob }
  }

  describe('private event announcement routing', () => {
    it('sends announcement to owner DM for private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      await eventBusiness.announceEvent(event.id)

      expect(api.sendMessage).toHaveBeenCalledWith(ADMIN_ID, expect.any(String), expect.anything())

      const announced = await eventRepository.findById(event.id)
      expect(announced!.status).toBe('announced')
      expect(announced!.telegramChatId).toBe(String(ADMIN_ID))
    })

    it('does not pin announcement for private event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })

      await eventBusiness.announceEvent(event.id)

      expect(api.pinChatMessage).not.toHaveBeenCalled()
    })
  })

  describe('event create with private flag', () => {
    it('should save isPrivate=true when private arg given', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/event create tomorrow 21:00 2 private', {
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
        })
      )

      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(1)
      expect(events[0].isPrivate).toBe(true)
    })

    it('should save isPrivate=false by default', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/event create tomorrow 21:00 2', {
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
        })
      )

      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(1)
      expect(events[0].isPrivate).toBe(false)
    })
  })

  describe('+participant via wizard (button click)', () => {
    it('shows participant picker and adds selected participant', async () => {
      const { event, messageId, alice } = await setupPrivateAnnouncedEvent()

      // Step 1: Click +participant on announcement → wizard shows picker
      const clickDone = bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:event:+participant:${event.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID, // private event → announcement is in owner DM
          messageId,
        })
      )
      await tick()

      // Verify wizard sent participant picker
      expect(api.sendMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.stringContaining('Choose a participant to add'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  callback_data: `wizard:select:${alice.id}`,
                }),
              ]),
            ]),
          }),
        })
      )

      // Step 2: Select Alice via wizard callback
      api.editMessageText.mockClear()
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `wizard:select:${alice.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId: messageId + 1, // wizard message
        })
      )
      await clickDone
      await tick()

      // Verify participant was added to event
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participant.telegramUsername).toBe('alice')

      // Verify announcement was refreshed (editMessageText called on original announcement)
      const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
      expect(editCalls.length).toBeGreaterThanOrEqual(1)
      const lastEdit = editCalls[editCalls.length - 1]
      expect(lastEdit?.[2]).toContain('Participants (1):')
      expect(lastEdit?.[2]).toContain('@alice')
    })
  })

  describe('+participant via wizard (text input)', () => {
    it('accepts participant ID typed as text', async () => {
      const { event, messageId, bob } = await setupPrivateAnnouncedEvent()

      // Step 1: Click +participant → wizard shows picker
      const clickDone = bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:event:+participant:${event.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId,
        })
      )
      await tick()

      // Verify wizard is active
      expect(container.resolve('wizardService').isActive(ADMIN_ID)).toBe(true)

      // Step 2: Type participant ID as text instead of clicking button
      api.editMessageText.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate(bob.id, {
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
        })
      )
      await clickDone
      await tick()

      // Verify participant was added
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participant.telegramUsername).toBe('bob')

      // Verify announcement was refreshed
      const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
      expect(editCalls.length).toBeGreaterThanOrEqual(1)
      expect(editCalls[editCalls.length - 1]?.[2]).toContain('@bob')
    })
  })

  describe('-participant via wizard', () => {
    it('shows current participants and removes selected one', async () => {
      const { event, messageId, alice, bob } = await setupPrivateAnnouncedEvent()

      // Pre-add both participants to event
      await participantRepository.addToEvent(event.id, alice.id)
      await participantRepository.addToEvent(event.id, bob.id)

      // Step 1: Click -participant → wizard shows current participants
      const clickDone = bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:event:-participant:${event.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId,
        })
      )
      await tick()

      // Verify wizard sent participant picker with current event participants
      expect(api.sendMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.stringContaining('Choose a participant to remove'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  callback_data: `wizard:select:${alice.id}`,
                }),
              ]),
            ]),
          }),
        })
      )

      // Step 2: Select Alice to remove
      api.editMessageText.mockClear()
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `wizard:select:${alice.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId: messageId + 2, // wizard message (after announcement + wizard prompt)
        })
      )
      await clickDone
      await tick()

      // Verify Alice was removed, Bob remains
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
      expect(participants[0].participant.telegramUsername).toBe('bob')

      // Verify announcement was refreshed
      const editCalls = api.editMessageText.mock.calls.filter(([, msgId]) => msgId === messageId)
      expect(editCalls.length).toBeGreaterThanOrEqual(1)
      const lastEdit = editCalls[editCalls.length - 1]
      expect(lastEdit?.[2]).toContain('Participants (1):')
      expect(lastEdit?.[2]).toContain('@bob')
      expect(lastEdit?.[2]).not.toContain('@alice')
    })
  })

  describe('+participant empty message', () => {
    it('shows helpful message when no participants available', async () => {
      // Create event WITHOUT pre-creating participants
      const event = await eventRepository.createEvent({
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
        ownerId: String(ADMIN_ID),
        isPrivate: true,
      })
      await eventBusiness.announceEvent(event.id)
      const announced = await eventRepository.findById(event.id)
      const messageId = parseInt(announced!.telegramMessageId!, 10)

      // Click +participant with no participants in DB
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:event:+participant:${event.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId,
        })
      )
      await tick()

      // Should show helpful empty message with bot link
      expect(api.sendMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.stringContaining('No participants available'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        ADMIN_ID,
        expect.stringContaining('start a chat with me'),
        expect.anything()
      )
    })
  })

  describe('wizard cancel', () => {
    it('cancel on +participant does not add anyone', async () => {
      const { event, messageId } = await setupPrivateAnnouncedEvent()

      // Click +participant → wizard shows picker
      const clickDone = bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:event:+participant:${event.id}`,
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId,
        })
      )
      await tick()

      // Click cancel
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          data: 'wizard:cancel',
          userId: ADMIN_ID,
          chatId: ADMIN_ID,
          messageId: messageId + 1,
        })
      )
      await clickDone
      await tick()

      // Verify no participants were added
      const participants = await participantRepository.getEventParticipants(event.id)
      expect(participants).toHaveLength(0)
    })
  })

  describe('event create from private scaffold — inherit + copy', () => {
    let scaffoldRepository: ScaffoldRepo
    let settingsRepository: SettingsRepo

    beforeEach(() => {
      scaffoldRepository = container.resolve('scaffoldRepository')
      settingsRepository = container.resolve('settingsRepository')
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should create private event from private scaffold with participants copied', async () => {
      const scaffold = await scaffoldRepository.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(ADMIN_ID),
        true
      )

      const alice = await participantRepository.findOrCreateParticipant(
        '555555555',
        'alice',
        'Alice'
      )
      const bob = await participantRepository.findOrCreateParticipant('666666666', 'bob', 'Bob')
      await scaffoldRepository.addParticipant(scaffold.id, alice.id)
      await scaffoldRepository.addParticipant(scaffold.id, bob.id)

      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()
      expect(count).toBe(1)

      const events = await eventRepository.getEvents()
      expect(events).toHaveLength(1)
      expect(events[0].isPrivate).toBe(true)
      expect(events[0].scaffoldId).toBe(scaffold.id)

      const eventParticipants = await participantRepository.getEventParticipants(events[0].id)
      expect(eventParticipants).toHaveLength(2)
      const usernames = eventParticipants.map((p) => p.participant.telegramUsername).sort()
      expect(usernames).toEqual(['alice', 'bob'])
    })

    it('should not copy participants for public scaffold', async () => {
      await scaffoldRepository.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID), false)
      await settingsRepository.setSetting('announcement_deadline', '-7d 12:00')

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T14:00:00+01:00'))

      const count = await eventBusiness.checkAndCreateEventsFromScaffolds()
      expect(count).toBe(1)

      const events = await eventRepository.getEvents()
      expect(events[0].isPrivate).toBe(false)

      const eventParticipants = await participantRepository.getEventParticipants(events[0].id)
      expect(eventParticipants).toHaveLength(0)
    })
  })
})
