import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import { createTextMessageUpdate } from '../helpers/updateHelpers'
import { TEST_CHAT_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import type { ParticipantRepo } from '~/storage/repo/participant'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('participant-registration', () => {
  let bot: Bot
  let container: TestContainer
  let participantRepository: ParticipantRepo
  let api: BotApiMock

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    participantRepository = container.resolve('participantRepository')
    await bot.init()
  })

  describe('findOrCreateParticipant update behavior', () => {
    it('updates username when it changes', async () => {
      await participantRepository.findOrCreateParticipant('123', 'old_name', 'Test User')
      const { participant: updated } = await participantRepository.findOrCreateParticipant(
        '123',
        'new_name',
        'Test User'
      )
      expect(updated.telegramUsername).toBe('new_name')
    })

    it('updates displayName when it changes', async () => {
      await participantRepository.findOrCreateParticipant('123', 'user', 'Old Name')
      const { participant: updated } = await participantRepository.findOrCreateParticipant(
        '123',
        'user',
        'New Name'
      )
      expect(updated.displayName).toBe('New Name')
    })

    it('does not update when nothing changed', async () => {
      const { participant: original } = await participantRepository.findOrCreateParticipant(
        '123',
        'user',
        'Name'
      )
      const { participant: same } = await participantRepository.findOrCreateParticipant(
        '123',
        'user',
        'Name'
      )
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

  describe('participant_registered log event', () => {
    function getRegistrationLogCalls() {
      return api.sendMessage.mock.calls.filter(
        ([, text]) => typeof text === 'string' && text.includes('New participant')
      )
    }

    it('fires participant_registered on first interaction', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/start', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'freshuser',
          firstName: 'Fresh',
          lastName: 'User',
        })
      )
      await tick()

      const logCalls = getRegistrationLogCalls()
      expect(logCalls).toHaveLength(1)
      expect(logCalls[0][1]).toContain('@freshuser')
    })

    it('does not fire participant_registered on subsequent interaction', async () => {
      // First interaction — triggers registration
      await bot.handleUpdate(
        createTextMessageUpdate('/start', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'repeater',
          firstName: 'Repeat',
        })
      )
      await tick()

      // Clear mocks so we only see calls from the second interaction
      api.sendMessage.mockClear()

      // Second interaction — same user, should NOT fire registration event
      await bot.handleUpdate(
        createTextMessageUpdate('/help', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'repeater',
          firstName: 'Repeat',
        })
      )
      await tick()

      const logCalls = getRegistrationLogCalls()
      expect(logCalls).toHaveLength(0)
    })

    it('fires participant_registered exactly once for /start', async () => {
      // /start goes through middleware (ensureRegistered) and then handleStart.
      // After Task 6, /start no longer calls ensureRegistered directly —
      // only middleware does. Verify exactly one registration log event.
      await bot.handleUpdate(
        createTextMessageUpdate('/start', {
          userId: 888888888,
          chatId: TEST_CHAT_ID,
          username: 'onceonly',
          firstName: 'Once',
          lastName: 'Only',
        })
      )
      await tick()

      const logCalls = getRegistrationLogCalls()
      expect(logCalls).toHaveLength(1)
      expect(logCalls[0][1]).toContain('@onceonly')
    })
  })

  describe('owner label in list commands', () => {
    it('shows owner label on scaffold list after creator is auto-registered', async () => {
      // Create scaffold — middleware will register the user
      await bot.handleUpdate(
        createTextMessageUpdate('/scaffold create Tue 21:00 2', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'creator',
          firstName: 'The',
          lastName: 'Creator',
        })
      )
      await tick()

      // List scaffolds — owner label should be resolved
      await bot.handleUpdate(
        createTextMessageUpdate('/scaffold list', {
          userId: NON_ADMIN_ID,
          chatId: TEST_CHAT_ID,
          username: 'creator',
          firstName: 'The',
          lastName: 'Creator',
        })
      )
      await tick()

      const listCall = api.sendMessage.mock.calls.find(
        (call) => typeof call[1] === 'string' && call[1].includes('Scaffold list')
      )
      expect(listCall).toBeDefined()
      expect(listCall![1]).toContain('@creator')
    })
  })
})
