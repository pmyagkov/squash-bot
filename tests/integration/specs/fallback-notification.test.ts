import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import type { Message } from 'grammy/types'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { EventRepo } from '~/storage/repo/event'
import type { EventBusiness } from '~/business/event'

describe('fallback-notification', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  let eventRepository: EventRepo
  let eventBusiness: EventBusiness

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)

    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()

    api = mockBot(bot)

    eventRepository = container.resolve('eventRepository')
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

  it('should send fallback message when DM delivery fails', async () => {
    const { messageId } = await setupAnnouncedEventWithParticipants(2, [
      { userId: 111, username: 'alice', firstName: 'Alice' },
      { userId: 222, username: 'bob', firstName: 'Bob' },
    ])

    // Make DM to user 222 fail
    api.sendMessage.mockImplementation(async (chatId: number | string) => {
      if (chatId === 222) throw new Error("Forbidden: bot can't initiate conversation")
      return {
        message_id: Math.floor(Math.random() * 1000000),
        chat: { id: chatId, type: 'group', title: 'Test Chat' },
        date: Math.floor(Date.now() / 1000),
        from: { id: 0, is_bot: true, first_name: 'Bot' },
      } as Message.TextMessage
    })

    api.sendMessage.mockClear()

    const finalizeUpdate = createCallbackQueryUpdate({
      userId: ADMIN_ID,
      chatId: TEST_CHAT_ID,
      messageId,
      data: 'event:finalize',
    })
    await bot.handleUpdate(finalizeUpdate)

    // Should have sent fallback message to main chat mentioning @bob
    const fallbackCall = api.sendMessage.mock.calls.find(
      ([chatId, text]) =>
        chatId === TEST_CHAT_ID && typeof text === 'string' && text.includes("can't reach")
    )
    expect(fallbackCall).toBeDefined()
    expect(fallbackCall![1]).toContain('@bob')
  })
})
