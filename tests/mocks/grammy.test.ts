import { describe, it, expect } from 'vitest'
import { mockContext } from './grammy'
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
        firstName: 'Custom',
      })

      expect(ctx.from?.id).toBe(999)
      expect(ctx.chat?.id).toBe(888)
      expect(ctx.from?.first_name).toBe('Custom')
    })

    it('should create callback query context', () => {
      const ctx = mockContext({
        callbackQueryId: 'cb_test',
        callbackQueryData: 'event:join',
      })

      expect(ctx.callbackQuery?.id).toBe('cb_test')
      expect(ctx.callbackQuery?.data).toBe('event:join')
    })

    it('should create message context', () => {
      const ctx = mockContext({
        messageText: '/event create',
        messageId: 123,
      })

      expect(ctx.message?.text).toBe('/event create')
      expect(ctx.message?.message_id).toBe(123)
    })
  })
})
