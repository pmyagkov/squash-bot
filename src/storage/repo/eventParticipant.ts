import { db } from '~/storage/db'
import { eventParticipants, participants } from '~/storage/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { EventParticipant } from '~/types'

export class EventParticipantRepo {
  async addToEvent(eventId: string, participantId: string, participations = 1): Promise<void> {
    await db
      .insert(eventParticipants)
      .values({
        eventId,
        participantId,
        participations,
      })
      .onConflictDoUpdate({
        target: [eventParticipants.eventId, eventParticipants.participantId],
        set: {
          participations: sql`${eventParticipants.participations} + ${participations}`,
        },
      })
  }

  async removeFromEvent(eventId: string, participantId: string): Promise<void> {
    // Decrement participations counter
    await db
      .update(eventParticipants)
      .set({
        participations: sql`${eventParticipants.participations} - 1`,
      })
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.participantId, participantId)
        )
      )

    // Remove record if counter reached 0
    await db
      .delete(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.participantId, participantId),
          sql`${eventParticipants.participations} <= 0`
        )
      )
  }

  async getEventParticipants(eventId: string): Promise<EventParticipant[]> {
    const results = await db
      .select({
        id: eventParticipants.id,
        eventId: eventParticipants.eventId,
        participantId: eventParticipants.participantId,
        participations: eventParticipants.participations,
        participantDisplayName: participants.displayName,
        participantTelegramId: participants.telegramId,
        participantTelegramUsername: participants.telegramUsername,
      })
      .from(eventParticipants)
      .innerJoin(participants, eq(eventParticipants.participantId, participants.id))
      .where(eq(eventParticipants.eventId, eventId))

    return results.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      participations: row.participations,
      participant: {
        id: row.participantId,
        displayName: row.participantDisplayName,
        telegramId: row.participantTelegramId ?? undefined,
        telegramUsername: row.participantTelegramUsername ?? undefined,
      },
    }))
  }

  async updateParticipations(
    eventId: string,
    participantId: string,
    participations: number
  ): Promise<void> {
    await db
      .update(eventParticipants)
      .set({ participations })
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.participantId, participantId)
        )
      )
  }
}
