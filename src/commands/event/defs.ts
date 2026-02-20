import type { CommandDef } from '~/services/command/types'
import {
  resolveEventId,
  resolveEventIdAndUsername,
  resolveScaffoldIdForSpawn,
  resolveDeletedEventId,
} from './parsers'
import { eventSelectStep, usernameStep, scaffoldSelectStep } from './steps'

export const eventListDef: CommandDef<Record<string, never>> = {
  parser: () => ({ parsed: {}, missing: [] }),
  steps: [],
}

export const eventAnnounceDef: CommandDef<{ eventId: string }> = {
  parser: resolveEventId,
  steps: [eventSelectStep],
}

export const eventCancelDef: CommandDef<{ eventId: string }> = {
  parser: resolveEventId,
  steps: [eventSelectStep],
}

export const eventSpawnDef: CommandDef<{ scaffoldId: string }> = {
  parser: resolveScaffoldIdForSpawn,
  steps: [scaffoldSelectStep],
}

export const eventTransferDef: CommandDef<{ eventId: string; targetUsername: string }> = {
  parser: resolveEventIdAndUsername,
  steps: [eventSelectStep, usernameStep],
}

export const eventDeleteDef: CommandDef<{ eventId: string }> = {
  parser: resolveEventId,
  steps: [eventSelectStep],
}

export const eventUndoDeleteDef: CommandDef<{ eventId: string }> = {
  parser: resolveDeletedEventId,
  steps: [],
}
