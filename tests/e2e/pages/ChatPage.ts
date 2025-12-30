import { TelegramWebPage } from './base/TelegramWebPage'
import { Page } from '@playwright/test'

/**
 * Page Object for Telegram chat interactions
 * Handles chat navigation, message sending, and message reading
 */
export class ChatPage extends TelegramWebPage {
  constructor(page: Page) {
    super(page)
  }

  /**
   * Send a text message to the current chat
   * @param text - Message text to send
   */
  async sendMessage(text: string): Promise<void> {
    const composer = this.getMessageComposer()
    await composer.waitFor({ state: 'visible', timeout: 10000 })
    await composer.fill(text)
    await composer.press('Enter')
    // Wait a bit for message to be sent
    await this.page.waitForTimeout(500)
  }

  /**
   * Send a command and wait for bot response
   * @param command - Command to send (e.g., '/scaffold list')
   * @param timeout - Timeout for waiting for response
   * @returns Bot response text
   */
  async sendCommand(command: string, timeout = 10000): Promise<string> {
    // Get the last message ID before sending
    const lastMessage = this.page.locator('.Message').last()
    const lastMessageId = await lastMessage.getAttribute('data-message-id')

    // Send the command
    await this.sendMessage(command)

    // Wait for a new message from bot (without .own class and with higher ID)
    return await this.waitForBotMessage(lastMessageId || '0', timeout)
  }

  /**
   * Wait for next bot message (not own message)
   * @param afterMessageId - Message ID to wait after
   * @param timeout - Maximum time to wait
   * @returns Bot response text
   */
  private async waitForBotMessage(afterMessageId: string, timeout = 10000): Promise<string> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      // Get all messages that are NOT own and have ID > afterMessageId
      const messages = await this.page.locator('.Message:not(.own)').all()

      for (const message of messages) {
        const messageId = await message.getAttribute('data-message-id')
        if (messageId && parseInt(messageId) > parseInt(afterMessageId)) {
          // Found a new bot message!
          const text = await message.locator('.text-content').textContent()
          if (text) {
            // Skip log messages (they start with [ℹ️ INFO], [❌ ERROR], etc.)
            if (!text.trim().startsWith('[')) {
              return text
            }
          }
        }
      }

      // Wait a bit before checking again
      await this.page.waitForTimeout(200)
    }

    throw new Error(`Timeout waiting for bot response after ${timeout}ms`)
  }

  /**
   * Get the last N messages from the chat
   * @param count - Number of messages to retrieve
   * @returns Array of message texts
   */
  async getLastMessages(count: number): Promise<string[]> {
    const messages = await this.getAllMessages()
    const messageCount = await messages.count()
    const startIndex = Math.max(0, messageCount - count)

    const texts: string[] = []
    for (let i = startIndex; i < messageCount; i++) {
      const text = await messages.nth(i).innerText()
      texts.push(text)
    }

    return texts
  }

  /**
   * Search for a message containing specific text in recent messages
   * @param searchText - Text to search for
   * @param messageCount - Number of recent messages to search through
   * @returns Message text if found, null otherwise
   */
  async findMessageContaining(searchText: string, messageCount = 10): Promise<string | null> {
    const messages = await this.getLastMessages(messageCount)
    return messages.find((msg) => msg.includes(searchText)) || null
  }

  /**
   * Wait for bot response containing specific text
   * @param text - Text to wait for in bot response
   * @param timeout - Maximum time to wait
   * @returns Response text
   */
  async waitForBotResponse(text: string, timeout = 10000): Promise<string> {
    return await this.waitForMessageContaining(text, timeout)
  }

  /**
   * Check if a message exists in recent messages
   * @param text - Text to search for
   * @param messageCount - Number of recent messages to check
   * @returns True if message is found
   */
  async hasMessage(text: string, messageCount = 10): Promise<boolean> {
    const message = await this.findMessageContaining(text, messageCount)
    return message !== null
  }

  /**
   * Clear the message input
   */
  async clearMessageInput(): Promise<void> {
    const composer = this.getMessageComposer()
    await composer.clear()
  }

  /**
   * Get text content of the last message
   */
  async getLastMessageText(): Promise<string> {
    const message = await this.getLastMessage()
    return await message.innerText()
  }
}
