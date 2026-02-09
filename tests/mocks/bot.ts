import { Bot } from 'grammy'
import { TEST_CONFIG } from '@fixtures'

export interface SentMessage {
  chatId: number | string
  text: string
  options?: any
  reply_markup?: any
}

/**
 * Sets up mock transformer to intercept all bot API requests.
 * Uses official grammy API: https://grammy.dev/advanced/transformers
 *
 * TODO: This mock requires future revision to align with centralized mock patterns.
 * Consider creating a factory function that returns both bot and sentMessages,
 * or integrating with mockContainer for better consistency.
 *
 * @param bot - Bot instance to mock
 * @returns Array of sent messages that will be updated on each API call
 */
export function mockBot(bot: Bot): SentMessage[] {
  const sentMessages: SentMessage[] = []

  // Set transformer via bot.api.config.use() (correct way according to grammy documentation)
  // https://grammy.dev/advanced/transformers
  bot.api.config.use((prev, method, payload, signal) => {
    if (method === 'sendMessage') {
      // Type payload for sendMessage
      const sendMessagePayload = payload as {
        chat_id: number | string
        text: string
        parse_mode?: string
        reply_markup?: any
      }
      const chatId = sendMessagePayload.chat_id
      const text = sendMessagePayload.text || ''

      sentMessages.push({
        chatId,
        text,
        reply_markup: sendMessagePayload.reply_markup,
        options: {
          parse_mode: sendMessagePayload.parse_mode,
          reply_markup: sendMessagePayload.reply_markup,
        },
      })

      // Return mock response instead of real API call
      return Promise.resolve({
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 1000000),
          chat: { id: chatId, type: 'group', title: 'Test Chat' },
          text: text,
          date: Math.floor(Date.now() / 1000),
          from: { id: TEST_CONFIG.userId, is_bot: true, first_name: 'Test Bot' },
        },
      } as any)
    }

    if (method === 'getMe') {
      return Promise.resolve({
        ok: true,
        result: {
          id: TEST_CONFIG.userId,
          is_bot: true,
          first_name: 'Test Bot',
          username: 'test_bot',
        },
      } as any)
    }

    if (method === 'editMessageText') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    if (method === 'pinChatMessage') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    if (method === 'unpinAllChatMessages') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    if (method === 'unpinChatMessage') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    if (method === 'answerCallbackQuery') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    if (method === 'editMessageReplyMarkup') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    // For other methods, call original transformer
    return prev(method, payload, signal)
  })

  return sentMessages
}
