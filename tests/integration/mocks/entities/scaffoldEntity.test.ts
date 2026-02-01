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
      announcement_deadline: '-1d',
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
      default_courts: { number: 2 },
    }

    const eventProps = {
      datetime: { date: { start: '2024-01-20T19:00:00Z' } },
      courts: { number: 2 },
    }

    expect(config.converters.matchesEntityType(scaffoldProps)).toBe(true)
    expect(config.converters.matchesEntityType(eventProps)).toBe(false)
  })

  describe('Store Operations', () => {
    it('should update existing scaffold', () => {
      const scaffold: Scaffold = {
        id: 'sc_update_test',
        day_of_week: 'Mon',
        time: '19:00',
        default_courts: 2,
        is_active: true,
      }

      config.store.create(scaffold)
      const updated = config.store.update('sc_update_test', {
        time: '20:00',
        default_courts: 3,
      })

      expect(updated.time).toBe('20:00')
      expect(updated.default_courts).toBe(3)
      expect(updated.day_of_week).toBe('Mon')
      expect(updated.is_active).toBe(true)

      const retrieved = config.store.findById('sc_update_test')
      expect(retrieved).toEqual(updated)
    })

    it('should throw error when updating non-existent scaffold', () => {
      expect(() => {
        config.store.update('non_existent_id', { time: '20:00' })
      }).toThrow('Scaffold with id non_existent_id not found')
    })

    it('should delete scaffold', () => {
      const scaffold: Scaffold = {
        id: 'sc_delete_test',
        day_of_week: 'Tue',
        time: '18:00',
        default_courts: 1,
        is_active: true,
      }

      config.store.create(scaffold)
      expect(config.store.findById('sc_delete_test')).toBeDefined()

      config.store.delete('sc_delete_test')
      expect(config.store.findById('sc_delete_test')).toBeUndefined()
    })

    it('should retrieve all scaffolds', () => {
      const scaffold1: Scaffold = {
        id: 'sc_all_1',
        day_of_week: 'Mon',
        time: '19:00',
        default_courts: 2,
        is_active: true,
      }

      const scaffold2: Scaffold = {
        id: 'sc_all_2',
        day_of_week: 'Wed',
        time: '20:00',
        default_courts: 3,
        is_active: false,
      }

      config.store.create(scaffold1)
      config.store.create(scaffold2)

      const allScaffolds = config.store.getAll()
      expect(allScaffolds).toHaveLength(2)
      expect(allScaffolds).toContainEqual(scaffold1)
      expect(allScaffolds).toContainEqual(scaffold2)
    })

    it('should clear all scaffolds', () => {
      config.store.create({
        id: 'sc_clear_1',
        day_of_week: 'Mon',
        time: '19:00',
        default_courts: 2,
        is_active: true,
      })

      config.store.create({
        id: 'sc_clear_2',
        day_of_week: 'Tue',
        time: '20:00',
        default_courts: 3,
        is_active: true,
      })

      expect(config.store.getAll()).toHaveLength(2)

      config.store.clear()
      expect(config.store.getAll()).toHaveLength(0)
    })
  })

  describe('Optional Field Handling', () => {
    it('should handle scaffold with announcement_deadline = "-0h" (edge case)', () => {
      const scaffold: Scaffold = {
        id: 'sc_zero_hours',
        day_of_week: 'Thu',
        time: '19:00',
        default_courts: 2,
        is_active: true,
        announcement_deadline: '-0h',
      }

      config.store.create(scaffold)
      const retrieved = config.store.findById('sc_zero_hours')

      expect(retrieved).toEqual(scaffold)
      expect(retrieved?.announcement_deadline).toBe('-0h')
    })

    it('should handle scaffold WITHOUT announcement_deadline', () => {
      const scaffold: Scaffold = {
        id: 'sc_no_announce',
        day_of_week: 'Fri',
        time: '18:30',
        default_courts: 1,
        is_active: true,
      }

      config.store.create(scaffold)
      const retrieved = config.store.findById('sc_no_announce')

      expect(retrieved).toEqual(scaffold)
      expect(retrieved?.announcement_deadline).toBeUndefined()
    })

    it('should convert scaffold with announcement_deadline to Notion page', () => {
      const scaffold: Scaffold = {
        id: 'sc_with_announce',
        day_of_week: 'Sat',
        time: '10:00',
        default_courts: 4,
        is_active: true,
        announcement_deadline: '-2d',
      }

      const notionPage = config.converters.toNotionPage(scaffold, 'page-456')

      expect(notionPage.properties.announcement_deadline).toBeDefined()
      expect((notionPage.properties.announcement_deadline as any).rich_text[0].plain_text).toBe(
        '-2d'
      )
    })

    it('should convert scaffold WITHOUT announcement_deadline to Notion page', () => {
      const scaffold: Scaffold = {
        id: 'sc_without_announce',
        day_of_week: 'Sun',
        time: '11:00',
        default_courts: 3,
        is_active: false,
      }

      const notionPage = config.converters.toNotionPage(scaffold, 'page-789')

      expect(notionPage.properties.announcement_deadline).toBeUndefined()
    })

    it('should parse Notion properties with announcement_deadline', () => {
      const properties = {
        id: {
          title: [{ plain_text: 'sc_parse_with', text: { content: 'sc_parse_with' } }],
        },
        day_of_week: {
          select: { name: 'Mon' },
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
        announcement_deadline: {
          rich_text: [{ plain_text: '-1d', text: { content: '-1d' } }],
        },
      }

      const scaffold = config.converters.fromNotionProperties(properties)

      expect(scaffold.announcement_deadline).toBe('-1d')
    })

    it('should parse Notion properties WITHOUT announcement_deadline', () => {
      const properties = {
        id: {
          title: [{ plain_text: 'sc_parse_without', text: { content: 'sc_parse_without' } }],
        },
        day_of_week: {
          select: { name: 'Tue' },
        },
        time: {
          rich_text: [{ plain_text: '20:00', text: { content: '20:00' } }],
        },
        default_courts: {
          number: 3,
        },
        is_active: {
          checkbox: false,
        },
      }

      const scaffold = config.converters.fromNotionProperties(properties)

      expect(scaffold.announcement_deadline).toBeUndefined()
    })
  })

  describe('Round-trip Conversions', () => {
    it('should preserve all data in round-trip conversion WITH announcement_deadline', () => {
      const originalScaffold: Scaffold = {
        id: 'sc_roundtrip_1',
        day_of_week: 'Wed',
        time: '19:30',
        default_courts: 2,
        is_active: true,
        announcement_deadline: '-1d 12:00',
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalScaffold, 'page-rt-1')

      // Convert back to Scaffold
      const reconstructedScaffold = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedScaffold).toEqual(originalScaffold)
    })

    it('should preserve all data in round-trip conversion WITHOUT announcement_deadline', () => {
      const originalScaffold: Scaffold = {
        id: 'sc_roundtrip_2',
        day_of_week: 'Fri',
        time: '21:00',
        default_courts: 4,
        is_active: false,
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalScaffold, 'page-rt-2')

      // Convert back to Scaffold
      const reconstructedScaffold = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedScaffold).toEqual(originalScaffold)
    })

    it('should preserve announcement_deadline = "-0h" in round-trip conversion', () => {
      const originalScaffold: Scaffold = {
        id: 'sc_roundtrip_zero',
        day_of_week: 'Sat',
        time: '10:00',
        default_courts: 1,
        is_active: true,
        announcement_deadline: '-0h',
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalScaffold, 'page-rt-zero')

      // Convert back to Scaffold
      const reconstructedScaffold = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedScaffold).toEqual(originalScaffold)
      expect(reconstructedScaffold.announcement_deadline).toBe('-0h')
    })
  })
})
