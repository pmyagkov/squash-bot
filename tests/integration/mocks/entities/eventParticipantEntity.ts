import type {
  PageObjectResponse,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityStore, EntityConverters, EntityConfig } from '../entityConfig'
import type { EventParticipant } from '~/types'

/**
 * In-memory store for EventParticipant entities
 */
class EventParticipantStore implements EntityStore<EventParticipant> {
  private eventParticipants: Map<string, EventParticipant> = new Map()

  // Composite key for event_id + participant_id
  private getKey(eventId: string, participantId: string): string {
    return `${eventId}:${participantId}`
  }

  getAll(): EventParticipant[] {
    return Array.from(this.eventParticipants.values())
  }

  create(entity: EventParticipant): EventParticipant {
    const key = this.getKey(entity.eventId, entity.participantId)
    this.eventParticipants.set(key, entity)
    return entity
  }

  update(id: string, updates: Partial<EventParticipant>): EventParticipant {
    // For EventParticipant, id is composite key "eventId:participantId"
    const existing = this.eventParticipants.get(id)
    if (!existing) {
      throw new Error(`EventParticipant with id ${id} not found`)
    }
    const updated = { ...existing, ...updates }
    this.eventParticipants.set(id, updated)
    return updated
  }

  findById(id: string): EventParticipant | undefined {
    return this.eventParticipants.get(id)
  }

  delete(id: string): void {
    this.eventParticipants.delete(id)
  }

  clear(): void {
    this.eventParticipants.clear()
  }
}

/**
 * Converters for transforming between EventParticipant and Notion API formats
 */
class EventParticipantConverters implements EntityConverters<EventParticipant> {
  toNotionPage(entity: EventParticipant, pageId: string, context?: Record<string, unknown>): PageObjectResponse {
    const eventPageId = context?.eventPageId as string | undefined
    const participantPageId = context?.participantPageId as string | undefined

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
        Name: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: `${entity.eventId}:${entity.participantId}`, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: `${entity.eventId}:${entity.participantId}`,
              href: null,
            },
          ],
        },
        event_id: {
          id: 'event_id',
          type: 'relation',
          relation: eventPageId ? [{ id: eventPageId }] : [],
        },
        participant_id: {
          id: 'participant_id',
          type: 'relation',
          relation: participantPageId ? [{ id: participantPageId }] : [],
        },
        participations: {
          id: 'participations',
          type: 'number',
          number: entity.participations,
        },
      },
      url: `https://notion.so/${pageId}`,
      public_url: null,
    } as PageObjectResponse
  }

  fromNotionProperties(properties: CreatePageParameters['properties'], context?: Record<string, unknown>): EventParticipant {
    // Extract event_id (from relation, needs reverse lookup)
    const eventIdProp = properties.event_id
    const eventPageId = eventIdProp && typeof eventIdProp === 'object' && 'relation' in eventIdProp
      ? eventIdProp.relation?.[0]?.id
      : undefined
    let event_id = ''
    if (eventPageId && context?.eventPageIdMap) {
      const eventPageIdMap = context.eventPageIdMap as Map<string, string>
      event_id = eventPageIdMap.get(eventPageId) || ''
    }

    // Extract participant_id (from relation, needs reverse lookup)
    const participantIdProp = properties.participant_id
    const participantPageId = participantIdProp && typeof participantIdProp === 'object' && 'relation' in participantIdProp
      ? participantIdProp.relation?.[0]?.id
      : undefined
    let participant_id = ''
    if (participantPageId && context?.participantPageIdMap) {
      const participantPageIdMap = context.participantPageIdMap as Map<string, string>
      participant_id = participantPageIdMap.get(participantPageId) || ''
    }

    // Extract participations
    const participationsProp = properties.participations
    const participations = participationsProp && typeof participationsProp === 'object' && 'number' in participationsProp
      ? participationsProp.number ?? 1
      : 1

    return {
      eventId: event_id,
      participantId: participant_id,
      participations,
    }
  }

  extractEntityId(properties: CreatePageParameters['properties']): string {
    // EventParticipant uses composite key from Name field
    const nameProp = properties.Name
    if (nameProp && typeof nameProp === 'object' && 'title' in nameProp) {
      const firstItem = nameProp.title?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        return firstItem.text.content
      }
    }
    return ''
  }

  matchesEntityType(properties: CreatePageParameters['properties']): boolean {
    // An EventParticipant has event_id, participant_id relations and participations number
    const hasEventId = 'event_id' in properties
    const hasParticipantId = 'participant_id' in properties
    const hasParticipations = 'participations' in properties

    return hasEventId && hasParticipantId && hasParticipations
  }
}

/**
 * Factory function to create a complete EventParticipant entity configuration
 */
export function createEventParticipantEntityConfig(): EntityConfig<EventParticipant> {
  return {
    name: 'eventParticipant',
    store: new EventParticipantStore(),
    converters: new EventParticipantConverters(),
    pageIdMap: new Map<string, string>(),
  }
}
