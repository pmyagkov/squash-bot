import { Bot } from 'grammy'

export interface SentMessage {
  chatId: number | string
  text: string
  options?: any
}

/**
 * Настраивает mock transformer для перехвата всех API запросов бота.
 * Использует официальный API grammy: https://grammy.dev/advanced/transformers
 *
 * @param bot - Экземпляр бота для мокирования
 * @returns Массив отправленных сообщений, который будет обновляться при каждом вызове API
 */
export function setupMockBotApi(bot: Bot): SentMessage[] {
  const sentMessages: SentMessage[] = []

  // Устанавливаем transformer через bot.api.config.use() (правильный способ по документации grammy)
  // https://grammy.dev/advanced/transformers
  bot.api.config.use((prev, method, payload, signal) => {
    if (method === 'sendMessage') {
      // Типизируем payload для sendMessage
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
        options: {
          parse_mode: sendMessagePayload.parse_mode,
          reply_markup: sendMessagePayload.reply_markup,
        },
      })

      // Возвращаем mock response вместо реального API вызова
      return Promise.resolve({
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 1000000),
          chat: { id: chatId, type: 'group', title: 'Test Chat' },
          text: text,
          date: Math.floor(Date.now() / 1000),
          from: { id: 0, is_bot: true, first_name: 'Test Bot' },
        },
      } as any)
    }

    if (method === 'getMe') {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456789,
          is_bot: true,
          first_name: 'Test Bot',
          username: 'test_bot',
        },
      } as any)
    }

    if (method === 'editMessageText') {
      return Promise.resolve({ ok: true, result: true } as any)
    }

    // Для остальных методов вызываем оригинальный transformer
    return prev(method, payload, signal)
  })

  return sentMessages
}

