import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-join', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    eventRepository = container.resolve('eventRepository')
    await bot.init()
  })

  describe('event:join via CommandDef', () => {
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
        expect.stringContaining(`Joined event ${event.id}`),
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
                  text: event.id,
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
        expect.stringContaining(`Joined event ${event.id}`),
        expect.anything()
      )

      // Verify participant in DB
      const participants = await container
        .resolve('participantRepository')
        .getEventParticipants(event.id)
      expect(participants).toHaveLength(1)
    })
  })
})
