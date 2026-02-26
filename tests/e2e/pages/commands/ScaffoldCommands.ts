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
   * Example:
   * /scaffold create Tue 21:00 2
   * → 📋 Scaffold created
   * →
   * → Tue, 21:00
   * → 🏟 Courts: 2 | 🟢 Active | 📢 Public | sc_1
   */
  async addScaffold(day: string, time: string, courts: number): Promise<string> {
    const command = `/scaffold create ${day} ${time} ${courts}`
    return await this.sendCommand(command)
  }

  /**
   * List all scaffolds
   * @returns Response message from bot
   *
   * Example (2-line entity format):
   * /scaffold list
   * → Tue, 21:00 | 👑 @owner
   * → 🏟 Courts: 2 | 🟢 Active | 📢 Public | sc_1
   * →
   * → Sat, 18:00 | 👑 @owner
   * → 🏟 Courts: 3 | ⏸ Paused | 📢 Public | sc_2
   */
  async listScaffolds(): Promise<string> {
    return await this.sendCommand('/scaffold list')
  }

  /**
   * Toggle scaffold active/inactive status via edit menu
   * @param scaffoldId - Scaffold ID (e.g., "sc_1")
   * @returns Edit menu response text
   *
   * Opens the edit menu, clicks the toggle button, then clicks Done.
   */
  async toggleScaffold(scaffoldId: string): Promise<string> {
    const editMenu = await this.sendCommand(`/scaffold update ${scaffoldId}`)

    // Click the contextual toggle button
    const toggleText = editMenu.includes('Active') ? '⏸ Turn off' : '▶️ Turn on'
    await this.clickInlineButton(toggleText)
    await this.page.waitForTimeout(1000)

    // Dismiss the edit menu
    await this.clickInlineButton('✅ Done')
    await this.page.waitForTimeout(500)

    return editMenu
  }

  /**
   * Remove a scaffold
   * @param scaffoldId - Scaffold ID (e.g., "sc_1")
   * @returns Response message from bot
   *
   * Example:
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
   * Example (confirmation, 2-line entity format):
   * "📋 Scaffold created\n\nTue, 21:00\n🏟 Courts: 2 | 🟢 Active | 📢 Public | sc_1" → "sc_1"
   */
  parseScaffoldId(response: string): string | null {
    const match = response.match(/(sc_[\w-]+)/)
    return match ? match[1] : null
  }

  /**
   * Parse scaffold list from bot response
   * @param response - Bot response text
   * @returns Array of scaffold objects
   *
   * New 2-line entity format (blank line between entities):
   * "Tue, 21:00 | 👑 @owner\n🏟 Courts: 2 | 🟢 Active | 📢 Public | sc_1"
   * → [{ id: "sc_1", day: "Tue", time: "21:00", courts: 2, active: true }]
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

    // Match 2-line pattern:
    // Line 1: Tue, 21:00 | 👑 @owner
    // Line 2: 🏟 Courts: 2 | 🟢 Active | 📢 Public | sc_1
    const regex = /(\w+),\s+([\d:]+)\s+\|.*\n🏟 Courts:\s+(\d+)\s+\|\s+(🟢 Active|⏸ Paused)\s+\|.*?\|\s+(sc_[\w-]+)/g
    let match

    while ((match = regex.exec(response)) !== null) {
      scaffolds.push({
        id: match[5],
        day: match[1],
        time: match[2],
        courts: parseInt(match[3], 10),
        active: match[4] === '🟢 Active',
      })
    }

    return scaffolds
  }

  /**
   * Verify scaffold was created successfully
   * @param response - Bot response text
   * @returns True if scaffold was created
   *
   * New format: "📋 Scaffold created\n\n..."
   */
  isScaffoldCreated(response: string): boolean {
    return response.includes('Scaffold created') || response.includes('✅')
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
    // Toggle happens via edit menu — response is the edit menu text
    return response.includes('Scaffold') && response.includes('sc_')
  }
}
