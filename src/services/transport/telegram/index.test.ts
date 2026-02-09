import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Bot } from 'grammy'
import type { InlineKeyboardMarkup } from 'grammy/types'
import { TelegramTransport } from './index'
import { ParseError } from './parsers'
import { mockBotApi } from '@mocks'
import { mockLogger } from '@mocks'
import { TEST_CONFIG } from '@fixtures/config'

describe('TelegramTransport', () => {
  let transport: TelegramTransport
  let api: ReturnType<typeof mockBotApi>
  let logger: ReturnType<typeof mockLogger>

  beforeEach(() => {
    api = mockBotApi()
    logger = mockLogger()

    const bot = { api, command: vi.fn(), on: vi.fn() } as unknown as Bot
    transport = new TelegramTransport(bot, logger)
  })

  describe('sendMessage', () => {
    it('should call bot.api.sendMessage and return messageId', async () => {
      const messageId = await transport.sendMessage(TEST_CONFIG.chatId, 'Hello world')

      expect(api.sendMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 'Hello world', {
        reply_markup: undefined,
      })
      expect(messageId).toBe(123)
    })

    it('should pass reply_markup when keyboard is provided', async () => {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [[{ text: 'Click me', callback_data: 'test' }]],
      }

      await transport.sendMessage(TEST_CONFIG.chatId, 'With keyboard', keyboard)

      expect(api.sendMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 'With keyboard', {
        reply_markup: keyboard,
      })
    })
  })

  describe('editMessage', () => {
    it('should call bot.api.editMessageText', async () => {
      await transport.editMessage(TEST_CONFIG.chatId, TEST_CONFIG.messageId, 'Updated text')

      expect(api.editMessageText).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        TEST_CONFIG.messageId,
        'Updated text',
        { reply_markup: undefined }
      )
    })

    it('should pass reply_markup when keyboard is provided', async () => {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [[{ text: 'Button', callback_data: 'action' }]],
      }

      await transport.editMessage(
        TEST_CONFIG.chatId,
        TEST_CONFIG.messageId,
        'Updated text',
        keyboard
      )

      expect(api.editMessageText).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        TEST_CONFIG.messageId,
        'Updated text',
        { reply_markup: keyboard }
      )
    })
  })

  describe('answerCallback', () => {
    it('should call bot.api.answerCallbackQuery', async () => {
      await transport.answerCallback(TEST_CONFIG.callbackQueryId)

      expect(api.answerCallbackQuery).toHaveBeenCalledWith(TEST_CONFIG.callbackQueryId, {
        text: undefined,
      })
    })

    it('should pass text param when provided', async () => {
      await transport.answerCallback(TEST_CONFIG.callbackQueryId, 'Action completed')

      expect(api.answerCallbackQuery).toHaveBeenCalledWith(TEST_CONFIG.callbackQueryId, {
        text: 'Action completed',
      })
    })
  })

  describe('pinMessage', () => {
    it('should call bot.api.pinChatMessage', async () => {
      await transport.pinMessage(TEST_CONFIG.chatId, TEST_CONFIG.messageId)

      expect(api.pinChatMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, TEST_CONFIG.messageId)
    })
  })

  describe('unpinMessage', () => {
    it('should call bot.api.unpinChatMessage', async () => {
      await transport.unpinMessage(TEST_CONFIG.chatId, TEST_CONFIG.messageId)

      expect(api.unpinChatMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, TEST_CONFIG.messageId)
    })
  })

  describe('error handling', () => {
    it('should construct ParseError with correct name and message for user-friendly responses', () => {
      const error = new ParseError('Usage: /event add <day> <time> <courts>')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ParseError)
      expect(error.name).toBe('ParseError')
      expect(error.message).toBe('Usage: /event add <day> <time> <courts>')
    })
  })
})
