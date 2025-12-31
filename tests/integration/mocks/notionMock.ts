import { vi } from 'vitest'
import type { Client } from '@notionhq/client'
import type { Scaffold, Event } from '~/types'

// In-memory storage for mocked data
class MockNotionStore {
  private scaffolds: Map<string, Scaffold> = new Map()
  private events: Map<string, Event> = new Map()
  private scaffoldPageIdMap: Map<string, string> = new Map() // scaffold ID -> page ID
  private eventPageIdMap: Map<string, string> = new Map() // event ID -> page ID
  private pageIdCounter = 1

  // Generate unique page ID
  private generatePageId(): string {
    return `mock-page-${this.pageIdCounter++}`
  }

  // Convert Scaffold to Notion Page format
  private scaffoldToNotionPage(scaffold: Scaffold, pageId: string): any {
    return {
      id: pageId,
      properties: {
        id: {
          title: [
            {
              plain_text: scaffold.id,
              text: {
                content: scaffold.id,
              },
            },
          ],
        },
        day_of_week: {
          select: {
            name: scaffold.day_of_week,
          },
        },
        time: {
          rich_text: [
            {
              plain_text: scaffold.time,
              text: {
                content: scaffold.time,
              },
            },
          ],
        },
        default_courts: {
          number: scaffold.default_courts,
        },
        is_active: {
          checkbox: scaffold.is_active,
        },
        ...(scaffold.announce_hours_before !== undefined && {
          announce_hours_before: {
            number: scaffold.announce_hours_before,
          },
        }),
      },
    }
  }

  // Get all scaffolds
  getAllScaffolds(): Scaffold[] {
    return Array.from(this.scaffolds.values())
  }

  // Create scaffold
  createScaffold(scaffold: Scaffold): any {
    const pageId = this.generatePageId()
    const page = this.scaffoldToNotionPage(scaffold, pageId)
    this.scaffolds.set(scaffold.id, scaffold)
    this.scaffoldPageIdMap.set(scaffold.id, pageId)
    return page
  }

  // Update scaffold
  updateScaffold(id: string, updates: Partial<Scaffold>): any {
    const existing = this.scaffolds.get(id)
    if (!existing) {
      throw new Error(`Scaffold ${id} not found`)
    }

    const updated = { ...existing, ...updates }
    this.scaffolds.set(id, updated)
    // Use pageId from existing scaffold or generate new one
    const pageId = `mock-page-${id}`
    return this.scaffoldToNotionPage(updated, pageId)
  }

  // Find scaffold by ID
  findScaffoldById(id: string): Scaffold | undefined {
    return this.scaffolds.get(id)
  }

  // Remove scaffold (archive)
  archiveScaffold(id: string): void {
    this.scaffolds.delete(id)
  }

  // Event methods
  getAllEvents(): Event[] {
    return Array.from(this.events.values())
  }

  createEvent(event: Event, scaffoldPageId?: string): any {
    const pageId = this.generatePageId()
    this.events.set(event.id, event)
    this.eventPageIdMap.set(event.id, pageId)
    if (scaffoldPageId) {
      // Store relation
      const entries = Array.from(this.scaffoldPageIdMap.entries())
      const found = entries.find(([_, pid]: [string, string]) => pid === scaffoldPageId)
      const scaffoldId = found ? found[0] : undefined
      if (scaffoldId) {
        // Store relation mapping
      }
    }
    return this.eventToNotionPage(event, pageId, scaffoldPageId)
  }

  findEventById(id: string): Event | undefined {
    return this.events.get(id)
  }

  updateEvent(id: string, updates: Partial<Event>): any {
    const existing = this.events.get(id)
    if (!existing) {
      throw new Error(`Event ${id} not found`)
    }
    const updated = { ...existing, ...updates }
    this.events.set(id, updated)
    const pageId = this.eventPageIdMap.get(id) || `mock-page-${id}`
    const scaffoldPageId = existing.scaffold_id
      ? this.scaffoldPageIdMap.get(existing.scaffold_id)
      : undefined
    return this.eventToNotionPage(updated, pageId, scaffoldPageId)
  }

  eventToNotionPage(event: Event, pageId: string, scaffoldPageId?: string): any {
    return {
      id: pageId,
      properties: {
        id: {
          title: [
            {
              plain_text: event.id,
              text: {
                content: event.id,
              },
            },
          ],
        },
        datetime: {
          date: {
            start: event.datetime instanceof Date ? event.datetime.toISOString() : new Date(event.datetime).toISOString(),
          },
        },
        courts: {
          number: event.courts,
        },
        status: {
          select: {
            name: event.status,
          },
        },
        ...(event.scaffold_id &&
          scaffoldPageId && {
            scaffold_id: {
              relation: [
                {
                  id: scaffoldPageId,
                },
              ],
            },
          }),
        ...(event.telegram_message_id && {
          telegram_message_id: {
            rich_text: [
              {
                plain_text: event.telegram_message_id,
                text: {
                  content: event.telegram_message_id,
                },
              },
            ],
          },
        }),
        ...(event.payment_message_id && {
          payment_message_id: {
            rich_text: [
              {
                plain_text: event.payment_message_id,
                text: {
                  content: event.payment_message_id,
                },
              },
            ],
          },
        }),
      },
    }
  }

