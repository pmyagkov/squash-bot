import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('scaffold-owner', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  const OWNER_ID = 222222222

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  describe('scaffold creation — any user becomes owner', () => {
    it('should allow non-admin to create scaffold', async () => {
      const update = createTextMessageUpdate('/scaffold create Tue 21:00 2', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
    })

    it('should store creator as owner', async () => {
      const update = createTextMessageUpdate('/scaffold create Tue 21:00 2', {
        userId: OWNER_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      // Extract scaffold ID
      const addCall = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('✅ Created scaffold')
      )
      const scaffoldId = addCall![1].match(/sc_[\w-]+/)![0]

      // Verify owner via repo
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffold = await scaffoldRepo.findById(scaffoldId)
      expect(scaffold!.ownerId).toBe(String(OWNER_ID))
    })
  })
})
