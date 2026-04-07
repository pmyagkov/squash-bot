import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '@integration/database'
import { createTestContainer, type TestContainer } from '@integration/helpers/container'
import type { EventAnnouncementRepo } from './eventAnnouncement'
import type { EventRepo } from './event'

describe('EventAnnouncementRepo', () => {
  let container: TestContainer
  let announcementRepo: EventAnnouncementRepo
  let eventRepo: EventRepo
  let testEventId: string

  beforeEach(async () => {
    await clearTestDb()

    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    announcementRepo = container.resolve('eventAnnouncementRepository')
    eventRepo = container.resolve('eventRepository')

    const event = await eventRepo.createEvent({
      datetime: new Date('2024-01-20T21:00:00Z'),
      courts: 2,
      ownerId: '111111111',
    })
    testEventId = event.id
  })

  it('should create and retrieve announcement', async () => {
    const ann = await announcementRepo.create(testEventId, '100', '-1001234')
    expect(ann.eventId).toBe(testEventId)
    expect(ann.telegramMessageId).toBe('100')

    const list = await announcementRepo.getByEventId(testEventId)
    expect(list).toHaveLength(1)
    expect(list[0].telegramMessageId).toBe('100')
  })

  it('should find event by message ID', async () => {
    await announcementRepo.create(testEventId, '200', '-1001234')

    const eventId = await announcementRepo.findEventByMessageId('200')
    expect(eventId).toBe(testEventId)
  })

  it('should return null for unknown message ID', async () => {
    const eventId = await announcementRepo.findEventByMessageId('999')
    expect(eventId).toBeNull()
  })

  it('should delete all announcements for event', async () => {
    await announcementRepo.create(testEventId, '100', '-1001234')
    await announcementRepo.create(testEventId, '101', '55555')

    await announcementRepo.deleteByEventId(testEventId)

    const list = await announcementRepo.getByEventId(testEventId)
    expect(list).toHaveLength(0)
  })

  it('should create announcement with pinned=true by default', async () => {
    const ann = await announcementRepo.create(testEventId, '100', '-1001234')
    expect(ann.pinned).toBe(true)
  })

  it('should get pinned announcements by chat ID', async () => {
    await announcementRepo.create(testEventId, '100', '-1001234')
    await announcementRepo.create(testEventId, '101', '-1001234')

    const pinned = await announcementRepo.getPinnedByChatId('-1001234')
    expect(pinned).toHaveLength(2)
    expect(pinned.every((a) => a.pinned)).toBe(true)
  })

  it('should unpin announcement by ID', async () => {
    const ann = await announcementRepo.create(testEventId, '100', '-1001234')
    await announcementRepo.unpin(ann.id)

    const list = await announcementRepo.getByEventId(testEventId)
    expect(list[0].pinned).toBe(false)
  })

  it('should not return unpinned announcements from getPinnedByChatId', async () => {
    const ann = await announcementRepo.create(testEventId, '100', '-1001234')
    await announcementRepo.unpin(ann.id)

    const pinned = await announcementRepo.getPinnedByChatId('-1001234')
    expect(pinned).toHaveLength(0)
  })
})
