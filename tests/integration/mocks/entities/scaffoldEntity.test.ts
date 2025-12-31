import { describe, it, expect, beforeEach } from 'vitest'
import { createScaffoldEntityConfig } from './scaffoldEntity'
import type { Scaffold } from '~/types'

describe('Scaffold Entity Config', () => {
  let config: ReturnType<typeof createScaffoldEntityConfig>

  beforeEach(() => {
    config = createScaffoldEntityConfig()
    config.store.clear()
  })

  it('should create and retrieve scaffold', () => {
    const scaffold: Scaffold = {
      id: 'sc_test123',
      day_of_week: 'Mon',
      time: '19:00',
      default_courts: 2,
      is_active: true,
      announce_hours_before: 24,
    }

    config.store.create(scaffold)
    const retrieved = config.store.findById('sc_test123')

    expect(retrieved).toEqual(scaffold)
  })

  it('should convert scaffold to Notion page format', () => {
    const scaffold: Scaffold = {
      id: 'sc_test123',
      day_of_week: 'Tue',
      time: '21:00',
      default_courts: 3,
      is_active: true,
    }

    const notionPage = config.converters.toNotionPage(scaffold, 'page-123')

    expect(notionPage.id).toBe('page-123')
    expect(notionPage.properties.id).toHaveProperty('title')
    expect((notionPage.properties.id as any).title[0].plain_text).toBe('sc_test123')
    expect((notionPage.properties.day_of_week as any).select.name).toBe('Tue')
  })

  it('should parse Notion properties to scaffold', () => {
    const properties = {
      id: {
        title: [{ plain_text: 'sc_test123', text: { content: 'sc_test123' } }],
      },
      day_of_week: {
        select: { name: 'Wed' },
      },
      time: {
        rich_text: [{ plain_text: '19:00', text: { content: '19:00' } }],
      },
      default_courts: {
        number: 2,
      },
      is_active: {
        checkbox: true,
      },
    }

    const scaffold = config.converters.fromNotionProperties(properties)

    expect(scaffold.id).toBe('sc_test123')
    expect(scaffold.day_of_week).toBe('Wed')
    expect(scaffold.time).toBe('19:00')
    expect(scaffold.default_courts).toBe(2)
    expect(scaffold.is_active).toBe(true)
  })

  it('should identify scaffold properties correctly', () => {
    const scaffoldProps = {
      day_of_week: { select: { name: 'Mon' } },
      time: { rich_text: [] },
    }

    const eventProps = {
      datetime: { date: { start: '2024-01-20T19:00:00Z' } },
      courts: { number: 2 },
    }

    expect(config.converters.matchesEntityType(scaffoldProps)).toBe(true)
    expect(config.converters.matchesEntityType(eventProps)).toBe(false)
  })
})
