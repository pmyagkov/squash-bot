import { Page, Locator } from '@playwright/test'

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
      // Message input
      messageComposer: '#message-input-text [role="textbox"][contenteditable="true"]',

      // Messages
      messageContainer: '.sender-group-container',
      lastMessage: '.sender-group-container:last-child .text-content',
      messageText: '.text-content',

      // Inline buttons
      inlineKeyboard: '.reply-markup',
      inlineButton: '.reply-markup-button',

      // Chat list
      chatList: '.chat-list',
      chatItem: '.chatlist-chat',

      // Search
      searchInput: 'input[type="text"]',
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
    await this.page.goto(`https://web.telegram.org/a/#${chatId}`)
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
    return new Promise((resolve, reject) => {
      const checkInterval = 200
      let elapsed = 0

      const interval = setInterval(async () => {
        try {
          const message = await this.getLastMessage()
          const messageText = await message?.innerText()

          if (messageText && messageText.includes(text)) {
            clearInterval(interval)
            resolve(messageText)
          } else {
            elapsed += checkInterval
            if (elapsed >= timeout) {
              clearInterval(interval)
              reject(new Error(`Timeout waiting for message containing "${text}"`))
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
   * Find inline button by text
   * @param buttonText - Text on the button to find
   */
  protected findInlineButton(buttonText: string): Locator {
    return this.page.locator(this.selectors.inlineButton, { hasText: buttonText })
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
