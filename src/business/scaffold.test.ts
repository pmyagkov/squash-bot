import { test, describe, expect } from '@tests/setup'
import { buildScaffold } from '@fixtures'
import { TEST_CONFIG } from '@fixtures/config'
import { ScaffoldBusiness } from '~/business/scaffold'

describe('ScaffoldBusiness', () => {
  // ── handleAdd ──────────────────────────────────────────────────────

  describe('handleAdd', () => {
    test('happy path: creates scaffold, sends success message', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_new123' })
      scaffoldRepo.createScaffold.mockResolvedValue(scaffold)

      const business = new ScaffoldBusiness(container)
      business.init()

      // Simulate the command handler directly
      const onCommandCalls = transport.onCommand.mock.calls
      const addHandler = onCommandCalls.find((c) => c[0] === 'scaffold:add')
      expect(addHandler).toBeDefined()

      await addHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: 'Tue',
        time: '18:00',
        courts: 2,
      })

      expect(scaffoldRepo.createScaffold).toHaveBeenCalledWith(
        'Tue', '18:00', 2, undefined, String(TEST_CONFIG.adminId)
      )
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Created scaffold')
      )
    })

    test('any user can create scaffold (no admin check)', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_new456' })
      scaffoldRepo.createScaffold.mockResolvedValue(scaffold)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const addHandler = onCommandCalls.find((c) => c[0] === 'scaffold:add')

      await addHandler![1]({
        userId: 999999,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: 'Tue',
        time: '18:00',
        courts: 2,
      })

      expect(scaffoldRepo.createScaffold).toHaveBeenCalledWith(
        'Tue', '18:00', 2, undefined, '999999'
      )
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Created scaffold')
      )
    })

    test('invalid day → sends error', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const transport = container.resolve('transport')
      const scaffoldRepo = container.resolve('scaffoldRepository')

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const addHandler = onCommandCalls.find((c) => c[0] === 'scaffold:add')

      await addHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: 'InvalidDay',
        time: '18:00',
        courts: 2,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Invalid day of week')
      )
      expect(scaffoldRepo.createScaffold).not.toHaveBeenCalled()
    })

    test('invalid courts → sends error', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const transport = container.resolve('transport')
      const scaffoldRepo = container.resolve('scaffoldRepository')

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const addHandler = onCommandCalls.find((c) => c[0] === 'scaffold:add')

      await addHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        day: 'Tue',
        time: '18:00',
        courts: 0,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('positive number')
      )
      expect(scaffoldRepo.createScaffold).not.toHaveBeenCalled()
    })
  })

  // ── handleList ─────────────────────────────────────────────────────

  describe('handleList', () => {
    test('with scaffolds → sends formatted list', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffolds = [
        buildScaffold({
          id: 'sc_001',
          dayOfWeek: 'Tue',
          time: '18:00',
          defaultCourts: 2,
          isActive: true,
        }),
        buildScaffold({
          id: 'sc_002',
          dayOfWeek: 'Thu',
          time: '19:00',
          defaultCourts: 3,
          isActive: false,
        }),
      ]
      scaffoldRepo.getScaffolds.mockResolvedValue(scaffolds)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const listHandler = onCommandCalls.find((c) => c[0] === 'scaffold:list')

      await listHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Scaffold list')
      )
      // Verify both scaffolds appear in the message
      const message = transport.sendMessage.mock.calls[0][1]
      expect(message).toContain('sc_001')
      expect(message).toContain('sc_002')
      expect(message).toContain('active')
      expect(message).toContain('inactive')
    })

    test('empty → sends "no scaffolds" message', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.getScaffolds.mockResolvedValue([])

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const listHandler = onCommandCalls.find((c) => c[0] === 'scaffold:list')

      await listHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('No scaffolds found')
      )
    })

    test('any user can list scaffolds (no admin check)', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.getScaffolds.mockResolvedValue([])

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const listHandler = onCommandCalls.find((c) => c[0] === 'scaffold:list')

      await listHandler![1]({
        userId: 999999,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('No scaffolds found')
      )
    })
  })

  // ── handleToggle ───────────────────────────────────────────────────

  describe('handleToggle', () => {
    test('happy path → toggles, sends status', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_toggle', isActive: true })
      scaffoldRepo.findById.mockResolvedValue(scaffold)

      const toggledScaffold = buildScaffold({ id: 'sc_toggle', isActive: false })
      scaffoldRepo.setActive.mockResolvedValue(toggledScaffold)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const toggleHandler = onCommandCalls.find((c) => c[0] === 'scaffold:toggle')

      await toggleHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_toggle',
      })

      expect(scaffoldRepo.setActive).toHaveBeenCalledWith('sc_toggle', false)
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('inactive')
      )
    })

    test('not found → sends error', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.findById.mockResolvedValue(undefined)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const toggleHandler = onCommandCalls.find((c) => c[0] === 'scaffold:toggle')

      await toggleHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_missing',
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
      )
    })

    test('not owner or admin → sends owner-only error', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_test123', ownerId: '777777' })
      scaffoldRepo.findById.mockResolvedValue(scaffold)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const toggleHandler = onCommandCalls.find((c) => c[0] === 'scaffold:toggle')

      await toggleHandler![1]({
        userId: 999999,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_test123',
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Only the owner or admin')
      )
    })
  })

  // ── handleRemove ───────────────────────────────────────────────────

  describe('handleRemove', () => {
    test('happy path → removes, sends confirmation', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_remove' })
      scaffoldRepo.findById.mockResolvedValue(scaffold)
      scaffoldRepo.remove.mockResolvedValue(undefined)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const removeHandler = onCommandCalls.find((c) => c[0] === 'scaffold:remove')

      await removeHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_remove',
      })

      expect(scaffoldRepo.remove).toHaveBeenCalledWith('sc_remove')
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('removed')
      )
    })

    test('not found → sends error', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.findById.mockResolvedValue(undefined)

      const business = new ScaffoldBusiness(container)
      business.init()

      const onCommandCalls = transport.onCommand.mock.calls
      const removeHandler = onCommandCalls.find((c) => c[0] === 'scaffold:remove')

      await removeHandler![1]({
        userId: TEST_CONFIG.adminId,
        chatId: TEST_CONFIG.chatId,
        chatType: 'group' as const,
        scaffoldId: 'sc_missing',
      })

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
      )
    })
  })
})
