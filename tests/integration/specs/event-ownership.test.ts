import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-ownership', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  const CREATOR_ID = 333333333

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  describe('owner assignment', () => {
    describe('ad-hoc event — creator becomes owner', () => {
      it('should set creator as owner for /event create', async () => {
        const update = createTextMessageUpdate('/event create tomorrow 19:00 2', {
          userId: CREATOR_ID,
          chatId: TEST_CHAT_ID,
        })
        await bot.handleUpdate(update)
        await tick()

        const addCall = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('📅 Created')
        )
        const eventId = addCall![1].match(/ev_[\w-]+/)![0]

        const eventRepo = container.resolve('eventRepository')
        const event = await eventRepo.findById(eventId)
        expect(event!.ownerId).toBe(String(CREATOR_ID))
      })
    })

    describe('scaffold event — inherits scaffold owner', () => {
      it('should inherit owner from scaffold', async () => {
        const scaffoldRepo = container.resolve('scaffoldRepository')
        const scaffold = await scaffoldRepo.createScaffold(
          'Tue',
          '21:00',
          2,
          undefined,
          String(CREATOR_ID)
        )

        const update = createTextMessageUpdate(`/event spawn ${scaffold.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
        await bot.handleUpdate(update)
        await tick()

        const addCall = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('📅 Created')
        )
        const eventId = addCall![1].match(/ev_[\w-]+/)![0]

        const eventRepo = container.resolve('eventRepository')
        const event = await eventRepo.findById(eventId)
        expect(event!.ownerId).toBe(String(CREATOR_ID))
      })

      it('should fallback to global admin when scaffold has no owner', async () => {
        const scaffoldRepo = container.resolve('scaffoldRepository')
        const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2)

        const update = createTextMessageUpdate(`/event spawn ${scaffold.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
        await bot.handleUpdate(update)
        await tick()

        const addCall = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('📅 Created')
        )
        const eventId = addCall![1].match(/ev_[\w-]+/)![0]

        const eventRepo = container.resolve('eventRepository')
        const event = await eventRepo.findById(eventId)
        expect(event!.ownerId).toBe(String(ADMIN_ID))
      })
    })
  })

  describe('ownership transfer', () => {
    it('should transfer event to another user', async () => {
      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(CREATOR_ID),
      })

      const participantRepo = container.resolve('participantRepository')
      await participantRepo.findOrCreateParticipant('444444444', 'vasya', 'Vasya')

      const update = createTextMessageUpdate(`/event transfer ${event.id} @vasya`, {
        userId: CREATOR_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('transferred to @vasya'),
        expect.anything()
      )

      const updated = await eventRepo.findById(event.id)
      expect(updated!.ownerId).toBe('444444444')
    })

    it('should allow global admin to transfer any event', async () => {
      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(CREATOR_ID),
      })

      const participantRepo = container.resolve('participantRepository')
      await participantRepo.findOrCreateParticipant('444444444', 'vasya', 'Vasya')

      const update = createTextMessageUpdate(`/event transfer ${event.id} @vasya`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('transferred to @vasya'),
        expect.anything()
      )
    })

    it('should reject transfer by non-owner non-admin', async () => {
      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(CREATOR_ID),
      })

      const update = createTextMessageUpdate(`/event transfer ${event.id} @vasya`, {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )
    })

    it('should return error for non-existent event', async () => {
      const update = createTextMessageUpdate('/event transfer ev_nonexist @vasya', {
        userId: ADMIN_ID,
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

  describe('owner-only actions', () => {
    async function setupAnnouncedEvent(courts = 2) {
      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts,
        ownerId: String(CREATOR_ID),
      })

      const eventBusiness = container.resolve('eventBusiness')
      await eventBusiness.announceEvent(event.id)

      const announcedEvent = await eventRepo.findById(event.id)
      const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

      return { event: announcedEvent!, messageId }
    }

    it('should reject non-owner clicking add-court', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const update = createCallbackQueryUpdate({
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:add-court',
      })
      await bot.handleUpdate(update)

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.courts).toBe(2)

      expect(api.answerCallbackQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ text: 'Only the event owner can do this' })
      )
    })

    it('should allow owner to add court', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const update = createCallbackQueryUpdate({
        userId: CREATOR_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:add-court',
      })
      await bot.handleUpdate(update)

      const eventRepo = container.resolve('eventRepository')
      const updated = await eventRepo.findById(event.id)
      expect(updated!.courts).toBe(3)
    })

    it('should allow admin to add court', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const update = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:add-court',
      })
      await bot.handleUpdate(update)

      const eventRepo = container.resolve('eventRepository')
      const updated = await eventRepo.findById(event.id)
      expect(updated!.courts).toBe(3)
    })

    it('should reject non-owner clicking finalize', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const participantRepo = container.resolve('participantRepository')
      const { participant } = await participantRepo.findOrCreateParticipant(
        String(CREATOR_ID),
        'creator',
        'Creator'
      )
      await participantRepo.addToEvent(event.id, participant.id)

      const update = createCallbackQueryUpdate({
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:finalize',
      })
      await bot.handleUpdate(update)

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.status).toBe('announced')
    })

    it('should reject non-owner clicking cancel', async () => {
      const { event, messageId } = await setupAnnouncedEvent()

      const update = createCallbackQueryUpdate({
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId,
        data: 'event:cancel',
      })
      await bot.handleUpdate(update)

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.status).toBe('announced')
    })
  })

  describe('owner-only commands (text)', () => {
    async function setupAnnouncedEvent(courts = 2) {
      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts,
        ownerId: String(CREATOR_ID),
      })

      const eventBusiness = container.resolve('eventBusiness')
      await eventBusiness.announceEvent(event.id)

      const announcedEvent = await eventRepo.findById(event.id)
      return announcedEvent!
    }

    it('should reject non-owner /event create-court', async () => {
      const event = await setupAnnouncedEvent()

      const update = createTextMessageUpdate(
        `/event create-court ${event.id}`,
        { userId: NON_ADMIN_ID, chatId: TEST_CHAT_ID }
      )
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.courts).toBe(2)
    })

    it('should reject non-owner /event delete-court', async () => {
      const event = await setupAnnouncedEvent(3)

      const update = createTextMessageUpdate(
        `/event delete-court ${event.id}`,
        { userId: NON_ADMIN_ID, chatId: TEST_CHAT_ID }
      )
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.courts).toBe(3)
    })

    it('should reject non-owner /event finalize', async () => {
      const event = await setupAnnouncedEvent()

      const participantRepo = container.resolve('participantRepository')
      const { participant } = await participantRepo.findOrCreateParticipant(
        String(CREATOR_ID),
        'creator',
        'Creator'
      )
      await participantRepo.addToEvent(event.id, participant.id)

      const update = createTextMessageUpdate(
        `/event finalize ${event.id}`,
        { userId: NON_ADMIN_ID, chatId: TEST_CHAT_ID }
      )
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.status).toBe('announced')
    })

    it('should reject non-owner /event cancel', async () => {
      const event = await setupAnnouncedEvent()

      const update = createTextMessageUpdate(
        `/event cancel ${event.id}`,
        { userId: NON_ADMIN_ID, chatId: TEST_CHAT_ID }
      )
      await bot.handleUpdate(update)
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Only the owner or admin'),
        expect.anything()
      )

      const eventRepo = container.resolve('eventRepository')
      const unchanged = await eventRepo.findById(event.id)
      expect(unchanged!.status).toBe('announced')
    })
  })
})
