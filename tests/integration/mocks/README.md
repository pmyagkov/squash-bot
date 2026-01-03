# Notion Mock Architecture

## Overview

This directory implements a **type-safe Notion API mock** using the **Entity Registry Pattern**. The architecture completely eliminates indirect type inference, replacing it with explicit, database-driven entity resolution.

### Why This Pattern?

Previous mock implementations suffered from brittle type inference based on ID prefixes (`sc_*`, `ev_*`) or property patterns. This approach:

- Required hardcoding entity type assumptions throughout the codebase
- Led to tight coupling between mock internals and test code
- Made it difficult to add new entity types
- Created fragile tests that broke with schema changes

The Entity Registry Pattern solves these issues by:

1. **Explicit Type Resolution**: Database IDs directly map to entity configurations
2. **Bidirectional Mapping**: Page IDs map to database IDs, enabling reverse lookups
3. **Zero Inference**: No guessing entity types from properties or ID patterns
4. **Type Safety**: Full TypeScript support with generic entity types
5. **Extensibility**: Adding new entity types requires no changes to core mock logic

## Key Concepts

### 1. Entity Configuration

Each entity type (Scaffold, Event, etc.) has a complete configuration that encapsulates all entity-specific behavior:

```typescript
interface EntityConfig<T> {
  name: string                        // Human-readable entity name
  store: EntityStore<T>               // In-memory storage for entities
  converters: EntityConverters<T>     // Bidirectional conversion logic
  pageIdMap: Map<string, string>      // Entity ID → Notion Page ID mapping
}
```

**Location**: `tests/integration/mocks/entityConfig.ts` (lines 25-33)

### 2. Entity Registry

The registry maps Notion database IDs to their entity configurations:

```typescript
const entityRegistry: EntityRegistry = {
  [SCAFFOLD_DB_ID]: scaffoldConfig,
  [EVENT_DB_ID]: eventConfig,
}
```

**How it works**:
- When a database operation occurs (create, query, update), the database ID from the request is used to look up the correct entity configuration
- No inference needed - the database ID explicitly tells us the entity type

**Location**: `tests/integration/mocks/notionMock.ts` (lines 36-39)

### 3. Database ID Mapping

The mock maintains three critical mappings:

1. **Database ID → Entity Config** (`entityRegistry`)
   - Maps Notion database IDs to entity configurations
   - Enables type resolution during database queries/creates

2. **Entity ID → Page ID** (`config.pageIdMap`)
   - Maps domain entity IDs (`sc_abc123`, `ev_xyz789`) to Notion page IDs (`mock-page-1`)
   - Enables converting domain entities to Notion pages

3. **Page ID → Database ID** (`pageIdToDatabaseId`)
   - Maps Notion page IDs back to database IDs
   - Enables type resolution during page updates/retrieves

**Example Flow** (Create Event):
```typescript
// 1. pages.create({ parent: { database_id: EVENT_DB_ID }, properties: {...} })
// 2. Look up entity config: entityRegistry[EVENT_DB_ID] → eventConfig
// 3. Convert properties to domain entity: eventConfig.converters.fromNotionProperties(...)
// 4. Store entity: eventConfig.store.create(entity)
// 5. Generate page ID: pageId = "mock-page-42"
// 6. Map IDs: eventConfig.pageIdMap.set(entity.id, pageId)
//            pageIdToDatabaseId.set(pageId, EVENT_DB_ID)
```

**Location**: `tests/integration/mocks/notionMock.ts` (lines 14-39, 161-164)

### 4. No Inference Principle

The architecture follows a strict **no inference** principle:

**Before (Problematic)**:
```typescript
// Guessing entity type from ID prefix
if (entityId.startsWith('sc_')) {
  return scaffoldConfig
} else if (entityId.startsWith('ev_')) {
  return eventConfig
}
```

