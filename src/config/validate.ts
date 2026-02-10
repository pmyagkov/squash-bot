import { config } from '.'
import type { SettingsRepo } from '~/storage/repo/settings'

/**
 * Validate that all required environment variables are set.
 * Call before any other startup logic.
 */
export function validateEnvConfig(): void {
  const required: { key: string; value: string | undefined }[] = [
    { key: 'TELEGRAM_BOT_TOKEN', value: config.telegram.botToken },
    { key: 'TELEGRAM_LOG_CHAT_ID', value: config.telegram.logChatId },
    { key: 'DATABASE_URL', value: config.database.url },
    { key: 'API_KEY', value: config.server.apiKey },
  ]

  const missing = required.filter((r) => !r.value)
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map((r) => r.key).join(', ')}`
    )
  }
}

/**
 * Validate that required settings exist in the database.
 * Call after container is created (needs DB access).
 */
export async function validateDbSettings(settingsRepo: SettingsRepo): Promise<void> {
  const requiredKeys = ['main_chat_id', 'admin_id']
  const missing: string[] = []

  for (const key of requiredKeys) {
    const value = await settingsRepo.getSetting(key)
    if (!value) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required database settings: ${missing.join(', ')}. Run 'npm run db:seed' to initialize.`
    )
  }
}
