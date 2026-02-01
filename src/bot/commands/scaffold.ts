import { Context } from 'grammy'
import { logToTelegram } from '~/utils/logger'
import { scaffoldService } from '~/services/scaffoldService'
import { isAdmin } from '~/utils/environment'
import { Scaffold } from '~/types'

export const commandName = 'scaffold'

export async function handleCommand(
  ctx: Context,
  args: string[],
  chatId?: number | string
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('Error: failed to identify user')
    return
  }

  // Check if user is admin
  if (!isAdmin(ctx.from.id)) {
    await ctx.reply('❌ This command is only available to administrators')
    return
  }

  if (!ctx.chat) {
    await ctx.reply('Error: failed to identify chat')
    return
  }

  const subcommand = args[0]
  const effectiveChatId = chatId ?? ctx.chat.id

  try {
    if (subcommand === 'add') {
      // /scaffold add <day> <time> <courts>
      const dayStr = args[1]
      const time = args[2]
      const courtsStr = args[3]

      if (!dayStr || !time || !courtsStr) {
        await ctx.reply(
          'Usage: /scaffold add <day> <time> <courts>\n\n' +
            'Example: /scaffold add Tue 21:00 2\n\n' +
            'Days of week: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
        )
        return
      }

      const dayOfWeek = scaffoldService.parseDayOfWeek(dayStr)
      if (!dayOfWeek) {
        await ctx.reply(
          `Invalid day of week: ${dayStr}\n\n` + 'Valid values: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
        )
        return
      }

      const courts = parseInt(courtsStr, 10)
      if (isNaN(courts) || courts < 1) {
        await ctx.reply('Number of courts must be a positive number')
        return
      }

      const scaffold = await scaffoldService.createScaffold(
        effectiveChatId,
        dayOfWeek,
        time,
        courts
      )

      await ctx.reply(
        `✅ Created scaffold ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} court(s), announcement ${scaffold.announcement_deadline ?? 'default'}`
      )

      await logToTelegram(
        `Admin ${ctx.from.id} created scaffold ${scaffold.id}: ${dayOfWeek} ${time}, ${courts} courts`,
        'info'
      )
    } else if (subcommand === 'list') {
      // /scaffold list
      const scaffolds = await scaffoldService.getScaffolds(effectiveChatId)

      if (scaffolds.length === 0) {
        await ctx.reply('📋 No scaffolds found')
        return
      }

      const list = scaffolds
        .map(
          (s: Scaffold) =>
            `${s.id}: ${s.day_of_week} ${s.time}, ${s.default_courts} court(s), ${
              s.is_active ? '✅ active' : '❌ inactive'
            }`
        )
        .join('\n')

      await ctx.reply(`📋 Scaffold list:\n\n${list}`)
    } else if (subcommand === 'toggle') {
      // /scaffold toggle <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Usage: /scaffold toggle <id>\n\nExample: /scaffold toggle sc_1')
        return
      }

      const scaffold = await scaffoldService.toggleScaffold(effectiveChatId, id)

      await ctx.reply(`✅ ${scaffold.id} is now ${scaffold.is_active ? 'active' : 'inactive'}`)
      await logToTelegram(
        `Admin ${ctx.from.id} toggled scaffold ${id} to ${scaffold.is_active ? 'active' : 'inactive'}`,
        'info'
      )
    } else if (subcommand === 'remove') {
      // /scaffold remove <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Usage: /scaffold remove <id>\n\nExample: /scaffold remove sc_1')
        return
      }

      await scaffoldService.removeScaffold(effectiveChatId, id)

      await ctx.reply(`✅ Scaffold ${id} removed`)
      await logToTelegram(`Admin ${ctx.from.id} removed scaffold ${id}`, 'info')
    } else {
      await ctx.reply(
        'Usage:\n' +
          '/scaffold add <day> <time> <courts> - create scaffold\n' +
          '/scaffold list - list scaffolds\n' +
          '/scaffold toggle <id> - enable/disable scaffold\n' +
          '/scaffold remove <id> - remove scaffold'
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await ctx.reply(`❌ Error: ${errorMessage}`)
    await logToTelegram(
      `Error in scaffold command from user ${ctx.from.id}: ${errorMessage}`,
      'error'
    )
  }
}
