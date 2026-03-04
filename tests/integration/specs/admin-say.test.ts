import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ParticipantRepo } from '~/storage/repo/participant'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('admin-say', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let participantRepo: ParticipantRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    participantRepo = container.resolve('participantRepository')
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
    await participantRepo.findOrCreateParticipant(
      String(targetChatId),
      'targetuser',
      'Target User'
    )

    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @targetuser Hello!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

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

  it('should fallback to group when user not found', async () => {
    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @unknown Sorry!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    // Standard fallback notification to group (not the original message)
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('write to @test_bot'),
      expect.anything()
    )
    // Confirmation about fallback
    expect(api.sendMessage).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.stringContaining('not found'),
      expect.anything()
    )
  })

  it('should fallback to group when DM delivery fails', async () => {
    await participantRepo.findOrCreateParticipant('999', 'failuser', 'Fail User')
    api.sendMessage
      .mockResolvedValueOnce({ message_id: 1 } as Awaited<ReturnType<BotApiMock['sendMessage']>>) // first call is group fallback
      .mockRejectedValueOnce(new Error('Forbidden: bot can\'t initiate conversation'))

    await bot.handleUpdate(
      createTextMessageUpdate('/admin say @failuser Hello!', {
        userId: ADMIN_ID,
        chatId: ADMIN_ID,
      })
    )
    await tick()

    // Standard fallback notification to group (not the original message)
    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('write to @test_bot'),
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
