import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('private-chat-commands', () => {
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

  it('should redirect command from group chat to private', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/help', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        chatType: 'group',
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('t.me/test_bot'),
      expect.anything()
    )
    // Should NOT have processed the command
    expect(api.sendMessage).not.toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Available commands'),
      expect.anything()
    )
  })

  it('should process command from private chat normally', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/help', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
        chatType: 'private',
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('Available commands'),
      expect.anything()
    )
  })

  it('should redirect admin command from group chat', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say hello', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        chatType: 'group',
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('t.me/test_bot'),
      expect.anything()
    )
  })
})
