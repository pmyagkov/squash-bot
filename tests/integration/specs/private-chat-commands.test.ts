import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

describe('command-private-chat-only', () => {
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

  it('should block commands in group chat with a warning', async () => {
    const update = createTextMessageUpdate('/event add 2024-01-20 19:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      chatType: 'group',
    })

    await bot.handleUpdate(update)

    // Should send warning message
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      'This command is not supported in group chats. Please send it in a private message to the bot.',
      expect.anything()
    )

    // Should NOT create the event
    const events = await eventRepository.getEvents()
    expect(events).toHaveLength(0)
  })

  it('should allow commands in private chat', async () => {
    const update = createTextMessageUpdate('/event add 2024-01-20 19:00 2', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      chatType: 'private',
    })

    await bot.handleUpdate(update)

    // Should create the event
    const events = await eventRepository.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].courts).toBe(2)
  })
})
