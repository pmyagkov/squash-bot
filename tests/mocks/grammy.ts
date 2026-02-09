import { vi } from 'vitest'
import type { Context } from 'grammy'
import type { Chat, User, Message, CallbackQuery } from 'grammy/types'
import { TEST_CONFIG, TEST_USER, TEST_CHAT } from '@fixtures/config'

export interface MockContextOptions {
  userId?: number
  chatId?: number
  chatType?: 'private' | 'group'
  username?: string
  firstName?: string
  lastName?: string
  messageId?: number
  messageText?: string
  callbackQueryId?: string
  callbackQueryData?: string
  chatTitle?: string
}

/**
 * Creates mock grammy Context for unit tests
 * Supports both commands and callback queries
 * Uses TEST_CONFIG for default values
 */
export function mockContext(options: MockContextOptions = {}): Partial<Context> {
  const {
    userId = TEST_CONFIG.userId,
    chatId = TEST_CONFIG.chatId,
    chatType = 'group',
    username,
    firstName = TEST_USER.firstName,
    lastName,
    messageId,
    messageText,
    callbackQueryId,
    callbackQueryData,
    chatTitle = TEST_CHAT.title,
  } = options

  const from: User = {
    id: userId,
    is_bot: false,
    first_name: firstName,
    last_name: lastName,
    username,
  }

  const chat: Chat =
    chatType === 'private'
      ? { id: chatId, type: 'private', first_name: firstName, last_name: lastName, username }
      : { id: chatId, type: 'group', title: chatTitle }

  const message: Message | undefined =
    messageId !== undefined || messageText !== undefined
      ? ({
          message_id: messageId ?? TEST_CONFIG.messageId,
          date: Math.floor(Date.now() / 1000),
          chat,
          from,
          text: messageText,
        } as Message)
      : undefined

  const callback_query: CallbackQuery | undefined =
    callbackQueryId !== undefined
      ? ({
          id: callbackQueryId,
          from,
          chat_instance: 'test_instance',
          data: callbackQueryData,
          message: message ?? {
            message_id: messageId ?? TEST_CONFIG.messageId,
            date: Math.floor(Date.now() / 1000),
            chat,
            from,
          },
        } as CallbackQuery)
      : undefined

  return {
    from,
    chat,
    message,
    callbackQuery: callback_query,
    answerCallbackQuery: vi.fn(),
    reply: vi.fn(),
  } as Partial<Context>
}

/**
 * Creates mock for bot.api
 * All methods return successful results by default
 */
export function mockBotApi() {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      message_id: 123,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123, type: 'group' },
      text: 'test',
      from: { id: 0, is_bot: true, first_name: 'Bot' },
    }),
    editMessageText: vi.fn().mockResolvedValue(true),
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    pinChatMessage: vi.fn().mockResolvedValue(true),
    unpinChatMessage: vi.fn().mockResolvedValue(true),
    unpinAllChatMessages: vi.fn().mockResolvedValue(true),
  }
}
