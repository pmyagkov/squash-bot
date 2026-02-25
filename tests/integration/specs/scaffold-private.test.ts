import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('scaffold-private', () => {
  let bot: Bot
  let container: TestContainer

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    mockBot(bot)
    await bot.init()
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

      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID), true)
      const participant = await participantRepo.findOrCreateParticipant('555555555', 'alice', 'Alice')

      await scaffoldRepo.addParticipant(scaffold.id, participant.id)

      const withMembers = await scaffoldRepo.findByIdWithParticipants(scaffold.id)
      expect(withMembers!.participants).toHaveLength(1)
      expect(withMembers!.participants[0].telegramUsername).toBe('alice')
    })

    it('should remove participant from scaffold', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const participantRepo = container.resolve('participantRepository')

      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID), true)
      const participant = await participantRepo.findOrCreateParticipant('555555555', 'alice', 'Alice')
      await scaffoldRepo.addParticipant(scaffold.id, participant.id)

      await scaffoldRepo.removeParticipant(scaffold.id, participant.id)

      const withMembers = await scaffoldRepo.findByIdWithParticipants(scaffold.id)
      expect(withMembers!.participants).toHaveLength(0)
    })

    it('should not duplicate participant on re-add', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const participantRepo = container.resolve('participantRepository')

      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID), true)
      const participant = await participantRepo.findOrCreateParticipant('555555555', 'alice', 'Alice')

      await scaffoldRepo.addParticipant(scaffold.id, participant.id)
      await scaffoldRepo.addParticipant(scaffold.id, participant.id) // duplicate

      const withMembers = await scaffoldRepo.findByIdWithParticipants(scaffold.id)
      expect(withMembers!.participants).toHaveLength(1)
    })
  })

  describe('toggle scaffold privacy', () => {
    it('should toggle scaffold from public to private', async () => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID))
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
      const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(ADMIN_ID), true)
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
