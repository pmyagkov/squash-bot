import { nanoid } from 'nanoid'
import { Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { db } from '~/storage/db'
import { events } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import type { Event, EventStatus } from '~/types'
import { config } from '~/config'
import { logToTelegram } from '~/utils/logger'
import { scaffoldRepo } from '~/storage/repo/scaffold'
import * as eventBusiness from '~/business/event'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

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

  async cancelEvent(id: string, bot?: Bot): Promise<Event> {
    const event = await this.findById(id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    const updatedEvent = await this.updateEvent(id, { status: 'cancelled' })

    // Send notification if event was announced
    if (event.status === 'announced' && event.telegramMessageId && bot) {
      const chatIdToUse = config.telegram.mainChatId
      try {
        await bot.api.sendMessage(chatIdToUse, `❌ Event ${id} has been cancelled.`)
      } catch (error) {
        await logToTelegram(
          `Failed to send cancellation notification: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
      }
    }

    return updatedEvent
  }

  buildInlineKeyboard(status: EventStatus): InlineKeyboard {
    if (status === 'cancelled') {
      // Show only Restore button
      return new InlineKeyboard().text('🔄 Restore', 'event:restore')
    }

    if (status === 'finalized') {
      // No buttons for finalized events
      return new InlineKeyboard()
    }

    // Active event (announced status)
    return new InlineKeyboard()
      .text("I'm in", 'event:join')
      .text("I'm out", 'event:leave')
      .row()
      .text('+court', 'event:add_court')
      .text('-court', 'event:rm_court')
      .row()
      .text('✅ Finalize', 'event:finalize')
      .text('❌ Cancel', 'event:cancel')
  }

  async announceEvent(id: string, bot: Bot): Promise<Event> {
    const event = await this.findById(id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    const chatIdToUse = config.telegram.mainChatId

    try {
      // 1. Unpin all previous pinned messages
      try {
        await bot.api.unpinAllChatMessages(chatIdToUse)
      } catch (error) {
        // Ignore errors if there are no pinned messages
        await logToTelegram(
          `Note: Could not unpin messages (may be none): ${error instanceof Error ? error.message : String(error)}`,
          'info'
        )
      }

      // 2. Format message
      const eventDate = dayjs.tz(event.datetime, config.timezone)
      const dayName = eventDate.format('dddd')
      const dateStr = eventDate.format('D MMMM')
      const timeStr = eventDate.format('HH:mm')

      const messageText = `🎾 Squash: ${dayName}, ${dateStr}, ${timeStr}
Courts: ${event.courts}

Participants:
(nobody yet)`

      // 3. Create inline keyboard
      const keyboard = this.buildInlineKeyboard('announced')

      // 4. Send message
      const sentMessage = await bot.api.sendMessage(chatIdToUse, messageText, {
        reply_markup: keyboard,
      })

      // 5. Pin message
      await bot.api.pinChatMessage(chatIdToUse, sentMessage.message_id)

      // 6. Save telegram_message_id and update status
      const updatedEvent = await this.updateEvent(id, {
        telegramMessageId: String(sentMessage.message_id),
        status: 'announced',
      })

      await logToTelegram(`Event ${id} announced in chat ${chatIdToUse}`, 'info')

      return updatedEvent
    } catch (error) {
      await logToTelegram(
        `Failed to announce event ${id}: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
      throw error
    }
  }


  async checkAndCreateEventsFromScaffolds(bot: Bot): Promise<number> {
    const scaffolds = await scaffoldRepo.getScaffolds()
    const activeScaffolds = scaffolds.filter((s) => s.isActive)

    let createdCount = 0

    for (const scaffold of activeScaffolds) {
      try {
        const nextOccurrence = eventBusiness.calculateNextOccurrence(scaffold)

        // Check if event already exists
        const allEvents = await this.getEvents()
        const exists = eventBusiness.eventExists(allEvents, scaffold.id, nextOccurrence)
        if (exists) {
          continue
        }

        // Check if it's time to create
        if (!(await eventBusiness.shouldCreateEvent(scaffold, nextOccurrence))) {
          continue
        }

        // Create event
        const event = await this.createEvent({
          scaffoldId: scaffold.id,
          datetime: nextOccurrence,
          courts: scaffold.defaultCourts,
          status: 'created',
        })

        // Immediately announce
        await this.announceEvent(event.id, bot)

        createdCount++
        await logToTelegram(
          `Created and announced event ${event.id} from scaffold ${scaffold.id}`,
          'info'
        )
      } catch (error) {
        await logToTelegram(
          `Failed to create event from scaffold ${scaffold.id}: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
      }
    }

    return createdCount
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

export const eventRepo = new EventRepo()
