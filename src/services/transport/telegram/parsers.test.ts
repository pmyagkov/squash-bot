import { describe, it, expect } from 'vitest'
import { Context } from 'grammy'
import { callbackParsers, commandParsers, ParseError } from './parsers'
import { mockContext } from '@mocks'
import { TEST_CONFIG, TEST_USER } from '@fixtures/config'

describe('parsers', () => {
  // === getChatType (tested indirectly via parsers) ===

  describe('getChatType', () => {
    it('should return "private" for private chat', () => {
      const ctx = mockContext({
        chatType: 'private',
        callbackQueryId: TEST_CONFIG.callbackQueryId,
        callbackQueryData: 'event:join',
        username: TEST_USER.username,
      })

      const result = callbackParsers['event:join'](ctx as Context)
      expect(result.chatType).toBe('private')
    })

    it('should return "group" for group chat', () => {
      const ctx = mockContext({
        chatType: 'group',
        callbackQueryId: TEST_CONFIG.callbackQueryId,
        callbackQueryData: 'event:join',
        username: TEST_USER.username,
      })

      const result = callbackParsers['event:join'](ctx as Context)
      expect(result.chatType).toBe('group')
    })
  })

  // === baseCallbackParser ===

  describe('baseCallbackParser', () => {
    it('should parse valid context into { userId, chatId, chatType, messageId, callbackId }', () => {
      const ctx = mockContext({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group',
        callbackQueryId: TEST_CONFIG.callbackQueryId,
        callbackQueryData: 'event:add-court',
        messageId: TEST_CONFIG.messageId,
      })

      const result = callbackParsers['event:add-court'](ctx as Context)

      expect(result).toEqual({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group',
        messageId: TEST_CONFIG.messageId,
        callbackId: TEST_CONFIG.callbackQueryId,
      })
    })

    it('should throw ParseError when callback query is missing', () => {
      const ctx = mockContext({
        // No callbackQueryId → callbackQuery will be undefined
      })

      expect(() => callbackParsers['event:add-court'](ctx as Context)).toThrow(ParseError)
      expect(() => callbackParsers['event:add-court'](ctx as Context)).toThrow(
        'Invalid callback context'
      )
    })
  })

  // === userCallbackParser ===

  describe('userCallbackParser', () => {
    it('should parse valid context with user info into base + { username, firstName, lastName }', () => {
      const ctx = mockContext({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group',
        callbackQueryId: TEST_CONFIG.callbackQueryId,
        callbackQueryData: 'event:join',
        messageId: TEST_CONFIG.messageId,
        username: TEST_USER.username,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName,
      })

      const result = callbackParsers['event:join'](ctx as Context)

      expect(result).toEqual({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group',
        messageId: TEST_CONFIG.messageId,
        callbackId: TEST_CONFIG.callbackQueryId,
        username: TEST_USER.username,
        firstName: TEST_USER.firstName,
        lastName: TEST_USER.lastName,
      })
    })

    it('should return undefined username when user has no username', () => {
      const ctx = mockContext({
        callbackQueryId: TEST_CONFIG.callbackQueryId,
        callbackQueryData: 'event:join',
        // No username provided
      })

      const result = callbackParsers['event:join'](ctx as Context)

      expect(result.username).toBeUndefined()
    })
  })

  // === Callback parser mapping ===

  describe('callback parser mapping', () => {
    const callbackCtx = mockContext({
      callbackQueryId: TEST_CONFIG.callbackQueryId,
      callbackQueryData: 'event:join',
      username: TEST_USER.username,
      firstName: TEST_USER.firstName,
      lastName: TEST_USER.lastName,
    })

    it('event:join should use userCallbackParser (includes user info)', () => {
      const result = callbackParsers['event:join'](callbackCtx as Context)
      expect(result).toHaveProperty('username')
      expect(result).toHaveProperty('firstName')
      expect(result).toHaveProperty('lastName')
    })

    it('event:leave should use userCallbackParser (includes user info)', () => {
      const result = callbackParsers['event:leave'](callbackCtx as Context)
      expect(result).toHaveProperty('username')
      expect(result).toHaveProperty('firstName')
      expect(result).toHaveProperty('lastName')
    })

    it('event:add-court should use baseCallbackParser (no user info)', () => {
      const result = callbackParsers['event:add-court'](callbackCtx as Context)
      expect(result).not.toHaveProperty('username')
      expect(result).not.toHaveProperty('firstName')
      expect(result).not.toHaveProperty('lastName')
    })

    it('event:remove-court should use baseCallbackParser (no user info)', () => {
      const result = callbackParsers['event:remove-court'](callbackCtx as Context)
      expect(result).not.toHaveProperty('username')
      expect(result).not.toHaveProperty('firstName')
      expect(result).not.toHaveProperty('lastName')
    })

    it('event:finalize should use baseCallbackParser (no user info)', () => {
      const result = callbackParsers['event:finalize'](callbackCtx as Context)
      expect(result).not.toHaveProperty('username')
      expect(result).not.toHaveProperty('firstName')
      expect(result).not.toHaveProperty('lastName')
    })

    it('event:cancel should use baseCallbackParser (no user info)', () => {
      const result = callbackParsers['event:cancel'](callbackCtx as Context)
      expect(result).not.toHaveProperty('username')
      expect(result).not.toHaveProperty('firstName')
      expect(result).not.toHaveProperty('lastName')
    })

    it('event:undo-cancel should use baseCallbackParser (no user info)', () => {
      const result = callbackParsers['event:undo-cancel'](callbackCtx as Context)
      expect(result).not.toHaveProperty('username')
      expect(result).not.toHaveProperty('firstName')
      expect(result).not.toHaveProperty('lastName')
    })
  })

  // === baseCommandParser ===

  describe('baseCommandParser', () => {
    it('should parse valid context into { userId, chatId, chatType }', () => {
      const ctx = mockContext({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group',
        messageId: TEST_CONFIG.messageId,
        messageText: '/start',
      })

      const result = commandParsers.start(ctx as Context, [])

      expect(result).toEqual({
        userId: TEST_CONFIG.userId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group',
      })
    })
  })

  // === Command parsers with args ===

  describe('command parsers with args', () => {
    const cmdCtx = mockContext({
      userId: TEST_CONFIG.userId,
      chatId: TEST_CONFIG.chatId,
      chatType: 'group',
      messageId: TEST_CONFIG.messageId,
      messageText: '/event add',
    })

    describe('event:add', () => {
      it('should parse day, time, courts from args', () => {
        const result = commandParsers['event:add'](cmdCtx as Context, ['sat', '21:00', '2'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          chatType: 'group',
          day: 'sat',
          time: '21:00',
          courts: 2,
        })
      })

      it('should handle multi-word day like "next tue" with time and courts', () => {
        const result = commandParsers['event:add'](cmdCtx as Context, ['next', 'tue', '18:00', '3'])

        expect(result).toMatchObject({
          day: 'next tue',
          time: '18:00',
          courts: 3,
        })
      })

      it('should throw ParseError with usage when args are missing', () => {
        expect(() => commandParsers['event:add'](cmdCtx as Context, ['sat'])).toThrow(ParseError)
        expect(() => commandParsers['event:add'](cmdCtx as Context, ['sat'])).toThrow(
          'Usage: /event add <day> <time> <courts>'
        )
      })
    })

    describe('event:announce', () => {
      it('should parse eventId from args', () => {
        const result = commandParsers['event:announce'](cmdCtx as Context, ['ev_test123'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          eventId: 'ev_test123',
        })
      })

      it('should throw ParseError when no eventId provided', () => {
        expect(() => commandParsers['event:announce'](cmdCtx as Context, [])).toThrow(ParseError)
        expect(() => commandParsers['event:announce'](cmdCtx as Context, [])).toThrow(
          'Usage: /event announce <eventId>'
        )
      })
    })

    describe('event:add-by-scaffold', () => {
      it('should parse scaffoldId from args', () => {
        const result = commandParsers['event:add-by-scaffold'](cmdCtx as Context, ['sc_test123'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          scaffoldId: 'sc_test123',
        })
      })
    })

    describe('event:cancel', () => {
      it('should parse eventId from args', () => {
        const result = commandParsers['event:cancel'](cmdCtx as Context, ['ev_test456'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          eventId: 'ev_test456',
        })
      })
    })

    describe('scaffold:add', () => {
      it('should parse day, time, courts from args', () => {
        const result = commandParsers['scaffold:add'](cmdCtx as Context, ['Tue', '21:00', '2'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          chatType: 'group',
          day: 'Tue',
          time: '21:00',
          courts: 2,
        })
      })
    })

    describe('scaffold:toggle', () => {
      it('should parse scaffoldId from args', () => {
        const result = commandParsers['scaffold:toggle'](cmdCtx as Context, ['sc_abc'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          scaffoldId: 'sc_abc',
        })
      })
    })

    describe('scaffold:remove', () => {
      it('should parse scaffoldId from args', () => {
        const result = commandParsers['scaffold:remove'](cmdCtx as Context, ['sc_xyz'])

        expect(result).toMatchObject({
          userId: TEST_CONFIG.userId,
          chatId: TEST_CONFIG.chatId,
          scaffoldId: 'sc_xyz',
        })
      })
    })

    describe('missing args validation', () => {
      it('should throw ParseError for scaffold:add with insufficient args', () => {
        expect(() => commandParsers['scaffold:add'](cmdCtx as Context, ['Tue'])).toThrow(ParseError)
        expect(() => commandParsers['scaffold:add'](cmdCtx as Context, ['Tue'])).toThrow(
          'Usage: /scaffold add <day> <time> <courts>'
        )
      })
    })
  })
})
