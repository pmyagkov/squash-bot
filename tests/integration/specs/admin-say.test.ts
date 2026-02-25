import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('admin say', () => {
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

  it('should send message to group chat', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say Hello everyone!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    // Message sent to main chat
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      'Hello everyone!',
      expect.anything()
    )
    // Confirmation to admin
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('sent to group chat'),
      expect.anything()
    )
  })

  it('should send DM to user', async () => {
    const targetChatId = 777888
    api.getChat.mockResolvedValueOnce({
      id: targetChatId,
      type: 'private',
      first_name: 'Target',
    } as Awaited<ReturnType<BotApiMock['getChat']>>)

    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @targetuser Hello!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    expect(api.getChat).toHaveBeenCalledWith('@targetuser')
    expect(api.sendMessage).toHaveBeenCalledWith(
      targetChatId,
      'Hello!',
      expect.anything()
    )
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('@targetuser'),
      expect.anything()
    )
  })

  it('should fallback to group when DM fails', async () => {
    api.getChat.mockRejectedValueOnce(new Error('chat not found'))

    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @unknown Sorry!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    // Fallback message to group with mention
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      '@unknown, Sorry!',
      expect.anything()
    )
    // Confirmation about fallback
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('DM to @unknown failed'),
      expect.anything()
    )
  })

  it('should show usage when no text provided', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('Usage'),
      expect.anything()
    )
  })

  it('should show usage when DM target has no text', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @someone', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('Usage'),
      expect.anything()
    )
  })

  it('should reject non-admin', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say hello', {
        userId: NON_ADMIN_ID,
        chatId: NON_ADMIN_ID,
      })
    )

    expect(api.sendMessage).toHaveBeenCalledWith(
      NON_ADMIN_ID,
      expect.stringContaining('only available to administrators'),
      expect.anything()
    )
  })
})
