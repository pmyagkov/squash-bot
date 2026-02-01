import type {
  PageObjectResponse,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityStore, EntityConverters, EntityConfig } from '../entityConfig'
import type { Scaffold, DayOfWeek } from '~/types'

/**
 * In-memory store for Scaffold entities
 */
class ScaffoldStore implements EntityStore<Scaffold> {
  private scaffolds: Map<string, Scaffold> = new Map()

  getAll(): Scaffold[] {
    return Array.from(this.scaffolds.values())
  }

  create(entity: Scaffold): Scaffold {
    this.scaffolds.set(entity.id, entity)
    return entity
  }

  update(id: string, updates: Partial<Scaffold>): Scaffold {
    const existing = this.scaffolds.get(id)
    if (!existing) {
      throw new Error(`Scaffold with id ${id} not found`)
    }
    const updated = { ...existing, ...updates }
    this.scaffolds.set(id, updated)
    return updated
  }

  findById(id: string): Scaffold | undefined {
    return this.scaffolds.get(id)
  }

  delete(id: string): void {
    this.scaffolds.delete(id)
  }

  clear(): void {
    this.scaffolds.clear()
  }
}

/**
 * Converters for transforming between Scaffold and Notion API formats
 */
class ScaffoldConverters implements EntityConverters<Scaffold> {
  toNotionPage(entity: Scaffold, pageId: string, context?: Record<string, unknown>): PageObjectResponse {
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
        day_of_week: {
          id: 'day_of_week',
          type: 'select',
          select: { id: entity.day_of_week, name: entity.day_of_week, color: 'default' },
        },
        time: {
          id: 'time',
          type: 'rich_text',
          rich_text: [
            {
              type: 'text',
              text: { content: entity.time, link: null },
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'default',
              },
              plain_text: entity.time,
              href: null,
            },
          ],
        },
        default_courts: {
          id: 'default_courts',
          type: 'number',
          number: entity.default_courts,
        },
        is_active: {
          id: 'is_active',
          type: 'checkbox',
          checkbox: entity.is_active,
        },
        ...(entity.announcement_deadline !== undefined
          ? {
              announcement_deadline: {
                id: 'announcement_deadline',
                type: 'rich_text',
                rich_text: [
                  {
                    type: 'text',
                    text: { content: entity.announcement_deadline, link: null },
                    annotations: {
                      bold: false,
                      italic: false,
                      strikethrough: false,
                      underline: false,
                      code: false,
                      color: 'default',
                    },
                    plain_text: entity.announcement_deadline,
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

  fromNotionProperties(properties: CreatePageParameters['properties'], _context?: Record<string, unknown>): Scaffold {
    const id = this.extractEntityId(properties)

    // Extract day_of_week
    const dayOfWeekProp = properties.day_of_week
    const day_of_week = (dayOfWeekProp && typeof dayOfWeekProp === 'object' && 'select' in dayOfWeekProp
      ? dayOfWeekProp.select?.name
      : undefined) as DayOfWeek

    // Extract time
    const timeProp = properties.time
    let time = ''
    if (timeProp && typeof timeProp === 'object' && 'rich_text' in timeProp) {
      const firstItem = timeProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        time = firstItem.text.content
      }
    }

    // Extract default_courts
    const defaultCourtsProp = properties.default_courts
    const default_courts = defaultCourtsProp && typeof defaultCourtsProp === 'object' && 'number' in defaultCourtsProp
      ? defaultCourtsProp.number ?? 0
      : 0

    // Extract is_active
    const isActiveProp = properties.is_active
    const is_active = isActiveProp && typeof isActiveProp === 'object' && 'checkbox' in isActiveProp
      ? isActiveProp.checkbox ?? false
      : false

    // Extract optional announcement_deadline
    const announcementDeadlineProp = properties.announcement_deadline
    let announcement_deadline: string | undefined
    if (announcementDeadlineProp && typeof announcementDeadlineProp === 'object' && 'rich_text' in announcementDeadlineProp) {
      const firstItem = announcementDeadlineProp.rich_text?.[0]
      if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
        announcement_deadline = firstItem.text.content
      }
    }

    return {
      id,
      day_of_week,
      time,
      default_courts,
      is_active,
      ...(announcement_deadline !== undefined
        ? { announcement_deadline }
        : {}),
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
    // A scaffold has day_of_week (select) and default_courts (number) properties
    // This distinguishes it from events which have datetime instead
    const hasDayOfWeek = 'day_of_week' in properties
    const hasDefaultCourts = 'default_courts' in properties

    return hasDayOfWeek && hasDefaultCourts
  }
}

/**
 * Factory function to create a complete Scaffold entity configuration
 */
export function createScaffoldEntityConfig(): EntityConfig<Scaffold> {
  return {
    name: 'scaffold',
    store: new ScaffoldStore(),
    converters: new ScaffoldConverters(),
    pageIdMap: new Map<string, string>(),
  }
}
