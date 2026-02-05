import { db } from '~/storage/db'
import { settings } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'

export class SettingsRepo {
  async getSettings(): Promise<Record<string, string>> {
    const results = await db.select().from(settings)
    const settingsMap: Record<string, string> = {}
    for (const row of results) {
      settingsMap[row.key] = row.value
    }
    return settingsMap
  }

  async getSetting(key: string): Promise<string | null> {
    const result = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    })
    return result?.value ?? null
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
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
}
