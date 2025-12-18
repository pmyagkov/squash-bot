import { notionClient } from '../notion/client'
import { Scaffold, DayOfWeek } from '../types'
import { getDatabases, isTestChat } from '../utils/environment'

const DAYS_OF_WEEK: Record<string, DayOfWeek> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

export class ScaffoldService {
  /**
   * Get all scaffolds from Notion
   */
  async getScaffolds(chatId: number | string): Promise<Scaffold[]> {
    const client = notionClient.getClient()
    const databases = getDatabases(chatId)

    if (!databases.scaffolds) {
      throw new Error(
        `Scaffolds database ID is not configured. ChatId: ${chatId}, isTestChat: ${isTestChat(chatId)}`
      )
    }

    const response = await client.databases.query({
      database_id: databases.scaffolds,
    })

    return response.results.map((page: any) => this.mapNotionPageToScaffold(page))
  }

  /**
   * Get scaffold by ID
   */
  async getScaffoldById(chatId: number | string, id: string): Promise<Scaffold | null> {
    const scaffolds = await this.getScaffolds(chatId)
    return scaffolds.find((s) => s.id === id) || null
  }

  /**
   * Get next scaffold ID (sc_1, sc_2, ...)
   */
  async getNextScaffoldId(chatId: number | string): Promise<string> {
    const scaffolds = await this.getScaffolds(chatId)
    const ids = scaffolds.map((s) => {
      const match = s.id.match(/^sc_(\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    const maxId = ids.length > 0 ? Math.max(...ids) : 0
    return `sc_${maxId + 1}`
  }

  /**
   * Create a new scaffold
   */
  async createScaffold(
    chatId: number | string,
    dayOfWeek: DayOfWeek,
    time: string,
    defaultCourts: number,
    announceHoursBefore?: number
  ): Promise<Scaffold> {
    const client = notionClient.getClient()
    const databases = getDatabases(chatId)

    // Validate time format (HH:MM)
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      throw new Error('Неверный формат времени. Используйте HH:MM (например, 21:00)')
    }

    // Validate day of week
    if (!Object.values(DAYS_OF_WEEK).includes(dayOfWeek)) {
      throw new Error(
        `Неверный день недели. Используйте: ${Object.values(DAYS_OF_WEEK).join(', ')}`
      )
    }

    // Use default value of 26 hours if not specified
    const hoursBefore = announceHoursBefore ?? 26

    const id = await this.getNextScaffoldId(chatId)

    const response = await client.pages.create({
      parent: {
        database_id: databases.scaffolds,
      },
      properties: {
        id: {
          title: [
            {
              text: {
                content: id,
              },
            },
          ],
        },
        day_of_week: {
          select: {
            name: dayOfWeek,
          },
        },
        time: {
          rich_text: [
            {
              text: {
                content: time,
              },
            },
          ],
        },
        default_courts: {
          number: defaultCourts,
        },
        is_active: {
          checkbox: true,
        },
        announce_hours_before: {
          number: hoursBefore,
        },
      },
    })

    return this.mapNotionPageToScaffold(response)
  }

  /**
   * Toggle scaffold active status
   */
  async toggleScaffold(chatId: number | string, id: string): Promise<Scaffold> {
    const scaffold = await this.getScaffoldById(chatId, id)
    if (!scaffold) {
      throw new Error(`Scaffold ${id} не найден`)
    }

    const client = notionClient.getClient()
    const databases = getDatabases(chatId)

    // Find the page ID for this scaffold
    const scaffolds = await client.databases.query({
      database_id: databases.scaffolds,
      filter: {
        property: 'id',
        title: {
          equals: id,
        },
      },
    })

    if (scaffolds.results.length === 0) {
      throw new Error(`Scaffold ${id} не найден`)
    }

    const pageId = scaffolds.results[0].id

    await client.pages.update({
      page_id: pageId,
      properties: {
        is_active: {
          checkbox: !scaffold.is_active,
        },
      },
    })

    return {
      ...scaffold,
      is_active: !scaffold.is_active,
    }
  }

  /**
   * Remove scaffold
   */
  async removeScaffold(chatId: number | string, id: string): Promise<void> {
    const scaffold = await this.getScaffoldById(chatId, id)
    if (!scaffold) {
      throw new Error(`Scaffold ${id} не найден`)
    }

    const client = notionClient.getClient()
    const databases = getDatabases(chatId)

    // Find the page ID for this scaffold
    const scaffolds = await client.databases.query({
      database_id: databases.scaffolds,
      filter: {
        property: 'id',
        title: {
          equals: id,
        },
      },
    })

    if (scaffolds.results.length === 0) {
      throw new Error(`Scaffold ${id} не найден`)
    }

    const pageId = scaffolds.results[0].id

    await client.pages.update({
      page_id: pageId,
      archived: true,
    })
  }

  /**
   * Parse day of week from string
   */
  parseDayOfWeek(dayStr: string): DayOfWeek | null {
    const normalized = dayStr.toLowerCase().trim()
    return DAYS_OF_WEEK[normalized] || null
  }

  /**
   * Map Notion page to Scaffold object
   */
  private mapNotionPageToScaffold(page: any): Scaffold {
    const props = page.properties

    return {
      id: this.getTitleProperty(props.id),
      day_of_week: props.day_of_week?.select?.name as DayOfWeek,
      time: this.getRichTextProperty(props.time),
      default_courts: props.default_courts?.number || 0,
      is_active: props.is_active?.checkbox || false,
      announce_hours_before: props.announce_hours_before?.number,
    }
  }

  private getTitleProperty(prop: any): string {
    if (!prop || !prop.title || !Array.isArray(prop.title) || prop.title.length === 0) {
      return ''
    }
    return prop.title[0].plain_text || ''
  }

  private getRichTextProperty(prop: any): string {
    if (
      !prop ||
      !prop.rich_text ||
      !Array.isArray(prop.rich_text) ||
      prop.rich_text.length === 0
    ) {
      return ''
    }
    return prop.rich_text[0].plain_text || ''
  }
}

export const scaffoldService = new ScaffoldService()



