import { db } from '~/storage/db'
import { eventAnnouncements } from '~/storage/db/schema'
import { eq, desc } from 'drizzle-orm'
import type { EventAnnouncement } from '~/types'

export class EventAnnouncementRepo {
  async create(
    eventId: string,
    telegramMessageId: string,
    telegramChatId: string
  ): Promise<EventAnnouncement> {
    const [row] = await db
      .insert(eventAnnouncements)
      .values({
        eventId,
        telegramMessageId: String(telegramMessageId),
        telegramChatId: String(telegramChatId),
      })
      .returning()

    return {
      id: row.id,
      eventId: row.eventId,
      telegramMessageId: row.telegramMessageId,
      telegramChatId: row.telegramChatId,
    }
  }

  async getByEventId(eventId: string): Promise<EventAnnouncement[]> {
    const rows = await db
      .select()
      .from(eventAnnouncements)
      .where(eq(eventAnnouncements.eventId, eventId))

    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      telegramMessageId: row.telegramMessageId,
      telegramChatId: row.telegramChatId,
    }))
  }

  async findEventByMessageId(messageId: string): Promise<string | null> {
    const rows = await db
      .select({ eventId: eventAnnouncements.eventId })
      .from(eventAnnouncements)
      .where(eq(eventAnnouncements.telegramMessageId, messageId))
      .limit(1)

    return rows.length > 0 ? rows[0].eventId : null
  }

  async getLastByChatId(chatId: string): Promise<EventAnnouncement | null> {
    const rows = await db
      .select()
      .from(eventAnnouncements)
      .where(eq(eventAnnouncements.telegramChatId, chatId))
      .orderBy(desc(eventAnnouncements.id))
      .limit(1)

    if (rows.length === 0) {
      return null
    }

    const row = rows[0]
    return {
      id: row.id,
      eventId: row.eventId,
      telegramMessageId: row.telegramMessageId,
      telegramChatId: row.telegramChatId,
    }
  }

  async deleteByEventId(eventId: string): Promise<void> {
    await db.delete(eventAnnouncements).where(eq(eventAnnouncements.eventId, eventId))
  }
}
