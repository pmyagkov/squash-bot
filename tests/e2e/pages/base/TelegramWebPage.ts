import { Page, Locator } from '@playwright/test'
import { getTelegramWebUrl } from '@e2e/config/config'

/**
 * Base class for all Telegram Web page objects
 * Provides common selectors and utilities for interacting with Telegram Web
 */
export class TelegramWebPage {
  protected readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Common selectors for Telegram Web elements
   */
  protected get selectors() {
    return {
      // Message input (Web K)
      messageComposer: '.input-message-input[contenteditable="true"]:not(.input-field-input-fake)',

      // Messages (Web K)
      messageContainer: '.bubbles-group',
      lastMessage: '.bubbles-group:last-child .bubble:last-child .translatable-message',
      messageText: '.translatable-message',

      // Inline buttons (Web K)
      inlineKeyboard: '.reply-markup',
      inlineButton: '.reply-markup-button',

      // Chat list (Web K)
      chatList: '.chatlist-chat',
      chatItem: '.chatlist-chat',

      // Search
      searchInput: '.input-search-input',
    }
  }

  /**
   * Wait for page to be loaded
   */
  async waitForLoad(timeout = 10000): Promise<void> {
    await this.page.waitForSelector(this.selectors.messageComposer, { timeout })
  }

  /**
   * Navigate to a specific chat by chat ID
   */
  async navigateToChat(chatId: string): Promise<void> {
    await this.page.goto(getTelegramWebUrl(chatId), { waitUntil: 'domcontentloaded' })
    // Web K needs a reload for hash-based navigation to take effect
    await this.page.waitForSelector(this.selectors.chatItem, { timeout: 15000 })
    await this.page.evaluate(() => window.location.reload())
    await this.waitForLoad()
  }

  /**
   * Get message composer element
   */
  protected getMessageComposer(): Locator {
    return this.page.locator(this.selectors.messageComposer)
  }

  /**
   * Get last message in chat
   */
  protected getLastMessage(): Locator {
    return this.page.locator(this.selectors.lastMessage).last()
  }

  /**
   * Get all messages in chat
   */
  protected getAllMessages(): Locator {
    return this.page.locator(this.selectors.messageText)
  }

  /**
   * Wait for a new message to appear
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Text content of the new message
   */
  async waitForNewMessage(timeout = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const checkInterval = 200
      let elapsed = 0

      const interval = setInterval(async () => {
        try {
          const message = await this.getLastMessage()
          const text = await message?.innerText()

          if (text) {
            clearInterval(interval)
            resolve(text)
          } else {
            elapsed += checkInterval
            if (elapsed >= timeout) {
              clearInterval(interval)
              reject(new Error('Timeout waiting for new message'))
            }
          }
        } catch (error) {
          elapsed += checkInterval
          if (elapsed >= timeout) {
            clearInterval(interval)
            reject(error)
          }
        }
      }, checkInterval)
    })
  }

  /**
   * Wait for a message containing specific text
   * @param text - Text to search for in message
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Text content of the matching message
   */
  async waitForMessageContaining(text: string, timeout = 10000): Promise<string> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const messages = await this.getAllMessages().all()
      // Search from newest to oldest
      for (let i = messages.length - 1; i >= 0; i--) {
        const messageText = await messages[i].innerText()
        if (messageText && messageText.includes(text)) {
          return messageText
        }
      }
      await this.page.waitForTimeout(200)
    }

    throw new Error(`Timeout waiting for message containing "${text}"`)
  }

  /**
   * Find inline button by text
   * @param buttonText - Text on the button to find
   */
  protected findInlineButton(buttonText: string): Locator {
    const lastKeyboard = this.page.locator(this.selectors.inlineKeyboard).last()
    return lastKeyboard.locator(this.selectors.inlineButton, { hasText: buttonText })
  }

  /**
   * Click inline button by text
   * @param buttonText - Text on the button to click
   */
  async clickInlineButton(buttonText: string): Promise<void> {
    const button = this.findInlineButton(buttonText)
    await button.waitFor({ state: 'visible', timeout: 5000 })
    await button.click()
  }

  /**
   * Take a screenshot for debugging
   * @param name - Name for the screenshot file
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true
    })
  }

  /**
   * Get text content of the last message
   */
  async getLastMessageText(): Promise<string> {
    const message = await this.getLastMessage()
    return await message.innerText()
  }
}
