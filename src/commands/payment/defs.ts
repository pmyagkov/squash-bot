import type { CommandDef } from '~/services/command/types'

export const paymentDebtDef: CommandDef<Record<string, never>> = {
  parser: () => ({ parsed: {}, missing: [] }),
  steps: [],
}

export interface AdminPaymentDebtData {
  targetUsername?: string
}

export const adminPaymentDebtDef: CommandDef<AdminPaymentDebtData> = {
  parser: ({ args }) => {
    if (args.length === 0) {
      return { parsed: {}, missing: [] }
    }
    const target = args[0].startsWith('@') ? args[0].slice(1) : args[0]
    return { parsed: { targetUsername: target }, missing: [] }
  },
  steps: [],
}