**After (Explicit)**:
```typescript
// Explicit lookup via database ID
const config = entityRegistry[databaseId]

// Or via page ID → database ID → config
const databaseId = pageIdToDatabaseId.get(pageId)
const config = entityRegistry[databaseId]
```

**Benefits**:
- Entity IDs can have any format (no prefix requirements)
- Adding new entity types doesn't require updating inference logic
- Type resolution is guaranteed to be correct
- Code is easier to understand and maintain

## Architecture Components

### Core Files

1. **`entityConfig.ts`** - Type definitions
   - `EntityStore<T>`: Interface for in-memory entity storage
   - `EntityConverters<T>`: Interface for entity ↔ Notion conversion
   - `EntityConfig<T>`: Complete configuration for an entity type
   - `EntityRegistry`: Database ID → Entity Config mapping

2. **`notionMock.ts`** - Mock implementation
   - `MockNotionClient`: Main mock class
   - Implements all Notion API methods (databases.query, pages.create, etc.)
   - Uses entity registry for type resolution
   - Maintains Page ID → Database ID mapping

3. **`entities/scaffoldEntity.ts`** - Scaffold entity implementation
   - `ScaffoldStore`: In-memory storage for scaffolds
   - `ScaffoldConverters`: Conversion between Scaffold ↔ Notion format
   - `createScaffoldEntityConfig()`: Factory function

4. **`entities/eventEntity.ts`** - Event entity implementation
   - `EventStore`: In-memory storage for events
   - `EventConverters`: Conversion between Event ↔ Notion format
   - Handles scaffold relations via context passing
   - `createEventEntityConfig()`: Factory function

### Entity Store Interface

```typescript
interface EntityStore<T> {
  getAll(): T[]                           // Get all entities
  create(entity: T): T                    // Create new entity
  update(id: string, updates: Partial<T>): T  // Update existing entity
  findById(id: string): T | undefined     // Find by entity ID
  delete(id: string): void                // Delete entity
  clear(): void                           // Clear all entities
}
```

Simple in-memory implementation using `Map<string, T>`.

**Location**: `tests/integration/mocks/entityConfig.ts` (lines 4-13)

### Entity Converters Interface

```typescript
interface EntityConverters<T> {
  // Convert domain entity → Notion page format
  toNotionPage(entity: T, pageId: string, context?: Record<string, unknown>): PageObjectResponse

  // Convert Notion properties → domain entity
  fromNotionProperties(properties: CreatePageParameters['properties'], context?: Record<string, unknown>): T

  // Extract entity ID from Notion properties
  extractEntityId(properties: CreatePageParameters['properties']): string

  // Check if properties match this entity type (legacy, not currently used)
  matchesEntityType(properties: CreatePageParameters['properties']): boolean
}
```

**Context Parameter**: Used to pass additional information during conversion:
- `databaseId`: The database ID for the page parent
- `scaffoldPageId`: When converting events with scaffold relations, the Notion page ID of the scaffold
- `scaffoldPageIdMap`: Reverse map (Page ID → Scaffold ID) for parsing scaffold relations during create

**Location**: `tests/integration/mocks/entityConfig.ts` (lines 15-23)

## Adding New Entity Types

Follow these steps to add a new entity type to the mock:

### Step 1: Create Entity Configuration File

Create `tests/integration/mocks/entities/yourEntity.ts`:

