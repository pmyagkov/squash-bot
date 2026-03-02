import { db } from '~/storage/db'
import { notifications } from '~/storage/db/schema'
import { eq, and, lte } from 'drizzle-orm'
import type { Notification, NotificationType, NotificationStatus } from '~/types'

export class NotificationRepo {
  async create(data: {
    type: NotificationType
    status: NotificationStatus
    recipientId: string
    params: Record<string, unknown>
    scheduledAt: Date
  }): Promise<Notification> {
    const [row] = await db
      .insert(notifications)
      .values({
        type: data.type,
        status: data.status,
        recipientId: data.recipientId,
        params: JSON.stringify(data.params),
        scheduledAt: data.scheduledAt,
        createdAt: new Date(),
      })
      .returning()
    return this.toDomain(row)
  }

  async findPendingByTypeAndEventId(
    type: NotificationType,
    eventId: string
  ): Promise<Notification | undefined> {
    const results = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, type), eq(notifications.status, 'pending')))
    // Filter by eventId in params (stored as JSON)
    const match = results.find((r) => {
      const params = JSON.parse(r.params) as Record<string, unknown>
      return params.eventId === eventId
    })
    return match ? this.toDomain(match) : undefined
  }

  async findDue(): Promise<Notification[]> {
    const now = new Date()
    const results = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.status, 'pending'), lte(notifications.scheduledAt, now)))
    return results.map((r) => this.toDomain(r))
  }

  async updateStatus(id: number, status: NotificationStatus, sentAt?: Date): Promise<Notification> {
    const [row] = await db
      .update(notifications)
      .set({
        status,
        ...(sentAt !== undefined && { sentAt }),
      })
      .where(eq(notifications.id, id))
      .returning()
    return this.toDomain(row)
  }

  async updateScheduledAt(id: number, scheduledAt: Date): Promise<Notification> {
    const [row] = await db
      .update(notifications)
      .set({ scheduledAt })
      .where(eq(notifications.id, id))
      .returning()
    return this.toDomain(row)
  }

  async updateMessageRef(id: number, messageId: string, chatId: string): Promise<Notification> {
    const [row] = await db
      .update(notifications)
      .set({ messageId, chatId })
      .where(eq(notifications.id, id))
      .returning()
    return this.toDomain(row)
  }

  async findSentByTypeAndEventId(
    type: NotificationType,
    eventId: string
  ): Promise<Notification | undefined> {
    const results = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, type), eq(notifications.status, 'sent')))
    const match = results.find((r) => {
      const params = JSON.parse(r.params) as Record<string, unknown>
      return params.eventId === eventId
    })
    return match ? this.toDomain(match) : undefined
  }

  private toDomain(row: typeof notifications.$inferSelect): Notification {
    return {
      id: row.id,
      type: row.type as NotificationType,
      status: row.status as NotificationStatus,
      recipientId: row.recipientId,
      params: JSON.parse(row.params) as Record<string, unknown>,
      scheduledAt: row.scheduledAt,
      sentAt: row.sentAt ?? undefined,
      createdAt: row.createdAt,
      messageId: row.messageId ?? undefined,
      chatId: row.chatId ?? undefined,
    }
  }
}
