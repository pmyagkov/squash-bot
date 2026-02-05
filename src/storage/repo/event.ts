import { nanoid } from 'nanoid'
import { db } from '~/storage/db'
import { events } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import type { Event, EventStatus } from '~/types'

const EVENT_STATUSES: EventStatus[] = [
  'created',
  'announced',
  'cancelled',
  'finished',
  'finalized',
  'paid',
]

export class EventRepo {
  async getEvents(): Promise<Event[]> {
    const results = await db.select().from(events)
    return results.map(this.toDomain)
  }

  async findById(id: string): Promise<Event | undefined> {
    const result = await db.query.events.findFirst({
      where: eq(events.id, id),
    })
    return result ? this.toDomain(result) : undefined
  }

  async findByMessageId(messageId: string): Promise<Event | undefined> {
    const result = await db.query.events.findFirst({
      where: eq(events.telegramMessageId, messageId),
    })
    return result ? this.toDomain(result) : undefined
  }

  async createEvent(data: {
    scaffoldId?: string
    datetime: Date
    courts: number
    status?: EventStatus
  }): Promise<Event> {
    const id = `ev_${nanoid(8)}`
    const status = data.status || 'created'

    // Validate status
    if (!EVENT_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid values: ${EVENT_STATUSES.join(', ')}`)
    }

    const [event] = await db
      .insert(events)
      .values({
        id,
        scaffoldId: data.scaffoldId ?? null,
        datetime: data.datetime,
        courts: data.courts,
        status,
      })
      .returning()

    return this.toDomain(event)
  }

  async updateEvent(
    id: string,
    updates: {
      status?: EventStatus
      telegramMessageId?: string
      paymentMessageId?: string
      courts?: number
    }
  ): Promise<Event> {
    // Validate status if provided
    if (updates.status && !EVENT_STATUSES.includes(updates.status)) {
      throw new Error(`Invalid status: ${updates.status}`)
    }

    const [event] = await db
      .update(events)
      .set({
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.telegramMessageId !== undefined && {
          telegramMessageId: updates.telegramMessageId,
        }),
        ...(updates.paymentMessageId !== undefined && {
          paymentMessageId: updates.paymentMessageId,
        }),
        ...(updates.courts !== undefined && { courts: updates.courts }),
      })
      .where(eq(events.id, id))
      .returning()

    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    return this.toDomain(event)
  }

  private toDomain(row: typeof events.$inferSelect): Event {
    return {
      id: row.id,
      scaffoldId: row.scaffoldId ?? undefined,
      datetime: row.datetime,
      courts: row.courts,
      status: row.status as EventStatus,
      telegramMessageId: row.telegramMessageId ?? undefined,
      paymentMessageId: row.paymentMessageId ?? undefined,
    }
  }
}