```typescript
import type {
  PageObjectResponse,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints'
import type { EntityStore, EntityConverters, EntityConfig } from '../entityConfig'
import type { YourEntity } from '~/types' // Your domain type

// 1. Implement EntityStore
class YourEntityStore implements EntityStore<YourEntity> {
  private entities: Map<string, YourEntity> = new Map()

  getAll(): YourEntity[] {
    return Array.from(this.entities.values())
  }

  create(entity: YourEntity): YourEntity {
    this.entities.set(entity.id, entity)
    return entity
  }

  update(id: string, updates: Partial<YourEntity>): YourEntity {
    const existing = this.entities.get(id)
    if (!existing) {
      throw new Error(`YourEntity with id ${id} not found`)
    }
    const updated = { ...existing, ...updates }
    this.entities.set(id, updated)
    return updated
  }

  findById(id: string): YourEntity | undefined {
    return this.entities.get(id)
  }

  delete(id: string): void {
    this.entities.delete(id)
  }

  clear(): void {
    this.entities.clear()
  }
}

// 2. Implement EntityConverters
class YourEntityConverters implements EntityConverters<YourEntity> {
  toNotionPage(entity: YourEntity, pageId: string, context?: Record<string, unknown>): PageObjectResponse {
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
        // Map your entity properties to Notion property format
        id: {
          id: 'title',
          type: 'title',
          title: [{
            type: 'text',
            text: { content: entity.id, link: null },
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
            plain_text: entity.id,
            href: null,
          }],
        },
        // Add your entity-specific properties here
        // See scaffoldEntity.ts and eventEntity.ts for examples
      },
      url: `https://notion.so/${pageId}`,
      public_url: null,
    } as PageObjectResponse
  }

  fromNotionProperties(properties: CreatePageParameters['properties'], context?: Record<string, unknown>): YourEntity {
    const id = this.extractEntityId(properties)

    // Extract your entity properties from Notion format
    // See scaffoldEntity.ts and eventEntity.ts for examples

    return {
      id,
      // ... your entity fields
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
    // Define unique properties that identify this entity type
    return 'your_unique_property' in properties
  }
}

// 3. Export factory function
export function createYourEntityConfig(): EntityConfig<YourEntity> {
  return {
    name: 'your-entity',
    store: new YourEntityStore(),
    converters: new YourEntityConverters(),
    pageIdMap: new Map<string, string>(),
  }
}
```

### Step 2: Register Entity in Mock

Edit `tests/integration/mocks/notionMock.ts`:

```typescript
// 1. Add database ID constant
const YOUR_ENTITY_DB_ID = 'your-database-id-here'

// 2. Import your entity config
import { createYourEntityConfig } from './entities/yourEntity'

// 3. Register in constructor (line 36)
constructor() {
  const scaffoldConfig = createScaffoldEntityConfig()
  const eventConfig = createEventEntityConfig()
  const yourEntityConfig = createYourEntityConfig()  // Add this

  this.entityRegistry = {
    [SCAFFOLD_DB_ID]: scaffoldConfig as EntityConfig<unknown>,
    [EVENT_DB_ID]: eventConfig as EntityConfig<unknown>,
    [YOUR_ENTITY_DB_ID]: yourEntityConfig as EntityConfig<unknown>,  // Add this
  }
}
```

### Step 3: Handle Entity-Specific Logic (If Needed)

If your entity has relations to other entities or special update logic:

1. **Relations**: Add context passing in converters (see Event's scaffold_id handling in `eventEntity.ts`, lines 112-119)
2. **Updates**: Add property parsing in `pagesUpdate` method (see `notionMock.ts`, lines 218-248)

### Step 4: Update Types (If Needed)

Ensure your domain type exists in `src/types/index.ts` or equivalent.

### Step 5: Test Your Entity

Create test file `tests/integration/specs/yourEntity.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMockNotionClient, clearMockNotionStore } from '@integration/mocks/notionMock'
import { notionClient } from '~/notion/client'

describe('YourEntity tests', () => {
  beforeEach(() => {
    const mockClient = createMockNotionClient()
    notionClient.setMockClient(mockClient)
    clearMockNotionStore()
  })

  afterEach(() => {
    clearMockNotionStore()
    notionClient.clearMockClient()
  })

  it('should create and retrieve your entity', async () => {
    // Your tests here
  })
})
```

## Type Safety

The architecture leverages TypeScript generics for complete type safety:

### Generic Entity Configuration

```typescript
// EntityConfig is generic over entity type T
interface EntityConfig<T> {
  store: EntityStore<T>      // Store knows entity type
  converters: EntityConverters<T>  // Converters know entity type
}

