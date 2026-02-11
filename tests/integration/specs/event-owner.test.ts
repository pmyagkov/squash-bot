import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('event-owner', () => {
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

  describe('ad-hoc event — creator becomes owner', () => {
    it('should set creator as owner for /event add', async () => {
      const update = createTextMessageUpdate('/event add tomorrow 19:00 2', {
        userId: CREATOR_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      const addCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('✅ Created event')
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
      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(CREATOR_ID))

      const update = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      const addCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('✅ Created event')
      )
      const eventId = addCall![1].match(/ev_[\w-]+/)![0]

      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.findById(eventId)
      expect(event!.ownerId).toBe(String(CREATOR_ID))
    })

    it('should fallback to global admin when scaffold has no owner', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2)

      const update = createTextMessageUpdate(`/event add-by-scaffold ${scaffold.id}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      const addCall = api.sendMessage.mock.calls.find(
        ([, text]) => text.includes('✅ Created event')
      )
      const eventId = addCall![1].match(/ev_[\w-]+/)![0]

      const eventRepo = container.resolve('eventRepository')
      const event = await eventRepo.findById(eventId)
      expect(event!.ownerId).toBe(String(ADMIN_ID))
    })
  })
})
