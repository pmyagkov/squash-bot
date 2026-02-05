import { Bot } from 'grammy'
import { config } from '~/config'
import type { Event } from '~/types'
import { buildInlineKeyboard, formatEventMessage } from '~/services/formatters/event'
import type { AppContainer } from '~/container'

export class TelegramOutput {
  private bot: Bot

  constructor(container: AppContainer) {
    this.bot = container.resolve('bot')
  }

  /**
   * Send service log message to technical chat
   */
  async sendLogMessage(message: string): Promise<void> {
    if (!config.telegram.logChatId) {
      return
    }
    await this.bot.api.sendMessage(config.telegram.logChatId, message)
  }

  /**
   * Sends event announcement to Telegram
   * Returns the message ID of the sent message
   */
  async sendEventAnnouncement(event: Event): Promise<number> {
    const chatIdToUse = config.telegram.mainChatId

    try {
      // 1. Unpin all previous pinned messages
      try {
        await this.bot.api.unpinAllChatMessages(chatIdToUse)
      } catch {
        // Ignore errors if there are no pinned messages (silently continue)
      }

      // 2. Format message and keyboard
      const messageText = formatEventMessage(event)
      const keyboard = buildInlineKeyboard('announced')

      // 3. Send message
      const sentMessage = await this.bot.api.sendMessage(chatIdToUse, messageText, {
        reply_markup: keyboard,
      })

      // 4. Pin message
      await this.bot.api.pinChatMessage(chatIdToUse, sentMessage.message_id)

      return sentMessage.message_id
    } catch (error) {
      console.error(
        `Failed to announce event ${event.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  /**
   * Sends cancellation notification to Telegram
   */
  async sendCancellationNotification(eventId: string): Promise<void> {
    const chatIdToUse = config.telegram.mainChatId
    try {
      await this.bot.api.sendMessage(chatIdToUse, `❌ Event ${eventId} has been cancelled.`)
    } catch (error) {
      console.error(
        `Failed to send cancellation notification: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
