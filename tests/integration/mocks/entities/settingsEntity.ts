import type {
  PageObjectResponse,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityStore, EntityConverters, EntityConfig } from '../entityConfig'
import type { Settings } from '~/types'

/**
 * In-memory store for Settings entities
 */
class SettingsStore implements EntityStore<Settings> {
  private settings: Map<string, Settings> = new Map()

  getAll(): Settings[] {
    return Array.from(this.settings.values())
  }

  create(entity: Settings): Settings {
    this.settings.set(entity.key, entity)
    return entity
  }

  update(key: string, updates: Partial<Settings>): Settings {
    const existing = this.settings.get(key)
    if (!existing) {
      throw new Error(`Settings with key ${key} not found`)
    }
    const updated = { ...existing, ...updates }
    this.settings.set(key, updated)
    return updated
  }

  findById(key: string): Settings | undefined {
    return this.settings.get(key)
  }

  delete(key: string): void {
    this.settings.delete(key)
  }

  clear(): void {
    this.settings.clear()
  }
}

/**
 * Converters for transforming between Settings and Notion API formats
 */
class SettingsConverters implements EntityConverters<Settings> {
  toNotionPage(
    entity: Settings,
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
        key: {
          id: 'title',
          type: 'title',
          title: [
            {
              type: 'text',
              text: { content: entity.key, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: entity.key,
              href: null,
            },
          ],
        },
        value: {
          id: 'value',
          type: 'rich_text',
          rich_text: [
            {
              type: 'text',
              text: { content: entity.value, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: entity.value,
              href: null,
            },
          ],
        },
      },
      url: `https://notion.so/${pageId}`,
      public_url: null,
    } as PageObjectResponse
  }

  fromNotionProperties(properties: CreatePageParameters['properties']): Settings {
    const key = this.extractEntityId(properties)

    // Extract value
    const valueProp = properties.value
    let value = ''
    if (valueProp && typeof valueProp === 'object' && 'rich_text' in valueProp) {
      const firstItem = valueProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        value = firstItem.text.content
      }
    }

    return {
      key,
      value,
    }
  }

  extractEntityId(properties: CreatePageParameters['properties']): string {
    const keyProp = properties.key
    if (keyProp && typeof keyProp === 'object' && 'title' in keyProp) {
      const firstItem = keyProp.title?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        return firstItem.text.content
      }
    }
    return ''
  }

  matchesEntityType(properties: CreatePageParameters['properties']): boolean {
    // A setting has 'key' (title) and 'value' (rich_text) properties
    const hasKey = 'key' in properties
    const hasValue = 'value' in properties

    return hasKey && hasValue
  }
}

/**
 * Factory function to create a complete Settings entity configuration
 */
export function createSettingsEntityConfig(): EntityConfig<Settings> {
  return {
    name: 'settings',
    store: new SettingsStore(),
    converters: new SettingsConverters(),
    pageIdMap: new Map<string, string>(),
  }
}