  // Clear all data
  clear(): void {
    this.scaffolds.clear()
    this.events.clear()
    this.scaffoldPageIdMap.clear()
    this.eventPageIdMap.clear()
    this.pageIdCounter = 1
  }
}

// Global storage for all tests
const mockStore = new MockNotionStore()

/**
 * Creates mock for Notion Client
 */
export function createMockNotionClient(): Client {
  const mockClient = {
    databases: {
      query: vi.fn(async ({ database_id, filter }: any) => {
        const store = mockStore as any
        const scaffolds = store.getAllScaffolds()
        const events = store.getAllEvents()

        let results: any[] = []

        // Determine database type by:
        // 1. Filter pattern (if filtering by ID with ev_* or sc_* prefix)
        // 2. Database ID (check which database is being queried)
        // 3. Fallback to what data we have

        const isEventQuery =
          filter?.property === 'id' &&
          filter?.title?.equals &&
          filter.title.equals.startsWith('ev_')
        const isScaffoldQuery =
          filter?.property === 'id' &&
          filter?.title?.equals &&
          filter.title.equals.startsWith('sc_')

        // Determine which database to query
        // Priority: explicit filter pattern > database_id match > data availability
        let shouldQueryEvents: boolean
        if (isEventQuery) {
          shouldQueryEvents = true
        } else if (isScaffoldQuery) {
          shouldQueryEvents = false
        } else {
          // Check database_id to determine which database is being queried
          // In tests, scaffold DB ID is 1c6408e91d3a4d308b0736e79ff5b937
          // and events DB ID is 4e6dc64564e042c9991daf38f6b0ec85
          const isScaffoldDatabase = database_id === '1c6408e91d3a4d308b0736e79ff5b937'
          const isEventDatabase = database_id === '4e6dc64564e042c9991daf38f6b0ec85'

          if (isEventDatabase) {
            shouldQueryEvents = true
          } else if (isScaffoldDatabase) {
            shouldQueryEvents = false
          } else {
            // Fallback: if we have events and no scaffolds, query events; otherwise query scaffolds
            shouldQueryEvents = events.length > 0 && scaffolds.length === 0
          }
        }

        if (shouldQueryEvents) {
          // Query events
          let filteredEvents = events

          if (filter?.property === 'id' && filter?.title?.equals) {
            const targetId = filter.title.equals
            const event = store.findEventById(targetId)
            filteredEvents = event ? [event] : []
          }

          results = filteredEvents.map((event: Event) => {
            const pageId = store.eventPageIdMap?.get(event.id) || `mock-page-${event.id}`
            const scaffoldPageId = event.scaffold_id
              ? store.scaffoldPageIdMap?.get(event.scaffold_id)
              : undefined
            return store.eventToNotionPage(event, pageId, scaffoldPageId)
          })
        } else {
          // Query scaffolds
          let filteredScaffolds = scaffolds

          if (filter?.property === 'id' && filter?.title?.equals) {
            const targetId = filter.title.equals
            const scaffold = store.findScaffoldById(targetId)
            filteredScaffolds = scaffold ? [scaffold] : []
          }

          results = filteredScaffolds.map((scaffold: Scaffold) => {
            const pageId = store.scaffoldPageIdMap?.get(scaffold.id) || `mock-page-${scaffold.id}`
            return store.scaffoldToNotionPage(scaffold, pageId)
          })
        }

        return {
          results,
          has_more: false,
          next_cursor: null,
        }
      }),
    },
    pages: {
      create: vi.fn(async ({ parent: _parent, properties }: any) => {
        const store = mockStore as any

        // Check if it's a scaffold or event by checking properties
        if (properties.day_of_week) {
          // It's a scaffold
          const scaffold: Scaffold = {
            id: properties.id.title[0].text.content,
            day_of_week: properties.day_of_week.select.name,
            time: properties.time.rich_text[0].text.content,
            default_courts: properties.default_courts.number,
            is_active: properties.is_active.checkbox,
            announce_hours_before: properties.announce_hours_before?.number,
          }
          return store.createScaffold(scaffold)
        } else if (properties.datetime) {
          // It's an event
          const event: Event = {
            id: properties.id.title[0].text.content,
            scaffold_id: undefined,
            datetime: new Date(properties.datetime.date.start),
            courts: properties.courts.number,
            status: (properties.status.select.name as any) || 'created',
            telegram_message_id: properties.telegram_message_id?.rich_text?.[0]?.text?.content,
            payment_message_id: properties.payment_message_id?.rich_text?.[0]?.text?.content,
          }

          // Handle scaffold_id relation
          let scaffoldPageId: string | undefined
          if (properties.scaffold_id?.relation?.[0]?.id) {
            scaffoldPageId = properties.scaffold_id.relation[0].id
            // Find scaffold ID from page ID
            const entries = Array.from(
              (store.scaffoldPageIdMap as Map<string, string>)?.entries() || []
            )
            const found = entries.find(([_, pid]: [string, string]) => pid === scaffoldPageId)
            if (found) {
              event.scaffold_id = found[0]
            }
          }

          return store.createEvent(event, scaffoldPageId)
        }

        throw new Error('Unknown page type')
      }),
      update: vi.fn(async ({ page_id, properties, archived }: any) => {
        const store = mockStore as any

        // If archived = true, remove
        if (archived) {
          // Try to find as scaffold first
          const scaffoldEntries = Array.from(
            (store.scaffoldPageIdMap as Map<string, string>)?.entries() || []
          )
          const scaffoldFound = scaffoldEntries.find(
            ([_, pid]: [string, string]) => pid === page_id
          )
          const scaffoldId = scaffoldFound ? scaffoldFound[0] : undefined
          if (scaffoldId) {
            store.archiveScaffold(scaffoldId)
            return { id: page_id, archived: true }
          }

          // Try to find as event
          const eventEntries = Array.from(
            (store.eventPageIdMap as Map<string, string>)?.entries() || []
          )
          const eventFound = eventEntries.find(([_, pid]: [string, string]) => pid === page_id)
          const eventId = eventFound ? eventFound[0] : undefined
          if (eventId) {
            store.events.delete(eventId)
            store.eventPageIdMap.delete(eventId)
            return { id: page_id, archived: true }
          }

          throw new Error(`Page ${page_id} not found`)
        }

        // Try scaffold first
        const scaffoldEntries = Array.from(
          (store.scaffoldPageIdMap as Map<string, string>)?.entries() || []
        )
        const scaffoldFound = scaffoldEntries.find(([_, pid]: [string, string]) => pid === page_id)
        const scaffoldId = scaffoldFound ? scaffoldFound[0] : undefined
        if (scaffoldId) {
          const scaffold = store.findScaffoldById(scaffoldId)
          if (!scaffold) {
            throw new Error(`Page ${page_id} not found`)
          }

          const updates: Partial<Scaffold> = {}
          if (properties.is_active !== undefined) {
            updates.is_active = properties.is_active.checkbox
          }

          return store.updateScaffold(scaffold.id, updates)
        }

        // Try event
        const eventEntries = Array.from(
          (store.eventPageIdMap as Map<string, string>)?.entries() || []
        )
        const eventFound = eventEntries.find(([_, pid]: [string, string]) => pid === page_id)
        const eventId = eventFound ? eventFound[0] : undefined
        if (eventId) {
          const event = store.findEventById(eventId)
          if (!event) {
            throw new Error(`Page ${page_id} not found`)
          }

          const updates: Partial<Event> = {}
          if (properties.status !== undefined) {
            updates.status = properties.status.select.name
          }
          if (properties.telegram_message_id !== undefined) {
            updates.telegram_message_id = properties.telegram_message_id.rich_text[0].text.content
          }
          if (properties.payment_message_id !== undefined) {
            updates.payment_message_id = properties.payment_message_id.rich_text[0].text.content
          }
          if (properties.courts !== undefined) {
            updates.courts = properties.courts.number
          }

          return store.updateEvent(event.id, updates)
        }

        throw new Error(`Page ${page_id} not found`)
      }),
      retrieve: vi.fn(async ({ page_id }: any) => {
        const store = mockStore as any

        // Try scaffold first
        const scaffoldEntries = Array.from(
          (store.scaffoldPageIdMap as Map<string, string>)?.entries() || []
        )
        const scaffoldFound = scaffoldEntries.find(([_, pid]: [string, string]) => pid === page_id)
        const scaffoldId = scaffoldFound ? scaffoldFound[0] : undefined
        if (scaffoldId) {
          const scaffold = store.findScaffoldById(scaffoldId)
          if (scaffold) {
            return store.scaffoldToNotionPage(scaffold, page_id)
          }
        }

        // Try event
        const eventEntries = Array.from(
          (store.eventPageIdMap as Map<string, string>)?.entries() || []
        )
        const eventFound = eventEntries.find(([_, pid]: [string, string]) => pid === page_id)
        const eventId = eventFound ? eventFound[0] : undefined
        if (eventId) {
          const event = store.findEventById(eventId)
          if (event) {
            const scaffoldPageId = event.scaffold_id
              ? store.scaffoldPageIdMap?.get(event.scaffold_id)
              : undefined
            return store.eventToNotionPage(event, page_id, scaffoldPageId)
          }
        }

        throw new Error(`Page ${page_id} not found`)
      }),
    },
  } as unknown as Client

  return mockClient
}

/**
 * Clears mock storage
 */
export function clearMockNotionStore(): void {
  mockStore.clear()
}

/**
 * Get current state of mock storage (for debugging)
 */
export function getMockNotionStore(): MockNotionStore {
  return mockStore
}
