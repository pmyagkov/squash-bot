import { nanoid } from 'nanoid'
import { Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { notionClient } from '~/storage/client'
import { Event, EventStatus, Scaffold, DayOfWeek } from '~/types'
import { getDatabases } from '~/utils/environment'
import { config } from '~/config'
import { logToTelegram } from '~/utils/logger'
import { scaffoldService } from '~/services/scaffoldService'
import { settingsService } from '~/services/settingsService'
import { shouldTrigger } from '~/utils/timeOffset'
import {
  NotionDateProperty,
  NotionNumberProperty,
  NotionRelationProperty,
  NotionRichTextProperty,
  NotionSelectProperty,
  NotionTitleProperty,
} from '~/types/notion'
import { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

const DAY_OF_WEEK_TO_NUMBER: Record<DayOfWeek, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
}

const EVENT_STATUSES: EventStatus[] = [
  'created',
  'announced',
  'cancelled',
  'finished',
  'finalized',
  'paid',
]

export type EventNotionProperties = {
  id: NotionTitleProperty
  datetime: NotionDateProperty
  courts: NotionNumberProperty
  status: NotionSelectProperty
  scaffold_id?: NotionRelationProperty
  telegram_message_id?: NotionRichTextProperty
  payment_message_id?: NotionRichTextProperty
}

// Helper type for creating/updating properties (without id and type fields)
type EventNotionPropertiesInput = {
  id: { title: { text: { content: string } }[] }
  datetime: { date: { start: string } }
  courts: { number: number }
  status: { select: { name: EventStatus } }
  scaffold_id?: { relation: { id: string }[] }
  telegram_message_id?: { rich_text: { text: { content: string } }[] }
  payment_message_id?: { rich_text: { text: { content: string } }[] }
}

export class EventService {
  /**
   * Get all events from Notion
   */
  async getEvents(chatId: number | string): Promise<Event[]> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.events) {
      throw new Error(`Events database ID is not configured. ChatId: ${chatId}`)
    }

    const response = await client.databases.query({
      database_id: databases.events,
    })

    // Log full response payload from Notion database for debugging
    console.log('=== Notion Events Query Response ===')
    console.log(JSON.stringify(response, null, 2))
    console.log('=== End of Response ===')

    const events: Event[] = []
    for (const page of response.results) {
      // Log each page payload
      console.log('=== Notion Event Page Payload ===')
      console.log(JSON.stringify(page, null, 2))
      console.log('=== End of Page Payload ===')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events.push(await this.mapNotionPageToEvent(page as any))
    }
    return events
  }

  /**
   * Get event by ID
   */
  async getEventById(chatId: number | string, id: string): Promise<Event | null> {
    const events = await this.getEvents(chatId)
    return events.find((e) => e.id === id) || null
  }

  /**
   * Get event by telegram message ID
   */
  async getByMessageId(chatId: number | string, messageId: string): Promise<Event | null> {
    const events = await this.getEvents(chatId)
    return events.find((e) => e.telegram_message_id === messageId) || null
  }

  /**
   * Create a new event
   */
  async createEvent(
    chatId: number | string,
    data: {
      scaffold_id?: string
      datetime: Date
      courts: number
      status?: EventStatus
    }
  ): Promise<Event> {
    const client = notionClient.getClient()
    const databases = getDatabases()

    if (!databases.events) {
      throw new Error(`Events database ID is not configured. ChatId: ${chatId}`)
    }

    const rawId = nanoid(4)
    const id = `ev_${rawId}`
    const status = data.status || 'created'

    // Validate status
    if (!EVENT_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid values: ${EVENT_STATUSES.join(', ')}`)
    }

    // Properties object for Notion API - structure matches Notion's expected format
    const properties: EventNotionPropertiesInput = {
      id: {
        title: [
          {
            text: {
              content: id,
            },
          },
        ],
      },
      datetime: {
        date: {
          start: data.datetime.toISOString(),
        },
      },
      courts: {
        number: data.courts,
      },
      status: {
        select: {
          name: status,
        },
      },
    }

    // Add scaffold_id relation if provided
    if (data.scaffold_id) {
      // Find scaffold page ID
      const scaffolds = await client.databases.query({
        database_id: databases.scaffolds!,
        filter: {
          property: 'id',
          title: {
            equals: data.scaffold_id,
          },
        },
      })

      if (scaffolds.results.length === 0) {
        throw new Error(`Scaffold ${data.scaffold_id} not found`)
      }

      properties.scaffold_id = {
        relation: [
          {
            id: scaffolds.results[0].id,
          },
        ],
      }
    }

    const response = await client.pages.create({
      parent: {
        database_id: databases.events,
      },

      properties,
    })

    // Log created page payload
    console.log('=== Notion Created Event Page Payload ===')
    console.log(JSON.stringify(response, null, 2))
    console.log('=== End of Created Page Payload ===')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await this.mapNotionPageToEvent(response as any)
  }

  /**
   * Update event properties
   */
  async updateEvent(
    chatId: number | string,
    id: string,
    updates: {
      status?: EventStatus
      telegram_message_id?: string
      payment_message_id?: string
      courts?: number
    }
  ): Promise<Event> {
    const event = await this.getEventById(chatId, id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    const client = notionClient.getClient()
    const databases = getDatabases()

    // Find the page ID for this event
    const events = await client.databases.query({
      database_id: databases.events!,
      filter: {
        property: 'id',
        title: {
          equals: id,
        },
      },
    })

    if (events.results.length === 0) {
      throw new Error(`Event ${id} not found`)
    }

    const pageId = events.results[0].id

    // Properties object for Notion API - structure matches Notion's expected format
    const properties: Partial<EventNotionPropertiesInput> = {}

    if (updates.status !== undefined) {
      if (!EVENT_STATUSES.includes(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}`)
      }
      properties.status = {
        select: {
          name: updates.status,
        },
      }
    }

    if (updates.telegram_message_id !== undefined) {
      properties.telegram_message_id = {
        rich_text: [
          {
            text: {
              content: updates.telegram_message_id,
            },
          },
        ],
      }
    }

    if (updates.payment_message_id !== undefined) {
      properties.payment_message_id = {
        rich_text: [
          {
            text: {
              content: updates.payment_message_id,
            },
          },
        ],
      }
    }

    if (updates.courts !== undefined) {
      properties.courts = {
        number: updates.courts,
      }
    }

    await client.pages.update({
      page_id: pageId,
      properties: properties,
    })

    return (await this.getEventById(chatId, id))!
  }

  /**
   * Cancel event
   */
  async cancelEvent(chatId: number | string, id: string, bot?: Bot): Promise<Event> {
    const event = await this.getEventById(chatId, id)
    if (!event) {
      throw new Error(`Event ${id} not found`)
    }

    const updatedEvent = await this.updateEvent(chatId, id, { status: 'cancelled' })

    // Send notification if event was announced
    if (event.status === 'announced' && event.telegram_message_id && bot) {
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

  /**
   * Build inline keyboard based on event status
   */
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

  /**
   * Announce event - send message to Telegram, pin it, save message_id
   */
  async announceEvent(chatId: number | string, id: string, bot: Bot): Promise<Event> {
    const event = await this.getEventById(chatId, id)
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
      const updatedEvent = await this.updateEvent(chatId, id, {
        telegram_message_id: String(sentMessage.message_id),
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

  /**
   * Calculate next occurrence date/time from scaffold
   */
  calculateNextOccurrence(scaffold: Scaffold): Date {
    // Validate scaffold data
    if (!scaffold.day_of_week) {
      throw new Error(`Invalid scaffold: missing day_of_week`)
    }

    const targetDayOfWeek = DAY_OF_WEEK_TO_NUMBER[scaffold.day_of_week]
    if (targetDayOfWeek === undefined) {
      throw new Error(`Invalid scaffold: unknown day_of_week "${scaffold.day_of_week}"`)
    }

    if (!scaffold.time) {
      throw new Error(`Invalid scaffold: missing time`)
    }

    // Validate time format
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(scaffold.time)) {
      throw new Error(
        `Invalid scaffold: invalid time format "${scaffold.time}". Expected HH:MM format`
      )
    }

    const [hours, minutes] = scaffold.time.split(':').map(Number)

    // Validate parsed hours and minutes
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Invalid scaffold: failed to parse time "${scaffold.time}"`)
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error(`Invalid scaffold: invalid time values (${hours}:${minutes})`)
    }

    const now = dayjs().tz(config.timezone)

    // Find next occurrence of this day
    let daysUntil = targetDayOfWeek - now.day()
    if (daysUntil < 0) {
      daysUntil += 7
    } else if (daysUntil === 0) {
      // Same day - check if time has passed
      const targetTime = now.hour(hours).minute(minutes).second(0).millisecond(0)
      if (now.isAfter(targetTime)) {
        daysUntil = 7 // Next week
      }
    }

    const nextDate = now.add(daysUntil, 'day').hour(hours).minute(minutes).second(0).millisecond(0)

    // Validate resulting date
    if (!nextDate.isValid()) {
      throw new Error(`Invalid scaffold: failed to calculate next occurrence date`)
    }

    const result = nextDate.toDate()

    // Validate Date object
    if (isNaN(result.getTime())) {
      throw new Error(`Invalid scaffold: resulting date is invalid`)
    }

    return result
  }

  /**
   * Check if event should be created based on announcement_deadline
   */
  private async shouldCreateEvent(scaffold: Scaffold, nextOccurrence: Date): Promise<boolean> {
    const timezone = await settingsService.getTimezone()
    const deadline =
      scaffold.announcement_deadline ?? (await settingsService.getAnnouncementDeadline())

    return shouldTrigger(deadline, nextOccurrence, timezone)
  }

  /**
   * Check if event already exists for scaffold + datetime
   */
  async eventExists(chatId: number | string, scaffoldId: string, datetime: Date): Promise<boolean> {
    const events = await this.getEvents(chatId)
    return events.some(
      (e) =>
        e.scaffold_id === scaffoldId &&
        Math.abs(e.datetime.getTime() - datetime.getTime()) < 1000 * 60 * 60 // Within 1 hour
    )
  }

  /**
   * Check active scaffolds and create events if needed
   */
  async checkAndCreateEventsFromScaffolds(chatId: number | string, bot: Bot): Promise<number> {
    const scaffolds = await scaffoldService.getScaffolds(chatId)
    const activeScaffolds = scaffolds.filter((s) => s.is_active)

    let createdCount = 0

    for (const scaffold of activeScaffolds) {
      try {
        const nextOccurrence = this.calculateNextOccurrence(scaffold)

        // Check if event already exists
        const exists = await this.eventExists(chatId, scaffold.id, nextOccurrence)
        if (exists) {
          continue
        }

        // Check if it's time to create
        if (!(await this.shouldCreateEvent(scaffold, nextOccurrence))) {
          continue
        }

        // Create event
        const event = await this.createEvent(chatId, {
          scaffold_id: scaffold.id,
          datetime: nextOccurrence,
          courts: scaffold.default_courts,
          status: 'created',
        })

        // Immediately announce
        await this.announceEvent(chatId, event.id, bot)

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

  /**
   * Map Notion page to Event object
   */
  private async mapNotionPageToEvent(
    // Using DatabaseObjectResponse type, but need to cast properties
    page: DatabaseObjectResponse
  ): Promise<Event> {
    const props = page.properties as unknown as EventNotionProperties

    let scaffoldId: string | undefined = undefined

    // Notion relation is an array, but types show it as object - use type assertion
    const relation = props.scaffold_id?.relation as unknown as { id: string }[] | undefined

    if (relation?.[0]?.id) {
      scaffoldId = await notionClient.getScaffoldIdFromPageId(relation[0].id)
    }

    return {
      id: this.getTitleProperty(props.id),
      scaffold_id: scaffoldId,
      datetime: props.datetime?.date?.start ? new Date(props.datetime.date.start) : new Date(),
      courts: props.courts?.number || 0,
      status: (props.status?.select?.name as EventStatus) || 'created',
      telegram_message_id: props.telegram_message_id
        ? this.getRichTextProperty(props.telegram_message_id)
        : undefined,
      payment_message_id: props.payment_message_id
        ? this.getRichTextProperty(props.payment_message_id)
        : undefined,
    }
  }

  // Using 'any' because Notion property types vary and are not fully typed in @notionhq/client
  // This function handles title properties which can have different structures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getTitleProperty(prop: any): string {
    if (!prop || !prop.title || !Array.isArray(prop.title) || prop.title.length === 0) {
      return ''
    }
    return prop.title[0].plain_text || ''
  }

  // Using 'any' because Notion property types vary and are not fully typed in @notionhq/client
  // This function handles rich_text properties which can have different structures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getRichTextProperty(prop: any): string {
    if (!prop || !prop.rich_text || !Array.isArray(prop.rich_text) || prop.rich_text.length === 0) {
      return ''
    }
    return prop.rich_text[0].plain_text || ''
  }
}

export const eventService = new EventService()
