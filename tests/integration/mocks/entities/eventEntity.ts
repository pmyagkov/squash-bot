import type {
  PageObjectResponse,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityStore, EntityConverters, EntityConfig } from '../entityConfig'
import type { Event, EventStatus } from '~/types'

/**
 * In-memory store for Event entities
 */
class EventStore implements EntityStore<Event> {
  private events: Map<string, Event> = new Map()

  getAll(): Event[] {
    return Array.from(this.events.values())
  }

  create(entity: Event): Event {
    this.events.set(entity.id, entity)
    return entity
  }

  update(id: string, updates: Partial<Event>): Event {
    const existing = this.events.get(id)
    if (!existing) {
      throw new Error(`Event with id ${id} not found`)
    }
    const updated = { ...existing, ...updates }
    this.events.set(id, updated)
    return updated
  }

  findById(id: string): Event | undefined {
    return this.events.get(id)
  }

  delete(id: string): void {
    this.events.delete(id)
  }

  clear(): void {
    this.events.clear()
  }
}

/**
 * Converters for transforming between Event and Notion API formats
 */
class EventConverters implements EntityConverters<Event> {
  toNotionPage(entity: Event, pageId: string, context?: Record<string, unknown>): PageObjectResponse {
    // Handle Date serialization
    const datetimeISO = entity.datetime instanceof Date
      ? entity.datetime.toISOString()
      : new Date(entity.datetime).toISOString()

    return {
      object: 'page',
      id: pageId,
      created_time: new Date().toISOString(),
      last_edited_time: new Date().toISOString(),
      created_by: { object: 'user', id: 'mock-user' },
      last_edited_by: { object: 'user', id: 'mock-user' },
      cover: null,
      icon: null,
      parent: {
        type: 'database_id',
        database_id: context?.databaseId as string || 'mock-database-id',
      },
      archived: false,
      in_trash: false,
      properties: {
        id: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: entity.id, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: entity.id,
              href: null,
            },
          ],
        },
        datetime: {
          id: 'datetime',
          type: 'date',
          date: {
            start: datetimeISO,
            end: null,
            time_zone: null,
          },
        },
        courts: {
          id: 'courts',
          type: 'number',
          number: entity.courts,
        },
        status: {
          id: 'status',
          type: 'select',
          select: { id: entity.status, name: entity.status, color: 'default' },
        },
        // Optional fields
        ...(entity.scaffold_id !== undefined && context?.scaffoldPageId
          ? {
              scaffold_id: {
                id: 'scaffold_id',
                type: 'relation',
                relation: [{ id: context.scaffoldPageId as string }],
              },
            }
          : {}),
        ...(entity.telegram_message_id !== undefined
          ? {
              telegram_message_id: {
                id: 'telegram_message_id',
                type: 'rich_text',
                rich_text: [
                  {
                    type: 'text',
                    text: { content: entity.telegram_message_id, link: null },
                    annotations: {
                      bold: false,
                      italic: false,
                      strikethrough: false,
                      underline: false,
                      code: false,
                      color: 'default',
                    },
                    plain_text: entity.telegram_message_id,
                    href: null,
                  },
                ],
              },
            }
          : {}),
        ...(entity.payment_message_id !== undefined
          ? {
              payment_message_id: {
                id: 'payment_message_id',
                type: 'rich_text',
                rich_text: [
                  {
                    type: 'text',
                    text: { content: entity.payment_message_id, link: null },
                    annotations: {
                      bold: false,
                      italic: false,
                      strikethrough: false,
                      underline: false,
                      code: false,
                      color: 'default',
                    },
                    plain_text: entity.payment_message_id,
                    href: null,
                  },
                ],
              },
            }
          : {}),
      },
      url: `https://notion.so/${pageId}`,
      public_url: null,
    } as PageObjectResponse
  }

  fromNotionProperties(properties: CreatePageParameters['properties'], context?: Record<string, unknown>): Event {
    const id = this.extractEntityId(properties)

    // Extract datetime
    const datetimeProp = properties.datetime
    const datetimeStart = datetimeProp && typeof datetimeProp === 'object' && 'date' in datetimeProp
      ? datetimeProp.date?.start
      : undefined
    const datetime = new Date(datetimeStart || '')

    // Extract courts
    const courtsProp = properties.courts
    const courts = courtsProp && typeof courtsProp === 'object' && 'number' in courtsProp
      ? courtsProp.number ?? 0
      : 0

    // Extract status
    const statusProp = properties.status
    const status = (statusProp && typeof statusProp === 'object' && 'select' in statusProp
      ? statusProp.select?.name
      : undefined) as EventStatus

    // Extract optional scaffold_id (needs reverse lookup from page ID to scaffold ID)
    const scaffoldIdProp = properties.scaffold_id
    const scaffoldPageId = scaffoldIdProp && typeof scaffoldIdProp === 'object' && 'relation' in scaffoldIdProp
      ? scaffoldIdProp.relation?.[0]?.id
      : undefined
    let scaffold_id: string | undefined
    if (scaffoldPageId && context?.scaffoldPageIdMap) {
      const scaffoldPageIdMap = context.scaffoldPageIdMap as Map<string, string>
      scaffold_id = scaffoldPageIdMap.get(scaffoldPageId)
    }

    // Extract optional telegram_message_id
    const telegramMessageIdProp = properties.telegram_message_id
    let telegram_message_id: string | undefined
    if (telegramMessageIdProp && typeof telegramMessageIdProp === 'object' && 'rich_text' in telegramMessageIdProp) {
      const firstItem = telegramMessageIdProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        telegram_message_id = firstItem.text.content
      }
    }

    // Extract optional payment_message_id
    const paymentMessageIdProp = properties.payment_message_id
    let payment_message_id: string | undefined
    if (paymentMessageIdProp && typeof paymentMessageIdProp === 'object' && 'rich_text' in paymentMessageIdProp) {
      const firstItem = paymentMessageIdProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        payment_message_id = firstItem.text.content
      }
    }

    return {
      id,
      datetime,
      courts,
      status,
      ...(scaffold_id !== undefined ? { scaffold_id } : {}),
      ...(telegram_message_id !== undefined ? { telegram_message_id } : {}),
      ...(payment_message_id !== undefined ? { payment_message_id } : {}),
    }
  }

  extractEntityId(properties: CreatePageParameters['properties']): string {
    const idProp = properties.id
    if (idProp && typeof idProp === 'object' && 'title' in idProp) {
      const firstItem = idProp.title?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        return firstItem.text.content
      }
    }
    return ''
  }

  matchesEntityType(properties: CreatePageParameters['properties']): boolean {
    // An event has datetime (date) and courts (number) properties
    // This distinguishes it from scaffolds which have day_of_week instead
    const hasDatetime = 'datetime' in properties
    const hasCourts = 'courts' in properties

    return hasDatetime && hasCourts
  }
}

/**
 * Factory function to create a complete Event entity configuration
 */
export function createEventEntityConfig(): EntityConfig<Event> {
  return {
    name: 'event',
    store: new EventStore(),
    converters: new EventConverters(),
    pageIdMap: new Map<string, string>(),
  }
}
