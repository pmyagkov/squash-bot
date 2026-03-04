import type { CommandDef } from '~/services/command/types'

export interface PaymentDebtData {
  targetUsername?: string
}

export const paymentDebtDef: CommandDef<PaymentDebtData> = {
  parser: ({ args }) => {
    if (args.length === 0) {
      return { parsed: {}, missing: [] }
    }
    const target = args[0].startsWith('@') ? args[0].slice(1) : args[0]
    return { parsed: { targetUsername: target }, missing: [] }
  },
  steps: [],
}
