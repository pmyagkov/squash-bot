import { describe, it, expect } from 'vitest'
import { mockContext, mockBotApi } from './grammy'
import { TEST_CONFIG, TEST_USER } from '@fixtures/config'

describe('grammy mocks', () => {
  describe('mockContext', () => {
    it('should create context with defaults from TEST_CONFIG', () => {
      const ctx = mockContext()

      expect(ctx.from?.id).toBe(TEST_CONFIG.userId)
      expect(ctx.chat?.id).toBe(TEST_CONFIG.chatId)
      expect(ctx.from?.first_name).toBe(TEST_USER.firstName)
    })

    it('should allow overriding fields', () => {
      const ctx = mockContext({
        userId: 999,
        chatId: 888,
        firstName: 'Custom'
      })

      expect(ctx.from?.id).toBe(999)
      expect(ctx.chat?.id).toBe(888)
      expect(ctx.from?.first_name).toBe('Custom')
    })

    it('should create callback query context', () => {
      const ctx = mockContext({
        callbackQueryId: 'cb_test',
        callbackQueryData: 'event:join'
      })

      expect(ctx.callbackQuery?.id).toBe('cb_test')
      expect(ctx.callbackQuery?.data).toBe('event:join')
    })

    it('should create message context', () => {
      const ctx = mockContext({
        messageText: '/event add',
        messageId: 123
      })

      expect(ctx.message?.text).toBe('/event add')
      expect(ctx.message?.message_id).toBe(123)
    })
  })

  describe('mockBotApi', () => {
    it('should create bot.api mock with all methods', () => {
      const api = mockBotApi()

      expect(api.sendMessage).toBeDefined()
      expect(api.editMessageText).toBeDefined()
      expect(api.answerCallbackQuery).toBeDefined()
      expect(api.pinChatMessage).toBeDefined()
      expect(api.unpinChatMessage).toBeDefined()
      expect(api.unpinAllChatMessages).toBeDefined()
    })

    it('should return successful responses by default', async () => {
      const api = mockBotApi()

      const result = await api.sendMessage(123, 'test')
      expect(result.message_id).toBe(123)

      await expect(api.editMessageText(123, 456, 'updated')).resolves.toBe(true)
      await expect(api.answerCallbackQuery('cb_123')).resolves.toBe(true)
    })
  })
})
