import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { EventBusiness } from '~/business/event'

describe('payment-personal-notifications', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let settingsRepository: SettingsRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    api = mockBot(bot)

    eventRepository = container.resolve('eventRepository')
    settingsRepository = container.resolve('settingsRepository')
    eventBusiness = container.resolve('eventBusiness')

    await bot.init()
  })

  async function setupAnnouncedEventWithParticipants(
    courts: number,
    participantData: Array<{
      userId: number
      username?: string
      firstName: string
      participations?: number
    }>
  ) {
    const event = await eventRepository.createEvent({
      datetime: new Date('2024-01-20T19:00:00Z'),
      courts,
      status: 'created',
      ownerId: String(ADMIN_ID),
    })
    await eventBusiness.announceEvent(event.id)

    const announcedEvent = await eventRepository.findById(event.id)
    const messageId = parseInt(announcedEvent!.telegramMessageId!, 10)

    for (const p of participantData) {
      const totalJoins = p.participations ?? 1
      for (let i = 0; i < totalJoins; i++) {
        const joinUpdate = createCallbackQueryUpdate({
          userId: p.userId,
          chatId: TEST_CHAT_ID,
          messageId,
          data: 'event:join',
          username: p.username,
          firstName: p.firstName,
        })
        await bot.handleUpdate(joinUpdate)
      }
    }

    return { event: announcedEvent!, messageId }
  }

  it('should send personal DM to each participant', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222
    )
    expect(dmCalls).toHaveLength(2)

    expect(dmCalls[0][1]).toContain('Your amount: 2000 din')
    expect(dmCalls[1][1]).toContain('Your amount: 2000 din')
  })

  it('should include I paid button in personal DM', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    const dmCall = api.sendMessage.mock.calls.find(([chatId]) => chatId === 111)
    expect(dmCall).toBeDefined()

    const keyboard = dmCall![2]?.reply_markup
    expect(JSON.stringify(keyboard)).toContain('I paid')
  })

  it('should include court details in DM', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(4, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222
    )
    expect(dmCalls).toHaveLength(2)
    for (const call of dmCalls) {
      expect(call[1]).toContain('Courts: 4 × 2000 din = 8000 din')
      expect(call[1]).toContain('Your amount: 4000 din')
    }
  })

  it('should use court price from settings in DM', async () => {
    await settingsRepository.setSetting('court_price', '3000')

    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    const dmCalls = api.sendMessage.mock.calls.filter(
      ([chatId]) => chatId === 111 || chatId === 222
    )
    expect(dmCalls).toHaveLength(2)
    for (const call of dmCalls) {
      expect(call[1]).toContain('Courts: 2 × 3000 din = 6000 din')
      expect(call[1]).toContain('Your amount: 3000 din')
    }
  })
})
