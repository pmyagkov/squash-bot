import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-create-wizard', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  describe('/event create (no args) → wizard flow', () => {
    it('event:create is registered in CommandRegistry after init()', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('event:create')).toBeDefined()
    })

    it('full flow: select day → enter time → enter courts → event created', async () => {
      // Step 1: /event create (no args) → wizard starts at dayStep
      const commandDone = bot.handleUpdate(
        createTextMessageUpdate('/event create', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Verify day prompt with inline keyboard
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Choose a day'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: 'Mon', callback_data: 'wizard:select:Mon' }),
              ]),
            ]),
          }),
        })
      )

      // Step 2: Select day via callback → timeStep
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: 'wizard:select:Wed',
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Enter time'),
        expect.anything()
      )

      // Step 3: Enter time → courtsStep
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate('19:00', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('How many courts'),
        expect.anything()
      )

      // Step 4: Enter courts → handler runs
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate('2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )

      await commandDone

      // Verify event was created
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created event'),
        expect.anything()
      )

      // Verify event exists in database
      const events = await container.resolve('eventRepository').getEvents()
      const created = events.find((e) => e.courts === 2 && e.status === 'created')
      expect(created).toBeDefined()
    })

    it('cancel during wizard → no event created', async () => {
      const commandDone = bot.handleUpdate(
        createTextMessageUpdate('/event create', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(container.resolve('wizardService').isActive(ADMIN_ID)).toBe(true)

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: 'wizard:cancel',
        })
      )

      await commandDone

      expect(container.resolve('wizardService').isActive(ADMIN_ID)).toBe(false)
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Cancelled.'),
        expect.anything()
      )

      const events = await container.resolve('eventRepository').getEvents()
      expect(events).toHaveLength(0)
    })
  })

  describe('/event create with all args (skips wizard)', () => {
    it('creates event immediately without wizard prompts', async () => {
      const update = createTextMessageUpdate('/event create tomorrow 19:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created event'),
        expect.anything()
      )

      const events = await container.resolve('eventRepository').getEvents()
      expect(events).toHaveLength(1)
      expect(events[0].courts).toBe(2)
      expect(events[0].status).toBe('created')
    })
  })
})
