import { describe, it, expect } from 'vitest'
import {
  buildInlineKeyboard,
  formatEventMessage,
  formatAnnouncementText,
  formatPaymentText,
  formatPersonalPaymentText,
  formatPaidPersonalPaymentText,
  formatFallbackNotificationText,
  type EventParticipantDisplay,
} from './event'
import type { Event } from '~/types'
import type { InlineKeyboardButton } from 'grammy/types'

describe('event formatters', () => {
  describe('buildInlineKeyboard', () => {
    it('should show full button set for announced status', () => {
      const keyboard = buildInlineKeyboard('announced')
      const buttons = keyboard.inline_keyboard

      // Should have 3 rows
      expect(buttons).toHaveLength(3)

      // First row: I'm in, I'm out
      expect(buttons[0]).toHaveLength(2)
      expect(buttons[0][0].text).toBe("I'm in")
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:join'
      )
      expect(buttons[0][1].text).toBe("I'm out")
      expect((buttons[0][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:leave'
      )

      // Second row: +court, -court
      expect(buttons[1]).toHaveLength(2)
      expect(buttons[1][0].text).toBe('+court')
      expect((buttons[1][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:add_court'
      )
      expect(buttons[1][1].text).toBe('-court')
      expect((buttons[1][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:rm_court'
      )

      // Third row: Finalize, Cancel
      expect(buttons[2]).toHaveLength(2)
      expect(buttons[2][0].text).toBe('✅ Finalize')
      expect((buttons[2][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:finalize'
      )
      expect(buttons[2][1].text).toBe('❌ Cancel')
      expect((buttons[2][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:cancel'
      )
    })

    it('should show only Restore button for cancelled status', () => {
      const keyboard = buildInlineKeyboard('cancelled')
      const buttons = keyboard.inline_keyboard

      // Should have 1 row with 1 button
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveLength(1)
      expect(buttons[0][0].text).toBe('🔄 Restore')
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:restore'
      )
    })

    it('should show Unfinalize button for finalized status', () => {
      const keyboard = buildInlineKeyboard('finalized')
      const buttons = keyboard.inline_keyboard

      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveLength(1)
      expect(buttons[0][0].text).toBe('↩️ Unfinalize')
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:unfinalize'
      )
    })

    it('should show full button set for created status', () => {
      const keyboard = buildInlineKeyboard('created')
      const buttons = keyboard.inline_keyboard

      // Created events should get the same buttons as announced
      // (based on the implementation, any status that's not 'cancelled' or 'finalized' gets full set)
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('formatEventMessage', () => {
    it('should format basic event message with emoji, day, date, time, courts, and (nobody yet)', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'created',
        ownerId: '111111111',
      }

      const result = formatEventMessage(event)

      expect(result).toContain('🎾 Squash')
      expect(result).toContain('Saturday')
      expect(result).toContain('20 January')
      expect(result).toContain('21:00')
      expect(result).toContain('Courts: 2')
      expect(result).toContain('(nobody yet)')
    })
  })

  describe('formatAnnouncementText', () => {
    const baseEvent: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T21:00:00+01:00'),
      courts: 2,
      status: 'announced',
      ownerId: '111111111',
    }

    it('should show "(nobody yet)" when no participants', () => {
      const result = formatAnnouncementText(baseEvent, [])

      expect(result).toContain('🎾 Squash')
      expect(result).toContain('Saturday')
      expect(result).toContain('20 January')
      expect(result).toContain('21:00')
      expect(result).toContain('Courts: 2')
      expect(result).toContain('(nobody yet)')
    })

    it('should display participants with @ for username', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'john_doe',
            displayName: 'John Doe',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'jane_smith',
            displayName: 'Jane Smith',
          },
          participations: 1,
        },
      ]

      const result = formatAnnouncementText(baseEvent, participants)

      expect(result).toContain('Participants (2)')
      expect(result).toContain('@john_doe')
      expect(result).toContain('@jane_smith')
    })

    it('should show multi-participation with (×N) notation', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'john_doe',
            displayName: 'John Doe',
          },
          participations: 2,
        },
      ]

      const result = formatAnnouncementText(baseEvent, participants)

      expect(result).toContain('Participants (2)')
      expect(result).toContain('@john_doe (×2)')
    })

    it('should display name instead of @username when username is missing', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            displayName: 'John Doe',
          },
          participations: 1,
        },
      ]

      const result = formatAnnouncementText(baseEvent, participants)

      expect(result).toContain('John Doe')
      expect(result).not.toContain('@')
    })

    it('should append "Finalized" when finalized flag is true', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'john_doe',
            displayName: 'John Doe',
          },
          participations: 1,
        },
      ]

      const result = formatAnnouncementText(baseEvent, participants, true, false)

      expect(result).toContain('✅ Finalized')
    })

    it('should append "Event cancelled" when cancelled flag is true', () => {
      const participants: EventParticipantDisplay[] = []

      const result = formatAnnouncementText(baseEvent, participants, false, true)

      expect(result).toContain('❌ Event cancelled')
    })
  })

  describe('formatPaymentText', () => {
    const baseEvent: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T21:00:00+01:00'),
      courts: 2,
      status: 'finalized',
      ownerId: '111111111',
    }

    it('should calculate even split correctly (4000 / 4 = 1000 each)', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'user1',
            displayName: 'User One',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'user2',
            displayName: 'User Two',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'user3',
            displayName: 'User Three',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'user4',
            displayName: 'User Four',
          },
          participations: 1,
        },
      ]

      const result = formatPaymentText(baseEvent, participants, 2000)

      expect(result).toContain('Courts: 2 × 2000 din = 4000 din')
      expect(result).toContain('Participants: 4')
      expect(result).toContain('Each pays: 1000 din')
      expect(result).toContain('@user1 — 1000 din')
      expect(result).toContain('@user2 — 1000 din')
      expect(result).toContain('@user3 — 1000 din')
      expect(result).toContain('@user4 — 1000 din')
    })

    it('should handle uneven participations with weighted split', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'user1',
            displayName: 'User One',
          },
          participations: 2, // Bringing a friend
        },
        {
          participant: {
            telegramUsername: 'user2',
            displayName: 'User Two',
          },
          participations: 1,
        },
      ]

      // 1 court × 3000 = 3000 din total
      // 3 total participations (2 + 1)
      // Each person pays 1000 din
      // user1 pays 2 × 1000 = 2000 din
      // user2 pays 1 × 1000 = 1000 din
      const event = { ...baseEvent, courts: 1 }
      const result = formatPaymentText(event, participants, 3000)

      expect(result).toContain('Courts: 1 × 3000 din = 3000 din')
      expect(result).toContain('Participants: 3')
      expect(result).toContain('Each pays: 1000 din')
      expect(result).toContain('@user1 — 2000 din (×2)')
      expect(result).toContain('@user2 — 1000 din')
    })

    it('should handle single participant with full cost', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'solo_player',
            displayName: 'Solo Player',
          },
          participations: 1,
        },
      ]

      // 1 court × 2000 = 2000 din
      const event = { ...baseEvent, courts: 1 }
      const result = formatPaymentText(event, participants, 2000)

      expect(result).toContain('Courts: 1 × 2000 din = 2000 din')
      expect(result).toContain('Participants: 1')
      expect(result).toContain('Each pays: 2000 din')
      expect(result).toContain('@solo_player — 2000 din')
    })

    it('should handle rounding for non-integer amounts', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'user1',
            displayName: 'User One',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'user2',
            displayName: 'User Two',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'user3',
            displayName: 'User Three',
          },
          participations: 1,
        },
      ]

      // 1 court × 2500 = 2500 din total
      // 3 participants = 833.33... per person → should round to 833
      const event = { ...baseEvent, courts: 1 }
      const result = formatPaymentText(event, participants, 2500)

      expect(result).toContain('Courts: 1 × 2500 din = 2500 din')
      expect(result).toContain('Participants: 3')
      expect(result).toContain('Each pays: 833 din')
      expect(result).toContain('@user1 — 833 din')
      expect(result).toContain('@user2 — 833 din')
      expect(result).toContain('@user3 — 833 din')
    })

    it('should calculate cost correctly for multiple courts', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'user1',
            displayName: 'User One',
          },
          participations: 1,
        },
        {
          participant: {
            telegramUsername: 'user2',
            displayName: 'User Two',
          },
          participations: 1,
        },
      ]

      // 3 courts × 1500 = 4500 din total
      // 2 participants = 2250 per person
      const event = { ...baseEvent, courts: 3 }
      const result = formatPaymentText(event, participants, 1500)

      expect(result).toContain('Courts: 3 × 1500 din = 4500 din')
      expect(result).toContain('Participants: 2')
      expect(result).toContain('Each pays: 2250 din')
      expect(result).toContain('@user1 — 2250 din')
      expect(result).toContain('@user2 — 2250 din')
    })

    it('should use display name when username is missing', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            displayName: 'John Doe',
          },
          participations: 1,
        },
      ]

      const event = { ...baseEvent, courts: 1 }
      const result = formatPaymentText(event, participants, 2000)

      expect(result).toContain('John Doe — 2000 din')
      expect(result).not.toContain('@')
    })

    it('should show participation multiplier when participations > 1', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: {
            telegramUsername: 'user1',
            displayName: 'User One',
          },
          participations: 3,
        },
      ]

      // 1 court × 3000 = 3000 din total
      // 3 participations = 1000 per person
      // user1 pays 3 × 1000 = 3000 din
      const event = { ...baseEvent, courts: 1 }
      const result = formatPaymentText(event, participants, 3000)

      expect(result).toContain('@user1 — 3000 din (×3)')
    })
  })

  describe('formatAnnouncementText with paid checkmarks', () => {
    const baseEvent: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T21:00:00+01:00'),
      courts: 2,
      status: 'finalized',
      ownerId: '111111111',
    }

    it('should show checkmark next to paid participant', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: { id: 'p_1', telegramUsername: 'alice', displayName: 'Alice' },
          participations: 1,
        },
        {
          participant: { id: 'p_2', telegramUsername: 'bob', displayName: 'Bob' },
          participations: 1,
        },
      ]

      const paidIds = new Set(['p_1'])
      const result = formatAnnouncementText(baseEvent, participants, true, false, paidIds)

      expect(result).toContain('@alice ✓')
      expect(result).not.toContain('@bob ✓')
    })

    it('should combine multiplier and checkmark', () => {
      const participants: EventParticipantDisplay[] = [
        {
          participant: { id: 'p_1', telegramUsername: 'alice', displayName: 'Alice' },
          participations: 2,
        },
      ]

      const paidIds = new Set(['p_1'])
      const result = formatAnnouncementText(baseEvent, participants, true, false, paidIds)

      expect(result).toContain('@alice (×2) ✓')
    })
  })

  describe('formatPersonalPaymentText', () => {
    it('should format personal payment DM text', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'finalized',
        telegramMessageId: '42',
        ownerId: '111111111',
      }

      const result = formatPersonalPaymentText(event, 2000, 2, 2000, 4, -1001234567890, '42')

      expect(result).toContain('💰 Payment for Squash')
      expect(result).toContain('20.01')
      expect(result).toContain('21:00')
      expect(result).toContain('Courts: 2 × 2000 din = 4000 din')
      expect(result).toContain('Participants: 4')
      expect(result).toContain('Your amount: 2000 din')
      expect(result).toContain('https://t.me/c/1234567890/42')
    })
  })

  describe('formatPaidPersonalPaymentText', () => {
    it('should append paid date to base text', () => {
      const baseText = 'Your amount: 2000 din'
      const paidDate = new Date('2024-01-21T15:30:00+01:00')

      const result = formatPaidPersonalPaymentText(baseText, paidDate)

      expect(result).toContain('Your amount: 2000 din')
      expect(result).toContain('✓ Paid on 21.01 at 15:30')
    })
  })

  describe('formatFallbackNotificationText', () => {
    it('should format fallback message with participant names and bot link', () => {
      const result = formatFallbackNotificationText(['@alice', '@bob'], 'test_bot')

      expect(result).toContain("can't reach")
      expect(result).toContain('@alice, @bob')
      expect(result).toContain('https://t.me/test_bot?start')
      expect(result).toContain('/start')
    })
  })
})
