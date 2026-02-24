import { Page, Locator } from '@playwright/test'
import { getTelegramWebUrl, TIMEOUTS } from '@e2e/config/config'

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
  async waitForLoad(timeout = TIMEOUTS.pageLoad): Promise<void> {
    await this.page.waitForSelector(this.selectors.messageComposer, { timeout })
  }

  /**
   * Navigate to a specific chat by chat ID
   */
  async navigateToChat(chatId: string): Promise<void> {
    await this.page.goto(getTelegramWebUrl(chatId), { waitUntil: 'domcontentloaded' })
    await this.page.waitForSelector(this.selectors.chatItem, { timeout: TIMEOUTS.pageLoad })

    // Try hash-based navigation first (reload for Web K)
    await this.page.evaluate(() => window.location.reload())
    try {
      await this.page.waitForSelector(this.selectors.messageComposer, {
        timeout: TIMEOUTS.inlineButton,
      })
      return
    } catch {
      // Hash navigation failed — fall back to clicking the first chat in the list
    }

    // Fallback: click the first chat in the list (most recent messages)
    const firstChat = this.page.locator(this.selectors.chatItem).first()
    await firstChat.click()
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
  async waitForNewMessage(timeout = TIMEOUTS.messageWait): Promise<string> {
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
  async waitForMessageContaining(
    text: string,
    timeout: number = TIMEOUTS.messageWait
  ): Promise<string> {
    const selector = this.selectors.messageText
    await this.page.waitForFunction(
      ({ sel, searchText }) => {
        const elements = document.querySelectorAll(sel)
        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i] as HTMLElement
          if (el.innerText && el.innerText.includes(searchText)) {
            return true
          }
        }
        return false
      },
      { sel: selector, searchText: text },
      { timeout }
    )
    // Re-read with evaluate to get the actual text
    return await this.page.evaluate(
      ({ sel, searchText }) => {
        const elements = document.querySelectorAll(sel)
        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i] as HTMLElement
          if (el.innerText && el.innerText.includes(searchText)) {
            return el.innerText
          }
        }
        return ''
      },
      { sel: selector, searchText: text }
    )
  }

  /**
   * Find inline button by text.
   * Searches ALL keyboards in the chat (not just the last one) and returns the
   * last matching button, since multiple keyboards accumulate across test runs.
   */
  protected findInlineButton(buttonText: string): Locator {
    return this.page
      .locator(`.bubble ${this.selectors.inlineButton}`, { hasText: buttonText })
      .last()
  }

  /**
   * Click inline button by text
   * @param buttonText - Text on the button to click
   */
  async clickInlineButton(buttonText: string): Promise<void> {
    const button = this.findInlineButton(buttonText)
    await button.waitFor({ state: 'visible', timeout: TIMEOUTS.inlineButton })
    await button.click()
  }

  /**
   * Wait for an inline button with specific text to appear
   * @param buttonText - Text on the button to wait for
   * @param timeout - Maximum time to wait
   */
  async waitForInlineButton(
    buttonText: string,
    timeout: number = TIMEOUTS.inlineButton
  ): Promise<void> {
    const button = this.findInlineButton(buttonText)
    await button.waitFor({ state: 'visible', timeout })
  }

  /**
   * Take a screenshot for debugging
   * @param name - Name for the screenshot file
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
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
