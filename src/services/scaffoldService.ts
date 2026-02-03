import { nanoid } from 'nanoid'
import { notionClient } from '~/storage/client'
import { Scaffold, DayOfWeek } from '~/types'

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

// Helper type for creating/updating properties (without id and type fields)
type ScaffoldNotionPropertiesInput = {
  id: { title: { text: { content: string } }[] }
  day_of_week: { select: { name: DayOfWeek } }
  time: { rich_text: { text: { content: string } }[] }
  default_courts: { number: number }
  is_active: { checkbox: boolean }
  announce_hours_before?: { number: number }
}

export class ScaffoldService {
  /**
   * Get all scaffolds from Notion
   */
  async getScaffolds(chatId: number | string): Promise<Scaffold[]> {
    return notionClient.getScaffoldPages(chatId)
  }

  /**
   * Get scaffold by ID
   */
  async getScaffoldById(chatId: number | string, id: string): Promise<Scaffold | null> {
    const scaffolds = await this.getScaffolds(chatId)
    return scaffolds.find((s) => s.id === id) || null
  }

  /**
   * Generate scaffold ID using nanoid
   */
  async getNextScaffoldId(): Promise<string> {
    return `sc_${nanoid(4)}`
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
    // Validate time format (HH:MM)
    if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      throw new Error('Invalid time format. Use HH:MM (e.g., 21:00)')
    }

    // Validate day of week
    if (!Object.values(DAYS_OF_WEEK).includes(dayOfWeek)) {
      throw new Error(`Invalid day of week. Use: ${Object.values(DAYS_OF_WEEK).join(', ')}`)
    }

    // Use default value of 26 hours if not specified
    const hoursBefore = announceHoursBefore ?? 26

    const id = await this.getNextScaffoldId()

    const properties: ScaffoldNotionPropertiesInput = {
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
    }

    // Delegate creation to Notion client which returns domain Scaffold
    return notionClient.createScaffoldPage(chatId, properties)
  }

  /**
   * Toggle scaffold active status
   */
  async toggleScaffold(chatId: number | string, id: string): Promise<Scaffold> {
    const scaffold = await this.getScaffoldById(chatId, id)
    if (!scaffold) {
      throw new Error(`Scaffold ${id} not found`)
    }
    const pageId = await notionClient.findScaffoldPageIdByIdProperty(chatId, id)
    if (!pageId) throw new Error(`Scaffold ${id} not found`)

    const properties: Partial<ScaffoldNotionPropertiesInput> = {
      is_active: {
        checkbox: !scaffold.is_active,
      },
    }

    await notionClient.updatePageProperties(pageId, properties)

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
      throw new Error(`Scaffold ${id} not found`)
    }
    const pageId = await notionClient.findScaffoldPageIdByIdProperty(chatId, id)
    if (!pageId) throw new Error(`Scaffold ${id} not found`)

    await notionClient.archivePage(pageId)
  }

  /**
   * Parse day of week from string
   */
  parseDayOfWeek(dayStr: string): DayOfWeek | null {
    const normalized = dayStr.toLowerCase().trim()
    return DAYS_OF_WEEK[normalized] || null
  }
}

export const scaffoldService = new ScaffoldService()
