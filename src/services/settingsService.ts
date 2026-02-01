import { notionClient } from '~/notion/client'
import { getDatabases } from '~/utils/environment'

export class SettingsService {
  /**
   * Get all settings from Notion as key-value map
   */
  async getSettings(): Promise<Record<string, string>> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.settings) {
      throw new Error('Settings database ID is not configured')
    }

    const response = await client.databases.query({
      database_id: databases.settings,
    })

    const settings: Record<string, string> = {}
    for (const page of response.results) {
      // Using 'as any' because Notion API types don't fully expose the properties structure
      // The @notionhq/client types are incomplete for database query results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties
      const key = this.getTitleProperty(props.key)
      const value = this.getRichTextProperty(props.value)
      if (key) {
        settings[key] = value
      }
    }

    return settings
  }

  /**
   * Get single setting value by key
   */
  async getSetting(key: string): Promise<string | null> {
    const settings = await this.getSettings()
    return settings[key] || null
  }

  /**
   * Get court price setting
   * @returns Court price in cents (default: 2000)
   */
  async getCourtPrice(): Promise<number> {
    const value = await this.getSetting('court_price')
    return value ? parseInt(value, 10) : 2000
  }

  /**
   * Get timezone setting
   * @returns Timezone string (default: "Europe/Belgrade")
   */
  async getTimezone(): Promise<string> {
    const value = await this.getSetting('timezone')
    return value || 'Europe/Belgrade'
  }

  /**
   * Get announcement deadline setting
   * @returns Time offset notation string (default: "-1d 12:00")
   */
  async getAnnouncementDeadline(): Promise<string> {
    const value = await this.getSetting('announcement_deadline')
    return value || '-1d 12:00'
  }

  /**
   * Get cancellation deadline setting
   * @returns Time offset notation string (default: "-1d 23:00")
   */
  async getCancellationDeadline(): Promise<string> {
    const value = await this.getSetting('cancellation_deadline')
    return value || '-1d 23:00'
  }

  /**
   * Get maximum players per court setting
   * @returns Max players per court (default: 4)
   */
  async getMaxPlayersPerCourt(): Promise<number> {
    const value = await this.getSetting('max_players_per_court')
    return value ? parseInt(value, 10) : 4
  }

  /**
   * Get minimum players per court setting
   * @returns Min players per court (default: 2)
   */
  async getMinPlayersPerCourt(): Promise<number> {
    const value = await this.getSetting('min_players_per_court')
    return value ? parseInt(value, 10) : 2
  }

  // Using 'any' because Notion property types vary and are not fully typed in @notionhq/client
  // This function handles title properties which can have different structures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getTitleProperty(prop: any): string {
    if (!prop || !prop.title || !Array.isArray(prop.title) || prop.title.length === 0) {
      return ''
    }
    return prop.title[0].plain_text || ''
  }

  // Using 'any' because Notion property types vary and are not fully typed in @notionhq/client
  // This function handles rich_text properties which can have different structures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getRichTextProperty(prop: any): string {
    if (!prop || !prop.rich_text || !Array.isArray(prop.rich_text) || prop.rich_text.length === 0) {
      return ''
    }
    return prop.rich_text[0].plain_text || ''
  }
}

export const settingsService = new SettingsService()
