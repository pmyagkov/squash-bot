import { db } from '~/storage/db'
import { scaffolds, scaffoldMembers, participants } from '~/storage/db/schema'
import { eq, isNull, isNotNull, and } from 'drizzle-orm'
import type { Scaffold, DayOfWeek, Participant } from '~/types'
import { nanoid } from 'nanoid'

export class ScaffoldRepo {
  async getScaffolds(): Promise<Scaffold[]> {
    const results = await db.select().from(scaffolds).where(isNull(scaffolds.deletedAt))
    return results.map((r) => this.toDomain(r))
  }

  async findById(id: string): Promise<Scaffold | undefined> {
    const result = await db.query.scaffolds.findFirst({
      where: and(eq(scaffolds.id, id), isNull(scaffolds.deletedAt)),
    })
    return result ? this.toDomain(result) : undefined
  }

  async findByIdWithParticipants(id: string): Promise<Scaffold | undefined> {
    const result = await db.query.scaffolds.findFirst({
      where: and(eq(scaffolds.id, id), isNull(scaffolds.deletedAt)),
    })
    return result ? this.toDomainWithMembers(result) : undefined
  }

  async findByIdIncludingDeleted(id: string): Promise<Scaffold | undefined> {
    const result = await db.query.scaffolds.findFirst({
      where: eq(scaffolds.id, id),
    })
    return result ? this.toDomain(result) : undefined
  }

  async getDeletedScaffolds(): Promise<Scaffold[]> {
    const results = await db.select().from(scaffolds).where(isNotNull(scaffolds.deletedAt))
    return results.map((r) => this.toDomain(r))
  }

  async createScaffold(
    dayOfWeek: DayOfWeek,
    time: string,
    courts: number,
    announcementDeadline?: string,
    ownerId?: string,
    isPrivate?: boolean
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
        isPrivate: isPrivate ?? false,
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
    fields: Partial<{ dayOfWeek: string; time: string; defaultCourts: number; isActive: boolean; isPrivate: boolean }>
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

  async addParticipant(scaffoldId: string, participantId: string): Promise<void> {
    const id = `sm_${nanoid(8)}`
    await db.insert(scaffoldMembers).values({ id, scaffoldId, participantId }).onConflictDoNothing()
  }

  async removeParticipant(scaffoldId: string, participantId: string): Promise<void> {
    await db.delete(scaffoldMembers).where(
      and(eq(scaffoldMembers.scaffoldId, scaffoldId), eq(scaffoldMembers.participantId, participantId))
    )
  }

  private async loadParticipants(scaffoldId: string): Promise<Participant[]> {
    const rows = await db
      .select({
        id: participants.id,
        displayName: participants.displayName,
        telegramId: participants.telegramId,
        telegramUsername: participants.telegramUsername,
      })
      .from(scaffoldMembers)
      .innerJoin(participants, eq(scaffoldMembers.participantId, participants.id))
      .where(eq(scaffoldMembers.scaffoldId, scaffoldId))

    return rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      telegramId: r.telegramId ?? undefined,
      telegramUsername: r.telegramUsername ?? undefined,
    }))
  }

  /** Full domain mapping with participants loaded via JOIN — used for reads */
  private async toDomainWithMembers(row: typeof scaffolds.$inferSelect): Promise<Scaffold> {
    const memberList = await this.loadParticipants(row.id)
    return {
      ...this.toDomain(row),
      participants: memberList,
    }
  }

  /** Fast domain mapping without loading participants — used for writes */
  private toDomain(row: typeof scaffolds.$inferSelect): Scaffold {
    return {
      id: row.id,
      dayOfWeek: row.dayOfWeek as DayOfWeek,
      time: row.time,
      defaultCourts: row.defaultCourts,
      isActive: row.isActive,
      announcementDeadline: row.announcementDeadline ?? undefined,
      ownerId: row.ownerId ?? undefined,
      isPrivate: row.isPrivate,
      participants: [],
      deletedAt: row.deletedAt ?? undefined,
    }
  }
}
