import type { CommandDef } from '~/services/command/types'

type Empty = Record<string, never>

const emptyDef: CommandDef<Empty> = {
  parser: () => ({ parsed: {}, missing: [] }),
  steps: [],
}

export const startDef: CommandDef<Empty> = emptyDef
export const helpDef: CommandDef<Empty> = emptyDef
export const myidDef: CommandDef<Empty> = emptyDef
export const getchatidDef: CommandDef<Empty> = emptyDef
