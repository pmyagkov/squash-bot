import { describe, it, expect } from 'vitest'
import { formatScaffoldListItem, formatEventListItem } from './list'
import type { Scaffold, Event } from '~/types'

const baseScaffold: Scaffold = {
  id: 'sc_abc123',
  dayOfWeek: 'Wed',
  time: '19:00',
  defaultCourts: 2,
  isActive: true,
  isPrivate: false,
  participants: [],
}

const baseEvent: Event = {
  id: 'ev_xyz789',
  datetime: new Date('2026-03-01T19:00:00Z'),
  courts: 3,
  status: 'announced',
  ownerId: '12345',
  isPrivate: false,
}

describe('list formatters', () => {
  describe('formatScaffoldListItem', () => {
    it('should format basic scaffold without owner', () => {
      const result = formatScaffoldListItem(baseScaffold)

      expect(result).toContain('<code>sc_abc123</code>')
      expect(result).toContain('Wed, 19:00')
      expect(result).toContain('🏟 Courts: 2')
      expect(result).toContain('🟢 Active')
      expect(result).toContain('📢 Public')
      expect(result).not.toContain('👑')
    })

    it('should include owner label when provided', () => {
      const result = formatScaffoldListItem(baseScaffold, '@johndoe')

      expect(result).toContain(' | 👑 @johndoe')
    })

    it('should show Private for private scaffold', () => {
      const privateScaffold: Scaffold = { ...baseScaffold, isPrivate: true }
      const result = formatScaffoldListItem(privateScaffold)

      expect(result).toContain('🔒 Private')
      expect(result).not.toContain('📢 Public')
    })

    it('should show Paused for inactive scaffold', () => {
      const pausedScaffold: Scaffold = { ...baseScaffold, isActive: false }
      const result = formatScaffoldListItem(pausedScaffold)

      expect(result).toContain('⏸ Paused')
      expect(result).not.toContain('🟢 Active')
    })

    it('should use pipe separators between all fields', () => {
      const result = formatScaffoldListItem(baseScaffold)
      const parts = result.split(' | ')

      expect(parts).toHaveLength(5)
      expect(parts[0]).toBe('<code>sc_abc123</code>')
      expect(parts[1]).toBe('Wed, 19:00')
      expect(parts[2]).toBe('🏟 Courts: 2')
      expect(parts[3]).toBe('🟢 Active')
      expect(parts[4]).toBe('📢 Public')
    })
  })

  describe('formatEventListItem', () => {
    it('should format basic event without owner', () => {
      const result = formatEventListItem(baseEvent, 'Sun, 1 Mar, 19:00')

      expect(result).toContain('<code>ev_xyz789</code>')
      expect(result).toContain('Sun, 1 Mar, 19:00')
      expect(result).toContain('🏟 Courts: 3')
      expect(result).toContain('📣 Announced')
      expect(result).toContain('📢 Public')
      expect(result).not.toContain('👑')
    })

    it('should include owner label when provided', () => {
      const result = formatEventListItem(baseEvent, 'Sun, 1 Mar, 19:00', '@admin')

      expect(result).toContain(' | 👑 @admin')
    })

    it('should show Private for private event', () => {
      const privateEvent: Event = { ...baseEvent, isPrivate: true }
      const result = formatEventListItem(privateEvent, 'Sun, 1 Mar, 19:00')

      expect(result).toContain('🔒 Private')
      expect(result).not.toContain('📢 Public')
    })

    it('should show correct status for created event', () => {
      const createdEvent: Event = { ...baseEvent, status: 'created' }
      const result = formatEventListItem(createdEvent, 'Sun, 1 Mar, 19:00')

      expect(result).toContain('📝 Created')
    })

    it('should show correct status for finalized event', () => {
      const finalizedEvent: Event = { ...baseEvent, status: 'finalized' }
      const result = formatEventListItem(finalizedEvent, 'Sun, 1 Mar, 19:00')

      expect(result).toContain('✅ Finalized')
    })

    it('should use pipe separators between all fields', () => {
      const result = formatEventListItem(baseEvent, 'Sun, 1 Mar, 19:00')
      const parts = result.split(' | ')

      expect(parts).toHaveLength(5)
      expect(parts[0]).toBe('<code>ev_xyz789</code>')
      expect(parts[1]).toBe('Sun, 1 Mar, 19:00')
      expect(parts[2]).toBe('🏟 Courts: 3')
      expect(parts[3]).toBe('📣 Announced')
      expect(parts[4]).toBe('📢 Public')
    })
  })
})
