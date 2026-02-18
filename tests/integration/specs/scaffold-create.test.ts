import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID, NON_ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('scaffold-create', () => {
  let bot: Bot
  let api: BotApiMock
  let container: TestContainer

  beforeEach(async () => {
    bot = new Bot('test-token')
    container = createTestContainer(bot)
    container.resolve('eventBusiness').init()
    container.resolve('scaffoldBusiness').init()
    container.resolve('utilityBusiness').init()
    api = mockBot(bot)
    await bot.init()
  })

  describe('/scaffold create (direct)', () => {
    it('should create scaffold with valid input', async () => {
      const update = createTextMessageUpdate('/scaffold create Tue 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/Tue 21:00.*2 court\(s\)/s),
        expect.anything()
      )
    })

    it('should show error for invalid day', async () => {
      const update = createTextMessageUpdate('/scaffold create Xyz 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/Invalid day of week.*Xyz/s),
        expect.anything()
      )
    })

    it('should show error for invalid courts number', async () => {
      const update = createTextMessageUpdate('/scaffold create Tue 21:00 0', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Number of courts must be a positive number'),
        expect.anything()
      )
    })

    it('should allow non-admin user to create scaffold', async () => {
      const update = createTextMessageUpdate('/scaffold create Tue 21:00 2', {
        userId: NON_ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
    })
  })

  describe('/scaffold create with all args (skips wizard)', () => {
    it('creates scaffold immediately without wizard prompts', async () => {
      const update = createTextMessageUpdate('/scaffold create Tue 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/Tue 21:00.*2 court\(s\)/s),
        expect.anything()
      )
    })
  })

  describe('/scaffold create (no args) → wizard flow', () => {
    it('scaffold:create is registered in CommandRegistry after init()', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('scaffold:create')).toBeDefined()
    })

    it('full flow: select day → enter time → enter courts → scaffold created', async () => {
      // Step 1: Send /scaffold create (no args) — wizard starts, hangs at dayStep
      const commandDone = bot.handleUpdate(
        createTextMessageUpdate('/scaffold create', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Verify day prompt was sent with inline keyboard
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Choose a day of the week'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: 'Mon', callback_data: 'wizard:select:Mon' }),
              ]),
            ]),
          }),
        })
      )

      // Step 2: Select day via callback → resolves dayStep, wizard moves to timeStep
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: 'wizard:select:Wed',
        })
      )
      await tick()

      // Verify time prompt was sent
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Enter time (HH:MM)'),
        expect.anything()
      )

      // Step 3: Enter time as plain text → resolves timeStep, wizard moves to courtsStep
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate('21:00', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Verify courts prompt was sent
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('How many courts'),
        expect.anything()
      )

      // Step 4: Enter courts as plain text → resolves courtsStep, handler runs
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate('2', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )

      // Wait for the entire command flow to complete
      await commandDone

      // Verify scaffold was created
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringMatching(/Wed 21:00.*2 court\(s\)/s),
        expect.anything()
      )

      // Verify scaffold exists in database
      const scaffolds = await container.resolve('scaffoldRepository').getScaffolds()
      const created = scaffolds.find((s) => s.dayOfWeek === 'Wed' && s.time === '21:00')
      expect(created).toBeDefined()
      expect(created!.defaultCourts).toBe(2)
    })

    it('cancel during wizard → no scaffold created', async () => {
      // Start wizard
      const commandDone = bot.handleUpdate(
        createTextMessageUpdate('/scaffold create', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Verify wizard is active
      const wizardService = container.resolve('wizardService')
      expect(wizardService.isActive(ADMIN_ID)).toBe(true)

      // Cancel via callback button
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: 'wizard:cancel',
        })
      )

      await commandDone

      // Verify wizard is inactive
      expect(wizardService.isActive(ADMIN_ID)).toBe(false)

      // Verify cancel message was sent
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Cancelled.'),
        expect.anything()
      )

      // Verify no scaffold was created
      const scaffolds = await container.resolve('scaffoldRepository').getScaffolds()
      expect(scaffolds).toHaveLength(0)
    })

    it('re-prompts on invalid time input', async () => {
      // Start wizard
      const commandDone = bot.handleUpdate(
        createTextMessageUpdate('/scaffold create', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Select day
      await bot.handleUpdate(
        createCallbackQueryUpdate({
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
          messageId: 1,
          data: 'wizard:select:Mon',
        })
      )
      await tick()

      // Enter invalid time
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate('invalid', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Verify re-prompt with error
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Invalid time format'),
        expect.anything()
      )

      // Wizard should still be active
      expect(container.resolve('wizardService').isActive(ADMIN_ID)).toBe(true)

      // Enter valid time
      api.sendMessage.mockClear()
      await bot.handleUpdate(
        createTextMessageUpdate('19:00', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )
      await tick()

      // Enter courts
      await bot.handleUpdate(
        createTextMessageUpdate('1', {
          userId: ADMIN_ID,
          chatId: TEST_CHAT_ID,
        })
      )

      await commandDone

      // Verify scaffold was still created after recovery
      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('✅ Created scaffold'),
        expect.anything()
      )
    })
  })

  describe('full flow', () => {
    it('should add, list, toggle, and remove scaffold', async () => {
      // Step 1: Add scaffold
      const addUpdate = createTextMessageUpdate('/scaffold create Wed 19:00 3', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(addUpdate)

      const addCall = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('✅ Created scaffold')
      )
      expect(addCall).toBeDefined()
      expect(addCall![1]).toContain('Wed 19:00')
      expect(addCall![1]).toContain('3 court(s)')

      // Extract scaffold ID from response
      const idMatch = addCall![1].match(/sc_[\w-]+/)
      expect(idMatch).toBeTruthy()
      const scaffoldId = idMatch![0]

      // Step 2: List scaffolds
      api.sendMessage.mockClear()
      const listUpdate = createTextMessageUpdate('/scaffold list', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(listUpdate)

      const listCall = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('📋 Scaffold list')
      )
      expect(listCall).toBeDefined()
      expect(listCall![1]).toContain(scaffoldId)
      expect(listCall![1]).toContain('✅ active')

      // Step 3: Toggle scaffold
      api.sendMessage.mockClear()
      const toggleUpdate = createTextMessageUpdate(`/scaffold update ${scaffoldId}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(toggleUpdate)

      const toggleCall = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('is now inactive')
      )
      expect(toggleCall).toBeDefined()
      expect(toggleCall![1]).toContain(scaffoldId)

      // Step 4: Verify toggle in list
      api.sendMessage.mockClear()
      await bot.handleUpdate(listUpdate)

      const listCall2 = api.sendMessage.mock.calls.find(([, text]) =>
        text.includes('📋 Scaffold list')
      )
      expect(listCall2).toBeDefined()
      expect(listCall2![1]).toContain('❌ inactive')

      // Step 5: Remove scaffold
      api.sendMessage.mockClear()
      const removeUpdate = createTextMessageUpdate(`/scaffold delete ${scaffoldId}`, {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })

      await bot.handleUpdate(removeUpdate)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining(`✅ Scaffold ${scaffoldId} removed`),
        expect.anything()
      )

      // Step 6: Verify removal in list
      api.sendMessage.mockClear()
      await bot.handleUpdate(listUpdate)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('📋 No scaffolds found'),
        expect.anything()
      )
    })
  })
})
