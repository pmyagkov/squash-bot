import { InlineKeyboard } from 'grammy'
import type { Scaffold, Event } from '~/types'
import { code } from '~/helpers/format'
import dayjs from 'dayjs'
import {
  BTN_EDIT_DAY,
  BTN_EDIT_DATE,
  BTN_EDIT_TIME,
  BTN_ADD_COURT,
  BTN_REMOVE_COURT,
  BTN_TURN_ON,
  BTN_TURN_OFF,
  BTN_DONE,
  formatDate,
  formatCourts,
  formatActiveStatus,
} from '~/ui/constants'

export function formatScaffoldEditMenu(scaffold: Scaffold): string {
  return [
    `✏️ Scaffold ${code(scaffold.id)}`,
    '',
    `📅 ${scaffold.dayOfWeek}, ${scaffold.time}`,
    `${formatCourts(scaffold.defaultCourts)}`,
    `${formatActiveStatus(scaffold.isActive)}`,
  ].join('\n')
}

export function buildScaffoldEditKeyboard(scaffoldId: string, isActive: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(BTN_EDIT_DAY, `edit:scaffold:day:${scaffoldId}`)
    .text(BTN_EDIT_TIME, `edit:scaffold:time:${scaffoldId}`)
    .row()
    .text(BTN_ADD_COURT, `edit:scaffold:+court:${scaffoldId}`)
    .text(BTN_REMOVE_COURT, `edit:scaffold:-court:${scaffoldId}`)
    .row()
    .text(isActive ? BTN_TURN_OFF : BTN_TURN_ON, `edit:scaffold:toggle:${scaffoldId}`)
    .row()
    .text(BTN_DONE, `edit:scaffold:done:${scaffoldId}`)
}

export function formatEventEditMenu(event: Event): string {
  const dt = dayjs(event.datetime)
  const statusLabels: Record<string, string> = {
    created: '📝 Created',
    announced: '📢 Announced',
    finalized: '✅ Finalized',
    cancelled: '❌ Cancelled',
  }
  const statusLabel = statusLabels[event.status] ?? event.status
  return [
    `✏️ Event ${code(event.id)}`,
    '',
    `📅 ${formatDate(dt)}`,
    `${formatCourts(event.courts)}`,
    `${statusLabel}`,
  ].join('\n')
}

export function buildEventEditKeyboard(eventId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(BTN_EDIT_DATE, `edit:event:date:${eventId}`)
    .text(BTN_EDIT_TIME, `edit:event:time:${eventId}`)
    .row()
    .text(BTN_ADD_COURT, `edit:event:+court:${eventId}`)
    .text(BTN_REMOVE_COURT, `edit:event:-court:${eventId}`)
    .row()
    .text(BTN_DONE, `edit:event:done:${eventId}`)
}
