import type { CommandDef } from '~/services/command/types'
import { createPaymentMenuStep } from './menuStep'

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

export const paymentMenuDef: CommandDef<{ subcommand: string }> = {
  parser: () => ({ parsed: {}, missing: ['subcommand'] }),
  steps: [createPaymentMenuStep()],
}
