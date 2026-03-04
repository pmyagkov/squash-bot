import type { CommandDef } from '~/services/command/types'
import { createInfoMenuStep } from './menuStep'

export interface InfoPaymentData {
  paymentInfo?: string
}

export const infoPaymentDef: CommandDef<InfoPaymentData> = {
  parser: ({ args }) => {
    if (args.length === 0) {
      return { parsed: {}, missing: [] }
    }
    return { parsed: { paymentInfo: args.join(' ') }, missing: [] }
  },
  steps: [],
}

export const infoMenuDef: CommandDef<{ subcommand: string }> = {
  parser: () => ({ parsed: {}, missing: ['subcommand'] }),
  steps: [createInfoMenuStep()],
}
