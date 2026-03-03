import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTestContainer } from '../helpers/container'
import { mockBot } from '@mocks'
import type { EventRepo } from '~/storage/repo/event'
import type { NotificationRepo } from '~/storage/repo/notification'

describe('Event Notifications', () => {
  let bot: Bot
  let container: ReturnType<typeof createTestContainer>
  let eventRepository: EventRepo
  let notificationRepository: NotificationRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    mockBot(bot)
    eventRepository = container.resolve('eventRepository')
    notificationRepository = container.resolve('notificationRepository')
    await bot.init()
  })

  describe('checkUnfinalizedEvents', () => {
    it('creates pending notification for event started 2+ hours ago', async () => {
      const twoHoursAgo = new Date(Date.now() - 2.5 * 60 * 60 * 1000)
      await eventRepository.createEvent({
        datetime: twoHoursAgo,
        courts: 2,
        status: 'announced',
        ownerId: '123456',
      })

      const eventBusiness = container.resolve('eventBusiness')
      const count = await eventBusiness.checkUnfinalizedEvents()

      expect(count).toBe(1)
    })

    it('does not create notification for recently started events', async () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
      await eventRepository.createEvent({
        datetime: thirtyMinAgo,
        courts: 2,
        status: 'announced',
        ownerId: '123456',
      })

      const eventBusiness = container.resolve('eventBusiness')
      const count = await eventBusiness.checkUnfinalizedEvents()
      expect(count).toBe(0)
    })

    it('does not duplicate notification if pending exists', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
      const event = await eventRepository.createEvent({
        datetime: threeHoursAgo,
        courts: 2,
        status: 'announced',
        ownerId: '123456',
      })

      await notificationRepository.create({
        type: 'event-not-finalized',
        status: 'pending',
        recipientId: '123456',
        params: { eventId: event.id },
        scheduledAt: new Date(),
      })

      const eventBusiness = container.resolve('eventBusiness')
      const count = await eventBusiness.checkUnfinalizedEvents()
      expect(count).toBe(0)
    })

    it('skips finalized events', async () => {
      const twoHoursAgo = new Date(Date.now() - 2.5 * 60 * 60 * 1000)
      await eventRepository.createEvent({
        datetime: twoHoursAgo,
        courts: 2,
        status: 'finalized',
        ownerId: '123456',
      })

      const eventBusiness = container.resolve('eventBusiness')
      const count = await eventBusiness.checkUnfinalizedEvents()
      expect(count).toBe(0)
    })
  })

  describe('notificationHandler', () => {
    it('returns send action for still-unfinalized event', async () => {
      const twoHoursAgo = new Date(Date.now() - 2.5 * 60 * 60 * 1000)
      const event = await eventRepository.createEvent({
        datetime: twoHoursAgo,
        courts: 2,
        status: 'announced',
        ownerId: '123456',
      })

      const notification = {
        id: 1,
        type: 'event-not-finalized' as const,
        status: 'pending' as const,
        recipientId: '123456',
        params: { eventId: event.id },
        scheduledAt: new Date(),
        createdAt: new Date(),
      }

      const eventBusiness = container.resolve('eventBusiness')
      const result = await eventBusiness.notificationHandler(notification)

      expect(result.action).toBe('send')
      if (result.action === 'send') {
        expect(result.message).toContain('not finalized')
      }
    })

    it('returns cancel action when event is already finalized', async () => {
      const twoHoursAgo = new Date(Date.now() - 2.5 * 60 * 60 * 1000)
      const event = await eventRepository.createEvent({
        datetime: twoHoursAgo,
        courts: 2,
        status: 'finalized',
        ownerId: '123456',
      })

      const notification = {
        id: 1,
        type: 'event-not-finalized' as const,
        status: 'pending' as const,
        recipientId: '123456',
        params: { eventId: event.id },
        scheduledAt: new Date(),
        createdAt: new Date(),
      }

      const eventBusiness = container.resolve('eventBusiness')
      const result = await eventBusiness.notificationHandler(notification)
      expect(result.action).toBe('cancel')
    })
  })
})
