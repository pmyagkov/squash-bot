import { vi } from 'vitest'
import type { Client } from '@notionhq/client'
import type {
  QueryDatabaseParameters,
  CreatePageParameters,
  UpdatePageParameters,
  GetPageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityRegistry, EntityConfig } from './entityConfig'
import { createScaffoldEntityConfig } from './entities/scaffoldEntity'
import { createEventEntityConfig } from './entities/eventEntity'
import { createParticipantEntityConfig } from './entities/participantEntity'
import { createEventParticipantEntityConfig } from './entities/eventParticipantEntity'
import { createSettingsEntityConfig } from './entities/settingsEntity'

// Database IDs from the actual configuration
const SCAFFOLD_DB_ID = '1c6408e91d3a4d308b0736e79ff5b937'
const EVENT_DB_ID = '4e6dc64564e042c9991daf38f6b0ec85'
const PARTICIPANT_DB_ID = '734443ccc46d4c668ab2f34b34998e8f'
const EVENT_PARTICIPANT_DB_ID = 'd14061191885481fa5cfbb3978cf0473'
const SETTINGS_DB_ID = '2eb696a0ab0280f79a88000c171f5d3a'

/**
 * Mock Notion Client using Entity Registry pattern
 *
 * This implementation completely eliminates indirect inference by using:
 * 1. Database ID → Entity Config mapping
 * 2. Page ID → Database ID mapping
 *
 * No more guessing entity types based on ID prefixes or property patterns!
 */
class MockNotionClient {
  private entityRegistry: EntityRegistry
  private pageIdToDatabaseId: Map<string, string> = new Map()
  private pageIdCounter = 1

  constructor() {
    // Initialize entity registry with database ID mappings
    const scaffoldConfig = createScaffoldEntityConfig()
    const eventConfig = createEventEntityConfig()
    const participantConfig = createParticipantEntityConfig()
    const eventParticipantConfig = createEventParticipantEntityConfig()
    const settingsConfig = createSettingsEntityConfig()

    this.entityRegistry = {
      [SCAFFOLD_DB_ID]: scaffoldConfig as EntityConfig<unknown>,
      [EVENT_DB_ID]: eventConfig as EntityConfig<unknown>,
      [PARTICIPANT_DB_ID]: participantConfig as EntityConfig<unknown>,
      [EVENT_PARTICIPANT_DB_ID]: eventParticipantConfig as EntityConfig<unknown>,
      [SETTINGS_DB_ID]: settingsConfig as EntityConfig<unknown>,
    }
  }

  /**
   * Generate unique page ID
   */
  private generatePageId(): string {
    return `mock-page-${this.pageIdCounter++}`
  }

  /**
   * Get entity config for a database ID
   */
  private getEntityConfigByDatabaseId(databaseId: string): EntityConfig<unknown> {
    const config = this.entityRegistry[databaseId]
    if (!config) {
      throw new Error(`No entity configuration found for database ID: ${databaseId}`)
    }
    return config
  }

  /**
   * Get entity config for a page ID
   */
  private getEntityConfigByPageId(pageId: string): EntityConfig<unknown> {
    const databaseId = this.pageIdToDatabaseId.get(pageId)
    if (!databaseId) {
      throw new Error(`Page ID ${pageId} not found`)
    }
    return this.getEntityConfigByDatabaseId(databaseId)
  }

