import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('event-ownership-transfer', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  const CREATOR_ID = 333333333

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  it('should transfer event to another user', async () => {
    const eventRepo = container.resolve('eventRepository')
    const event = await eventRepo.createEvent({
      datetime: new Date('2026-03-01T19:00:00Z'),
      courts: 2,
      ownerId: String(CREATOR_ID),
    })

    const participantRepo = container.resolve('participantRepository')
    await participantRepo.findOrCreateParticipant('444444444', 'vasya', 'Vasya')

    const update = createTextMessageUpdate(`/event transfer ${event.id} @vasya`, {
      userId: CREATOR_ID,
      chatId: TEST_CHAT_ID,
    })
    await bot.handleUpdate(update)

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('transferred to @vasya'),
      expect.anything()
    )

    const updated = await eventRepo.findById(event.id)
    expect(updated!.ownerId).toBe('444444444')
  })

  it('should allow global admin to transfer any event', async () => {
    const eventRepo = container.resolve('eventRepository')
    const event = await eventRepo.createEvent({
      datetime: new Date('2026-03-01T19:00:00Z'),
      courts: 2,
      ownerId: String(CREATOR_ID),
    })

    const participantRepo = container.resolve('participantRepository')
    await participantRepo.findOrCreateParticipant('444444444', 'vasya', 'Vasya')

    const update = createTextMessageUpdate(`/event transfer ${event.id} @vasya`, {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })
    await bot.handleUpdate(update)

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('transferred to @vasya'),
      expect.anything()
    )
  })

  it('should reject transfer by non-owner non-admin', async () => {
    const eventRepo = container.resolve('eventRepository')
    const event = await eventRepo.createEvent({
      datetime: new Date('2026-03-01T19:00:00Z'),
      courts: 2,
      ownerId: String(CREATOR_ID),
    })

    const update = createTextMessageUpdate(`/event transfer ${event.id} @vasya`, {
      userId: NON_ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })
    await bot.handleUpdate(update)

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('Only the owner or admin'),
      expect.anything()
    )
  })

  it('should return error for non-existent event', async () => {
    const update = createTextMessageUpdate('/event transfer ev_nonexist @vasya', {
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
    })
    await bot.handleUpdate(update)

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('not found'),
      expect.anything()
    )
  })
})
