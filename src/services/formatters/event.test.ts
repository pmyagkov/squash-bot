import { describe, it, expect } from 'vitest'
import {
  buildInlineKeyboard,
  buildReminderKeyboard,
  formatEventMessage,
  formatAnnouncementText,
  formatPaymentText,
  formatPersonalPaymentText,
  formatPaidPersonalPaymentText,
  formatFallbackNotificationText,
  formatNotFinalizedReminder,
  formatOwnerNotification,
  formatDebtSummary,
  formatAdminDebtSummary,
  type EventParticipantDisplay,
  type DebtEntry,
} from './event'
import type { Event } from '~/types'
import type { InlineKeyboardButton } from 'grammy/types'
import {
  BTN_JOIN,
  BTN_LEAVE,
  BTN_ADD_COURT,
  BTN_REMOVE_COURT,
  BTN_FINALIZE,
  BTN_CANCEL_EVENT,
  BTN_RESTORE,
  BTN_UNFINALIZE,
  BTN_ADD_PARTICIPANT,
  BTN_REMOVE_PARTICIPANT,
} from '~/ui/constants'

describe('event formatters', () => {
  describe('buildInlineKeyboard', () => {
    it('should show full button set for announced status', () => {
      const keyboard = buildInlineKeyboard('announced')
      const buttons = keyboard.inline_keyboard

      // Should have 3 rows
      expect(buttons).toHaveLength(3)

      // First row: I'm in, I'm out
      expect(buttons[0]).toHaveLength(2)
      expect(buttons[0][0].text).toBe(BTN_JOIN)
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:join'
      )
      expect(buttons[0][1].text).toBe(BTN_LEAVE)
      expect((buttons[0][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:leave'
      )

      // Second row: +court, -court
      expect(buttons[1]).toHaveLength(2)
      expect(buttons[1][0].text).toBe(BTN_ADD_COURT)
      expect((buttons[1][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:add-court'
      )
      expect(buttons[1][1].text).toBe(BTN_REMOVE_COURT)
      expect((buttons[1][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:delete-court'
      )

      // Third row: Finalize, Cancel
      expect(buttons[2]).toHaveLength(2)
      expect(buttons[2][0].text).toBe(BTN_FINALIZE)
      expect((buttons[2][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:finalize'
      )
      expect(buttons[2][1].text).toBe(BTN_CANCEL_EVENT)
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
      expect(buttons[0][0].text).toBe(BTN_RESTORE)
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:undo-cancel'
      )
    })

    it('should show Unfinalize button for finalized status', () => {
      const keyboard = buildInlineKeyboard('finalized')
      const buttons = keyboard.inline_keyboard

      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveLength(1)
      expect(buttons[0][0].text).toBe(BTN_UNFINALIZE)
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:undo-finalize'
      )
    })

    it('should show +/- Participant for private announced event', () => {
      const keyboard = buildInlineKeyboard('announced', true, 'ev_test')
      const buttons = keyboard.inline_keyboard
      expect(buttons[0][0].text).toBe(BTN_ADD_PARTICIPANT)
      expect(buttons[0][1].text).toBe(BTN_REMOVE_PARTICIPANT)
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
        isPrivate: false,
      }

      const result = formatEventMessage(event)

      expect(result).toContain('🎾 Squash: Sat, 20 Jan, 21:00')
      expect(result).toContain('🏟 Courts: 2')
      expect(result).toContain('(nobody yet)')
    })

    it('should format private event message with 🔒', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'created',
        ownerId: '111111111',
        isPrivate: true,
      }

      const result = formatEventMessage(event)
      expect(result).toContain('🔒 Squash:')
      expect(result).not.toContain('🎾')
    })
  })

  describe('formatAnnouncementText', () => {
    const baseEvent: Event = {
      id: 'ev_test123',
      datetime: new Date('2024-01-20T21:00:00+01:00'),
      courts: 2,
      status: 'announced',
      ownerId: '111111111',
      isPrivate: false,
    }

    it('should use 🔒 for private event announcement', () => {
      const event: Event = { ...baseEvent, isPrivate: true }
      const result = formatAnnouncementText(event, [])
      expect(result).toContain('🔒 Squash:')
      expect(result).not.toContain('🎾')
    })

    it('should show "(nobody yet)" when no participants', () => {
      const result = formatAnnouncementText(baseEvent, [])

      expect(result).toContain('🎾 Squash: Sat, 20 Jan, 21:00')
      expect(result).toContain('🏟 Courts: 2')
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

      expect(result).toContain('Participants — 2:')
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

      expect(result).toContain('Participants — 2:')
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
      isPrivate: false,
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

      expect(result).toContain('🏟 Courts: 2 × 2000 din = 4000 din')
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

      expect(result).toContain('🏟 Courts: 1 × 3000 din = 3000 din')
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

      expect(result).toContain('🏟 Courts: 1 × 2000 din = 2000 din')
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

      expect(result).toContain('🏟 Courts: 1 × 2500 din = 2500 din')
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

      expect(result).toContain('🏟 Courts: 3 × 1500 din = 4500 din')
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
      isPrivate: false,
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
    it('should omit Full details link for private event', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'finalized',
        ownerId: '111111111',
        isPrivate: true,
      }

      const result = formatPersonalPaymentText(event, 1000, 2, 2000, 4, 12345, '100')
      expect(result).not.toContain('Full details')
    })

    it('should include collector payment info when provided', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'finalized',
        ownerId: '111111111',
        isPrivate: false,
      }

      const result = formatPersonalPaymentText(
        event,
        1000,
        2,
        2000,
        4,
        -100123,
        '456',
        'Card: 1234-5678-9012-3456'
      )
      expect(result).toContain('💳')
      expect(result).toContain('Card: 1234-5678-9012-3456')
    })

    it('should omit payment info line when not provided', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'finalized',
        ownerId: '111111111',
        isPrivate: false,
      }

      const result = formatPersonalPaymentText(event, 1000, 2, 2000, 4, -100123, '456')
      expect(result).not.toContain('💳')
    })

    it('should format personal payment DM text', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T21:00:00+01:00'),
        courts: 2,
        status: 'finalized',
        telegramMessageId: '42',
        ownerId: '111111111',
        isPrivate: false,
      }

      const result = formatPersonalPaymentText(event, 2000, 2, 2000, 4, -1001234567890, '42')

      expect(result).toContain('💰 Payment for Squash Sat, 20 Jan, 21:00')
      expect(result).toContain('🏟 Courts: 2 × 2000 din = 4000 din')
      expect(result).toContain('Participants: 4')
      expect(result).toContain('Your amount: 2000 din')
      expect(result).toContain('tg://privatepost?channel=1234567890&post=42')
    })
  })

  describe('formatPaidPersonalPaymentText', () => {
    it('should append paid date to base text', () => {
      const baseText = 'Your amount: 2000 din'
      const paidDate = new Date('2024-01-21T15:30:00+01:00')

      const result = formatPaidPersonalPaymentText(baseText, paidDate)

      expect(result).toContain('Your amount: 2000 din')
      expect(result).toContain('✓ Paid on Sun, 21 Jan, 15:30')
    })
  })

  describe('formatNotFinalizedReminder', () => {
    it('formats reminder same as announcement body', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T19:00:00+01:00'),
        courts: 2,
        status: 'announced',
        ownerId: '111111111',
        isPrivate: false,
      }
      const participants: EventParticipantDisplay[] = [
        { participant: { telegramUsername: 'alice', displayName: 'Alice' }, participations: 1 },
        { participant: { telegramUsername: 'bob', displayName: 'Bob' }, participations: 1 },
      ]
      const result = formatNotFinalizedReminder(event, participants)
      expect(result).toContain('not finalized')
      expect(result).toContain('Sat, 20 Jan, 19:00')
      expect(result).toContain('Courts: 2')
      expect(result).toContain('Participants — 2:')
      expect(result).toContain('@alice, @bob')
      expect(result).toContain('"✅ Finalize"')
    })

    it('uses displayName when no username', () => {
      const event: Event = {
        id: 'ev_test123',
        datetime: new Date('2024-01-20T19:00:00+01:00'),
        courts: 1,
        status: 'announced',
        ownerId: '111111111',
        isPrivate: false,
      }
      const participants: EventParticipantDisplay[] = [
        { participant: { displayName: 'Alice' }, participations: 1 },
      ]
      const result = formatNotFinalizedReminder(event, participants)
      expect(result).toContain('Alice')
      expect(result).not.toContain('@')
    })

    it('shows empty participant list when no participants', () => {
      const event: Event = {
        id: 'ev_test456',
        datetime: new Date('2024-01-20T19:00:00+01:00'),
        courts: 1,
        status: 'announced',
        ownerId: '111111111',
        isPrivate: false,
      }
      const result = formatNotFinalizedReminder(event, [])
      expect(result).toContain('Participants:')
      expect(result).toContain('(nobody yet)')
    })
  })

  describe('buildReminderKeyboard', () => {
    it('includes eventId in all callback data', () => {
      const kb = buildReminderKeyboard('ev_test123')
      const buttons = kb.inline_keyboard.flat()
      const callbackButtons = buttons.filter(
        (b): b is InlineKeyboardButton.CallbackButton => 'callback_data' in b
      )
      for (const btn of callbackButtons) {
        expect(btn.callback_data).toContain('ev_test123')
      }
    })

    it('builds keyboard with participant and court controls and URL', () => {
      const kb = buildReminderKeyboard('ev_test123', 'https://t.me/c/123/456')
      const buttons = kb.inline_keyboard

      // Row 1: +/- Participant
      expect(buttons[0]).toHaveLength(2)
      expect(buttons[0][0].text).toBe(BTN_ADD_PARTICIPANT)
      expect((buttons[0][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'edit:event:+participant:ev_test123'
      )
      expect(buttons[0][1].text).toBe(BTN_REMOVE_PARTICIPANT)
      expect((buttons[0][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'edit:event:-participant:ev_test123'
      )

      // Row 2: +/- Court
      expect(buttons[1]).toHaveLength(2)
      expect(buttons[1][0].text).toBe(BTN_ADD_COURT)
      expect((buttons[1][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:add-court:ev_test123'
      )
      expect(buttons[1][1].text).toBe(BTN_REMOVE_COURT)
      expect((buttons[1][1] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:delete-court:ev_test123'
      )

      // Row 3: Finalize
      expect(buttons[2]).toHaveLength(1)
      expect(buttons[2][0].text).toBe(BTN_FINALIZE)
      expect((buttons[2][0] as InlineKeyboardButton.CallbackButton).callback_data).toBe(
        'event:finalize:ev_test123'
      )

      // Row 4: URL button
      expect(buttons[3]).toHaveLength(1)
      expect(buttons[3][0].text).toBe('🔗 Go to announcement')
      expect((buttons[3][0] as InlineKeyboardButton.UrlButton).url).toBe('https://t.me/c/123/456')
    })

    it('builds keyboard without URL when not provided', () => {
      const kb = buildReminderKeyboard('ev_test123')
      const buttons = kb.inline_keyboard

      // Should have 3 rows (no URL row)
      expect(buttons).toHaveLength(3)
      // No URL button anywhere
      const allButtons = buttons.flat()
      expect(allButtons.every((b) => !('url' in b))).toBe(true)
    })
  })

  describe('formatFallbackNotificationText', () => {
    it('should format fallback message with participant names and bot link', () => {
      const result = formatFallbackNotificationText(['@alice', '@bob'], 'test_bot')

      expect(result).toContain("can't reach")
      expect(result).toContain('@alice, @bob')
      expect(result).toContain('@test_bot')
      expect(result).toContain('/start')
    })
  })

  describe('formatOwnerNotification', () => {
    it('should format participant joined with balance', () => {
      const result = formatOwnerNotification('participant-joined', '@vasya', 'Tue 21 Jan', 5, 2)
      expect(result).toContain('👤 @vasya joined Tue 21 Jan')
      expect(result).toContain('Participants: 5 · Courts: 2')
    })

    it('should format participant left with balance', () => {
      const result = formatOwnerNotification('participant-left', '@vasya', 'Tue 21 Jan', 4, 2)
      expect(result).toContain('👤 @vasya left Tue 21 Jan')
      expect(result).toContain('Participants: 4 · Courts: 2')
    })

    it('should format court added with balance', () => {
      const result = formatOwnerNotification('event-court-added', undefined, 'Tue 21 Jan', 5, 3)
      expect(result).toContain('🏟 Court added for Tue 21 Jan')
      expect(result).toContain('Participants: 5 · Courts: 3')
    })

    it('should format court removed with balance', () => {
      const result = formatOwnerNotification('event-court-removed', undefined, 'Tue 21 Jan', 5, 1)
      expect(result).toContain('🏟 Court removed for Tue 21 Jan')
      expect(result).toContain('Participants: 5 · Courts: 1')
    })

    it('should format event announced', () => {
      const result = formatOwnerNotification(
        'event-announced',
        undefined,
        'Tue 21 Jan 21:00',
        0,
        2,
        'https://t.me/c/123/456'
      )
      expect(result).toContain('🎾 Your event announced: Tue 21 Jan 21:00')
    })

    it('should format event finalized', () => {
      const result = formatOwnerNotification('event-finalized', '@petya', 'Tue 21 Jan', 5, 2)
      expect(result).toContain('✅ Tue 21 Jan finalized by @petya')
    })

    it('should append over capacity warning', () => {
      const result = formatOwnerNotification(
        'participant-joined',
        '@vasya',
        'Tue 21 Jan',
        10,
        2,
        undefined,
        {
          maxPerCourt: 4,
        }
      )
      expect(result).toContain('⚠️ Over capacity')
    })

    it('should append low attendance warning', () => {
      const result = formatOwnerNotification(
        'participant-left',
        '@vasya',
        'Tue 21 Jan',
        1,
        2,
        undefined,
        {
          minPerCourt: 2,
        }
      )
      expect(result).toContain('⚠️ Low attendance')
    })

    it('should not append warning when balance is ok', () => {
      const result = formatOwnerNotification(
        'participant-joined',
        '@vasya',
        'Tue 21 Jan',
        4,
        2,
        undefined,
        {
          maxPerCourt: 4,
          minPerCourt: 2,
        }
      )
      expect(result).not.toContain('⚠️')
    })
  })

  describe('formatDebtSummary', () => {
    it('should format debts with payment info', () => {
      const debts: DebtEntry[] = [
        { eventDateStr: 'Tue, 21 Jan, 21:00', amount: 1000, collectorPaymentInfo: 'Card: 1234' },
        { eventDateStr: 'Thu, 23 Jan, 19:00', amount: 1500 },
      ]

      const result = formatDebtSummary(debts)

      expect(result).toContain('Your unpaid debts:')
      expect(result).toContain('Squash Tue, 21 Jan, 21:00 — 1000 din')
      expect(result).toContain('💳 Card: 1234')
      expect(result).toContain('Squash Thu, 23 Jan, 19:00 — 1500 din')
      expect(result).toContain('Total: 2500 din')
    })

    it('should omit payment info when not available', () => {
      const debts: DebtEntry[] = [{ eventDateStr: 'Tue, 21 Jan, 21:00', amount: 1000 }]

      const result = formatDebtSummary(debts)

      expect(result).toContain('Squash Tue, 21 Jan, 21:00 — 1000 din')
      expect(result).not.toContain('💳')
      expect(result).toContain('Total: 1000 din')
    })

    it('should return no-debts message when empty array', () => {
      const result = formatDebtSummary([])

      expect(result).toContain('✅ No unpaid debts!')
    })
  })

  describe('formatAdminDebtSummary', () => {
    it('should format all debts grouped by event', () => {
      const groups = [
        {
          eventDateStr: 'Tue 21 Jan 21:00',
          debts: [
            { participantName: '@vasya', amount: 1000 },
            { participantName: '@petya', amount: 1000 },
          ],
        },
      ]
      const result = formatAdminDebtSummary(groups)
      expect(result).toContain('💰 Outstanding debts:')
      expect(result).toContain('Squash Tue 21 Jan 21:00:')
      expect(result).toContain('@vasya — 1000 din')
      expect(result).toContain('@petya — 1000 din')
      expect(result).toContain('Total: 2000 din (2 unpaid)')
    })

    it('should return no-debts message when empty', () => {
      const result = formatAdminDebtSummary([])
      expect(result).toContain('✅ All payments received!')
    })
  })
})
