import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { mockBot } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import { createTextMessageUpdate } from '../helpers/updateHelpers'
import { TEST_CHAT_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import type { ParticipantRepo } from '~/storage/repo/participant'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('participant-registration', () => {
  let bot: Bot
  let container: TestContainer
  let participantRepository: ParticipantRepo

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    mockBot(bot)
    participantRepository = container.resolve('participantRepository')
    await bot.init()
  })

  describe('findOrCreateParticipant update behavior', () => {
    it('updates username when it changes', async () => {
      await participantRepository.findOrCreateParticipant('123', 'old_name', 'Test User')
      const updated = await participantRepository.findOrCreateParticipant('123', 'new_name', 'Test User')
      expect(updated.telegramUsername).toBe('new_name')
    })

    it('updates displayName when it changes', async () => {
      await participantRepository.findOrCreateParticipant('123', 'user', 'Old Name')
      const updated = await participantRepository.findOrCreateParticipant('123', 'user', 'New Name')
      expect(updated.displayName).toBe('New Name')
    })

    it('does not update when nothing changed', async () => {
      const original = await participantRepository.findOrCreateParticipant('123', 'user', 'Name')
      const same = await participantRepository.findOrCreateParticipant('123', 'user', 'Name')
      expect(same.id).toBe(original.id)
      expect(same.telegramUsername).toBe('user')
    })
  })

  describe('eager registration via middleware', () => {
    it('registers user on /start command', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/start', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'newuser',
          firstName: 'New',
          lastName: 'User',
        })
      )
      await tick()

      const participant = await participantRepository.findByTelegramId(String(NON_ADMIN_ID))
      expect(participant).toBeDefined()
      expect(participant!.telegramUsername).toBe('newuser')
      expect(participant!.displayName).toBe('New User')
    })

    it('registers user on /scaffold list command', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/scaffold list', {
          userId: 777777,
          chatId: TEST_CHAT_ID,
          username: 'scaffolduser',
          firstName: 'Scaffold',
        })
      )
      await tick()

      const participant = await participantRepository.findByTelegramId('777777')
      expect(participant).toBeDefined()
      expect(participant!.telegramUsername).toBe('scaffolduser')
    })

    it('does not create duplicate when user already exists', async () => {
      await participantRepository.findOrCreateParticipant(
        String(NON_ADMIN_ID),
        'existing',
        'Existing User'
      )

      await bot.handleUpdate(
        createTextMessageUpdate('/start', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'existing',
          firstName: 'Existing',
          lastName: 'User',
        })
      )
      await tick()

      const all = await participantRepository.getParticipants()
      const matching = all.filter((p) => p.telegramId === String(NON_ADMIN_ID))
      expect(matching).toHaveLength(1)
    })

    it('updates username on subsequent interaction', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/start', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'oldname',
          firstName: 'Test',
        })
      )
      await tick()

      await bot.handleUpdate(
        createTextMessageUpdate('/help', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'newname',
          firstName: 'Test',
        })
      )
      await tick()

      const participant = await participantRepository.findByTelegramId(String(NON_ADMIN_ID))
      expect(participant!.telegramUsername).toBe('newname')
    })
  })
})
