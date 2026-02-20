import { InlineKeyboard } from 'grammy'
import type { Scaffold, Event } from '~/types'
import dayjs from 'dayjs'

export function formatScaffoldEditMenu(scaffold: Scaffold): string {
  const activeLabel = scaffold.isActive ? 'Active' : 'Inactive'
  return [
    `Editing scaffold ${scaffold.id}`,
    '',
    `Day: ${scaffold.dayOfWeek} | Time: ${scaffold.time} | Courts: ${scaffold.defaultCourts} | ${activeLabel}`,
  ].join('\n')
}

export function buildScaffoldEditKeyboard(scaffoldId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Change day', `edit:scaffold:day:${scaffoldId}`)
    .text('Change time', `edit:scaffold:time:${scaffoldId}`)
    .row()
    .text('+court', `edit:scaffold:+court:${scaffoldId}`)
    .text('-court', `edit:scaffold:-court:${scaffoldId}`)
    .row()
    .text('Toggle active', `edit:scaffold:toggle:${scaffoldId}`)
    .row()
    .text('Done', `edit:scaffold:done:${scaffoldId}`)
}

export function formatEventEditMenu(event: Event): string {
  const dt = dayjs(event.datetime)
  return [
    `Editing event ${event.id}`,
    '',
    `Date: ${dt.format('ddd DD MMM')} | Time: ${dt.format('HH:mm')} | Courts: ${event.courts} | Status: ${event.status}`,
  ].join('\n')
}

export function buildEventEditKeyboard(eventId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Change date', `edit:event:date:${eventId}`)
    .text('Change time', `edit:event:time:${eventId}`)
    .row()
    .text('+court', `edit:event:+court:${eventId}`)
    .text('-court', `edit:event:-court:${eventId}`)
    .row()
    .text('Done', `edit:event:done:${eventId}`)
}