  /**
   * databases.query implementation
   */
  async databasesQuery(params: QueryDatabaseParameters) {
    const { database_id, filter } = params

    // Use database_id to look up entity config
    const config = this.getEntityConfigByDatabaseId(database_id)

    // Get all entities from the store
    let entities = config.store.getAll()

    // Apply filter if provided
    if (filter && typeof filter === 'object' && 'property' in filter && filter.property === 'id' && 'title' in filter) {
      const titleFilter = filter.title as { equals?: string }
      if (titleFilter?.equals) {
        const targetId = titleFilter.equals
        const entity = config.store.findById(targetId)
        entities = entity ? [entity] : []
      }
    }

    // Convert entities to Notion page format
    const results = entities.map(entity => {
      // Get entity ID - for EventParticipant it's a composite key
      let entityId: string
      if (config.name === 'eventParticipant') {
        const ep = entity as { event_id: string; participant_id: string }
        entityId = `${ep.event_id}:${ep.participant_id}`
      } else {
        entityId = (entity as { id: string }).id
      }

      const pageId = config.pageIdMap.get(entityId)
      if (!pageId) {
        throw new Error(`Page ID not found for entity ${entityId}`)
      }

      // Build context for conversion
      const context: Record<string, unknown> = {
        databaseId: database_id,
      }

      // For events with scaffold relations, add scaffold page ID
      if (config.name === 'event') {
        const eventEntity = entity as { scaffold_id?: string }
        if (eventEntity.scaffold_id) {
          const scaffoldConfig = this.entityRegistry[SCAFFOLD_DB_ID]
          const scaffoldPageId = scaffoldConfig.pageIdMap.get(eventEntity.scaffold_id)
          if (scaffoldPageId) {
            context.scaffoldPageId = scaffoldPageId
          }
        }
      }

      // For eventParticipant with relations, add page IDs
      if (config.name === 'eventParticipant') {
        const ep = entity as { event_id: string; participant_id: string }
        const eventConfig = this.entityRegistry[EVENT_DB_ID]
        const participantConfig = this.entityRegistry[PARTICIPANT_DB_ID]

        const eventPageId = eventConfig.pageIdMap.get(ep.event_id)
        const participantPageId = participantConfig.pageIdMap.get(ep.participant_id)

        if (eventPageId) {
          context.eventPageId = eventPageId
        }
        if (participantPageId) {
          context.participantPageId = participantPageId
        }
      }

      return config.converters.toNotionPage(entity, pageId, context)
    })

    return {
      results,
      has_more: false,
      next_cursor: null,
    }
  }

  /**
   * pages.create implementation
   */
  async pagesCreate(params: CreatePageParameters) {
    const { parent, properties } = params
    const databaseId = parent && 'database_id' in parent ? parent.database_id : ''

    // Use database_id to determine entity type
    const config = this.getEntityConfigByDatabaseId(databaseId)

    // Build context for conversion
    const context: Record<string, unknown> = {
      databaseId,
    }

    // For events with scaffold relations, provide scaffoldPageIdMap for reverse lookup
    if (config.name === 'event') {
      const scaffoldConfig = this.entityRegistry[SCAFFOLD_DB_ID]
      // Create reverse map: pageId -> scaffoldId
      const reverseMap = new Map<string, string>()
      for (const [scaffoldId, pageId] of scaffoldConfig.pageIdMap.entries()) {
        reverseMap.set(pageId, scaffoldId)
      }
      context.scaffoldPageIdMap = reverseMap
    }

    // For eventParticipant with relations, provide reverse maps
    if (config.name === 'eventParticipant') {
      const eventConfig = this.entityRegistry[EVENT_DB_ID]
      const participantConfig = this.entityRegistry[PARTICIPANT_DB_ID]

      // Create reverse map: pageId -> eventId
      const eventReverseMap = new Map<string, string>()
      for (const [eventId, pageId] of eventConfig.pageIdMap.entries()) {
        eventReverseMap.set(pageId, eventId)
      }
      context.eventPageIdMap = eventReverseMap

      // Create reverse map: pageId -> participantId
      const participantReverseMap = new Map<string, string>()
      for (const [participantId, pageId] of participantConfig.pageIdMap.entries()) {
        participantReverseMap.set(pageId, participantId)
      }
      context.participantPageIdMap = participantReverseMap
    }

    // Parse properties to create entity
    const entity = config.converters.fromNotionProperties(properties, context)

    // Store entity
    const storedEntity = config.store.create(entity)

    // Generate and map page ID
    const pageId = this.generatePageId()
    const entityId = config.converters.extractEntityId(properties)
    config.pageIdMap.set(entityId, pageId)
    this.pageIdToDatabaseId.set(pageId, databaseId)

    // Build context for toNotionPage conversion
    const conversionContext: Record<string, unknown> = {
      databaseId,
    }

    // For events with scaffold relations, add scaffold page ID
    if (config.name === 'event') {
      const eventEntity = storedEntity as { scaffold_id?: string }
      if (eventEntity.scaffold_id) {
        const scaffoldConfig = this.entityRegistry[SCAFFOLD_DB_ID]
        const scaffoldPageId = scaffoldConfig.pageIdMap.get(eventEntity.scaffold_id)
        if (scaffoldPageId) {
          conversionContext.scaffoldPageId = scaffoldPageId
        }
      }
    }

    // For eventParticipant with relations, add page IDs
    if (config.name === 'eventParticipant') {
      const ep = storedEntity as { event_id: string; participant_id: string }
      const eventConfig = this.entityRegistry[EVENT_DB_ID]
      const participantConfig = this.entityRegistry[PARTICIPANT_DB_ID]

      const eventPageId = eventConfig.pageIdMap.get(ep.event_id)
      const participantPageId = participantConfig.pageIdMap.get(ep.participant_id)

      if (eventPageId) {
        conversionContext.eventPageId = eventPageId
      }
      if (participantPageId) {
        conversionContext.participantPageId = participantPageId
      }
    }

    // Convert to Notion page format
    return config.converters.toNotionPage(storedEntity, pageId, conversionContext)
  }

