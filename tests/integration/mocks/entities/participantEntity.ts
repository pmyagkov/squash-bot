import type {
  PageObjectResponse,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityStore, EntityConverters, EntityConfig } from '../entityConfig'
import type { Participant } from '~/types'

/**
 * In-memory store for Participant entities
 */
class ParticipantStore implements EntityStore<Participant> {
  private participants: Map<string, Participant> = new Map()

  getAll(): Participant[] {
    return Array.from(this.participants.values())
  }

  create(entity: Participant): Participant {
    this.participants.set(entity.id, entity)
    return entity
  }

  update(id: string, updates: Partial<Participant>): Participant {
    const existing = this.participants.get(id)
    if (!existing) {
      throw new Error(`Participant with id ${id} not found`)
    }
    const updated = { ...existing, ...updates }
    this.participants.set(id, updated)
    return updated
  }

  findById(id: string): Participant | undefined {
    return this.participants.get(id)
  }

  delete(id: string): void {
    this.participants.delete(id)
  }

  clear(): void {
    this.participants.clear()
  }
}

/**
 * Converters for transforming between Participant and Notion API formats
 */
class ParticipantConverters implements EntityConverters<Participant> {
  toNotionPage(
    entity: Participant,
    pageId: string,
    context?: Record<string, unknown>
  ): PageObjectResponse {
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
        database_id: (context?.databaseId as string) || 'mock-database-id',
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
        telegram_id: {
          id: 'telegram_id',
          type: 'rich_text',
          rich_text: entity.telegramId
            ? [
                {
                  type: 'text',
                  text: { content: entity.telegramId, link: null },
                  annotations: {
                    bold: false,
                    italic: false,
                    strikethrough: false,
                    underline: false,
                    code: false,
                    color: 'default',
                  },
                  plain_text: entity.telegramId,
                  href: null,
                },
              ]
            : [],
        },
        telegram_username: {
          id: 'telegram_username',
          type: 'rich_text',
          rich_text: entity.telegramUsername
            ? [
                {
                  type: 'text',
                  text: { content: entity.telegramUsername, link: null },
                  annotations: {
                    bold: false,
                    italic: false,
                    strikethrough: false,
                    underline: false,
                    code: false,
                    color: 'default',
                  },
                  plain_text: entity.telegramUsername,
                  href: null,
                },
              ]
            : [],
        },
        display_name: {
          id: 'display_name',
          type: 'rich_text',
          rich_text: [
            {
              type: 'text',
              text: { content: entity.displayName, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: entity.displayName,
              href: null,
            },
          ],
        },
      },
      url: `https://notion.so/${pageId}`,
      public_url: null,
    } as PageObjectResponse
  }

  fromNotionProperties(properties: CreatePageParameters['properties']): Participant {
    const id = this.extractEntityId(properties)

    // Extract telegram_id
    const telegramIdProp = properties.telegram_id
    let telegram_id: string | undefined
    if (telegramIdProp && typeof telegramIdProp === 'object' && 'rich_text' in telegramIdProp) {
      const firstItem = telegramIdProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        telegram_id = firstItem.text.content
      }
    }

    // Extract telegram_username
    const telegramUsernameProp = properties.telegram_username
    let telegram_username: string | undefined
    if (
      telegramUsernameProp &&
      typeof telegramUsernameProp === 'object' &&
      'rich_text' in telegramUsernameProp
    ) {
      const firstItem = telegramUsernameProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        telegram_username = firstItem.text.content
      }
    }

    // Extract display_name
    const displayNameProp = properties.display_name
    let display_name = ''
    if (displayNameProp && typeof displayNameProp === 'object' && 'rich_text' in displayNameProp) {
      const firstItem = displayNameProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        display_name = firstItem.text.content
      }
    }

    return {
      id,
      telegramId: telegram_id,
      telegramUsername: telegram_username,
      displayName: display_name,
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
    // A participant has telegram_id and display_name properties
    const hasTelegramId = 'telegram_id' in properties
    const hasDisplayName = 'display_name' in properties

    return hasTelegramId && hasDisplayName
  }
}

/**
 * Factory function to create a complete Participant entity configuration
 */
export function createParticipantEntityConfig(): EntityConfig<Participant> {
  return {
    name: 'participant',
    store: new ParticipantStore(),
    converters: new ParticipantConverters(),
    pageIdMap: new Map<string, string>(),
  }
}
