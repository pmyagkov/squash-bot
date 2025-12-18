import { vi } from 'vitest'
import type { Client } from '@notionhq/client'
import type { Scaffold } from '~/types'

// In-memory хранилище для мокированных данных
class MockNotionStore {
  private scaffolds: Map<string, Scaffold> = new Map()
  private pageIdCounter = 1

  // Генерируем уникальный page ID
  private generatePageId(): string {
    return `mock-page-${this.pageIdCounter++}`
  }

  // Преобразуем Scaffold в формат Notion Page
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


  // Получить все scaffold
  getAllScaffolds(): Scaffold[] {
    return Array.from(this.scaffolds.values())
  }

  // Создать scaffold
  createScaffold(scaffold: Scaffold): any {
    const pageId = this.generatePageId()
    const page = this.scaffoldToNotionPage(scaffold, pageId)
    this.scaffolds.set(scaffold.id, scaffold)
    return page
  }

  // Обновить scaffold
  updateScaffold(id: string, updates: Partial<Scaffold>): any {
    const existing = this.scaffolds.get(id)
    if (!existing) {
      throw new Error(`Scaffold ${id} not found`)
    }

    const updated = { ...existing, ...updates }
    this.scaffolds.set(id, updated)
    // Используем pageId из существующего scaffold или генерируем новый
    const pageId = `mock-page-${id}`
    return this.scaffoldToNotionPage(updated, pageId)
  }

  // Найти scaffold по ID
  findScaffoldById(id: string): Scaffold | undefined {
    return this.scaffolds.get(id)
  }

  // Удалить scaffold (архивировать)
  archiveScaffold(id: string): void {
    this.scaffolds.delete(id)
  }

  // Очистить все данные
  clear(): void {
    this.scaffolds.clear()
    this.pageIdCounter = 1
  }
}

// Глобальное хранилище для всех тестов
const mockStore = new MockNotionStore()

/**
 * Создает mock для Notion Client
 */
export function createMockNotionClient(): Client {
  const mockClient = {
    databases: {
      query: vi.fn(async ({ database_id: _database_id, filter }: any) => {
        let scaffolds = mockStore.getAllScaffolds()

        // Поддерживаем фильтрацию по ID (для toggle и remove)
        if (filter?.property === 'id' && filter?.title?.equals) {
          const targetId = filter.title.equals
          const scaffold = mockStore.findScaffoldById(targetId)
          scaffolds = scaffold ? [scaffold] : []
        }

        const pages = scaffolds.map((scaffold) => {
          // Используем приватный метод через any для доступа
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
        // Если archived = true, удаляем scaffold
        if (archived) {
          // Извлекаем ID из page_id (формат: mock-page-sc_1)
          const scaffoldId = page_id.replace('mock-page-', '')
          mockStore.archiveScaffold(scaffoldId)
          return { id: page_id, archived: true }
        }

        // Находим scaffold по page_id (используем ID из хранилища)
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
 * Очищает mock хранилище
 */
export function clearMockNotionStore(): void {
  mockStore.clear()
}

/**
 * Получить текущее состояние mock хранилища (для отладки)
 */
export function getMockNotionStore(): MockNotionStore {
  return mockStore
}

