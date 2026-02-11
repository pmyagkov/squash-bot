import { describe, it, expect } from 'vitest'
import { isOwnerOrAdmin } from './environment'

describe('isOwnerOrAdmin', () => {
  const mockSettingsRepo = {
    getAdminId: async () => '111111111',
  }

  it('should return true when userId matches ownerId', async () => {
    expect(await isOwnerOrAdmin(123, '123', mockSettingsRepo)).toBe(true)
  })

  it('should return true when userId is global admin', async () => {
    expect(await isOwnerOrAdmin(111111111, '999', mockSettingsRepo)).toBe(true)
  })

  it('should return false when userId is neither owner nor admin', async () => {
    expect(await isOwnerOrAdmin(555, '999', mockSettingsRepo)).toBe(false)
  })

  it('should return true when userId is owner even without global admin configured', async () => {
    const noAdmin = { getAdminId: async () => null }
    expect(await isOwnerOrAdmin(123, '123', noAdmin)).toBe(true)
  })

  it('should return false when ownerId is undefined and user is not admin', async () => {
    expect(await isOwnerOrAdmin(555, undefined, mockSettingsRepo)).toBe(false)
  })
})
