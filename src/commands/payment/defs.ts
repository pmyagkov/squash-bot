import type { CommandDef } from '~/services/command/types'

export const paymentDebtDef: CommandDef<Record<string, never>> = {
  parser: () => ({ parsed: {}, missing: [] }),
  steps: [],
}
