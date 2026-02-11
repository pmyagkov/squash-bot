import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

describe('scaffold-ownership-transfer', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer
  const OWNER_ID = 222222222

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  it('should transfer scaffold to another user', async () => {
    const scaffoldRepo = container.resolve('scaffoldRepository')
    const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(OWNER_ID))

    const participantRepo = container.resolve('participantRepository')
    await participantRepo.findOrCreateParticipant('444444444', 'vasya', 'Vasya')

    const update = createTextMessageUpdate(`/scaffold transfer ${scaffold.id} @vasya`, {
      userId: OWNER_ID,
      chatId: TEST_CHAT_ID,
    })
    await bot.handleUpdate(update)

    expect(api.sendMessage).toHaveBeenCalledWith(
      TEST_CHAT_ID,
      expect.stringContaining('transferred to @vasya'),
      expect.anything()
    )

    const updated = await scaffoldRepo.findById(scaffold.id)
    expect(updated!.ownerId).toBe('444444444')
  })

  it('should allow global admin to transfer any scaffold', async () => {
    const scaffoldRepo = container.resolve('scaffoldRepository')
    const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(OWNER_ID))

    const participantRepo = container.resolve('participantRepository')
    await participantRepo.findOrCreateParticipant('444444444', 'vasya', 'Vasya')

    const update = createTextMessageUpdate(`/scaffold transfer ${scaffold.id} @vasya`, {
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
    const scaffoldRepo = container.resolve('scaffoldRepository')
    const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2, undefined, String(OWNER_ID))

    const update = createTextMessageUpdate(`/scaffold transfer ${scaffold.id} @vasya`, {
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

  it('should return error for non-existent scaffold', async () => {
    const update = createTextMessageUpdate('/scaffold transfer sc_nonexist @vasya', {
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
