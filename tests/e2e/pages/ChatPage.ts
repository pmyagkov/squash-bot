import { TelegramWebPage } from './base/TelegramWebPage'
import { Page } from '@playwright/test'
import { TIMEOUTS } from '@e2e/config/config'

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
    await composer.waitFor({ state: 'visible', timeout: TIMEOUTS.pageLoad })
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
  async sendCommand(command: string, timeout = TIMEOUTS.botResponse): Promise<string> {
    // Get the last message ID before sending (Web K: .bubble with data-mid)
    const lastMessage = this.page.locator('.bubble[data-mid]').last()
    const lastMessageId = await lastMessage.getAttribute('data-mid')

    // Send the command
    await this.sendMessage(command)

    // Wait for a new message from bot (without .is-out class and with higher data-mid)
    return await this.waitForBotMessage(lastMessageId || '0', timeout)
  }

  /**
   * Wait for next bot message (not own message).
   * Uses page.evaluate for synchronous DOM scanning to avoid Playwright auto-wait
   * blocking on bubbles without .translatable-message (e.g. virtualized elements).
   */
  private async waitForBotMessage(
    afterMessageId: string,
    timeout = TIMEOUTS.botResponse
  ): Promise<string> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const result = await this.page.evaluate((afterMid) => {
        const bubbles = document.querySelectorAll('.bubble[data-mid]:not(.is-out)')
        // Scan oldest-to-newest to return the FIRST bot response after our command,
        // not the last one (important when bot sends multiple messages, e.g. announce)
        for (let i = 0; i < bubbles.length; i++) {
          const bubble = bubbles[i] as HTMLElement
          const mid = bubble.getAttribute('data-mid')
          if (mid && parseFloat(mid) > parseFloat(afterMid)) {
            const msgEl = bubble.querySelector('.translatable-message') as HTMLElement | null
            if (msgEl && msgEl.innerText) {
              const text = msgEl.innerText
              // Skip log messages (they start with [ℹ️ INFO], [❌ ERROR], etc.)
              if (!text.trim().startsWith('[')) {
                return text
              }
            }
          }
        }
        return null
      }, afterMessageId)

      if (result) return result

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
  async waitForBotResponse(text: string, timeout = TIMEOUTS.messageWait): Promise<string> {
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
   * Send a message and wait for a NEW bot response containing expected text.
   * Unlike waitForBotResponse, this ignores historical messages by counting
   * existing matches before sending and waiting for one more to appear.
   */
  async sendAndExpect(
    message: string,
    expectedText: string,
    timeout = TIMEOUTS.botResponse
  ): Promise<string> {
    // Count existing messages matching the expected text
    const beforeCount = await this.countMessagesContaining(expectedText)

    // Send the message
    await this.sendMessage(message)

    // Wait for a NEW message matching the expected text (count increases)
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const messages = await this.getAllMessages().all()
      let matchCount = 0
      let lastMatch = ''

      for (let i = messages.length - 1; i >= 0; i--) {
        const text = await messages[i].innerText()
        if (text && text.includes(expectedText)) {
          matchCount++
          if (!lastMatch) lastMatch = text
        }
      }

      if (matchCount > beforeCount) {
        return lastMatch
      }

      await this.page.waitForTimeout(200)
    }

    throw new Error(
      `Timeout waiting for new message containing "${expectedText}" after ${timeout}ms`
    )
  }

  /**
   * Wait for a NEW bot response after an action (e.g., clicking inline button).
   * Counts existing matches and waits for one more to appear.
   */
  async expectNewResponse(expectedText: string, timeout = TIMEOUTS.botResponse): Promise<string> {
    // Count existing messages matching the expected text
    const beforeCount = await this.countMessagesContaining(expectedText)

    // Wait for a NEW message matching the expected text
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const messages = await this.getAllMessages().all()
      let matchCount = 0
      let lastMatch = ''

      for (let i = messages.length - 1; i >= 0; i--) {
        const text = await messages[i].innerText()
        if (text && text.includes(expectedText)) {
          matchCount++
          if (!lastMatch) lastMatch = text
        }
      }

      if (matchCount > beforeCount) {
        return lastMatch
      }

      await this.page.waitForTimeout(200)
    }

    throw new Error(
      `Timeout waiting for new message containing "${expectedText}" after ${timeout}ms`
    )
  }

  private async countMessagesContaining(text: string): Promise<number> {
    const messages = await this.getAllMessages().all()
    let count = 0
    for (const msg of messages) {
      const content = await msg.innerText()
      if (content && content.includes(text)) count++
    }
    return count
  }

  /**
   * Cancel any active wizard by sending /cancel.
   * Prevents wizard state from leaking between tests.
   */
  async cancelActiveWizard(): Promise<void> {
    await this.sendMessage('/cancel')
    await this.page.waitForTimeout(1000)
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
