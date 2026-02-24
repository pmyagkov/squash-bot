import type { CommandDef } from '~/services/command/types'
import {
  resolveScaffoldId,
  resolveScaffoldIdAndUsername,
  resolveDeletedScaffoldId,
} from './parsers'
import { scaffoldSelectStep, usernameStep } from './steps'

export const scaffoldListDef: CommandDef<Record<string, never>> = {
  parser: () => ({ parsed: {}, missing: [] }),
  steps: [],
}

export const scaffoldActionDef: CommandDef<{ scaffoldId: string }> = {
  parser: resolveScaffoldId,
  steps: [scaffoldSelectStep],
}

export const scaffoldTransferDef: CommandDef<{ scaffoldId: string; targetUsername: string }> = {
  parser: resolveScaffoldIdAndUsername,
  steps: [scaffoldSelectStep, usernameStep],
}

export const scaffoldUndoDeleteDef: CommandDef<{ scaffoldId: string }> = {
  parser: resolveDeletedScaffoldId,
  steps: [],
}
