import { test, describe, expect } from '@tests/setup'
import { buildScaffold } from '@fixtures'
import { TEST_CONFIG } from '@fixtures/config'
import { ScaffoldBusiness } from '~/business/scaffold'
import type { MockAppContainer } from '@mocks'
import type { SourceContext } from '~/services/command/types'

/**
 * Helper to extract handler registered via commandRegistry.register
 */
function getHandler(
  container: MockAppContainer,
  key: string
): (data: unknown, source: SourceContext) => Promise<void> {
  const registry = container.resolve('commandRegistry')
  const call = registry.register.mock.calls.find((c) => c[0] === key)
  expect(call).toBeDefined()
  return call![2] as (data: unknown, source: SourceContext) => Promise<void>
}

function makeSource(overrides?: {
  chat?: SourceContext['chat']
  user?: SourceContext['user']
}): SourceContext {
  return {
    type: 'command',
    chat: overrides?.chat ?? { id: TEST_CONFIG.chatId, type: 'group', title: 'Test Chat' },
    user: overrides?.user ?? {
      id: TEST_CONFIG.adminId,
      username: undefined,
      firstName: 'Admin',
      lastName: undefined,
    },
  }
}

describe('ScaffoldBusiness', () => {
  // ── handleCreateFromDef (via CommandRegistry) ────────────────────

  describe('handleCreateFromDef', () => {
    test('happy path: creates scaffold, sends success message', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_new123' })
      scaffoldRepo.createScaffold.mockResolvedValue(scaffold)

      const business = new ScaffoldBusiness(container)
      business.init()

      const handler = getHandler(container, 'scaffold:create')
      await handler({ day: 'Tue', time: '18:00', courts: 2 }, makeSource())

      expect(scaffoldRepo.createScaffold).toHaveBeenCalledWith(
        'Tue',
        '18:00',
        2,
        undefined,
        String(TEST_CONFIG.adminId)
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

      const handler = getHandler(container, 'scaffold:create')
      await handler(
        { day: 'Tue', time: '18:00', courts: 2 },
        makeSource({ user: { id: 999999, firstName: 'User', lastName: undefined } })
      )

      expect(scaffoldRepo.createScaffold).toHaveBeenCalledWith(
        'Tue',
        '18:00',
        2,
        undefined,
        '999999'
      )
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Created scaffold')
      )
    })

    // Validation tests removed — parser now validates day and courts before handler is called
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

      const handler = getHandler(container, 'scaffold:list')
      await handler({}, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Scaffold list')
      )
      const message = transport.sendMessage.mock.calls[0][1]
      expect(message).toContain('sc_001')
      expect(message).toContain('sc_002')
      expect(message).toContain('Active')
      expect(message).toContain('Paused')
    })

    test('empty → sends "no scaffolds" message', async ({ container }) => {
      const settingsRepo = container.resolve('settingsRepository')
      settingsRepo.getAdminId.mockResolvedValue(String(TEST_CONFIG.adminId))
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.getScaffolds.mockResolvedValue([])

      const business = new ScaffoldBusiness(container)
      business.init()

      const handler = getHandler(container, 'scaffold:list')
      await handler({}, makeSource())

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

      const handler = getHandler(container, 'scaffold:list')
      await handler(
        {},
        makeSource({ user: { id: 999999, firstName: 'User', lastName: undefined } })
      )

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('No scaffolds found')
      )
    })
  })

  // ── handleEditMenu ─────────────────────────────────────────────────

  describe('handleEditMenu', () => {
    test('happy path → sends edit menu with keyboard', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      const scaffold = buildScaffold({ id: 'sc_edit', isActive: true })
      scaffoldRepo.findById.mockResolvedValue(scaffold)

      const business = new ScaffoldBusiness(container)
      business.init()

      const handler = getHandler(container, 'scaffold:update')
      await handler({ scaffoldId: 'sc_edit' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('Scaffold <code>sc_edit</code>'),
        expect.anything()
      )
    })

    test('not found → sends error', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.findById.mockResolvedValue(undefined)

      const business = new ScaffoldBusiness(container)
      business.init()

      const handler = getHandler(container, 'scaffold:update')
      await handler({ scaffoldId: 'sc_missing' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
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

      const handler = getHandler(container, 'scaffold:delete')
      await handler({ scaffoldId: 'sc_remove' }, makeSource())

      expect(scaffoldRepo.remove).toHaveBeenCalledWith('sc_remove')
      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('deleted')
      )
    })

    test('not found → sends error', async ({ container }) => {
      const scaffoldRepo = container.resolve('scaffoldRepository')
      const transport = container.resolve('transport')

      scaffoldRepo.findById.mockResolvedValue(undefined)

      const business = new ScaffoldBusiness(container)
      business.init()

      const handler = getHandler(container, 'scaffold:delete')
      await handler({ scaffoldId: 'sc_missing' }, makeSource())

      expect(transport.sendMessage).toHaveBeenCalledWith(
        TEST_CONFIG.chatId,
        expect.stringContaining('not found')
      )
    })
  })
})
