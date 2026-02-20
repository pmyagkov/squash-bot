import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('event-edit (edit menu)', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    eventRepository = container.resolve('eventRepository')
    await bot.init()
  })

  describe('/event update (show edit menu)', () => {
    it('shows edit menu with keyboard for existing event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createTextMessageUpdate(`/event update ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`Event <code>${event.id}</code>`),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '📅 Date' }),
                expect.objectContaining({ text: '🕐 Time' }),
              ]),
            ]),
          }),
        })
      )
    })

    it('shows event details in edit menu', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 3,
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createTextMessageUpdate(`/event update ${event.id}`, {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      const call = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes(`Event <code>${event.id}</code>`)
      )
      expect(call).toBeDefined()
      expect(call![1]).toContain('Courts: 3')
      expect(call![1]).toContain('Created')
    })

    it('shows error for nonexistent event', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/event update ev_nonexistent', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('❌ Event <code>ev_nonexistent</code> not found'),
        expect.anything()
      )
    })
  })

  describe('edit actions via callback', () => {
    it('+court increments courts and re-renders', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:+court:${event.id}`,
        })
      )
      await tick()

      const editCall = api.editMessageText.mock.calls.find(
        ([chatId]) => chatId === TEST_CHAT_ID
      )
      expect(editCall).toBeDefined()
      expect(editCall![2]).toContain('Courts: 3')

      const updated = await eventRepository.findById(event.id)
      expect(updated!.courts).toBe(3)
    })

    it('-court decrements courts and re-renders', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 3,
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:-court:${event.id}`,
        })
      )
      await tick()

      const editCall = api.editMessageText.mock.calls.find(
        ([chatId]) => chatId === TEST_CHAT_ID
      )
      expect(editCall).toBeDefined()
      expect(editCall![2]).toContain('Courts: 2')

      const updated = await eventRepository.findById(event.id)
      expect(updated!.courts).toBe(2)
    })

    it('-court does not go below 1', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 1,
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:-court:${event.id}`,
        })
      )
      await tick()

      expect(api.editMessageText).not.toHaveBeenCalled()

      const updated = await eventRepository.findById(event.id)
      expect(updated!.courts).toBe(1)
    })

    it('cancel in date sub-picker re-renders edit menu', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(ADMIN_ID),
      })

      // Click date → opens date picker
      const editDone = bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:date:${event.id}`,
        })
      )
      await tick()

      // Verify date picker was shown
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Choose a date'),
        expect.anything()
      )

      // Click cancel in date picker
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 2,
          data: 'wizard:cancel',
        })
      )
      await editDone

      // Wizard message should be deleted (edit menu stays visible)
      expect(api.deleteMessage).toHaveBeenCalledWith(TEST_CHAT_ID, 2)
      // No "Cancelled." message sent
      expect(api.sendMessage).not.toHaveBeenCalledWith(
        TEST_CHAT_ID,
        'Cancelled.',
        expect.anything()
      )

      // DB should be unchanged
      const updated = await eventRepository.findById(event.id)
      expect(updated!.datetime.toISOString()).toBe('2026-03-01T19:00:00.000Z')
    })

    it('cancel in time sub-picker deletes wizard message', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(ADMIN_ID),
      })

      // Click time → opens time input
      const editDone = bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:time:${event.id}`,
        })
      )
      await tick()

      // Verify time prompt was shown
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Enter time'),
        expect.anything()
      )

      // Click cancel
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 2,
          data: 'wizard:cancel',
        })
      )
      await editDone

      // Wizard message should be deleted
      expect(api.deleteMessage).toHaveBeenCalledWith(TEST_CHAT_ID, 2)

      // DB should be unchanged
      const updated = await eventRepository.findById(event.id)
      expect(updated!.datetime.toISOString()).toBe('2026-03-01T19:00:00.000Z')
    })

    it('done removes keyboard', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:done:${event.id}`,
        })
      )
      await tick()

      const editCall = api.editMessageText.mock.calls.find(
        ([chatId]) => chatId === TEST_CHAT_ID
      )
      expect(editCall).toBeDefined()
      expect(editCall![2]).toContain(`Event <code>${event.id}</code>`)

      // Done action should not include keyboard
      const options = editCall![3]
      if (options?.reply_markup) {
        expect(options.reply_markup).toBeUndefined()
      }
    })

    it('ignores edit actions on cancelled event (except done)', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        status: 'cancelled',
        ownerId: String(ADMIN_ID),
      })

      // +court should be silently ignored
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:+court:${event.id}`,
        })
      )
      await tick()

      expect(api.editMessageText).not.toHaveBeenCalled()

      const updated = await eventRepository.findById(event.id)
      expect(updated!.courts).toBe(2)
    })

    it('ignores edit actions on finalized event (except done)', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        status: 'finalized',
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:+court:${event.id}`,
        })
      )
      await tick()

      expect(api.editMessageText).not.toHaveBeenCalled()
    })

    it('allows done action on cancelled event', async () => {
      const event = await eventRepository.createEvent({
        datetime: new Date('2026-03-01T19:00:00Z'),
        courts: 2,
        status: 'cancelled',
        ownerId: String(ADMIN_ID),
      })

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: `edit:event:done:${event.id}`,
        })
      )
      await tick()

      // Done should still work — edits message to remove keyboard
      const editCall = api.editMessageText.mock.calls.find(
        ([chatId]) => chatId === TEST_CHAT_ID
      )
      expect(editCall).toBeDefined()
      expect(editCall![2]).toContain(`Event <code>${event.id}</code>`)
    })
  })
})
