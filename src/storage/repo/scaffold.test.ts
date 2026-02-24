import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '@integration/database'
import { createTestContainer, type TestContainer } from '@integration/helpers/container'
import type { ScaffoldRepo } from './scaffold'
import { db } from '~/storage/db'
import { scaffolds } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'

describe('ScaffoldRepo', () => {
  let container: TestContainer
  let scaffoldRepo: ScaffoldRepo

  beforeEach(async () => {
    await clearTestDb()

    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    scaffoldRepo = container.resolve('scaffoldRepository')
  })

  describe('createScaffold', () => {
    it('should create scaffold with all fields', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, '-1d 10:00')

      // Verify return value
      expect(scaffold.id).toMatch(/^sc_/)
      expect(scaffold.dayOfWeek).toBe('Tue')
      expect(scaffold.time).toBe('21:00')
      expect(scaffold.defaultCourts).toBe(2)
      expect(scaffold.isActive).toBe(true)
      expect(scaffold.announcementDeadline).toBe('-1d 10:00')

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].dayOfWeek).toBe('Tue')
      expect(dbResult[0].time).toBe('21:00')
    })

    it('should create scaffold without announcement deadline', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Wed', '19:00', 3)

      // Verify return value
      expect(scaffold.id).toMatch(/^sc_/)
      expect(scaffold.announcementDeadline).toBeUndefined()

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].announcementDeadline).toBeNull()
    })

    it('should generate unique IDs', async () => {
      const scaffold1 = await scaffoldRepo.createScaffold('Mon', '20:00', 2)
      const scaffold2 = await scaffoldRepo.createScaffold('Mon', '20:00', 2)

      // Verify IDs are unique
      expect(scaffold1.id).not.toBe(scaffold2.id)

      // Verify both exist in database
      const dbResult = await db.select().from(scaffolds)
      expect(dbResult).toHaveLength(2)
      expect(dbResult.map((s) => s.id)).toContain(scaffold1.id)
      expect(dbResult.map((s) => s.id)).toContain(scaffold2.id)
    })

    it('should actually persist scaffold to database', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Thu', '20:30', 4, '-2d 15:00')

      // Direct database query to verify
      const result = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(scaffold.id)
      expect(result[0].dayOfWeek).toBe('Thu')
      expect(result[0].time).toBe('20:30')
      expect(result[0].defaultCourts).toBe(4)
      expect(result[0].isActive).toBe(true) // Drizzle converts SQLite integer to boolean
      expect(result[0].announcementDeadline).toBe('-2d 15:00')
    })
  })

  describe('getScaffolds', () => {
    it('should return all scaffolds', async () => {
      await scaffoldRepo.createScaffold('Tue', '21:00', 2)
      await scaffoldRepo.createScaffold('Sat', '18:00', 3)

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds)
      expect(dbResult).toHaveLength(2)

      // Verify repo can read all scaffolds
      const scaffoldsList = await scaffoldRepo.getScaffolds()
      expect(scaffoldsList).toHaveLength(2)
      expect(scaffoldsList[0].dayOfWeek).toBe('Tue')
      expect(scaffoldsList[1].dayOfWeek).toBe('Sat')
    })

    it('should return empty array when no scaffolds', async () => {
      // Verify database is empty
      const dbResult = await db.select().from(scaffolds)
      expect(dbResult).toHaveLength(0)

      // Verify repo returns empty array
      const scaffoldsList = await scaffoldRepo.getScaffolds()
      expect(scaffoldsList).toEqual([])
    })
  })

  describe('findById', () => {
    it('should find scaffold by id', async () => {
      const created = await scaffoldRepo.createScaffold('Wed', '19:00', 2)

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, created.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].dayOfWeek).toBe('Wed')

      // Verify repo can find the scaffold
      const found = await scaffoldRepo.findById(created.id)
      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.dayOfWeek).toBe('Wed')
      expect(found?.time).toBe('19:00')
      expect(found?.defaultCourts).toBe(2)
    })

    it('should return undefined for non-existent id', async () => {
      // Verify database has no such scaffold
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, 'sc_nonexistent'))
      expect(dbResult).toHaveLength(0)

      // Verify repo returns undefined
      const found = await scaffoldRepo.findById('sc_nonexistent')
      expect(found).toBeUndefined()
    })
  })

  describe('setActive', () => {
    it('should activate scaffold', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Thu', '20:00', 2)
      await scaffoldRepo.setActive(scaffold.id, false)
      await scaffoldRepo.setActive(scaffold.id, true)

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].isActive).toBe(true)

      // Verify repo can read the updated value
      const updated = await scaffoldRepo.findById(scaffold.id)
      expect(updated?.isActive).toBe(true)
    })

    it('should deactivate scaffold', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Fri', '21:00', 2)
      const updated = await scaffoldRepo.setActive(scaffold.id, false)

      // Verify return value
      expect(updated.isActive).toBe(false)

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].isActive).toBe(false)
    })

    it('should return updated scaffold', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Sat', '18:00', 3)
      const updated = await scaffoldRepo.setActive(scaffold.id, false)

      // Verify return value
      expect(updated.id).toBe(scaffold.id)
      expect(updated.dayOfWeek).toBe('Sat')
      expect(updated.isActive).toBe(false)

      // Verify via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].isActive).toBe(false)
    })

    it('should actually update isActive in database', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Sun', '11:00', 2)

      // Deactivate scaffold
      await scaffoldRepo.setActive(scaffold.id, false)

      // Direct database query to verify
      const result = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))

      expect(result).toHaveLength(1)
      expect(result[0].isActive).toBe(false) // Drizzle converts SQLite integer to boolean
    })
  })

  describe('remove', () => {
    it('should soft delete scaffold (hidden from findById and getScaffolds)', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Sun', '10:00', 2)
      await scaffoldRepo.remove(scaffold.id)

      // Verify repo cannot find it via findById
      const found = await scaffoldRepo.findById(scaffold.id)
      expect(found).toBeUndefined()

      // Verify repo cannot find it via getScaffolds
      const all = await scaffoldRepo.getScaffolds()
      expect(all.find((s) => s.id === scaffold.id)).toBeUndefined()
    })

    it('should still exist in DB after soft delete (findByIdIncludingDeleted)', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Sun', '10:00', 2)
      await scaffoldRepo.remove(scaffold.id)

      // Verify row still exists via direct DB query
      const dbResult = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(dbResult).toHaveLength(1)
      expect(dbResult[0].deletedAt).not.toBeNull()

      // Verify findByIdIncludingDeleted returns it
      const found = await scaffoldRepo.findByIdIncludingDeleted(scaffold.id)
      expect(found).toBeDefined()
      expect(found?.deletedAt).toBeInstanceOf(Date)
    })

    it('should not affect other scaffolds', async () => {
      const scaffold1 = await scaffoldRepo.createScaffold('Mon', '20:00', 2)
      const scaffold2 = await scaffoldRepo.createScaffold('Tue', '21:00', 3)

      await scaffoldRepo.remove(scaffold1.id)

      // Verify scaffold1 is soft-deleted (still in DB but with deletedAt)
      const dbResult1 = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold1.id))
      expect(dbResult1).toHaveLength(1)
      expect(dbResult1[0].deletedAt).not.toBeNull()

      // Verify scaffold2 is unaffected
      const dbResult2 = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold2.id))
      expect(dbResult2).toHaveLength(1)
      expect(dbResult2[0].deletedAt).toBeNull()

      // Verify repo can still find scaffold2
      const found = await scaffoldRepo.findById(scaffold2.id)
      expect(found).toBeDefined()
    })

    it('should set deletedAt timestamp on scaffold', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Fri', '22:00', 3)

      // Verify it exists in database first with no deletedAt
      const beforeRemove = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(beforeRemove).toHaveLength(1)
      expect(beforeRemove[0].deletedAt).toBeNull()

      // Soft delete scaffold
      await scaffoldRepo.remove(scaffold.id)

      // Verify deletedAt is set
      const afterRemove = await db.select().from(scaffolds).where(eq(scaffolds.id, scaffold.id))
      expect(afterRemove).toHaveLength(1)
      expect(afterRemove[0].deletedAt).not.toBeNull()
    })
  })

  describe('restore', () => {
    it('should restore a soft-deleted scaffold', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Wed', '19:00', 2)
      await scaffoldRepo.remove(scaffold.id)

      // Verify it's hidden
      expect(await scaffoldRepo.findById(scaffold.id)).toBeUndefined()

      // Restore it
      const restored = await scaffoldRepo.restore(scaffold.id)
      expect(restored.id).toBe(scaffold.id)
      expect(restored.deletedAt).toBeUndefined()

      // Verify it's visible again
      const found = await scaffoldRepo.findById(scaffold.id)
      expect(found).toBeDefined()
      expect(found?.dayOfWeek).toBe('Wed')
    })
  })

  describe('updateFields', () => {
    it('should update defaultCourts', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Thu', '20:00', 2)
      const updated = await scaffoldRepo.updateFields(scaffold.id, { defaultCourts: 4 })
      expect(updated.defaultCourts).toBe(4)
    })

    it('should update multiple fields at once', async () => {
      const scaffold = await scaffoldRepo.createScaffold('Fri', '21:00', 2)
      const updated = await scaffoldRepo.updateFields(scaffold.id, {
        dayOfWeek: 'Sat',
        time: '18:00',
      })
      expect(updated.dayOfWeek).toBe('Sat')
      expect(updated.time).toBe('18:00')
    })
  })
})
