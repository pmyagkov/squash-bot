import type { Context } from 'grammy'
import type { Scaffold, DayOfWeek } from '~/types'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { AppContainer } from '../container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { Logger } from '~/services/logger'
import type { CommandRegistry } from '~/services/command/commandRegistry'
import type { SourceContext } from '~/services/command/types'
import type { WizardService } from '~/services/wizard/wizardService'
import type { WizardStep } from '~/services/wizard/types'
import type { HydratedStep } from '~/services/wizard/types'
import { WizardCancelledError } from '~/services/wizard/types'
import { isOwnerOrAdmin } from '~/utils/environment'
import { scaffoldCreateDef } from '~/commands/scaffold/create'
import {
  scaffoldListDef,
  scaffoldActionDef,
  scaffoldTransferDef,
  scaffoldUndoDeleteDef,
} from '~/commands/scaffold/defs'
import { dayStep, timeStep } from '~/commands/scaffold/steps'
import { formatScaffoldEditMenu, buildScaffoldEditKeyboard } from '~/services/formatters/editMenu'

/**
 * Business logic orchestrator for scaffolds
 */
export class ScaffoldBusiness {
  private scaffoldRepository: ScaffoldRepo
  private settingsRepository: SettingsRepo
  private participantRepository: ParticipantRepo
  private transport: TelegramTransport
  private logger: Logger
  private commandRegistry: CommandRegistry
  private wizardService: WizardService
  private container: AppContainer

  constructor(container: AppContainer) {
    this.scaffoldRepository = container.resolve('scaffoldRepository')
    this.settingsRepository = container.resolve('settingsRepository')
    this.participantRepository = container.resolve('participantRepository')
    this.transport = container.resolve('transport')
    this.logger = container.resolve('logger')
    this.commandRegistry = container.resolve('commandRegistry')
    this.wizardService = container.resolve('wizardService')
    this.container = container
  }

  /**
   * Initialize command handlers
   */
  init(): void {
    this.commandRegistry.register('scaffold:create', scaffoldCreateDef, async (data, source) => {
      await this.handleCreateFromDef(data, source)
    })

    this.commandRegistry.register('scaffold:list', scaffoldListDef, async (_data, source) => {
      await this.handleList(source)
    })

    this.commandRegistry.register('scaffold:update', scaffoldActionDef, async (data, source) => {
      await this.handleEditMenu(data as { scaffoldId: string }, source)
    })

    this.transport.onEdit('scaffold', (action, entityId, ctx) =>
      this.handleEditAction(action, entityId, ctx)
    )

    this.commandRegistry.register('scaffold:delete', scaffoldActionDef, async (data, source) => {
      await this.handleRemove(data as { scaffoldId: string }, source)
    })

    this.commandRegistry.register(
      'scaffold:transfer',
      scaffoldTransferDef,
      async (data, source) => {
        await this.handleTransfer(data as { scaffoldId: string; targetUsername: string }, source)
      }
    )

    this.commandRegistry.register(
      'scaffold:undo-delete',
      scaffoldUndoDeleteDef,
      async (data, source) => {
        await this.handleRestore(data as { scaffoldId: string }, source)
      }
    )

    this.transport.ensureBaseCommand('scaffold')
  }

  // === Command Handlers ===

  private async handleCreateFromDef(
    data: { day: DayOfWeek; time: string; courts: number },
    source: SourceContext
  ): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.createScaffold(
        data.day,
        data.time,
        data.courts,
        undefined,
        String(source.user.id)
      )

      await this.transport.sendMessage(
        source.chat.id,
        `✅ Created scaffold ${scaffold.id}: ${data.day} ${data.time}, ${data.courts} court(s)`
      )

      await this.logger.log(
        `User ${source.user.id} created scaffold ${scaffold.id}: ${data.day} ${data.time}, ${data.courts} courts`
      )
      void this.transport.logEvent({
        type: 'scaffold_created',
        scaffoldId: scaffold.id,
        day: data.day,
        time: data.time,
        courts: data.courts,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error creating scaffold: ${errorMessage}`)
    }
  }

  private async handleList(source: SourceContext): Promise<void> {
    try {
      const scaffolds = await this.scaffoldRepository.getScaffolds()

      if (scaffolds.length === 0) {
        await this.transport.sendMessage(source.chat.id, '📋 No scaffolds found')
        return
      }

      const list = await Promise.all(
        scaffolds.map(async (s: Scaffold) => {
          let ownerLabel = ''
          if (s.ownerId) {
            const owner = await this.participantRepository.findByTelegramId(s.ownerId)
            ownerLabel = owner?.telegramUsername
              ? `, 👑 @${owner.telegramUsername}`
              : owner?.displayName
                ? `, 👑 ${owner.displayName}`
                : ''
          }
          return `${s.id}: ${s.dayOfWeek} ${s.time}, ${s.defaultCourts} court(s), ${
            s.isActive ? '✅ active' : '❌ inactive'
          }${ownerLabel}`
        })
      )

      await this.transport.sendMessage(source.chat.id, `📋 Scaffold list:\n\n${list.join('\n')}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(
        `Error listing scaffolds from user ${source.user.id}: ${errorMessage}`
      )
    }
  }

  private async handleEditMenu(data: { scaffoldId: string }, source: SourceContext): Promise<void> {
    const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
    if (!scaffold) {
      await this.transport.sendMessage(source.chat.id, `❌ Scaffold ${data.scaffoldId} not found`)
      return
    }
    await this.transport.sendMessage(
      source.chat.id,
      formatScaffoldEditMenu(scaffold),
      buildScaffoldEditKeyboard(data.scaffoldId)
    )
  }

