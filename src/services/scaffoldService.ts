import { db } from '~/storage/db'
import { scaffolds } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import type { Scaffold, DayOfWeek } from '~/types'
import { nanoid } from 'nanoid'

class ScaffoldService {
  async getScaffolds(): Promise<Scaffold[]> {
    const results = await db.select().from(scaffolds)
    return results.map(this.toDomain)
  }

  async findById(id: string): Promise<Scaffold | undefined> {
    const result = await db.query.scaffolds.findFirst({
      where: eq(scaffolds.id, id),
    })
    return result ? this.toDomain(result) : undefined
  }

  async createScaffold(
    dayOfWeek: DayOfWeek,
    time: string,
    courts: number,
    announcementDeadline?: string
  ): Promise<Scaffold> {
    const id = `sc_${nanoid(10)}`

    const [scaffold] = await db
      .insert(scaffolds)
      .values({
        id,
        dayOfWeek,
        time,
        defaultCourts: courts,
        isActive: true,
        announcementDeadline,
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
    await db.delete(scaffolds).where(eq(scaffolds.id, id))
  }

  private toDomain(row: typeof scaffolds.$inferSelect): Scaffold {
    return {
      id: row.id,
      dayOfWeek: row.dayOfWeek as DayOfWeek,
      time: row.time,
      defaultCourts: row.defaultCourts,
      isActive: row.isActive,
      announcementDeadline: row.announcementDeadline ?? undefined,
    }
  }
}

export const scaffoldService = new ScaffoldService()
