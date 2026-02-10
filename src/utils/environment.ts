import { config } from '../config'
import type { SettingsRepo } from '~/storage/repo/settings'

export function isTestEnvironment(): boolean {
  return config.environment === 'test'
}

export async function isAdmin(
  userId: number | string,
  settingsRepo: Pick<SettingsRepo, 'getAdminId'>
): Promise<boolean> {
  const adminId = await settingsRepo.getAdminId()
  if (!adminId) return false
  return userId.toString() === adminId
}
