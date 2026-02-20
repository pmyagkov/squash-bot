import { TelegramWebPage } from '@e2e/pages/base/TelegramWebPage'
import { Page } from '@playwright/test'
import { TIMEOUTS } from '@e2e/config/config'

/**
 * Page Object for Participant actions on event announcements
 * Covers Scenario 5 from architecture.md: Participant Registration
 */
export class ParticipantActions extends TelegramWebPage {
  constructor(page: Page) {
    super(page)
  }

  /**
   * Click "I'm in" button on event announcement
   * Each click adds +1 participation for the user
   *
   * From architecture.md:
   * "I'm in" — each click +1 to user's participations
   */
  async clickImIn(): Promise<void> {
    const textBefore = await this.getAnnouncementText()
    await this.clickInlineButton("✋ I'm in")
    await this.waitForAnnouncementChange(textBefore)
  }

  /**
   * Click "I'm out" button on event announcement
   * Each click removes -1 participation (minimum 0)
   *
   * From architecture.md:
   * "I'm out" — each click −1 (minimum 0, at 0 user disappears from list)
   */
  async clickImOut(): Promise<void> {
    const textBefore = await this.getAnnouncementText()
    await this.clickInlineButton("👋 I'm out")
    await this.waitForAnnouncementChange(textBefore)
  }

  /**
   * Click "+🎾" button to increase number of courts
   *
   * From architecture.md Scenario 6:
   * +🎾 — increase number of courts by 1
   */
  async addCourt(): Promise<void> {
    const textBefore = await this.getAnnouncementText()
    await this.clickInlineButton('➕ Court')
    await this.waitForAnnouncementChange(textBefore)
  }

  /**
   * Click "-court" button to decrease number of courts
   *
   * From architecture.md Scenario 6:
   * -court — decrease number of courts by 1 (minimum 1)
   */
  async removeCourt(): Promise<void> {
    const textBefore = await this.getAnnouncementText()
    await this.clickInlineButton('➖ Court')
    await this.waitForAnnouncementChange(textBefore)
  }

  /**
   * Click "✅ Finalize" button to finalize the event
   *
   * From architecture.md Scenario 6:
   * Any participant presses ✅, payment message sent, reminders stop
   */
  async finalizeEvent(): Promise<void> {
    await this.clickInlineButton('✅ Finalize')
    // Wait for payment message to appear
    await this.page.waitForTimeout(1000)
  }

  /**
   * Register multiple participations for the user
   * @param count - Number of participations to register
   */
  async registerParticipations(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.clickImIn()
    }
  }

  /**
   * Unregister from event completely
   * Clicks "I'm out" until user is removed from participants
   * @param maxClicks - Maximum number of clicks (safety limit)
   */
  async unregisterCompletely(maxClicks = 10): Promise<void> {
    for (let i = 0; i < maxClicks; i++) {
      await this.clickImOut()
      // Check if user is still in the list
      const message = await this.getLastMessageText()
      if (message.includes('(nobody yet)')) {
        break
      }
    }
  }

  /**
   * Parse participants from announcement message
   * @param message - Announcement message text
   * @returns Array of participants with their participation counts
   *
   * Example message format from architecture.md:
   * Participants:
   * @pasha (×2), @vasya, @petya
   */
  parseParticipants(message: string): Array<{ username: string; count: number }> {
    const participants: Array<{ username: string; count: number }> = []

    // Check if nobody registered
    if (message.includes('(nobody yet)')) {
      return participants
    }

    // Extract participants section
    const participantsMatch = message.match(/Participants(?:\s*\(\d+\))?:([\s\S]*?)(?:\n\n|$)/)
    if (!participantsMatch) return participants

    const participantsText = participantsMatch[1]

    // Match @username (×count) or just @username
    const regex = /@(\w+)(?:\s*\(×(\d+)\))?/g
    let match

    while ((match = regex.exec(participantsText)) !== null) {
      participants.push({
        username: match[1],
        count: parseInt(match[2] || '1', 10),
      })
    }

    return participants
  }

  /**
   * Get total number of participations from announcement
   * @param message - Announcement message text
   * @returns Total participation count
   */
  getTotalParticipations(message: string): number {
    const participants = this.parseParticipants(message)
    return participants.reduce((sum, p) => sum + p.count, 0)
  }

  /**
   * Check if user is registered for event
   * @param message - Announcement message text
   * @param username - Username to check (without @)
   * @returns True if user is registered
   */
  isUserRegistered(message: string, username: string): boolean {
    const participants = this.parseParticipants(message)
    return participants.some((p) => p.username === username)
  }

  /**
   * Get user's participation count
   * @param message - Announcement message text
   * @param username - Username to check (without @)
   * @returns Number of participations (0 if not registered)
   */
  getUserParticipationCount(message: string, username: string): number {
    const participants = this.parseParticipants(message)
    const participant = participants.find((p) => p.username === username)
    return participant ? participant.count : 0
  }

  /**
   * Parse number of courts from announcement
   * @param message - Announcement message text
   * @returns Number of courts
   */
  getCourtsCount(message: string): number | null {
    const match = message.match(/Courts:\s*(\d+)/)
    return match ? parseInt(match[1], 10) : null
  }

  /**
   * Get current announcement text via browser evaluate (avoids Playwright auto-wait overhead).
   * Matches on "🎾" prefix to distinguish announcements from payment messages
   * (which also contain "Participants" and have .reply-markup).
   */
  private async getAnnouncementText(): Promise<string> {
    return await this.page.evaluate(() => {
      const bubbles = document.querySelectorAll('.bubble')
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i] as HTMLElement
        if (!bubble.querySelector('.reply-markup')) continue
        const msgEl = bubble.querySelector('.translatable-message') as HTMLElement | null
        if (msgEl && msgEl.innerText.includes('🎾')) {
          return msgEl.innerText
        }
      }
      return ''
    })
  }

  /**
   * Wait for announcement text to change from a known previous value.
   * Uses page.waitForFunction for efficient in-browser polling.
   */
  private async waitForAnnouncementChange(
    previousText: string,
    timeout = TIMEOUTS.announcementChange
  ): Promise<string> {
    await this.page.waitForFunction(
      (prevText) => {
        const bubbles = document.querySelectorAll('.bubble')
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const bubble = bubbles[i] as HTMLElement
          if (!bubble.querySelector('.reply-markup')) continue
          const msgEl = bubble.querySelector('.translatable-message') as HTMLElement | null
          if (msgEl && msgEl.innerText.includes('🎾')) {
            // Only check the MOST RECENT announcement — old ones from previous tests
            // have different text and would cause false positives
            return msgEl.innerText !== prevText
          }
        }
        return false
      },
      previousText,
      { timeout, polling: 250 }
    )
    return await this.getAnnouncementText()
  }

  /**
   * Wait for announcement message to update
   * Actions (clickImIn, addCourt, etc.) already wait for the announcement to change,
   * so this method just reads the current state.
   * @returns Current announcement text
   */
  async waitForAnnouncementUpdate(): Promise<string> {
    return await this.getAnnouncementText()
  }
}
