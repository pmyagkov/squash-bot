import { db } from '~/storage/db'
import { scaffolds } from '~/storage/db/schema'
import { eq, isNull, isNotNull, and } from 'drizzle-orm'
import type { Scaffold, DayOfWeek } from '~/types'
import { nanoid } from 'nanoid'

export class ScaffoldRepo {
  async getScaffolds(): Promise<Scaffold[]> {
    const results = await db.select().from(scaffolds).where(isNull(scaffolds.deletedAt))
    return results.map(this.toDomain)
  }

  async findById(id: string): Promise<Scaffold | undefined> {
    const result = await db.query.scaffolds.findFirst({
      where: and(eq(scaffolds.id, id), isNull(scaffolds.deletedAt)),
    })
    return result ? this.toDomain(result) : undefined
  }

  async findByIdIncludingDeleted(id: string): Promise<Scaffold | undefined> {
    const result = await db.query.scaffolds.findFirst({
      where: eq(scaffolds.id, id),
    })
    return result ? this.toDomain(result) : undefined
  }

  async getDeletedScaffolds(): Promise<Scaffold[]> {
    const results = await db.select().from(scaffolds).where(isNotNull(scaffolds.deletedAt))
    return results.map(this.toDomain)
  }

  async createScaffold(
    dayOfWeek: DayOfWeek,
    time: string,
    courts: number,
    announcementDeadline?: string,
    ownerId?: string
  ): Promise<Scaffold> {
    const id = `sc_${nanoid(8)}`

    const [scaffold] = await db
      .insert(scaffolds)
      .values({
        id,
        dayOfWeek,
        time,
        defaultCourts: courts,
        isActive: true,
        announcementDeadline,
        ownerId,
      })
      .returning()

    return this.toDomain(scaffold)
  }

  async setActive(id: string, isActive: boolean): Promise<Scaffold> {
    const [scaffold] = await db
      .update(scaffolds)
      .set({ isActive })
      .where(eq(scaffolds.id, id))
      .returning()

    return this.toDomain(scaffold)
  }

  async remove(id: string): Promise<void> {
    await db.update(scaffolds).set({ deletedAt: new Date() }).where(eq(scaffolds.id, id))
  }

  async restore(id: string): Promise<Scaffold> {
    const [scaffold] = await db
      .update(scaffolds)
      .set({ deletedAt: null })
      .where(eq(scaffolds.id, id))
      .returning()

    return this.toDomain(scaffold)
  }

  async updateFields(
    id: string,
    fields: Partial<{ dayOfWeek: string; time: string; defaultCourts: number; isActive: boolean }>
  ): Promise<Scaffold> {
    const [scaffold] = await db
      .update(scaffolds)
      .set(fields)
      .where(eq(scaffolds.id, id))
      .returning()

    return this.toDomain(scaffold)
  }

  async updateOwner(id: string, ownerId: string): Promise<Scaffold> {
    const [scaffold] = await db
      .update(scaffolds)
      .set({ ownerId })
      .where(eq(scaffolds.id, id))
      .returning()

    return this.toDomain(scaffold)
  }

  private toDomain(row: typeof scaffolds.$inferSelect): Scaffold {
    return {
      id: row.id,
      dayOfWeek: row.dayOfWeek as DayOfWeek,
      time: row.time,
      defaultCourts: row.defaultCourts,
      isActive: row.isActive,
      announcementDeadline: row.announcementDeadline ?? undefined,
      ownerId: row.ownerId ?? undefined,
      deletedAt: row.deletedAt ?? undefined,
    }
  }
}
