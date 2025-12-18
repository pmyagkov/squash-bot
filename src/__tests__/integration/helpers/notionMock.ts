import { vi } from 'vitest'
import type { Client } from '@notionhq/client'
import type { Scaffold } from '~/types'

// In-memory storage for mocked data
class MockNotionStore {
  private scaffolds: Map<string, Scaffold> = new Map()
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

  // Clear all data
  clear(): void {
    this.scaffolds.clear()
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
      query: vi.fn(async ({ database_id: _database_id, filter }: any) => {
        let scaffolds = mockStore.getAllScaffolds()

        // Support filtering by ID (for toggle and remove)
        if (filter?.property === 'id' && filter?.title?.equals) {
          const targetId = filter.title.equals
          const scaffold = mockStore.findScaffoldById(targetId)
          scaffolds = scaffold ? [scaffold] : []
        }

        const pages = scaffolds.map((scaffold) => {
          // Use private method via any for access
          const store = mockStore as any
          return store.scaffoldToNotionPage(scaffold, `mock-page-${scaffold.id}`)
        })

        return {
          results: pages,
          has_more: false,
          next_cursor: null,
        }
      }),
    },
    pages: {
      create: vi.fn(async ({ parent: _parent, properties }: any) => {
        const scaffold: Scaffold = {
          id: properties.id.title[0].text.content,
          day_of_week: properties.day_of_week.select.name,
          time: properties.time.rich_text[0].text.content,
          default_courts: properties.default_courts.number,
          is_active: properties.is_active.checkbox,
          announce_hours_before: properties.announce_hours_before?.number,
        }

        return mockStore.createScaffold(scaffold)
      }),
      update: vi.fn(async ({ page_id, properties, archived }: any) => {
        // If archived = true, remove scaffold
        if (archived) {
          // Extract ID from page_id (format: mock-page-sc_1)
          const scaffoldId = page_id.replace('mock-page-', '')
          mockStore.archiveScaffold(scaffoldId)
          return { id: page_id, archived: true }
        }

        // Find scaffold by page_id (use ID from storage)
        const scaffoldId = page_id.replace('mock-page-', '')
        const scaffold = mockStore.findScaffoldById(scaffoldId)

        if (!scaffold) {
          throw new Error(`Page ${page_id} not found`)
        }

        const updates: Partial<Scaffold> = {}
        if (properties.is_active !== undefined) {
          updates.is_active = properties.is_active.checkbox
        }

        return mockStore.updateScaffold(scaffold.id, updates)
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

