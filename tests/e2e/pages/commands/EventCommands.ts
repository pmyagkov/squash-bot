import { ChatPage } from '@e2e/pages/ChatPage'
import { Page } from '@playwright/test'
import { TIMEOUTS } from '@e2e/config/config'

/**
 * Page Object for Event commands
 * Covers Scenario 3 from architecture.md: Manual Event Creation (ad-hoc)
 */
export class EventCommands extends ChatPage {
  constructor(page: Page) {
    super(page)
  }

  /**
   * Add a new event manually
   * @param date - Date in various formats (2024-01-20, tomorrow, sat, next tue)
   * @param time - Time in HH:MM format (e.g., "19:00")
   * @param courts - Number of courts
   * @returns Response message from bot
   *
   * Example:
   * /event create 2024-01-20 19:00 2
   * → 📅 Event created
   * →
   * → Sat, 20 Jan, 19:00
   * → 🏟 Courts: 2 | 📝 Created | 📢 Public | ev_15
   */
  async addEvent(date: string, time: string, courts: number): Promise<string> {
    const command = `/event create ${date} ${time} ${courts}`
    return await this.sendCommand(command)
  }

  /**
   * List all events
   * @returns Response message from bot
   *
   * Example (2-line entity format):
   * /event list
   * → Sat, 20 Jan, 19:00 | 👑 @owner
   * → 🏟 Courts: 2 | 📝 Created | 📢 Public | ev_15
   * →
   * → Sun, 21 Jan, 19:00 | 👑 @owner
   * → 🏟 Courts: 2 | 📣 Announced | 📢 Public | ev_16
   */
  async listEvents(): Promise<string> {
    return await this.sendCommand('/event list')
  }

  /**
   * Announce an event
   * @param eventId - Event ID (e.g., "ev_15")
   * @returns Response message from bot
   *
   * Example:
   * /event announce ev_15
   * → 📢 Event announced
   * → ...
   */
  async announceEvent(eventId: string): Promise<string> {
    const command = `/event announce ${eventId}`
    const response = await this.sendCommand(command)
    // The announce handler is fire-and-forget in Grammy (to avoid wizard deadlocks).
    // sendCommand captures the announcement message, but the DB update (telegramMessageId)
    // may not be complete yet. Wait for the confirmation message which is sent AFTER
    // the DB update, ensuring callbacks can find the event by messageId.
    await this.waitForMessageContaining('Event announced', 5000)
    return response
  }

  /**
   * Cancel an event
   * @param eventId - Event ID (e.g., "ev_15")
   * @returns Response message from bot
   *
   * Example:
   * /event cancel ev_15
   * → Event ev_15 cancelled. Notification sent to chat.
   */
  async cancelEvent(eventId: string): Promise<string> {
    const command = `/event cancel ${eventId}`
    return await this.sendCommand(command)
  }

  /**
   * Parse event ID from bot response
   * @param response - Bot response text
   * @returns Event ID or null if not found
   *
   * Example (confirmation, 2-line entity format):
   * "📅 Event created\n\nSat, 20 Jan, 19:00\n🏟 Courts: 2 | 📝 Created | 📢 Public | ev_15" → "ev_15"
   */
  parseEventId(response: string): string | null {
    const match = response.match(/(ev_[\w-]+)/)
    return match ? match[1] : null
  }

  /**
   * Parse event list from bot response
   * @param response - Bot response text
   * @returns Array of event objects
   *
   * New 2-line entity format (blank line between entities):
   * "Sat, 20 Jan, 19:00 | 👑 @owner\n🏟 Courts: 2 | 📝 Created | 📢 Public | ev_15"
   * → [{ id: "ev_15", courts: 2, status: "created" }]
   */
  parseEventList(response: string): {
    id: string
    courts: number
    status: string
  }[] {
    const events: {
      id: string
      courts: number
      status: string
    }[] = []

    // Match line 2 pattern: 🏟 Courts: 2 | 📝 Created | 📢 Public | ev_15
    const statusMap: Record<string, string> = {
      '📝 Created': 'created',
      '📣 Announced': 'announced',
      '✅ Finalized': 'finalized',
      '❌ Cancelled': 'cancelled',
    }
    const regex = /🏟 Courts:\s+(\d+)\s+\|\s+([📝📣✅❌]\s+\w+)\s+\|.*?\|\s+(ev_[\w-]+)/g
    let match

    while ((match = regex.exec(response)) !== null) {
      events.push({
        id: match[3],
        courts: parseInt(match[1], 10),
        status: statusMap[match[2]] ?? match[2],
      })
    }

    return events
  }

  /**
   * Verify event was created successfully
   * @param response - Bot response text
   * @returns True if event was created
   *
   * New format: "📅 Event created\n\n..."
   */
  isEventCreated(response: string): boolean {
    return response.includes('Event created') || response.includes('✅')
  }

  /**
   * Verify announcement message has correct format
   * @param announcement - Announcement message text from group chat
   * @returns True if announcement has expected format
   */
  isEventAnnounced(announcement: string): boolean {
    return /Courts:\s*\d+/.test(announcement) && announcement.includes('Participants:')
  }

  /**
   * Verify event was cancelled successfully
   * @param response - Bot response text
   * @returns True if event was cancelled
   */
  isEventCancelled(response: string): boolean {
    return response.includes('cancelled') || response.includes('canceled')
  }

  /**
   * Wait for event announcement message in chat
   * @param timeout - Maximum time to wait
   * @returns Announcement message text
   *
   * Expected format from architecture.md:
   * 🎾 Squash: Tuesday, January 21, 21:00
   * Courts: 2
   * Participants: (nobody yet)
   */
  async waitForAnnouncement(timeout = TIMEOUTS.announcement): Promise<string> {
    return await this.waitForMessageContaining('🎾 Squash', timeout)
  }

  /**
   * Parse event details from announcement message
   * @param announcement - Announcement message text
   * @returns Event details object
   */
  parseAnnouncement(announcement: string): {
    courts: number
    participants: string[]
  } | null {
    // Parse courts: "Courts: 2"
    const courtsMatch = announcement.match(/Courts:\s*(\d+)/)
    if (!courtsMatch) return null

    // Parse participants
    const participantsSection = announcement.split(/Participants(?:\s*\(\d+\))?:/)[1]
    const participants: string[] = []

    if (participantsSection && !participantsSection.includes('nobody yet')) {
      // Match @username or "First Last" patterns
      const regex = /@(\w+)(?:\s*\(×(\d+)\))?/g
      let match
      while ((match = regex.exec(participantsSection)) !== null) {
        const username = match[1]
        const count = parseInt(match[2] || '1', 10)
        for (let i = 0; i < count; i++) {
          participants.push(username)
        }
      }
    }

    return {
      courts: parseInt(courtsMatch[1], 10),
      participants,
    }
  }
}
