import type { CommandDef } from '~/services/command/types'
import { resolveEventIdAndUsername } from './parsers'
import { eventSelectStep, usernameStep } from './steps'

export const adminPaymentMarkPaidDef: CommandDef<{
  eventId: string
  targetUsername: string
}> = {
  parser: resolveEventIdAndUsername,
  steps: [eventSelectStep, usernameStep],
}

export const adminPaymentUndoMarkPaidDef: CommandDef<{
  eventId: string
  targetUsername: string
}> = {
  parser: resolveEventIdAndUsername,
  steps: [eventSelectStep, usernameStep],
}