  private async handleEditAction(action: string, entityId: string, ctx: Context): Promise<void> {
    const scaffold = await this.scaffoldRepository.findById(entityId)
    if (!scaffold) return

    const chatId = ctx.chat!.id
    const messageId = ctx.callbackQuery!.message!.message_id

    switch (action) {
      case '+court':
        await this.scaffoldRepository.updateFields(entityId, {
          defaultCourts: scaffold.defaultCourts + 1,
        })
        break
      case '-court':
        if (scaffold.defaultCourts <= 1) return
        await this.scaffoldRepository.updateFields(entityId, {
          defaultCourts: scaffold.defaultCourts - 1,
        })
        break
      case 'toggle':
        await this.scaffoldRepository.setActive(entityId, !scaffold.isActive)
        break
      case 'day': {
        const hydratedDay = this.hydrateStep(dayStep)
        try {
          const newDay = await this.wizardService.collect(hydratedDay, ctx)
          await this.scaffoldRepository.updateFields(entityId, { dayOfWeek: newDay })
        } catch (e) {
          if (e instanceof WizardCancelledError) return
          throw e
        }
        break
      }
      case 'time': {
        const hydratedTime = this.hydrateStep(timeStep)
        try {
          const newTime = await this.wizardService.collect(hydratedTime, ctx)
          await this.scaffoldRepository.updateFields(entityId, { time: newTime })
        } catch (e) {
          if (e instanceof WizardCancelledError) return
          throw e
        }
        break
      }
      case 'done':
        await this.transport.editMessage(chatId, messageId, formatScaffoldEditMenu(scaffold))
        return // Don't re-render with keyboard
    }

    // Re-render edit menu with updated data
    const updated = await this.scaffoldRepository.findById(entityId)
    if (updated) {
      await this.transport.editMessage(
        chatId,
        messageId,
        formatScaffoldEditMenu(updated),
        buildScaffoldEditKeyboard(entityId)
      )
    }
  }

  private hydrateStep<T>(step: WizardStep<T>): HydratedStep<T> {
    const { createLoader, ...rest } = step
    return { ...rest, load: createLoader?.(this.container) }
  }

  private async handleRemove(data: { scaffoldId: string }, source: SourceContext): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(source.chat.id, `❌ Scaffold ${data.scaffoldId} not found`)
        return
      }

      if (!(await isOwnerOrAdmin(source.user.id, scaffold.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          source.chat.id,
          '❌ Only the owner or admin can remove this scaffold'
        )
        return
      }

      await this.scaffoldRepository.remove(data.scaffoldId)

      await this.transport.sendMessage(source.chat.id, `✅ Scaffold ${data.scaffoldId} removed`)
      await this.logger.log(`User ${source.user.id} removed scaffold ${data.scaffoldId}`)
      void this.transport.logEvent({ type: 'scaffold_removed', scaffoldId: data.scaffoldId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(
        `Error removing scaffold from user ${source.user.id}: ${errorMessage}`
      )
    }
  }

  private async handleRestore(data: { scaffoldId: string }, source: SourceContext): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.findByIdIncludingDeleted(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(source.chat.id, `❌ Scaffold ${data.scaffoldId} not found`)
        return
      }
      if (!scaffold.deletedAt) {
        await this.transport.sendMessage(
          source.chat.id,
          `❌ Scaffold ${data.scaffoldId} is not deleted`
        )
        return
      }
      if (!(await isOwnerOrAdmin(source.user.id, scaffold.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          source.chat.id,
          '❌ Only the owner or admin can restore this scaffold'
        )
        return
      }
      await this.scaffoldRepository.restore(data.scaffoldId)
      await this.transport.sendMessage(source.chat.id, `✅ Scaffold ${data.scaffoldId} restored`)
      await this.logger.log(`User ${source.user.id} restored scaffold ${data.scaffoldId}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(
        `Error restoring scaffold from user ${source.user.id}: ${errorMessage}`
      )
    }
  }

  private async handleTransfer(
    data: { scaffoldId: string; targetUsername: string },
    source: SourceContext
  ): Promise<void> {
    try {
      const scaffold = await this.scaffoldRepository.findById(data.scaffoldId)
      if (!scaffold) {
        await this.transport.sendMessage(source.chat.id, `❌ Scaffold ${data.scaffoldId} not found`)
        return
      }

      if (!(await isOwnerOrAdmin(source.user.id, scaffold.ownerId, this.settingsRepository))) {
        await this.transport.sendMessage(
          source.chat.id,
          '❌ Only the owner or admin can transfer ownership'
        )
        return
      }

      const target = await this.participantRepository.findByUsername(data.targetUsername)
      if (!target || !target.telegramId) {
        await this.transport.sendMessage(
          source.chat.id,
          `❌ User @${data.targetUsername} not found. They need to interact with the bot first.`
        )
        return
      }

      await this.scaffoldRepository.updateOwner(scaffold.id, target.telegramId)

      await this.transport.sendMessage(
        source.chat.id,
        `✅ Scaffold ${scaffold.id} transferred to @${data.targetUsername}`
      )
      await this.logger.log(
        `User ${source.user.id} transferred scaffold ${scaffold.id} to @${data.targetUsername}`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.transport.sendMessage(source.chat.id, `❌ Error: ${errorMessage}`)
      await this.logger.error(`Error transferring scaffold: ${errorMessage}`)
    }
  }
}