// Usage
const scaffoldConfig: EntityConfig<Scaffold> = createScaffoldEntityConfig()
const eventConfig: EntityConfig<Event> = createEventEntityConfig()
```

### Type-Safe Registry

The registry uses type erasure (`EntityConfig<unknown>`) to allow heterogeneous storage:

```typescript
type EntityRegistry = Record<string, EntityConfig<unknown>>

// At runtime, we get the config and trust it's the right type
const config = entityRegistry[databaseId]
const entity = config.converters.fromNotionProperties(properties)
```

This is safe because:
1. Database IDs are known at compile time (constants)
2. Each database ID maps to exactly one entity type
3. The converters handle type-specific logic

### Type Inference at Call Sites

When using the mock in tests, TypeScript infers types from service layer:

```typescript
// Service returns typed domain entities
const events: Event[] = await eventService.getEvents(chatId)
const scaffolds: Scaffold[] = await scaffoldService.getScaffolds(chatId)

// Full autocomplete and type checking
expect(events[0].datetime).toBeInstanceOf(Date)
expect(scaffolds[0].day_of_week).toBe('Tue')
```

## Usage in Tests

### Basic Setup

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMockNotionClient, clearMockNotionStore } from '@integration/mocks/notionMock'
import { notionClient } from '~/notion/client'

describe('My tests', () => {
  beforeEach(() => {
    // Create and inject mock client
    const mockClient = createMockNotionClient()
    notionClient.setMockClient(mockClient)

    // Clear storage from previous tests
    clearMockNotionStore()
  })

  afterEach(() => {
    // Cleanup
    clearMockNotionStore()
    notionClient.clearMockClient()
  })

  it('should test something', async () => {
    // Your test code here
    // Use service layer methods - they'll use the mock automatically
  })
})
```

**Example**: `tests/integration/specs/event.test.ts` (lines 27-53)

### Working with Services

The mock is designed to work through the service layer, not directly:

```typescript
// Use services (they use notionClient internally)
const event = await eventService.createEvent(chatId, {
  datetime: new Date('2024-01-20T19:00:00'),
  courts: 2,
  status: 'created',
})

const scaffold = await scaffoldService.createScaffold(chatId, 'Tue', '21:00', 3)

// Query through services
const events = await eventService.getEvents(chatId)
const foundScaffold = await scaffoldService.getScaffoldById(chatId, scaffold.id)

// Updates
await eventService.updateEventStatus(chatId, event.id, 'announced')
await scaffoldService.setScaffoldActive(chatId, scaffold.id, false)
```

This approach:
- Tests the real service logic
- Validates the mock behaves like real Notion API
- Keeps tests decoupled from mock implementation details

### Testing Relations

Events can reference scaffolds via `scaffold_id`:

```typescript
// Create scaffold first
const scaffold = await scaffoldService.createScaffold(chatId, 'Wed', '19:00', 2)

// Create event from scaffold
const event = await eventService.createEventFromScaffold(
  chatId,
  scaffold.id,
  new Date('2024-01-17T19:00:00') // Next Wednesday
)

// Event will have scaffold_id set
expect(event.scaffold_id).toBe(scaffold.id)
expect(event.courts).toBe(2) // Inherited from scaffold.default_courts
```

The mock automatically handles:
- Converting scaffold domain IDs to Notion page IDs
- Storing relation properties in correct format
- Reverse lookup during fromNotionProperties conversion

**Implementation**: `tests/integration/mocks/entities/eventEntity.ts` (lines 112-119, 199-206)

### Debugging Tests

Access mock storage for debugging:

```typescript
import { getMockNotionStore } from '@integration/mocks/notionMock'

// Inspect mock state
const mockClient = getMockNotionStore()
console.log('Current mock state:', mockClient)
```

**Warning**: This is for debugging only. Don't use in production test code.

## Common Patterns

### Creating Entities