  /**
   * pages.update implementation
   */
  async pagesUpdate(params: UpdatePageParameters) {
    const { page_id, properties = {}, archived } = params

    // Use page_id to find entity config
    const config = this.getEntityConfigByPageId(page_id)

    // Find entity ID from page ID
    let entityId: string | undefined
    for (const [id, pid] of config.pageIdMap.entries()) {
      if (pid === page_id) {
        entityId = id
        break
      }
    }

    if (!entityId) {
      throw new Error(`Entity not found for page ID: ${page_id}`)
    }

    // Handle archiving
    if (archived) {
      config.store.delete(entityId)
      config.pageIdMap.delete(entityId)
      this.pageIdToDatabaseId.delete(page_id)
      return { id: page_id, archived: true }
    }

    // Parse property updates based on entity type
    const updates: Record<string, unknown> = {}

    if (config.name === 'scaffold') {
      const isActiveProp = properties.is_active
      if (isActiveProp && typeof isActiveProp === 'object' && 'checkbox' in isActiveProp) {
        updates.is_active = isActiveProp.checkbox
      }
    } else if (config.name === 'event') {
      const statusProp = properties.status
      if (statusProp && typeof statusProp === 'object' && 'select' in statusProp && statusProp.select) {
        updates.status = statusProp.select.name
      }
      const telegramProp = properties.telegram_message_id
      if (telegramProp && typeof telegramProp === 'object' && 'rich_text' in telegramProp) {
        const firstItem = telegramProp.rich_text[0]
        if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
          updates.telegram_message_id = firstItem.text.content
        }
      }
      const paymentProp = properties.payment_message_id
      if (paymentProp && typeof paymentProp === 'object' && 'rich_text' in paymentProp) {
        const firstItem = paymentProp.rich_text[0]
        if (firstItem && typeof firstItem === 'object' && 'text' in firstItem) {
          updates.payment_message_id = firstItem.text.content
        }
      }
      const courtsProp = properties.courts
      if (courtsProp && typeof courtsProp === 'object' && 'number' in courtsProp) {
        updates.courts = courtsProp.number
      }
    } else if (config.name === 'eventParticipant') {
      const participationsProp = properties.participations
      if (
        participationsProp &&
        typeof participationsProp === 'object' &&
        'number' in participationsProp
      ) {
        console.log(
          '[MOCK] Updating eventParticipant participations to:',
          participationsProp.number
        )
        updates.participations = participationsProp.number
      }
    }

