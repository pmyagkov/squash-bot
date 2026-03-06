import { describe, it, expect } from 'vitest'
import type { InlineKeyboardButton } from 'grammy/types'

import {
  formatAnnouncementDeadline,
  dayNameBefore,
  buildAnnouncementDayKeyboard,
  buildAnnouncementTimeKeyboard,
  parseAnnTimeCallback,
} from './announcement'

type CB = InlineKeyboardButton.CallbackButton

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

  describe('buildAnnouncementDayKeyboard', () => {
    it('builds keyboard with 3 day buttons for Sat scaffold', () => {
      const keyboard = buildAnnouncementDayKeyboard('Sat', 'sc_1')
      const rows = keyboard.inline_keyboard

      expect(rows[0]).toHaveLength(3)
      expect(rows[0][0].text).toBe('Fri')
      expect((rows[0][0] as CB).callback_data).toBe('edit:scaffold:ann-date:-1d:sc_1')
      expect(rows[0][1].text).toBe('Thu')
      expect((rows[0][1] as CB).callback_data).toBe('edit:scaffold:ann-date:-2d:sc_1')
      expect(rows[0][2].text).toBe('Wed')
      expect((rows[0][2] as CB).callback_data).toBe('edit:scaffold:ann-date:-3d:sc_1')
    })
  })

  describe('buildAnnouncementTimeKeyboard', () => {
    it('builds keyboard with preset times and custom option', () => {
      const keyboard = buildAnnouncementTimeKeyboard('-1d', 'sc_1')
      const rows = keyboard.inline_keyboard

      expect(rows[0][0].text).toBe('10:00')
      expect((rows[0][0] as CB).callback_data).toBe('edit:scaffold:ann-time:-1d-10-00:sc_1')
      expect(rows[0][1].text).toBe('18:00')
      expect((rows[0][1] as CB).callback_data).toBe('edit:scaffold:ann-time:-1d-18-00:sc_1')
      expect(rows[1][0].text).toContain('Custom')
      expect((rows[1][0] as CB).callback_data).toBe('edit:scaffold:ann-custom:-1d:sc_1')
    })
  })

  describe('parseAnnTimeCallback', () => {
    it('parses -1d-10-00 to notation -1d 10:00', () => {
      expect(parseAnnTimeCallback('-1d-10-00')).toBe('-1d 10:00')
    })

    it('parses -2d-18-00 to notation -2d 18:00', () => {
      expect(parseAnnTimeCallback('-2d-18-00')).toBe('-2d 18:00')
    })

    it('parses -3d-09-30 to notation -3d 09:30', () => {
      expect(parseAnnTimeCallback('-3d-09-30')).toBe('-3d 09:30')
    })
  })
})
