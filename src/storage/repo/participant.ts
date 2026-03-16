import { nanoid } from 'nanoid'
import { db } from '~/storage/db'
import { participants } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import type { Participant, EventParticipant } from '~/types'
import type { AppContainer } from '../../container'
import type { EventParticipantRepo } from './eventParticipant'

export class ParticipantRepo {
  private eventParticipantRepository: EventParticipantRepo

  constructor(container: AppContainer) {
    this.eventParticipantRepository = container.resolve('eventParticipantRepository')
  }
  async getParticipants(): Promise<Participant[]> {
    const results = await db.select().from(participants)
    return results.map(this.toDomain)
  }

  async findById(id: string): Promise<Participant | undefined> {
    const result = await db.query.participants.findFirst({
      where: eq(participants.id, id),
    })
    return result ? this.toDomain(result) : undefined
  }

  async findByTelegramId(telegramId: string): Promise<Participant | undefined> {
    const result = await db.query.participants.findFirst({
      where: eq(participants.telegramId, telegramId),
    })
    return result ? this.toDomain(result) : undefined
  }

  async findByUsername(username: string): Promise<Participant | undefined> {
    const result = await db.query.participants.findFirst({
      where: eq(participants.telegramUsername, username),
    })
    return result ? this.toDomain(result) : undefined
  }

  async findOrCreateParticipant(
    telegramId: string,
    username?: string,
    displayName?: string
  ): Promise<{ participant: Participant; isNew: boolean }> {
    const existing = await this.findByTelegramId(telegramId)
    if (existing) {
      // Update if username or displayName changed
      const newUsername = username ?? existing.telegramUsername
      const newDisplayName = displayName || existing.displayName
      if (newUsername !== existing.telegramUsername || newDisplayName !== existing.displayName) {
        const [updated] = await db
          .update(participants)
          .set({
            telegramUsername: newUsername,
            displayName: newDisplayName,
          })
          .where(eq(participants.id, existing.id))
          .returning()
        return { participant: this.toDomain(updated), isNew: false }
      }
      return { participant: existing, isNew: false }
    }

    // Create new participant
    const id = `pt_${nanoid(8)}`
    const finalDisplayName = displayName || username || `User ${telegramId}`

    const [participant] = await db
      .insert(participants)
      .values({
        id,
        telegramId,
        telegramUsername: username,
        displayName: finalDisplayName,
      })
      .returning()

    return { participant: this.toDomain(participant), isNew: true }
  }

  async updatePaymentInfo(participantId: string, paymentInfo: string): Promise<void> {
    await db.update(participants).set({ paymentInfo }).where(eq(participants.id, participantId))
  }

  private toDomain(row: typeof participants.$inferSelect): Participant {
    return {
      id: row.id,
      telegramId: row.telegramId ?? undefined,
      telegramUsername: row.telegramUsername ?? undefined,
      displayName: row.displayName,
      paymentInfo: row.paymentInfo ?? undefined,
    }
  }

  async markAsOut(eventId: string, participantId: string): Promise<void> {
    return this.eventParticipantRepository.markAsOut(eventId, participantId)
  }

  async findEventParticipant(
    eventId: string,
    participantId: string
  ): Promise<EventParticipant | null> {
    return this.eventParticipantRepository.findEventParticipant(eventId, participantId)
  }

  // Legacy methods - these delegate to EventParticipantService
  // These will be removed once all code is migrated
  async addToEvent(
    eventId: string,
    participantId: string,
    participations = 1
  ): Promise<{ participations: number }> {
    return this.eventParticipantRepository.addToEvent(eventId, participantId, participations)
  }

  async removeFromEvent(eventId: string, participantId: string): Promise<void> {
    return this.eventParticipantRepository.removeFromEvent(eventId, participantId)
  }

  async getEventParticipants(eventId: string): Promise<EventParticipant[]> {
    return this.eventParticipantRepository.getEventParticipants(eventId)
  }
}
