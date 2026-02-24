import { vi, type Mock } from 'vitest'
import type { Bot, Transformer } from 'grammy'
import type { Message, User } from 'grammy/types'
import { TEST_CONFIG } from '@fixtures'

// Extract clean function type from Bot API method (strips class `this` context)
type ApiMethod<M extends keyof Bot['api']> = Bot['api'][M] extends (...args: infer A) => infer R
  ? (...args: A) => R
  : never

/**
 * Mock functions matching grammy Bot API signatures.
 * Each method is a vitest Mock with the same parameters as bot.api.<method>.
 */
export interface BotApiMock {
  getMe: Mock<ApiMethod<'getMe'>>
  sendMessage: Mock<ApiMethod<'sendMessage'>>
  editMessageText: Mock<ApiMethod<'editMessageText'>>
  pinChatMessage: Mock<ApiMethod<'pinChatMessage'>>
  unpinChatMessage: Mock<ApiMethod<'unpinChatMessage'>>
  unpinAllChatMessages: Mock<ApiMethod<'unpinAllChatMessages'>>
  answerCallbackQuery: Mock<ApiMethod<'answerCallbackQuery'>>
  editMessageReplyMarkup: Mock<ApiMethod<'editMessageReplyMarkup'>>
  deleteMessage: Mock<ApiMethod<'deleteMessage'>>
}

/** If rest object has keys, return it; otherwise undefined */
function restOrUndefined(rest: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(rest).length > 0 ? rest : undefined
}

/** Wrap result in Telegram API response format for the transformer */
function apiResponse<T>(result: T) {
  return { ok: true as const, result }
}

// Payload types for transformer conversion (Telegram Bot API format, snake_case)
interface SendMessagePayload {
  chat_id: number | string
  text: string
  [k: string]: unknown
}

interface EditMessageTextPayload {
  chat_id: number | string
  message_id: number
  text: string
  [k: string]: unknown
}

interface ChatMessagePayload {
  chat_id: number | string
  message_id: number
  [k: string]: unknown
}

interface ChatIdPayload {
  chat_id: number | string
}

interface AnswerCallbackPayload {
  callback_query_id: string
  [k: string]: unknown
}

/**
 * Sets up mock transformer to intercept all bot API requests.
 * Returns vitest mock functions matching grammy API signatures.
 *
 * Uses official grammy transformer API: https://grammy.dev/advanced/transformers
 *
 * @param bot - Bot instance to mock
 * @returns Object with vitest mock functions for each API method
 *
 * @example
 * const api = mockBot(bot)
 * await bot.handleUpdate(update)
 *
 * expect(api.sendMessage).toHaveBeenCalledWith(
 *   TEST_CHAT_ID,
 *   expect.stringContaining('Created'),
 *   expect.objectContaining({ parse_mode: 'HTML' })
 * )
 */
export function mockBot(bot: Bot): BotApiMock {
  let messageIdCounter = 1

  const api: BotApiMock = {
    getMe: vi.fn().mockResolvedValue({
      id: TEST_CONFIG.userId,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot',
    } satisfies User) as BotApiMock['getMe'],

    sendMessage: vi.fn().mockImplementation(
      async (chat_id: number | string) =>
        ({
          message_id: messageIdCounter++,
          chat: { id: chat_id, type: 'group', title: 'Test Chat' },
          date: Math.floor(Date.now() / 1000),
          from: {
            id: TEST_CONFIG.userId,
            is_bot: true,
            first_name: 'Test Bot',
          },
        }) as Message.TextMessage
    ) as BotApiMock['sendMessage'],

    editMessageText: vi.fn().mockResolvedValue(true) as BotApiMock['editMessageText'],
    pinChatMessage: vi.fn().mockResolvedValue(true) as BotApiMock['pinChatMessage'],
    unpinChatMessage: vi.fn().mockResolvedValue(true) as BotApiMock['unpinChatMessage'],
    unpinAllChatMessages: vi.fn().mockResolvedValue(true) as BotApiMock['unpinAllChatMessages'],
    answerCallbackQuery: vi.fn().mockResolvedValue(true) as BotApiMock['answerCallbackQuery'],
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true) as BotApiMock['editMessageReplyMarkup'],
    deleteMessage: vi.fn().mockResolvedValue(true) as BotApiMock['deleteMessage'],
  }

  // Grammy's Transformer type is generic over method M, but a switch-case
  // can't prove each branch returns the correct result type for that M.
  // Single cast replaces the 8+ `as any` casts from the previous implementation.
  bot.api.config.use(((prev, method, payload, signal) => {
    switch (method) {
      case 'getMe': {
        return api.getMe().then(apiResponse)
      }

      case 'sendMessage': {
        const { chat_id, text, ...rest } = payload as SendMessagePayload
        return api.sendMessage(chat_id, text, restOrUndefined(rest)).then(apiResponse)
      }

      case 'editMessageText': {
        const { chat_id, message_id, text, ...rest } = payload as EditMessageTextPayload
        return api
          .editMessageText(chat_id, message_id, text, restOrUndefined(rest))
          .then(apiResponse)
      }

      case 'pinChatMessage': {
        const { chat_id, message_id, ...rest } = payload as ChatMessagePayload
        return api.pinChatMessage(chat_id, message_id, restOrUndefined(rest)).then(apiResponse)
      }

      case 'unpinChatMessage': {
        const { chat_id, message_id, ...rest } = payload as ChatMessagePayload
        return api.unpinChatMessage(chat_id, message_id, restOrUndefined(rest)).then(apiResponse)
      }

      case 'unpinAllChatMessages': {
        const { chat_id } = payload as ChatIdPayload
        return api.unpinAllChatMessages(chat_id).then(apiResponse)
      }

      case 'answerCallbackQuery': {
        const { callback_query_id, ...rest } = payload as AnswerCallbackPayload
        return api.answerCallbackQuery(callback_query_id, restOrUndefined(rest)).then(apiResponse)
      }

      case 'editMessageReplyMarkup': {
        const { chat_id, message_id, ...rest } = payload as ChatMessagePayload
        return api
          .editMessageReplyMarkup(chat_id, message_id, restOrUndefined(rest))
          .then(apiResponse)
      }

      case 'deleteMessage': {
        const { chat_id, message_id } = payload as ChatMessagePayload
        return api.deleteMessage(chat_id, message_id).then(apiResponse)
      }

      default:
        return prev(method, payload, signal)
    }
  }) as Transformer)

  return api
}
