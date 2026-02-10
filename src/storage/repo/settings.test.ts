import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '@integration/database'
import { createTestContainer, type TestContainer } from '@integration/helpers/container'
import type { SettingsRepo } from './settings'
import { db } from '~/storage/db'
import { settings } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'

describe('SettingsRepo', () => {
  let container: TestContainer
  let settingsRepo: SettingsRepo

  beforeEach(async () => {
    await clearTestDb()

    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    settingsRepo = container.resolve('settingsRepository')
  })

  describe('setSetting', () => {
    it('should set and get a setting', async () => {
      await settingsRepo.setSetting('test_key', 'test_value')

      // Verify via direct DB query
      const dbResult = await db.select().from(settings).where(eq(settings.key, 'test_key'))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].value).toBe('test_value')

      // Verify repo can read what was written
      const value = await settingsRepo.getSetting('test_key')
      expect(value).toBe('test_value')
    })

    it('should actually persist setting to database', async () => {
      await settingsRepo.setSetting('db_test_key', 'db_test_value')

      // Direct database query to verify
      const result = await db.select().from(settings).where(eq(settings.key, 'db_test_key'))

      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('db_test_key')
      expect(result[0].value).toBe('db_test_value')
    })

    it('should update existing setting in database', async () => {
      await settingsRepo.setSetting('update_db_key', 'old_value')
      await settingsRepo.setSetting('update_db_key', 'new_value')

      // Direct database query to verify update
      const result = await db.select().from(settings).where(eq(settings.key, 'update_db_key'))

      expect(result).toHaveLength(1) // Should still be only one record, not two
      expect(result[0].value).toBe('new_value')
    })
  })

  describe('getSettings', () => {
    it('should return all settings as a map', async () => {
      await settingsRepo.setSetting('key1', 'value1')
      await settingsRepo.setSetting('key2', 'value2')
      await settingsRepo.setSetting('key3', 'value3')

      // Verify via direct DB query
      const dbResult = await db.select().from(settings)
      expect(dbResult).toHaveLength(3)

      // Verify repo can read all settings
      const settingsMap = await settingsRepo.getSettings()
      expect(settingsMap).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      })
    })

    it('should return empty map when no settings', async () => {
      // Verify database is empty
      const dbResult = await db.select().from(settings)
      expect(dbResult).toHaveLength(0)

      // Verify repo returns empty map
      const settingsMap = await settingsRepo.getSettings()
      expect(settingsMap).toEqual({})
    })
  })

  describe('getter methods', () => {
    describe('should return value from settings', () => {
      it.each([
        {
          methodName: 'getCourtPrice',
          key: 'court_price',
          setValue: '2500',
          expectedValue: 2500,
          getter: () => settingsRepo.getCourtPrice(),
        },
        {
          methodName: 'getTimezone',
          key: 'timezone',
          setValue: 'Europe/Moscow',
          expectedValue: 'Europe/Moscow',
          getter: () => settingsRepo.getTimezone(),
        },
        {
          methodName: 'getAnnouncementDeadline',
          key: 'announcement_deadline',
          setValue: '-2d 10:00',
          expectedValue: '-2d 10:00',
          getter: () => settingsRepo.getAnnouncementDeadline(),
        },
        {
          methodName: 'getCancellationDeadline',
          key: 'cancellation_deadline',
          setValue: '-1d 20:00',
          expectedValue: '-1d 20:00',
          getter: () => settingsRepo.getCancellationDeadline(),
        },
        {
          methodName: 'getMaxPlayersPerCourt',
          key: 'max_players_per_court',
          setValue: '6',
          expectedValue: 6,
          getter: () => settingsRepo.getMaxPlayersPerCourt(),
        },
        {
          methodName: 'getMinPlayersPerCourt',
          key: 'min_players_per_court',
          setValue: '3',
          expectedValue: 3,
          getter: () => settingsRepo.getMinPlayersPerCourt(),
        },
        {
          methodName: 'getMainChatId',
          key: 'main_chat_id',
          setValue: '-1001234567890',
          expectedValue: -1001234567890,
          getter: () => settingsRepo.getMainChatId(),
        },
        {
          methodName: 'getAdminId',
          key: 'admin_id',
          setValue: '123456789',
          expectedValue: '123456789',
          getter: () => settingsRepo.getAdminId(),
        },
      ])(
        '$methodName should return $key from settings',
        async ({ key, setValue, expectedValue, getter }) => {
          await settingsRepo.setSetting(key, setValue)

          // Verify via direct DB query
          const dbResult = await db.select().from(settings).where(eq(settings.key, key))
          expect(dbResult).toHaveLength(1)
          expect(dbResult[0].value).toBe(setValue)

          // Verify repo can read/parse and return the value
          const value = await getter()
          expect(value).toBe(expectedValue)
        }
      )
    })

    describe('should return default value when not set', () => {
      it.each([
        {
          methodName: 'getCourtPrice',
          key: 'court_price',
          defaultValue: 2000,
          getter: () => settingsRepo.getCourtPrice(),
        },
        {
          methodName: 'getTimezone',
          key: 'timezone',
          defaultValue: 'Europe/Belgrade',
          getter: () => settingsRepo.getTimezone(),
        },
        {
          methodName: 'getAnnouncementDeadline',
          key: 'announcement_deadline',
          defaultValue: '-1d 12:00',
          getter: () => settingsRepo.getAnnouncementDeadline(),
        },
        {
          methodName: 'getCancellationDeadline',
          key: 'cancellation_deadline',
          defaultValue: '-1d 23:00',
          getter: () => settingsRepo.getCancellationDeadline(),
        },
        {
          methodName: 'getMaxPlayersPerCourt',
          key: 'max_players_per_court',
          defaultValue: 4,
          getter: () => settingsRepo.getMaxPlayersPerCourt(),
        },
        {
          methodName: 'getMinPlayersPerCourt',
          key: 'min_players_per_court',
          defaultValue: 2,
          getter: () => settingsRepo.getMinPlayersPerCourt(),
        },
        {
          methodName: 'getMainChatId',
          key: 'main_chat_id',
          defaultValue: null,
          getter: () => settingsRepo.getMainChatId(),
        },
        {
          methodName: 'getAdminId',
          key: 'admin_id',
          defaultValue: null,
          getter: () => settingsRepo.getAdminId(),
        },
      ])(
        '$methodName should return default $key ($defaultValue) when not set',
        async ({ key, defaultValue, getter }) => {
          // Verify database has no setting
          const dbResult = await db.select().from(settings).where(eq(settings.key, key))
          expect(dbResult).toHaveLength(0)

          // Verify repo returns default
          const value = await getter()
          expect(value).toBe(defaultValue)
        }
      )
    })
  })
})
