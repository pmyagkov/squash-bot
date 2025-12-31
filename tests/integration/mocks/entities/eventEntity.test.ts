import { describe, it, expect, beforeEach } from 'vitest'
import { createEventEntityConfig } from './eventEntity'
import type { Event } from '~/types'

describe('Event Entity Config', () => {
  let config: ReturnType<typeof createEventEntityConfig>

  beforeEach(() => {
    config = createEventEntityConfig()
    config.store.clear()
  })

  it('should create and retrieve event', () => {
    const event: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 2,
      status: 'created',
    }

    config.store.create(event)
    const retrieved = config.store.findById('ev_test123')

    expect(retrieved).toEqual(event)
  })

  it('should convert event to Notion page format', () => {
    const event: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts: 3,
      status: 'announced',
    }

    const notionPage = config.converters.toNotionPage(event, 'page-123')

    expect(notionPage.id).toBe('page-123')
    expect(notionPage.properties.id).toHaveProperty('title')
    expect((notionPage.properties.id as any).title[0].plain_text).toBe('ev_test123')
    expect((notionPage.properties.datetime as any).date.start).toBe('2024-01-20T19:00:00.000Z')
    expect((notionPage.properties.courts as any).number).toBe(3)
    expect((notionPage.properties.status as any).select.name).toBe('announced')
  })

  it('should convert event with scaffold relation to Notion page format', () => {
    const event: Event = {
      id: 'ev_with_scaffold',
      scaffold_id: 'sc_123',
      datetime: new Date('2024-01-21T20:00:00Z'),
      courts: 2,
      status: 'created',
    }

    // Set up context with scaffold page ID mapping
    const context = {
      scaffoldPageId: 'scaffold-page-456',
    }

    const notionPage = config.converters.toNotionPage(event, 'page-456', context)

    expect((notionPage.properties.scaffold_id as any).relation).toEqual([{ id: 'scaffold-page-456' }])
  })

  it('should parse Notion properties to event', () => {
    const properties = {
      id: {
        title: [{ plain_text: 'ev_test123', text: { content: 'ev_test123' } }],
      },
      datetime: {
        date: { start: '2024-01-20T19:00:00Z' },
      },
      courts: {
        number: 2,
      },
      status: {
        select: { name: 'created' },
      },
    }

    const event = config.converters.fromNotionProperties(properties)

    expect(event.id).toBe('ev_test123')
    expect(event.datetime).toEqual(new Date('2024-01-20T19:00:00Z'))
    expect(event.courts).toBe(2)
    expect(event.status).toBe('created')
  })

  it('should parse Notion properties with scaffold relation to event', () => {
    const properties = {
      id: {
        title: [{ plain_text: 'ev_with_scaffold', text: { content: 'ev_with_scaffold' } }],
      },
      datetime: {
        date: { start: '2024-01-21T20:00:00Z' },
      },
      courts: {
        number: 3,
      },
      status: {
        select: { name: 'announced' },
      },
      scaffold_id: {
        relation: [{ id: 'scaffold-page-789' }],
      },
    }

    // Set up context with scaffold page ID reverse mapping
    const context = {
      scaffoldPageIdMap: new Map([['scaffold-page-789', 'sc_monday']]),
    }

    const event = config.converters.fromNotionProperties(properties, context)

    expect(event.scaffold_id).toBe('sc_monday')
  })

  it('should identify event properties correctly', () => {
    const eventProps = {
      datetime: { date: { start: '2024-01-20T19:00:00Z' } },
      courts: { number: 2 },
    }

    const scaffoldProps = {
      day_of_week: { select: { name: 'Mon' } },
      default_courts: { number: 2 },
    }

    expect(config.converters.matchesEntityType(eventProps)).toBe(true)
    expect(config.converters.matchesEntityType(scaffoldProps)).toBe(false)
  })

  describe('Store Operations', () => {
    it('should update existing event', () => {
      const event: Event = {
        id: 'ev_update_test',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      }

      config.store.create(event)
      const updated = config.store.update('ev_update_test', {
        courts: 3,
        status: 'announced',
      })

      expect(updated.courts).toBe(3)
      expect(updated.status).toBe('announced')
      expect(updated.datetime).toEqual(event.datetime)

      const retrieved = config.store.findById('ev_update_test')
      expect(retrieved).toEqual(updated)
    })

    it('should throw error when updating non-existent event', () => {
      expect(() => {
        config.store.update('non_existent_id', { courts: 3 })
      }).toThrow('Event with id non_existent_id not found')
    })

    it('should delete event', () => {
      const event: Event = {
        id: 'ev_delete_test',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 1,
        status: 'created',
      }

      config.store.create(event)
      expect(config.store.findById('ev_delete_test')).toBeDefined()

      config.store.delete('ev_delete_test')
      expect(config.store.findById('ev_delete_test')).toBeUndefined()
    })

    it('should retrieve all events', () => {
      const event1: Event = {
        id: 'ev_all_1',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      }

      const event2: Event = {
        id: 'ev_all_2',
        datetime: new Date('2024-01-21T20:00:00Z'),
        courts: 3,
        status: 'announced',
      }

      config.store.create(event1)
      config.store.create(event2)

      const allEvents = config.store.getAll()
      expect(allEvents).toHaveLength(2)
      expect(allEvents).toContainEqual(event1)
      expect(allEvents).toContainEqual(event2)
    })

    it('should clear all events', () => {
      config.store.create({
        id: 'ev_clear_1',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      })

      config.store.create({
        id: 'ev_clear_2',
        datetime: new Date('2024-01-21T20:00:00Z'),
        courts: 3,
        status: 'announced',
      })

      expect(config.store.getAll()).toHaveLength(2)

      config.store.clear()
      expect(config.store.getAll()).toHaveLength(0)
    })
  })

  describe('Optional Field Handling', () => {
    it('should handle event with all optional fields', () => {
      const event: Event = {
        id: 'ev_all_optional',
        scaffold_id: 'sc_123',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'announced',
        telegram_message_id: 'msg_123',
        payment_message_id: 'pay_msg_456',
      }

      config.store.create(event)
      const retrieved = config.store.findById('ev_all_optional')

      expect(retrieved).toEqual(event)
      expect(retrieved?.scaffold_id).toBe('sc_123')
      expect(retrieved?.telegram_message_id).toBe('msg_123')
      expect(retrieved?.payment_message_id).toBe('pay_msg_456')
    })

    it('should handle event WITHOUT optional fields', () => {
      const event: Event = {
        id: 'ev_no_optional',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      }

      config.store.create(event)
      const retrieved = config.store.findById('ev_no_optional')

      expect(retrieved).toEqual(event)
      expect(retrieved?.scaffold_id).toBeUndefined()
      expect(retrieved?.telegram_message_id).toBeUndefined()
      expect(retrieved?.payment_message_id).toBeUndefined()
    })

    it('should convert event with all optional fields to Notion page', () => {
      const event: Event = {
        id: 'ev_with_all',
        scaffold_id: 'sc_456',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 3,
        status: 'finalized',
        telegram_message_id: 'tg_789',
        payment_message_id: 'pay_012',
      }

      const context = {
        scaffoldPageId: 'scaffold-page-999',
      }

      const notionPage = config.converters.toNotionPage(event, 'page-555', context)

      expect(notionPage.properties.scaffold_id).toBeDefined()
      expect((notionPage.properties.scaffold_id as any).relation).toEqual([{ id: 'scaffold-page-999' }])
      expect(notionPage.properties.telegram_message_id).toBeDefined()
      expect((notionPage.properties.telegram_message_id as any).rich_text[0].plain_text).toBe('tg_789')
      expect(notionPage.properties.payment_message_id).toBeDefined()
      expect((notionPage.properties.payment_message_id as any).rich_text[0].plain_text).toBe('pay_012')
    })

    it('should convert event WITHOUT optional fields to Notion page', () => {
      const event: Event = {
        id: 'ev_without_optional',
        datetime: new Date('2024-01-20T19:00:00Z'),
        courts: 2,
        status: 'created',
      }

      const notionPage = config.converters.toNotionPage(event, 'page-666')

      expect(notionPage.properties.scaffold_id).toBeUndefined()
      expect(notionPage.properties.telegram_message_id).toBeUndefined()
      expect(notionPage.properties.payment_message_id).toBeUndefined()
    })

    it('should parse Notion properties with all optional fields', () => {
      const properties = {
        id: {
          title: [{ plain_text: 'ev_parse_with', text: { content: 'ev_parse_with' } }],
        },
        datetime: {
          date: { start: '2024-01-20T19:00:00Z' },
        },
        courts: {
          number: 2,
        },
        status: {
          select: { name: 'paid' },
        },
        scaffold_id: {
          relation: [{ id: 'scaffold-page-111' }],
        },
        telegram_message_id: {
          rich_text: [{ plain_text: 'tg_222', text: { content: 'tg_222' } }],
        },
        payment_message_id: {
          rich_text: [{ plain_text: 'pay_333', text: { content: 'pay_333' } }],
        },
      }

      const context = {
        scaffoldPageIdMap: new Map([['scaffold-page-111', 'sc_tuesday']]),
      }

      const event = config.converters.fromNotionProperties(properties, context)

      expect(event.scaffold_id).toBe('sc_tuesday')
      expect(event.telegram_message_id).toBe('tg_222')
      expect(event.payment_message_id).toBe('pay_333')
    })

    it('should parse Notion properties WITHOUT optional fields', () => {
      const properties = {
        id: {
          title: [{ plain_text: 'ev_parse_without', text: { content: 'ev_parse_without' } }],
        },
        datetime: {
          date: { start: '2024-01-21T20:00:00Z' },
        },
        courts: {
          number: 3,
        },
        status: {
          select: { name: 'cancelled' },
        },
      }

      const event = config.converters.fromNotionProperties(properties)

      expect(event.scaffold_id).toBeUndefined()
      expect(event.telegram_message_id).toBeUndefined()
      expect(event.payment_message_id).toBeUndefined()
    })
  })

  describe('Round-trip Conversions', () => {
    it('should preserve all data in round-trip conversion WITH all optional fields', () => {
      const originalEvent: Event = {
        id: 'ev_roundtrip_1',
        scaffold_id: 'sc_wednesday',
        datetime: new Date('2024-01-22T19:30:00Z'),
        courts: 2,
        status: 'finalized',
        telegram_message_id: 'tg_rt_1',
        payment_message_id: 'pay_rt_1',
      }

      // Set up scaffold page ID mapping for round-trip
      const scaffoldPageId = 'scaffold-page-rt-1'
      const context = {
        scaffoldPageId,
        scaffoldPageIdMap: new Map([[scaffoldPageId, 'sc_wednesday']]),
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalEvent, 'page-rt-1', context)

      // Convert back to Event
      const reconstructedEvent = config.converters.fromNotionProperties(notionPage.properties, context)

      expect(reconstructedEvent).toEqual(originalEvent)
    })

    it('should preserve all data in round-trip conversion WITHOUT optional fields', () => {
      const originalEvent: Event = {
        id: 'ev_roundtrip_2',
        datetime: new Date('2024-01-23T21:00:00Z'),
        courts: 4,
        status: 'finished',
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalEvent, 'page-rt-2')

      // Convert back to Event
      const reconstructedEvent = config.converters.fromNotionProperties(notionPage.properties)

      expect(reconstructedEvent).toEqual(originalEvent)
    })

    it('should preserve partial optional fields in round-trip conversion', () => {
      const originalEvent: Event = {
        id: 'ev_roundtrip_partial',
        scaffold_id: 'sc_thursday',
        datetime: new Date('2024-01-24T18:00:00Z'),
        courts: 1,
        status: 'announced',
        telegram_message_id: 'tg_partial',
        // payment_message_id intentionally omitted
      }

      // Set up scaffold page ID mapping for round-trip
      const scaffoldPageId = 'scaffold-page-rt-partial'
      const context = {
        scaffoldPageId,
        scaffoldPageIdMap: new Map([[scaffoldPageId, 'sc_thursday']]),
      }

      // Convert to Notion page
      const notionPage = config.converters.toNotionPage(originalEvent, 'page-rt-partial', context)

      // Convert back to Event
      const reconstructedEvent = config.converters.fromNotionProperties(notionPage.properties, context)

      expect(reconstructedEvent).toEqual(originalEvent)
      expect(reconstructedEvent.scaffold_id).toBe('sc_thursday')
      expect(reconstructedEvent.telegram_message_id).toBe('tg_partial')
      expect(reconstructedEvent.payment_message_id).toBeUndefined()
    })
  })
})
