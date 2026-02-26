import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { mockBot } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ParticipantRepo } from '~/storage/repo/participant'

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
})
