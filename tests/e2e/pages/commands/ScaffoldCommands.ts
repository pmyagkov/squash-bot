import { ChatPage } from '@e2e/pages/ChatPage'
import { Page } from '@playwright/test'

/**
 * Page Object for Scaffold commands
 * Covers Scenario 1 from architecture.md: Create Scaffold
 */
export class ScaffoldCommands extends ChatPage {
  constructor(page: Page) {
    super(page)
  }

  /**
   * Add a new scaffold
   * @param day - Day of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
   * @param time - Time in HH:MM format (e.g., "21:00")
   * @param courts - Number of courts
   * @returns Response message from bot
   *
   * Example from architecture.md:
   * /scaffold create Tue 21:00 2
   * → Created scaffold sc_1: Tue 21:00, 2 courts
   */
  async addScaffold(day: string, time: string, courts: number): Promise<string> {
    const command = `/scaffold create ${day} ${time} ${courts}`
    return await this.sendCommand(command)
  }

  /**
   * List all scaffolds
   * @returns Response message from bot
   *
   * Example from architecture.md:
   * /scaffold list
   * → sc_1: Tue 21:00, 2 courts, active
   * → sc_2: Sat 18:00, 3 courts, inactive
   */
  async listScaffolds(): Promise<string> {
    return await this.sendCommand('/scaffold list')
  }

  /**
   * Toggle scaffold active/inactive status
   * @param scaffoldId - Scaffold ID (e.g., "sc_1")
   * @returns Response message from bot
   *
   * Example from architecture.md:
   * /scaffold update sc_2
   * → sc_2 is now active
   */
  async toggleScaffold(scaffoldId: string): Promise<string> {
    const command = `/scaffold update ${scaffoldId}`
    return await this.sendCommand(command)
  }

  /**
   * Remove a scaffold
   * @param scaffoldId - Scaffold ID (e.g., "sc_1")
   * @returns Response message from bot
   *
   * Example from architecture.md:
   * /scaffold delete sc_1
   * → sc_1 removed
   */
  async removeScaffold(scaffoldId: string): Promise<string> {
    const command = `/scaffold delete ${scaffoldId}`
    return await this.sendCommand(command)
  }

  /**
   * Parse scaffold ID from bot response
   * @param response - Bot response text
   * @returns Scaffold ID or null if not found
   *
   * Example:
   * "Created scaffold sc_1: Tue 21:00, 2 courts" → "sc_1"
   */
  parseScaffoldId(response: string): string | null {
    const match = response.match(/scaffold (sc_\w+)/)
    return match ? match[1] : null
  }

  /**
   * Parse scaffold list from bot response
   * @param response - Bot response text
   * @returns Array of scaffold objects
   *
   * Example:
   * "sc_1: Tue 21:00, 2 courts, active" → [{ id: "sc_1", day: "Tue", time: "21:00", courts: 2, active: true }]
   */
  parseScaffoldList(response: string): {
    id: string
    day: string
    time: string
    courts: number
    active: boolean
  }[] {
    const scaffolds: {
      id: string
      day: string
      time: string
      courts: number
      active: boolean
    }[] = []

    // Match pattern: sc_1: Tue 21:00, 2 court(s), ✅ active
    // The format includes emoji and court(s) instead of courts
    const regex =
      /(sc_\w+):\s+(\w+)\s+([\d:]+),\s+(\d+)\s+court\(s\),\s+[✅❌]?\s*(active|inactive)/gi
    let match

    while ((match = regex.exec(response)) !== null) {
      scaffolds.push({
        id: match[1],
        day: match[2],
        time: match[3],
        courts: parseInt(match[4], 10),
        active: match[5] === 'active',
      })
    }

    return scaffolds
  }

  /**
   * Verify scaffold was created successfully
   * @param response - Bot response text
   * @returns True if scaffold was created
   */
  isScaffoldCreated(response: string): boolean {
    return response.includes('Created scaffold') || response.includes('✅')
  }

  /**
   * Verify scaffold was removed successfully
   * @param response - Bot response text
   * @returns True if scaffold was removed
   */
  isScaffoldRemoved(response: string): boolean {
    return response.includes('removed') || response.includes('deleted')
  }

  /**
   * Verify scaffold status was toggled successfully
   * @param response - Bot response text
   * @returns True if scaffold was toggled
   */
  isScaffoldToggled(response: string): boolean {
    return response.includes('is now active') || response.includes('is now inactive')
  }
}
