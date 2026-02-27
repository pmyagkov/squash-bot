import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('scaffold-private', () => {
  let bot: Bot
  let container: TestContainer
  let api: BotApiMock

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
    // Pre-register admin participant so middleware's ensureRegistered doesn't log new registration
    const participantRepo = container.resolve('participantRepository')
    await participantRepo.findOrCreateParticipant(String(ADMIN_ID), 'admin', 'Admin')
  })

  describe('create private scaffold', () => {
    it('should create private scaffold when private arg given', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/scaffold create Tue 21:00 2 private', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )

      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffolds = await scaffoldRepo.getScaffolds()
      expect(scaffolds).toHaveLength(1)
      expect(scaffolds[0].isPrivate).toBe(true)
    })

    it('should create public scaffold by default', async () => {
      await bot.handleUpdate(
        createTextMessageUpdate('/scaffold create Tue 21:00 2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )

      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffolds = await scaffoldRepo.getScaffolds()
      expect(scaffolds).toHaveLength(1)
      expect(scaffolds[0].isPrivate).toBe(false)
    })
  })

  describe('scaffold participants', () => {
    it('should add participant to scaffold', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const participantRepo = container.resolve('participantRepository')

      const scaffold = await scaffoldRepo.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(ADMIN_ID),
        true
      )
      const { participant } = await participantRepo.findOrCreateParticipant(
        '555555555',
        'alice',
        'Alice'
      )

      await scaffoldRepo.addParticipant(scaffold.id, participant.id)

      const withParticipants = await scaffoldRepo.findByIdWithParticipants(scaffold.id)
      expect(withParticipants!.participants).toHaveLength(1)
      expect(withParticipants!.participants[0].telegramUsername).toBe('alice')
    })

    it('should remove participant from scaffold', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const participantRepo = container.resolve('participantRepository')

      const scaffold = await scaffoldRepo.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(ADMIN_ID),
        true
      )
      const { participant } = await participantRepo.findOrCreateParticipant(
        '555555555',
        'alice',
        'Alice'
      )
      await scaffoldRepo.addParticipant(scaffold.id, participant.id)

      await scaffoldRepo.removeParticipant(scaffold.id, participant.id)

      const withParticipants = await scaffoldRepo.findByIdWithParticipants(scaffold.id)
      expect(withParticipants!.participants).toHaveLength(0)
    })

    it('should not duplicate participant on re-add', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const participantRepo = container.resolve('participantRepository')

      const scaffold = await scaffoldRepo.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(ADMIN_ID),
        true
      )
      const { participant } = await participantRepo.findOrCreateParticipant(
        '555555555',
        'alice',
        'Alice'
      )

      await scaffoldRepo.addParticipant(scaffold.id, participant.id)
      await scaffoldRepo.addParticipant(scaffold.id, participant.id) // duplicate

      const withParticipants = await scaffoldRepo.findByIdWithParticipants(scaffold.id)
      expect(withParticipants!.participants).toHaveLength(1)
    })
  })

  describe('scaffold list format', () => {
    it('should use unified pipe-separated format with privacy segment', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID), true)

      await bot.handleUpdate(
        createTextMessageUpdate('/scaffold list', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )

      const msg = api.sendMessage.mock.calls[0][1] as string
      expect(msg).toContain(' | ')
      expect(msg).toContain('🔒 Private')
      expect(msg).toContain('🟢 Active')
    })
  })

  describe('toggle scaffold privacy', () => {
    it('should toggle scaffold from public to private', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffold = await scaffoldRepo.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(ADMIN_ID)
      )
      expect(scaffold.isPrivate).toBe(false)

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:scaffold:privacy:${scaffold.id}`,
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 100,
        })
      )

      const updated = await scaffoldRepo.findById(scaffold.id)
      expect(updated!.isPrivate).toBe(true)
    })

    it('should toggle scaffold from private to public', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffold = await scaffoldRepo.createScaffold(
        'Tue',
        '21:00',
        2,
        undefined,
        String(ADMIN_ID),
        true
      )
      expect(scaffold.isPrivate).toBe(true)

      await bot.handleUpdate(
        createCallbackQueryUpdate({
          data: `edit:scaffold:privacy:${scaffold.id}`,
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 100,
        })
      )

      const updated = await scaffoldRepo.findById(scaffold.id)
      expect(updated!.isPrivate).toBe(false)
    })
  })
})
