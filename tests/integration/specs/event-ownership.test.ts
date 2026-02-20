import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

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

        const addCall = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('✅ Created event')
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

        const addCall = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('✅ Created event')
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

        const addCall = api.sendMessage.mock.calls.find(([, text]) =>
          text.includes('✅ Created event')
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

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('not found'),
        expect.anything()
      )
    })
  })
})
