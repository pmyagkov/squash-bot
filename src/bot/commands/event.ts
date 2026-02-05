import { Context, Bot } from 'grammy'
import { logToTelegram } from '~/utils/logger'
import { eventRepo } from '~/storage/repo/event'
import { scaffoldRepo } from '~/storage/repo/scaffold'
import { parseDate } from '~/utils/dateParser'
import { config } from '~/config'
import type { Event } from '~/types'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import * as eventBusiness from '~/business/event'

// Extend dayjs with plugins
dayjs.extend(utc)
dayjs.extend(timezone)

// Store bot instance reference for event commands
let globalBotInstance: Bot | null = null

export function setBotInstance(bot: Bot | null): void {
  globalBotInstance = bot
}

export const commandName = 'event'

export async function handleCommand(ctx: Context, args: string[]): Promise<void> {
  if (!ctx.from) {
    await ctx.reply('Error: failed to identify user')
    return
  }

  if (!ctx.chat) {
    await ctx.reply('Error: failed to identify chat')
    return
  }

  const subcommand = args[0]

  try {
    if (subcommand === 'add') {
      // /event add <date> <time> <courts>
      // Handle "next <day>" format by combining args[1] and args[2] if args[1] is "next"
      let dateStr = args[1]
      let timeStr = args[2]
      let courtsStr = args[3]

      // If first arg is "next", combine with second arg for date parsing
      if (dateStr?.toLowerCase() === 'next' && args[2]) {
        dateStr = `${dateStr} ${args[2]}`
        timeStr = args[3]
        courtsStr = args[4]
      }

      if (!dateStr || !timeStr || !courtsStr) {
        await ctx.reply(
          'Usage: /event add <date> <time> <courts>\n\n' +
            'Examples:\n' +
            '/event add 2024-01-20 19:00 2\n' +
            '/event add tomorrow 19:00 2\n' +
            '/event add sat 19:00 2\n' +
            '/event add next tue 21:00 2'
        )
        return
      }

      // Parse date
      let eventDate: Date
      try {
        eventDate = parseDate(dateStr)
      } catch {
        await ctx.reply(`❌ Invalid date format: ${dateStr}`)
        return
      }

      // Parse time
      if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
        await ctx.reply('❌ Invalid time format. Use HH:MM (e.g., 19:00)')
        return
      }

      const [hours, minutes] = timeStr.split(':').map(Number)
      const eventDateTime = dayjs
        .tz(eventDate, config.timezone)
        .hour(hours)
        .minute(minutes)
        .second(0)
        .millisecond(0)
        .toDate()

      const courts = parseInt(courtsStr, 10)
      if (isNaN(courts) || courts < 1) {
        await ctx.reply('❌ Number of courts must be a positive number')
        return
      }

      const event = await eventRepo.createEvent({
        datetime: eventDateTime,
        courts,
        status: 'created',
      })

      const formattedDate = dayjs.tz(eventDateTime, config.timezone).format('ddd D MMM HH:mm')
      await ctx.reply(
        `✅ Created event ${event.id} (${formattedDate}, ${courts} courts). To announce: /event announce ${event.id}`
      )

      await logToTelegram(
        `User ${ctx.from.id} created event ${event.id}: ${formattedDate}, ${courts} courts`,
        'info'
      )
    } else if (subcommand === 'add-by-scaffold') {
      // /event add-by-scaffold <scaffold-id>
      const scaffoldId = args[1]

      if (!scaffoldId) {
        await ctx.reply(
          'Usage: /event add-by-scaffold <scaffold-id>\n\nExample: /event add-by-scaffold sc_a1b2'
        )
        return
      }

      const scaffold = await scaffoldRepo.findById(scaffoldId)
      if (!scaffold) {
        await ctx.reply(`❌ Scaffold ${scaffoldId} not found`)
        return
      }

      // Calculate next occurrence
      const nextOccurrence = eventBusiness.calculateNextOccurrence(scaffold)

      // Check if event already exists
      const allEvents = await eventRepo.getEvents()
      const exists = eventBusiness.eventExists(allEvents, scaffold.id, nextOccurrence)
      if (exists) {
        await ctx.reply(`❌ Event already exists for scaffold ${scaffoldId} at this time`)
        return
      }

      // Create event
      const event = await eventRepo.createEvent({
        scaffoldId: scaffold.id,
        datetime: nextOccurrence,
        courts: scaffold.defaultCourts,
        status: 'created',
      })

      const formattedDate = dayjs.tz(nextOccurrence, config.timezone).format('ddd D MMM HH:mm')
      await ctx.reply(
        `✅ Created event ${event.id} from scaffold ${scaffoldId} (${formattedDate}, ${scaffold.defaultCourts} courts). To announce: /event announce ${event.id}`
      )

      await logToTelegram(
        `User ${ctx.from.id} created event ${event.id} from scaffold ${scaffoldId}`,
        'info'
      )
    } else if (subcommand === 'list') {
      // /event list
      const events = await eventRepo.getEvents()

      if (events.length === 0) {
        await ctx.reply('📋 No events found')
        return
      }

      const list = events
        .map((e: Event) => {
          const formattedDate = dayjs.tz(e.datetime, config.timezone).format('ddd D MMM HH:mm')
          return `${e.id}: ${formattedDate}, ${e.courts} courts, ${e.status}`
        })
        .join('\n')

      await ctx.reply(`📋 Event list:\n\n${list}`)
    } else if (subcommand === 'announce') {
      // /event announce <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Usage: /event announce <id>\n\nExample: /event announce ev_a1b2')
        return
      }

      const event = await eventRepo.findById(id)
      if (!event) {
        await ctx.reply(`❌ Event ${id} not found`)
        return
      }

      if (event.status === 'announced') {
        await ctx.reply(`ℹ️ Event ${id} is already announced`)
        return
      }

      // Get bot instance from global
      if (!globalBotInstance) {
        throw new Error('Bot instance not available')
      }
      await eventRepo.announceEvent(id, globalBotInstance)

      await ctx.reply(`✅ Event ${id} announced`)
      await logToTelegram(`User ${ctx.from.id} announced event ${id}`, 'info')
    } else if (subcommand === 'cancel') {
      // /event cancel <id>
      const id = args[1]

      if (!id) {
        await ctx.reply('Usage: /event cancel <id>\n\nExample: /event cancel ev_a1b2')
        return
      }

      // Get bot instance from global
      if (!globalBotInstance) {
        throw new Error('Bot instance not available')
      }
      await eventRepo.cancelEvent(id, globalBotInstance)

      await ctx.reply(`✅ Event ${id} cancelled`)
      await logToTelegram(`User ${ctx.from.id} cancelled event ${id}`, 'info')
    } else {
      await ctx.reply(
        'Usage:\n' +
          '/event add <date> <time> <courts> - create event manually\n' +
          '/event add-by-scaffold <scaffold-id> - create event from scaffold\n' +
          '/event list - list events\n' +
          '/event announce <id> - announce event\n' +
          '/event cancel <id> - cancel event'
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await ctx.reply(`❌ Error: ${errorMessage}`)
    await logToTelegram(`Error in event command from user ${ctx.from.id}: ${errorMessage}`, 'error')
  }
}
