import { describe, it, expect, beforeEach } from 'vitest'
import { NotificationService } from './notification'
import { createMockContainer } from '@mocks'
import { mockEventBusiness } from '@mocks/business'
import { buildNotification } from '@fixtures/builders'
import type { MockAppContainer } from '@mocks'

describe('NotificationService', () => {
  let service: NotificationService
  let container: MockAppContainer
  let eventBusiness: ReturnType<typeof mockEventBusiness>

  beforeEach(() => {
    eventBusiness = mockEventBusiness()
    container = createMockContainer({ eventBusiness })
    service = new NotificationService(container)
  })

  describe('schedule', () => {
    it('creates new notification when no pending exists', async () => {
      const created = buildNotification()
      container
        .resolve('notificationRepository')
        .findPendingByTypeAndEventId.mockResolvedValue(undefined)
      container.resolve('notificationRepository').create.mockResolvedValue(created)

      const result = await service.schedule(
        'event-not-finalized',
        '123456',
        { eventId: 'ev_abc' },
        0
      )

      expect(container.resolve('notificationRepository').create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'event-not-finalized',
          status: 'pending',
          recipientId: '123456',
          params: { eventId: 'ev_abc' },
        })
      )
      expect(result).toEqual(created)
    })

    it('updates scheduledAt when pending notification exists (debounce)', async () => {
      const existing = buildNotification({ id: 5 })
      const updated = buildNotification({ id: 5 })
      container
        .resolve('notificationRepository')
        .findPendingByTypeAndEventId.mockResolvedValue(existing)
      container.resolve('notificationRepository').updateScheduledAt.mockResolvedValue(updated)

      const result = await service.schedule(
        'event-not-finalized',
        '123456',
        { eventId: 'ev_abc' },
        30
      )

      expect(container.resolve('notificationRepository').updateScheduledAt).toHaveBeenCalledWith(
        5,
        expect.any(Date)
      )
      expect(container.resolve('notificationRepository').create).not.toHaveBeenCalled()
      expect(result).toEqual(updated)
    })
  })

  describe('cancel', () => {
    it('marks pending notification as cancelled', async () => {
      const existing = buildNotification({ id: 5 })
      const cancelled = buildNotification({ id: 5, status: 'cancelled' })
      container
        .resolve('notificationRepository')
        .findPendingByTypeAndEventId.mockResolvedValue(existing)
      container.resolve('notificationRepository').updateStatus.mockResolvedValue(cancelled)

      const result = await service.cancel('event-not-finalized', 'ev_abc')

      expect(container.resolve('notificationRepository').updateStatus).toHaveBeenCalledWith(
        5,
        'cancelled'
      )
      expect(result).toEqual(cancelled)
    })

    it('returns undefined when no pending notification exists', async () => {
      container
        .resolve('notificationRepository')
        .findPendingByTypeAndEventId.mockResolvedValue(undefined)

      const result = await service.cancel('event-not-finalized', 'ev_abc')
      expect(result).toBeUndefined()
    })
  })

  describe('processQueue', () => {
    it('sends notification when handler returns send action', async () => {
      const notification = buildNotification({ recipientId: '123456' })
      container.resolve('notificationRepository').findDue.mockResolvedValue([notification])
      container
        .resolve('notificationRepository')
        .updateStatus.mockResolvedValue(buildNotification({ status: 'sent' }))
      container
        .resolve('notificationRepository')
        .updateMessageRef.mockResolvedValue(buildNotification())
      container.resolve('transport').sendMessage.mockResolvedValue(42)
      eventBusiness.notificationHandler.mockResolvedValue({
        action: 'send',
        message: 'Test message',
      })

      const result = await service.processQueue()

      expect(eventBusiness.notificationHandler).toHaveBeenCalledWith(notification)
      expect(container.resolve('transport').sendMessage).toHaveBeenCalledWith(
        123456,
        'Test message',
        undefined
      )
      expect(container.resolve('notificationRepository').updateMessageRef).toHaveBeenCalledWith(
        notification.id,
        '42',
        '123456'
      )
      expect(container.resolve('notificationRepository').updateStatus).toHaveBeenCalledWith(
        notification.id,
        'sent',
        expect.any(Date)
      )
      expect(result).toHaveLength(1)
    })

    it('sends message with keyboard and saves messageRef', async () => {
      const notification = buildNotification({ recipientId: '789' })
      const keyboard = {
        inline_keyboard: [[{ text: 'Finalize', callback_data: 'finalize:ev_test123' }]],
      }
      container.resolve('notificationRepository').findDue.mockResolvedValue([notification])
      container
        .resolve('notificationRepository')
        .updateStatus.mockResolvedValue(buildNotification({ status: 'sent' }))
      container
        .resolve('notificationRepository')
        .updateMessageRef.mockResolvedValue(buildNotification())
      container.resolve('transport').sendMessage.mockResolvedValue(99)
      eventBusiness.notificationHandler.mockResolvedValue({
        action: 'send',
        message: 'Reminder',
        keyboard,
      })

      const result = await service.processQueue()

      expect(container.resolve('transport').sendMessage).toHaveBeenCalledWith(
        789,
        'Reminder',
        keyboard
      )
      expect(container.resolve('notificationRepository').updateMessageRef).toHaveBeenCalledWith(
        notification.id,
        '99',
        '789'
      )
      expect(result).toHaveLength(1)
    })

    it('cancels notification when handler returns cancel action', async () => {
      const notification = buildNotification()
      container.resolve('notificationRepository').findDue.mockResolvedValue([notification])
      container
        .resolve('notificationRepository')
        .updateStatus.mockResolvedValue(buildNotification({ status: 'cancelled' }))
      eventBusiness.notificationHandler.mockResolvedValue({ action: 'cancel' })

      const result = await service.processQueue()

      expect(eventBusiness.notificationHandler).toHaveBeenCalledWith(notification)
      expect(container.resolve('transport').sendMessage).not.toHaveBeenCalled()
      expect(container.resolve('notificationRepository').updateStatus).toHaveBeenCalledWith(
        notification.id,
        'cancelled'
      )
      expect(result).toHaveLength(1)
    })
  })
})
