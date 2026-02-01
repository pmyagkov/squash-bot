import { Update, CallbackQuery, Message } from '@grammyjs/types'
import { Context } from 'grammy'
import { vi } from 'vitest'

export interface CreateCallbackQueryOptions {
  userId: number
  chatId: number
  messageId: number
  data: string
  username?: string
  firstName?: string
  lastName?: string
}

/**
 * Create a mock CallbackQuery update for testing callback handlers
 */
export function createCallbackQueryUpdate(options: CreateCallbackQueryOptions): Update {
  return {
    update_id: Math.floor(Math.random() * 1000000),
    callback_query: {
      id: String(Math.floor(Math.random() * 1000000)),
      from: {
        id: options.userId,
        is_bot: false,
        first_name: options.firstName || 'Test',
        last_name: options.lastName,
        username: options.username,
      },
      message: {
        message_id: options.messageId,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: options.chatId,
          type: 'group',
          title: 'Test Chat',
        },
        from: {
          id: 0,
          is_bot: true,
          first_name: 'Test Bot',
        },
        text: 'Test message',
      } as Message.CommonMessage,
      chat_instance: String(Math.floor(Math.random() * 1000000)),
      data: options.data,
    } as CallbackQuery,
  } as Update
}

/**
 * Create a mock Context for callback query testing
 * This is useful for unit testing individual callback handlers
 */
export function createMockCallbackContext(options: CreateCallbackQueryOptions): Context {
  const update = createCallbackQueryUpdate(options)

  // Create mock API methods
  const mockApi = {
    sendMessage: vi.fn().mockResolvedValue({
      message_id: Math.floor(Math.random() * 1000000),
      chat: { id: options.chatId, type: 'group', title: 'Test Chat' },
      date: Math.floor(Date.now() / 1000),
      from: { id: 0, is_bot: true, first_name: 'Test Bot' },
    }),
    editMessageText: vi.fn().mockResolvedValue(true),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    pinChatMessage: vi.fn().mockResolvedValue(true),
    unpinChatMessage: vi.fn().mockResolvedValue(true),
    unpinAllChatMessages: vi.fn().mockResolvedValue(true),
  }

  const mockAnswerCallbackQuery = vi.fn().mockResolvedValue(true)

  // Create a minimal context object with the necessary properties
  const ctx = {
    update,
    callbackQuery: update.callback_query,
    from: update.callback_query?.from,
    chat: update.callback_query?.message
      ? 'chat' in update.callback_query.message
        ? update.callback_query.message.chat
        : undefined
      : undefined,
    api: mockApi as any,
    answerCallbackQuery: mockAnswerCallbackQuery,
  } as unknown as Context

  return ctx
}