```typescript
// Via service layer (recommended)
const entity = await service.createEntity(chatId, { ...properties })

// Mock handles:
// 1. Converting properties to Notion format
// 2. Calling databases.query or pages.create
// 3. Storing in entity store
// 4. Mapping entity ID ↔ page ID
// 5. Converting back to domain entity
```

### Querying Entities

```typescript
// Get all entities of a type
const entities = await service.getEntities(chatId)

// Find specific entity
const entity = await service.getEntityById(chatId, entityId)

// Mock handles:
// 1. Looking up database ID from chatId
// 2. Finding entity config from database ID
// 3. Querying entity store
// 4. Converting to Notion page format
// 5. Returning results
```

### Updating Entities

```typescript
// Via service layer
await service.updateEntity(chatId, entityId, { field: newValue })

// Mock handles:
// 1. Finding page ID from entity ID
// 2. Looking up entity config from page ID
// 3. Parsing update properties
// 4. Updating entity store
// 5. Returning updated Notion page
```

### Relations Between Entities

```typescript
// Create related entities
const parentEntity = await parentService.create(chatId, {...})
const childEntity = await childService.create(chatId, {
  ...properties,
  parent_id: parentEntity.id  // Domain ID, not page ID
})

// Mock handles:
// 1. Converting parent domain ID → page ID for Notion relation
// 2. Storing relation in correct format
// 3. Reverse lookup when querying (page ID → domain ID)
```

See event-scaffold relation in `eventEntity.ts` for complete example.

## Testing the Mock Itself

The mock should be tested to ensure it accurately represents Notion API behavior:

```typescript
describe('Notion Mock', () => {
  it('should handle database queries', async () => {
    const client = createMockNotionClient()

    // Create entity via pages.create
    const created = await client.pages.create({
      parent: { database_id: EVENT_DB_ID },
      properties: { /* ... */ }
    })

    // Query via databases.query
    const result = await client.databases.query({
      database_id: EVENT_DB_ID
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].id).toBe(created.id)
  })

  it('should handle page updates', async () => {
    // Test update logic
  })

  it('should handle relations correctly', async () => {
    // Test relation mapping
  })
})
```

Current integration tests serve this purpose (see `tests/integration/specs/event.test.ts`).

## Migration Notes

### Migrating from Old Mock

If you have tests using an older mock implementation:

1. **Remove ID prefix assumptions**: Stop checking for `sc_*`, `ev_*` patterns
2. **Use service layer**: Replace direct mock manipulation with service calls
3. **Update setup/teardown**: Use `createMockNotionClient()` and `clearMockNotionStore()`
4. **Remove type inference logic**: Let the registry handle type resolution

### Breaking Changes

The new mock is **not backward compatible** with inference-based mocks:

- No more `getEntityTypeFromId()` or similar helpers
- Page IDs are sequential (`mock-page-1`, `mock-page-2`), not entity-specific
- Entity types are resolved via database ID, not properties
- Relations use page IDs, not domain IDs directly

## Future Improvements

Potential enhancements to consider:

1. **Filter Support**: Expand filter parsing in `databases.query` beyond ID equality
2. **Sorting**: Implement sort parameter handling
3. **Pagination**: Add cursor-based pagination support
4. **Async Store**: Support async storage backends (e.g., SQLite for larger tests)
5. **Validation**: Add schema validation to catch property mismatches early
6. **Snapshot Testing**: Export/import mock state for reproducible tests

## References

- Notion API Types: `node_modules/@notionhq/client/build/src/api-endpoints.d.ts`
- Domain Types: `src/types/index.ts`
- Real Notion Client: `src/notion/client.ts`
- Integration Tests: `tests/integration/specs/`

---

**Architecture Principles**:
- Explicit over implicit
- Type safety over runtime checks
- Composition over inheritance
- Separation of concerns (storage, conversion, mapping)
- Testability over clever code

**Last Updated**: 2026-01-03
