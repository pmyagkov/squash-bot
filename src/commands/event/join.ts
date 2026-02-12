import type { CommandDef } from '~/services/command/types'
import { resolveEventId } from './parsers'
import { eventSelectStep } from './steps'

export const eventJoinDef: CommandDef<{ eventId: string }> = {
  parser: resolveEventId,
  steps: [eventSelectStep],
}
