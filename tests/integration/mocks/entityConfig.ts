import type { PageObjectResponse, CreatePageParameters } from '@notionhq/client/build/src/api-endpoints'

/**
 * Generic entity store interface for managing entities in memory
 */
export interface EntityStore<T> {
  getAll(): T[]
  create(entity: T): T
  update(id: string, updates: Partial<T>): T
  findById(id: string): T | undefined
  delete(id: string): void
  clear(): void
}

/**
 * Converters for transforming between domain entities and Notion API formats
 */
export interface EntityConverters<T> {
  toNotionPage(entity: T, pageId: string, context?: Record<string, unknown>): PageObjectResponse
  fromNotionProperties(properties: CreatePageParameters['properties'], context?: Record<string, unknown>): T
  extractEntityId(properties: CreatePageParameters['properties']): string
  matchesEntityType(properties: CreatePageParameters['properties']): boolean
}

/**
 * Complete configuration for an entity type in the Notion mock
 */
export interface EntityConfig<T> {
  name: string
  store: EntityStore<T>
  converters: EntityConverters<T>
  pageIdMap: Map<string, string>
}

/**
 * Registry mapping database IDs to their entity configurations
 */
export type EntityRegistry = Record<string, EntityConfig<unknown>>

/**
 * Context object for passing additional information during conversion
 */
export interface EntityContext {
  [key: string]: unknown
}
