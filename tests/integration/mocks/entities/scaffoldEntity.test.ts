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
      dayOfWeek: 'Mon',
      time: '19:00',
      defaultCourts: 2,
      isActive: true,
      announcementDeadline: '-1d',
    }

    config.store.create(scaffold)
    const retrieved = config.store.findById('sc_test123')

    expect(retrieved).toEqual(scaffold)
  })

  it('should convert scaffold to Notion page format', () => {
    const scaffold: Scaffold = {
      id: 'sc_test123',
      dayOfWeek: 'Tue',
      time: '21:00',
      defaultCourts: 3,
      isActive: true,
    }

    const notionPage = config.converters.toNotionPage(scaffold, 'page-123')

    expect(notionPage.id).toBe('page-123')
    expect(notionPage.properties.id).toHaveProperty('title')
    expect((notionPage.properties.id as any).title[0].plain_text).toBe('sc_test123')
    expect((notionPage.properties.dayOfWeek as any).select.name).toBe('Tue')
  })

  it('should parse Notion properties to scaffold', () => {
    const properties = {
      id: {
        title: [{ plain_text: 'sc_test123', text: { content: 'sc_test123' } }],
      },
      dayOfWeek: {
        select: { name: 'Wed' },
      },
      time: {
        rich_text: [{ plain_text: '19:00', text: { content: '19:00' } }],
      },
      defaultCourts: {
        number: 2,
      },
      isActive: {
        checkbox: true,
      },
    }

    const scaffold = config.converters.fromNotionProperties(properties)

    expect(scaffold.id).toBe('sc_test123')
    expect(scaffold.dayOfWeek).toBe('Wed')
    expect(scaffold.time).toBe('19:00')
    expect(scaffold.defaultCourts).toBe(2)
    expect(scaffold.isActive).toBe(true)
  })

  it('should identify scaffold properties correctly', () => {
    const scaffoldProps = {
      dayOfWeek: { select: { name: 'Mon' } },
      defaultCourts: { number: 2 },
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
        dayOfWeek: 'Mon',
        time: '19:00',
        defaultCourts: 2,
        isActive: true,
      }

      config.store.create(scaffold)
      const updated = config.store.update('sc_update_test', {
        time: '20:00',
        defaultCourts: 3,
      })

      expect(updated.time).toBe('20:00')
      expect(updated.defaultCourts).toBe(3)
      expect(updated.dayOfWeek).toBe('Mon')
      expect(updated.isActive).toBe(true)

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
        dayOfWeek: 'Tue',
        time: '18:00',
        defaultCourts: 1,
        isActive: true,
      }

      config.store.create(scaffold)
      expect(config.store.findById('sc_delete_test')).toBeDefined()

      config.store.delete('sc_delete_test')
      expect(config.store.findById('sc_delete_test')).toBeUndefined()
    })

    it('should retrieve all scaffolds', () => {
      const scaffold1: Scaffold = {
        id: 'sc_all_1',
        dayOfWeek: 'Mon',
        time: '19:00',
        defaultCourts: 2,
        isActive: true,
      }

      const scaffold2: Scaffold = {
        id: 'sc_all_2',
        dayOfWeek: 'Wed',
        time: '20:00',
        defaultCourts: 3,
        isActive: false,
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
        dayOfWeek: 'Mon',
        time: '19:00',
        defaultCourts: 2,
        isActive: true,
      })

      config.store.create({
        id: 'sc_clear_2',
        dayOfWeek: 'Tue',
        time: '20:00',
        defaultCourts: 3,
        isActive: true,
      })

      expect(config.store.getAll()).toHaveLength(2)

      config.store.clear()
      expect(config.store.getAll()).toHaveLength(0)
    })
  })

  describe('Optional Field Handling', () => {
    it('should handle scaffold with announcementDeadline = "-0h" (edge case)', () => {
      const scaffold: Scaffold = {
        id: 'sc_zero_hours',
        dayOfWeek: 'Thu',
        time: '19:00',
        defaultCourts: 2,
        isActive: true,
        announcementDeadline: '-0h',
      }

      config.store.create(scaffold)
      const retrieved = config.store.findById('sc_zero_hours')

      expect(retrieved).toEqual(scaffold)
      expect(retrieved?.announcementDeadline).toBe('-0h')
    })

    it('should handle scaffold WITHOUT announcementDeadline', () => {
      const scaffold: Scaffold = {
        id: 'sc_no_announce',
        dayOfWeek: 'Fri',
        time: '18:30',
        defaultCourts: 1,
        isActive: true,
      }

      config.store.create(scaffold)
      const retrieved = config.store.findById('sc_no_announce')

      expect(retrieved).toEqual(scaffold)
      expect(retrieved?.announcementDeadline).toBeUndefined()
    })

    it('should convert scaffold with announcementDeadline to Notion page', () => {
      const scaffold: Scaffold = {
        id: 'sc_with_announce',
        dayOfWeek: 'Sat',
        time: '10:00',
        defaultCourts: 4,
        isActive: true,
        announcementDeadline: '-2d',
      }

      const notionPage = config.converters.toNotionPage(scaffold, 'page-456')

      expect(notionPage.properties.announcementDeadline).toBeDefined()
      expect((notionPage.properties.announcementDeadline as any).rich_text[0].plain_text).toBe(
        '-2d'
      )
    })

    it('should convert scaffold WITHOUT announcementDeadline to Notion page', () => {
      const scaffold: Scaffold = {
        id: 'sc_without_announce',
        dayOfWeek: 'Sun',
        time: '11:00',
        defaultCourts: 3,
        isActive: false,
      }

      const notionPage = config.converters.toNotionPage(scaffold, 'page-789')

      expect(notionPage.properties.announcementDeadline).toBeUndefined()
    })

    it('should parse Notion properties with announcementDeadline', () => {
      const properties = {
        id: {
          title: [{ plain_text: 'sc_parse_with', text: { content: 'sc_parse_with' } }],
        },
        dayOfWeek: {
          select: { name: 'Mon' },
        },
        time: {
          rich_text: [{ plain_text: '19:00', text: { content: '19:00' } }],
        },
        defaultCourts: {
          number: 2,
        },
        isActive: {
          checkbox: true,
        },
        announcementDeadline: {
          rich_text: [{ plain_text: '-1d', text: { content: '-1d' } }],
        },
      }

      const scaffold = config.converters.fromNotionProperties(properties)

      expect(scaffold.announcementDeadline).toBe('-1d')
    })

    it('should parse Notion properties WITHOUT announcementDeadline', () => {
      const properties = {
        id: {
          title: [{ plain_text: 'sc_parse_without', text: { content: 'sc_parse_without' } }],
        },
        dayOfWeek: {
          select: { name: 'Tue' },
        },
        time: {
          rich_text: [{ plain_text: '20:00', text: { content: '20:00' } }],
        },
        defaultCourts: {
          number: 3,
        },
        isActive: {
          checkbox: false,
        },
      }

      const scaffold = config.converters.fromNotionProperties(properties)

      expect(scaffold.announcementDeadline).toBeUndefined()
    })
  })

  describe('Round-trip Conversions', () => {
    it('should preserve all data in round-trip conversion WITH announcementDeadline', () => {
      const originalScaffold: Scaffold = {
        id: 'sc_roundtrip_1',
        dayOfWeek: 'Wed',
        time: '19:30',
        defaultCourts: 2,
        isActive: true,
        announcementDeadline: '-1d 12:00',
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalScaffold, 'page-rt-1')

      // Convert back to Scaffold
      const reconstructedScaffold = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedScaffold).toEqual(originalScaffold)
    })

    it('should preserve all data in round-trip conversion WITHOUT announcementDeadline', () => {
      const originalScaffold: Scaffold = {
        id: 'sc_roundtrip_2',
        dayOfWeek: 'Fri',
        time: '21:00',
        defaultCourts: 4,
        isActive: false,
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalScaffold, 'page-rt-2')

      // Convert back to Scaffold
      const reconstructedScaffold = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedScaffold).toEqual(originalScaffold)
    })

    it('should preserve announcementDeadline = "-0h" in round-trip conversion', () => {
      const originalScaffold: Scaffold = {
        id: 'sc_roundtrip_zero',
        dayOfWeek: 'Sat',
        time: '10:00',
        defaultCourts: 1,
        isActive: true,
        announcementDeadline: '-0h',
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalScaffold, 'page-rt-zero')

      // Convert back to Scaffold
      const reconstructedScaffold = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedScaffold).toEqual(originalScaffold)
      expect(reconstructedScaffold.announcementDeadline).toBe('-0h')
    })
  })
})
