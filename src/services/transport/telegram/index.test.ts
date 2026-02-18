import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Bot } from 'grammy'
import type { InlineKeyboardMarkup } from 'grammy/types'
import { TelegramTransport } from './index'
import { ParseError } from './parsers'
import { mockBot, mockLogger, mockConfig } from '@mocks'
import { TEST_CONFIG } from '@fixtures/config'
import type { LogEvent } from '~/types/logEvent'
import type { WizardService } from '~/services/wizard/wizardService'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { CommandService } from '~/services/command/commandService'
import { mock } from 'vitest-mock-extended'

describe('TelegramTransport', () => {
  let transport: TelegramTransport
  let bot: Bot
  let api: ReturnType<typeof mockBot>
  let logger: ReturnType<typeof mockLogger>
  let config: ReturnType<typeof mockConfig>
  let wizardService: ReturnType<typeof mock<InstanceType<typeof WizardService>>>
  let commandRegistry: ReturnType<typeof mock<InstanceType<typeof CommandRegistry>>>
  let commandService: ReturnType<typeof mock<InstanceType<typeof CommandService>>>

  beforeEach(() => {
    bot = new Bot('test-token')
    api = mockBot(bot)
    logger = mockLogger()
    config = mockConfig()
    wizardService = mock<InstanceType<typeof WizardService>>()
    commandRegistry = mock<InstanceType<typeof CommandRegistry>>()
    commandService = mock<InstanceType<typeof CommandService>>()

    transport = new TelegramTransport(
      bot,
      logger,
      config,
      wizardService,
      commandRegistry,
      commandService
    )
  })

  describe('sendMessage', () => {
    it('should call bot.api.sendMessage and return messageId', async () => {
      const messageId = await transport.sendMessage(TEST_CONFIG.chatId, 'Hello world')

      expect(api.sendMessage).toHaveBeenCalledWith(TEST_CONFIG.chatId, 'Hello world', {
        reply_markup: undefined,
      })
      expect(messageId).toBe(1) // mockBot returns incrementing counter starting from 1
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

      expect(api.pinChatMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        TEST_CONFIG.messageId,
        undefined // mockBot passes undefined for empty rest params
      )
    })
  })

  describe('unpinMessage', () => {
    it('should call bot.api.unpinChatMessage', async () => {
      await transport.unpinMessage(TEST_CONFIG.chatId, TEST_CONFIG.messageId)

      expect(api.unpinChatMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        TEST_CONFIG.messageId,
        undefined // mockBot passes undefined for empty rest params
      )
    })
  })

  describe('logEvent', () => {
    it('should send formatted message to log chat', async () => {
      const event: LogEvent = { type: 'bot_started', botUsername: 'squash_bot' }
      await transport.logEvent(event)

      expect(api.sendMessage).toHaveBeenCalledWith(
        config.telegram.logChatId,
        '🟢 Bot started as @squash_bot',
        undefined
      )
    })

    it('should handle send failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      api.sendMessage.mockRejectedValueOnce(new Error('Network error'))

      const event: LogEvent = { type: 'bot_stopped' }
      await expect(transport.logEvent(event)).resolves.toBeUndefined()

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send log event to Telegram:',
        expect.any(Error)
      )
      consoleSpy.mockRestore()
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
