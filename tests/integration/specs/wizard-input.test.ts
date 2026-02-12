import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { createTextMessageUpdate } from '@integration/helpers/updateHelpers'
import { createCallbackQueryUpdate } from '@integration/helpers/callbackHelpers'
import { TEST_CHAT_ID, ADMIN_ID } from '@integration/fixtures/testFixtures'
import { mockBot, type BotApiMock } from '@mocks'
import { createTestContainer, type TestContainer } from '../helpers/container'
import { WizardCancelledError } from '~/services/wizard/types'
import type { HydratedStep } from '~/services/wizard/types'
import type { Context } from 'grammy'

describe('wizard-input', () => {
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

  // Backward compatibility: existing /scaffold add with all args still works
  describe('scaffold add with all args (backward compat)', () => {
    it('creates scaffold immediately without wizard', async () => {
      const update = createTextMessageUpdate('/scaffold add Tue 21:00 2', {
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
      })
      await bot.handleUpdate(update)

      expect(api.sendMessage).toHaveBeenCalledWith(
        TEST_CHAT_ID,
        expect.stringContaining('Created scaffold'),
        expect.anything()
      )
    })
  })

  // Verify CommandRegistry wiring after business.init()
  describe('CommandRegistry wiring', () => {
    it('has scaffold:create registered', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('scaffold:create')).toBeDefined()
    })

    it('has event:join registered', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('event:join')).toBeDefined()
    })

    it('has event:create-wizard registered', () => {
      const registry = container.resolve('commandRegistry')
      expect(registry.get('event:create-wizard')).toBeDefined()
    })
  })

  // WizardService lifecycle with real service instances from container
  describe('WizardService lifecycle', () => {
    it('wizard becomes active during collect and inactive after input', async () => {
      const wizardService = container.resolve('wizardService')
      const userId = ADMIN_ID

      expect(wizardService.isActive(userId)).toBe(false)

      const step: HydratedStep = {
        param: 'day',
        type: 'select',
        prompt: 'Choose:',
        load: async () => [{ value: 'Mon', label: 'Mon' }],
      }

      const mockCtx = {
        from: { id: userId },
        reply: async () => ({ message_id: 1 }),
      } as unknown as Context

      const promise = wizardService.collect(step, mockCtx)
      expect(wizardService.isActive(userId)).toBe(true)

      const inputCtx = {
        from: { id: userId },
        reply: async () => ({ message_id: 2 }),
      } as unknown as Context

      wizardService.handleInput(inputCtx, 'Mon')

      const result = await promise
      expect(result).toBe('Mon')
      expect(wizardService.isActive(userId)).toBe(false)
    })

    it('cancel rejects with WizardCancelledError', async () => {
      const wizardService = container.resolve('wizardService')
      const userId = ADMIN_ID

      const step: HydratedStep = {
        param: 'day',
        type: 'text',
        prompt: 'Enter:',
      }

      const mockCtx = {
        from: { id: userId },
        reply: async () => ({ message_id: 1 }),
      } as unknown as Context

      const promise = wizardService.collect(step, mockCtx)

      const cancelCtx = {
        from: { id: userId },
        reply: async () => ({ message_id: 2 }),
      } as unknown as Context

      wizardService.cancel(userId, cancelCtx)

      await expect(promise).rejects.toThrow(WizardCancelledError)
      expect(wizardService.isActive(userId)).toBe(false)
    })
  })

  // CommandService orchestration with real registry
  describe('CommandService orchestration', () => {
    it('runs handler when all params provided', async () => {
      const commandService = container.resolve('commandService')
      const registry = container.resolve('commandRegistry')

      const registered = registry.get('scaffold:create')
      expect(registered).toBeDefined()

      const mockCtx = {
        from: { id: ADMIN_ID },
        callbackQuery: undefined,
        message: { text: '/scaffold create Tue 21:00 2', chat: { id: TEST_CHAT_ID } },
      } as unknown as Context

      // If this completes without error, the full flow worked:
      // parse -> no missing params -> handler called
      await commandService.run({
        registered: registered!,
        args: ['Tue', '21:00', '2'],
        ctx: mockCtx,
      })
    })
  })

  // Transport callback routing for wizard callbacks
  describe('Transport wizard routing', () => {
    it('routes wizard:cancel callback to WizardService', async () => {
      const wizardService = container.resolve('wizardService')

      // Start a wizard manually
      const step: HydratedStep = {
        param: 'day',
        type: 'text',
        prompt: 'Enter:',
      }

      const mockCtx = {
        from: { id: ADMIN_ID },
        reply: async () => ({ message_id: 1 }),
      } as unknown as Context

      const promise = wizardService.collect(step, mockCtx)
      expect(wizardService.isActive(ADMIN_ID)).toBe(true)

      // Send wizard:cancel callback through the bot transport
      const cancelUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: 'wizard:cancel',
      })
      await bot.handleUpdate(cancelUpdate)

      // Wizard should be cancelled
      await expect(promise).rejects.toThrow(WizardCancelledError)
      expect(wizardService.isActive(ADMIN_ID)).toBe(false)
    })

    it('routes wizard:select callback to WizardService', async () => {
      const wizardService = container.resolve('wizardService')

      const step: HydratedStep = {
        param: 'day',
        type: 'select',
        prompt: 'Choose:',
        load: async () => [
          { value: 'Mon', label: 'Monday' },
          { value: 'Tue', label: 'Tuesday' },
        ],
      }

      const mockCtx = {
        from: { id: ADMIN_ID },
        reply: async () => ({ message_id: 1 }),
      } as unknown as Context

      const promise = wizardService.collect(step, mockCtx)

      // Send wizard:select:Tue callback through the bot transport
      const selectUpdate = createCallbackQueryUpdate({
        userId: ADMIN_ID,
        chatId: TEST_CHAT_ID,
        messageId: 1,
        data: 'wizard:select:Tue',
      })
      await bot.handleUpdate(selectUpdate)

      const result = await promise
      expect(result).toBe('Tue')
      expect(wizardService.isActive(ADMIN_ID)).toBe(false)
    })
  })
})
