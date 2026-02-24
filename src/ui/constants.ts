import type { Dayjs } from 'dayjs'

// Date format: "Sat, 20 Jan, 21:00"
export const DATE_FORMAT = 'ddd, D MMM, HH:mm'
export const formatDate = (d: Dayjs): string => d.format(DATE_FORMAT)

// Announcement buttons
export const BTN_JOIN = "✋ I'm in"
export const BTN_LEAVE = "👋 I'm out"
export const BTN_ADD_COURT = '➕ Court'
export const BTN_REMOVE_COURT = '➖ Court'
export const BTN_FINALIZE = '✅ Finalize'
export const BTN_CANCEL_EVENT = '❌ Cancel'
export const BTN_RESTORE = '🔄 Restore'
export const BTN_UNFINALIZE = '↩️ Unfinalize'

// Payment buttons
export const BTN_I_PAID = '✅ I paid'
export const BTN_UNDO = '↩️ Undo'

// Edit menu buttons
export const BTN_EDIT_DAY = '📅 Day'
export const BTN_EDIT_DATE = '📅 Date'
export const BTN_EDIT_TIME = '🕐 Time'
export const BTN_TURN_ON = '▶️ Turn on'
export const BTN_TURN_OFF = '⏸ Turn off'
export const BTN_DONE = '✅ Done'

// Wizard buttons
export const BTN_WIZARD_CANCEL = '❌ Cancel'

// Courts format
export const formatCourts = (n: number): string => `🏟 Courts: ${n}`

// Status labels
export const formatActiveStatus = (isActive: boolean): string =>
  isActive ? '🟢 Active' : '⏸ Paused'
