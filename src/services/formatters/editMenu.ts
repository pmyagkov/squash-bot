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
  BTN_MAKE_PRIVATE,
  BTN_MAKE_PUBLIC,
  BTN_PARTICIPANTS,
  BTN_ADD_PARTICIPANT,
  BTN_REMOVE_PARTICIPANT,
  BTN_BACK,
  formatDate,
  formatCourts,
  formatActiveStatus,
} from '~/ui/constants'

export function formatScaffoldEditMenu(scaffold: Scaffold): string {
  const lines = [
    `✏️ Scaffold ${code(scaffold.id)}`,
    '',
    `📅 ${scaffold.dayOfWeek}, ${scaffold.time}`,
    `${formatCourts(scaffold.defaultCourts)}`,
    `${formatActiveStatus(scaffold.isActive)}`,
  ]
  if (scaffold.isPrivate) {
    lines.push('🔒 Private')
  }
  return lines.join('\n')
}

export function buildScaffoldEditKeyboard(
  scaffoldId: string,
  isActive: boolean,
  isPrivate: boolean
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(BTN_EDIT_DAY, `edit:scaffold:day:${scaffoldId}`)
    .text(BTN_EDIT_TIME, `edit:scaffold:time:${scaffoldId}`)
    .row()
    .text(BTN_ADD_COURT, `edit:scaffold:+court:${scaffoldId}`)
    .text(BTN_REMOVE_COURT, `edit:scaffold:-court:${scaffoldId}`)
    .row()
    .text(isActive ? BTN_TURN_OFF : BTN_TURN_ON, `edit:scaffold:toggle:${scaffoldId}`)
    .row()
    .text(isPrivate ? BTN_MAKE_PUBLIC : BTN_MAKE_PRIVATE, `edit:scaffold:privacy:${scaffoldId}`)
    .row()

  if (isPrivate) {
    keyboard.text(BTN_PARTICIPANTS, `edit:scaffold:participants:${scaffoldId}`).row()
  }

  keyboard.text(BTN_DONE, `edit:scaffold:done:${scaffoldId}`)
  return keyboard
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
  const lines = [
    `✏️ Event ${code(event.id)}`,
    '',
    `📅 ${formatDate(dt)}`,
    `${formatCourts(event.courts)}`,
    `${statusLabel}`,
  ]
  if (event.isPrivate) {
    lines.push('🔒 Private')
  }
  return lines.join('\n')
}

export function formatScaffoldParticipantsMenu(
  scaffoldId: string,
  participants: { telegramUsername?: string; displayName: string }[]
): string {
  const list =
    participants.length > 0
      ? participants
          .map((p) => (p.telegramUsername ? `@${p.telegramUsername}` : p.displayName))
          .join(', ')
      : '(no participants)'
  return `👥 Participants for ${code(scaffoldId)}\n\n${list}`
}

export function buildScaffoldParticipantsKeyboard(scaffoldId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(BTN_ADD_PARTICIPANT, `edit:scaffold:+participant:${scaffoldId}`)
    .text(BTN_REMOVE_PARTICIPANT, `edit:scaffold:-participant:${scaffoldId}`)
    .row()
    .text(BTN_BACK, `edit:scaffold:back:${scaffoldId}`)
}

export function buildEventEditKeyboard(
  eventId: string,
  isPrivate?: boolean,
  status?: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(BTN_EDIT_DATE, `edit:event:date:${eventId}`)
    .text(BTN_EDIT_TIME, `edit:event:time:${eventId}`)
    .row()
    .text(BTN_ADD_COURT, `edit:event:+court:${eventId}`)
    .text(BTN_REMOVE_COURT, `edit:event:-court:${eventId}`)
    .row()

  if (status === 'created') {
    keyboard
      .text(isPrivate ? BTN_MAKE_PUBLIC : BTN_MAKE_PRIVATE, `edit:event:privacy:${eventId}`)
      .row()
  }

  keyboard.text(BTN_DONE, `edit:event:done:${eventId}`)
  return keyboard
}
