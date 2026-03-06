import { describe, it, expect } from 'vitest'

import { formatAnnouncementDeadline, dayNameBefore } from './announcement'

describe('announcement formatters', () => {
  describe('formatAnnouncementDeadline', () => {
    it('formats 1 day with singular', () => {
      expect(formatAnnouncementDeadline('-1d 10:00')).toBe('📣 Announcement: a day before, 10:00')
    })

    it('formats 2 days with plural', () => {
      expect(formatAnnouncementDeadline('-2d 18:00')).toBe('📣 Announcement: 2 days before, 18:00')
    })

    it('formats 3 days with plural', () => {
      expect(formatAnnouncementDeadline('-3d 12:00')).toBe('📣 Announcement: 3 days before, 12:00')
    })

    it('uses provided default when null', () => {
      expect(formatAnnouncementDeadline(null, '-1d 12:00')).toBe(
        '📣 Announcement: a day before, 12:00'
      )
    })

    it('uses provided custom default when null', () => {
      expect(formatAnnouncementDeadline(null, '-2d 10:00')).toBe(
        '📣 Announcement: 2 days before, 10:00'
      )
    })
  })

  describe('dayNameBefore', () => {
    it('returns Fri for 1 day before Sat', () => {
      expect(dayNameBefore('Sat', 1)).toBe('Fri')
    })

    it('returns Thu for 2 days before Sat', () => {
      expect(dayNameBefore('Sat', 2)).toBe('Thu')
    })

    it('wraps around week: Sun for 1 day before Mon', () => {
      expect(dayNameBefore('Mon', 1)).toBe('Sun')
    })

    it('wraps around week: Sat for 2 days before Mon', () => {
      expect(dayNameBefore('Mon', 2)).toBe('Sat')
    })
  })
})
