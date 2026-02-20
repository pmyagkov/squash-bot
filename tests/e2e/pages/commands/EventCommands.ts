import { ChatPage } from '@e2e/pages/ChatPage'
import { Page } from '@playwright/test'

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
   * Example from architecture.md:
   * /event create 2024-01-20 19:00 2
   * → Created event ev_15 (Sat 20 Jan 19:00, 2 courts). To announce: /event announce ev_15
   */
  async addEvent(date: string, time: string, courts: number): Promise<string> {
    const command = `/event create ${date} ${time} ${courts}`
    return await this.sendCommand(command)
  }

  /**
   * List all events
   * @returns Response message from bot
   *
   * Example from architecture.md:
   * /event list
   * → ev_15: Sat 20 Jan 19:00, 2 courts, created
   * → ev_16: Sun 21 Jan 19:00, 2 courts, announced
   */
  async listEvents(): Promise<string> {
    return await this.sendCommand('/event list')
  }

  /**
   * Announce an event
   * @param eventId - Event ID (e.g., "ev_15")
   * @returns Response message from bot
   *
   * Example from architecture.md:
   * /event announce ev_15
   * → Announcement sent to chat
   */
  async announceEvent(eventId: string): Promise<string> {
    const command = `/event announce ${eventId}`
    return await this.sendCommand(command)
  }

  /**
   * Cancel an event
   * @param eventId - Event ID (e.g., "ev_15")
   * @returns Response message from bot
   *
   * Example from architecture.md:
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
   * Example:
   * "Created event ev_15 (Sat 20 Jan 19:00, 2 courts)" → "ev_15"
   */
  parseEventId(response: string): string | null {
    const match = response.match(/event (ev_[\w-]+)/)
    return match ? match[1] : null
  }

  /**
   * Parse event list from bot response
   * @param response - Bot response text
   * @returns Array of event objects
   *
   * Example:
   * "ev_15: Sat 20 Jan 19:00, 2 courts, created" → [{ id: "ev_15", status: "created", ... }]
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

    // Match pattern: ev_15: Sat 20 Jan 19:00, 2 courts, created
    const regex = /(ev_[\w-]+):.*?(\d+)\s+courts?,\s+(\w+)/gi
    let match

    while ((match = regex.exec(response)) !== null) {
      events.push({
        id: match[1],
        courts: parseInt(match[2], 10),
        status: match[3],
      })
    }

    return events
  }

  /**
   * Verify event was created successfully
   * @param response - Bot response text
   * @returns True if event was created
   */
  isEventCreated(response: string): boolean {
    return response.includes('Created event') || response.includes('✅')
  }

  /**
   * Verify event was announced successfully
   * @param response - Bot response text
   * @returns True if event was announced
   */
  isEventAnnounced(response: string): boolean {
    return /Courts:\s*\d+/.test(response) && response.includes('Participants:')
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
  async waitForAnnouncement(timeout = 10000): Promise<string> {
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