    // Update entity
    const updatedEntity = config.store.update(entityId, updates)

    // Get database ID for context
    const databaseId = this.pageIdToDatabaseId.get(page_id)

    // Build context for conversion
    const context: Record<string, unknown> = {
      databaseId,
    }

    // For events with scaffold relations, add scaffold page ID
    if (config.name === 'event') {
      const eventEntity = updatedEntity as { scaffold_id?: string }
      if (eventEntity.scaffold_id) {
        const scaffoldConfig = this.entityRegistry[SCAFFOLD_DB_ID]
        const scaffoldPageId = scaffoldConfig.pageIdMap.get(eventEntity.scaffold_id)
        if (scaffoldPageId) {
          context.scaffoldPageId = scaffoldPageId
        }
      }
    }

    // Convert to Notion page format
    return config.converters.toNotionPage(updatedEntity, page_id, context)
  }

  /**
   * pages.retrieve implementation
   */
  async pagesRetrieve(params: GetPageParameters) {
    const { page_id } = params

    // Use page_id to find entity config
    const config = this.getEntityConfigByPageId(page_id)

    // Find entity ID from page ID
    let entityId: string | undefined
    for (const [id, pid] of config.pageIdMap.entries()) {
      if (pid === page_id) {
        entityId = id
        break
      }
    }

    if (!entityId) {
      throw new Error(`Entity not found for page ID: ${page_id}`)
    }

    // Retrieve entity
    const entity = config.store.findById(entityId)
    if (!entity) {
      throw new Error(`Entity ${entityId} not found in store`)
    }

    // Get database ID for context
    const databaseId = this.pageIdToDatabaseId.get(page_id)

    // Build context for conversion
    const context: Record<string, unknown> = {
      databaseId,
    }

    // For events with scaffold relations, add scaffold page ID
    if (config.name === 'event') {
      const eventEntity = entity as { scaffold_id?: string }
      if (eventEntity.scaffold_id) {
        const scaffoldConfig = this.entityRegistry[SCAFFOLD_DB_ID]
        const scaffoldPageId = scaffoldConfig.pageIdMap.get(eventEntity.scaffold_id)
        if (scaffoldPageId) {
          context.scaffoldPageId = scaffoldPageId
        }
      }
    }

    // Convert to Notion page format
    return config.converters.toNotionPage(entity, page_id, context)
  }

  /**
   * Clear all data
   */
  clear(): void {
    // Clear all entity stores and page ID maps
    for (const config of Object.values(this.entityRegistry)) {
      config.store.clear()
      config.pageIdMap.clear()
    }
    this.pageIdToDatabaseId.clear()
    this.pageIdCounter = 1
  }
}

// Global instance
const mockNotionClient = new MockNotionClient()

/**
 * Creates mock for Notion Client
 */
export function createMockNotionClient(): Client {
  const mockClient = {
    databases: {
      query: vi.fn(async (params: QueryDatabaseParameters) => {
        return mockNotionClient.databasesQuery(params)
      }),
    },
    pages: {
      create: vi.fn(async (params: CreatePageParameters) => {
        return mockNotionClient.pagesCreate(params)
      }),
      update: vi.fn(async (params: UpdatePageParameters) => {
        return mockNotionClient.pagesUpdate(params)
      }),
      retrieve: vi.fn(async (params: GetPageParameters) => {
        return mockNotionClient.pagesRetrieve(params)
      }),
    },
  } as unknown as Client

  return mockClient
}

/**
 * Clears mock storage
 */
export function clearMockNotionStore(): void {
  mockNotionClient.clear()
}

/**
 * Get current state of mock storage (for debugging)
 */
export function getMockNotionStore(): MockNotionClient {
  return mockNotionClient
}
