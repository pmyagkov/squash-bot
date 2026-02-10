import { describe, it, expect, vi } from 'vitest'
import { isAdmin, isTestEnvironment } from './environment'

vi.mock('../config', () => ({
  config: {
    environment: 'test',
  },
}))

describe('environment utilities', () => {
  describe('isAdmin', () => {
    const mockSettingsRepo = {
      getAdminId: vi.fn(),
    }

    it('should return true when userId matches admin_id from settings', async () => {
      mockSettingsRepo.getAdminId.mockResolvedValue('123456789')

      expect(await isAdmin('123456789', mockSettingsRepo)).toBe(true)
      expect(await isAdmin(123456789, mockSettingsRepo)).toBe(true)
    })

    it('should return false when userId differs from admin_id', async () => {
      mockSettingsRepo.getAdminId.mockResolvedValue('123456789')

      expect(await isAdmin('987654321', mockSettingsRepo)).toBe(false)
      expect(await isAdmin(987654321, mockSettingsRepo)).toBe(false)
    })

    it('should return false when admin_id is not set in settings', async () => {
      mockSettingsRepo.getAdminId.mockResolvedValue(null)

      expect(await isAdmin('123456789', mockSettingsRepo)).toBe(false)
    })
  })

  describe('isTestEnvironment', () => {
    it('should return true when config.environment is "test"', () => {
      expect(isTestEnvironment()).toBe(true)
    })
  })
})
