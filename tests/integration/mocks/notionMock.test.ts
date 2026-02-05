import { describe, it, expect, beforeEach } from 'vitest'
import { createMockNotionClient, clearMockNotionStore } from './notionMock'
import type { Client } from '@notionhq/client'

describe('notionMock with entity registry', () => {
  const SCAFFOLD_DB_ID = '1c6408e91d3a4d308b0736e79ff5b937'
  const EVENT_DB_ID = '4e6dc64564e042c9991daf38f6b0ec85'

  let mockClient: Client

  beforeEach(() => {
    clearMockNotionStore()
    mockClient = createMockNotionClient()
  })

  describe('scaffold operations', () => {
    it('should create scaffold in correct database', async () => {
      const response = await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_test123' } }] },
          dayOfWeek: { select: { name: 'Mon' } },
          time: { rich_text: [{ text: { content: '19:00' } }] },
          defaultCourts: { number: 2 },
          isActive: { checkbox: true },
        },
      })

      expect(response.id).toBeDefined()
      if ('properties' in response) {
        expect(response.properties).toBeDefined()
      }
    })

    it('should query scaffolds by database ID', async () => {
      // Create scaffold
      await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_query_test' } }] },
          dayOfWeek: { select: { name: 'Tue' } },
          time: { rich_text: [{ text: { content: '20:00' } }] },
          defaultCourts: { number: 3 },
          isActive: { checkbox: true },
        },
      })

      // Query scaffold database
      const result = await mockClient.databases.query({
        database_id: SCAFFOLD_DB_ID,
      })

      expect(result.results).toHaveLength(1)
      expect((result.results[0] as any).properties.id.title[0].plain_text).toBe('sc_query_test')
    })

    it('should query specific scaffold by ID filter', async () => {
      // Create two scaffolds
      await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_first' } }] },
          dayOfWeek: { select: { name: 'Mon' } },
          time: { rich_text: [{ text: { content: '19:00' } }] },
          defaultCourts: { number: 2 },
          isActive: { checkbox: true },
        },
      })

      await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_second' } }] },
          dayOfWeek: { select: { name: 'Wed' } },
          time: { rich_text: [{ text: { content: '18:00' } }] },
          defaultCourts: { number: 1 },
          isActive: { checkbox: false },
        },
      })

      // Query for specific scaffold
      const result = await mockClient.databases.query({
        database_id: SCAFFOLD_DB_ID,
        filter: {
          property: 'id',
          title: {
            equals: 'sc_second',
          },
        },
      })

      expect(result.results).toHaveLength(1)
      expect((result.results[0] as any).properties.id.title[0].plain_text).toBe('sc_second')
    })
  })

  describe('event operations', () => {
    it('should create event in correct database', async () => {
      const response = await mockClient.pages.create({
        parent: { database_id: EVENT_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'ev_test456' } }] },
          datetime: { date: { start: '2025-01-15T19:00:00.000Z' } },
          courts: { number: 2 },
          status: { select: { name: 'created' } },
        },
      })

      expect(response.id).toBeDefined()
      if ('properties' in response) {
        expect(response.properties).toBeDefined()
      }
    })

    it('should query events by database ID', async () => {
      // Create event
      await mockClient.pages.create({
        parent: { database_id: EVENT_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'ev_query_test' } }] },
          datetime: { date: { start: '2025-01-20T20:00:00.000Z' } },
          courts: { number: 3 },
          status: { select: { name: 'announced' } },
        },
      })

      // Query event database
      const result = await mockClient.databases.query({
        database_id: EVENT_DB_ID,
      })

      expect(result.results).toHaveLength(1)
      expect((result.results[0] as any).properties.id.title[0].plain_text).toBe('ev_query_test')
    })
  })

  describe('database isolation', () => {
    it('should not confuse scaffolds and events', async () => {
      // Create scaffold
      await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_isolation' } }] },
          dayOfWeek: { select: { name: 'Thu' } },
          time: { rich_text: [{ text: { content: '21:00' } }] },
          defaultCourts: { number: 2 },
          isActive: { checkbox: true },
        },
      })

      // Create event
      await mockClient.pages.create({
        parent: { database_id: EVENT_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'ev_isolation' } }] },
          datetime: { date: { start: '2025-01-25T21:00:00.000Z' } },
          courts: { number: 2 },
          status: { select: { name: 'created' } },
        },
      })

      // Query scaffold database - should only return scaffold
      const scaffoldResult = await mockClient.databases.query({
        database_id: SCAFFOLD_DB_ID,
      })

      expect(scaffoldResult.results).toHaveLength(1)
      expect((scaffoldResult.results[0] as any).properties.id.title[0].plain_text).toBe('sc_isolation')

      // Query event database - should only return event
      const eventResult = await mockClient.databases.query({
        database_id: EVENT_DB_ID,
      })

      expect(eventResult.results).toHaveLength(1)
      expect((eventResult.results[0] as any).properties.id.title[0].plain_text).toBe('ev_isolation')
    })
  })

  describe('page operations', () => {
    it('should update scaffold by page ID', async () => {
      // Create scaffold
      const createResponse = await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_update' } }] },
          dayOfWeek: { select: { name: 'Fri' } },
          time: { rich_text: [{ text: { content: '22:00' } }] },
          defaultCourts: { number: 2 },
          isActive: { checkbox: true },
        },
      })

      // Update scaffold
      const updateResponse = await mockClient.pages.update({
        page_id: createResponse.id,
        properties: {
          isActive: { checkbox: false },
        },
      })

      expect((updateResponse as any).properties.isActive.checkbox).toBe(false)
    })

    it('should retrieve scaffold by page ID', async () => {
      // Create scaffold
      const createResponse = await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_retrieve' } }] },
          dayOfWeek: { select: { name: 'Sat' } },
          time: { rich_text: [{ text: { content: '10:00' } }] },
          defaultCourts: { number: 4 },
          isActive: { checkbox: true },
        },
      })

      // Retrieve scaffold
      const retrieveResponse = await mockClient.pages.retrieve({
        page_id: createResponse.id,
      })

      expect((retrieveResponse as any).properties.id.title[0].plain_text).toBe('sc_retrieve')
    })

    it('should archive scaffold by page ID', async () => {
      // Create scaffold
      const createResponse = await mockClient.pages.create({
        parent: { database_id: SCAFFOLD_DB_ID },
        properties: {
          id: { title: [{ text: { content: 'sc_archive' } }] },
          dayOfWeek: { select: { name: 'Sun' } },
          time: { rich_text: [{ text: { content: '11:00' } }] },
          defaultCourts: { number: 1 },
          isActive: { checkbox: true },
        },
      })

      // Archive scaffold
      await mockClient.pages.update({
        page_id: createResponse.id,
        archived: true,
      })

      // Query should return empty results
      const result = await mockClient.databases.query({
        database_id: SCAFFOLD_DB_ID,
      })

      expect(result.results).toHaveLength(0)
    })
  })
})
