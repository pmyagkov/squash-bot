import type { CommandDef } from '~/services/command/types'

export interface SayData {
  target?: string // '@username' for DM, undefined for group chat
  message: string
}

export const sayDef: CommandDef<SayData> = {
  parser: ({ args }) => {
    if (args.length === 0) {
      return { parsed: {}, missing: [], error: 'Usage: /admin say [text] or /admin say @username [text]' }
    }

    const firstArg = args[0]
    if (firstArg.startsWith('@')) {
      const message = args.slice(1).join(' ')
      if (!message) {
        return { parsed: {}, missing: [], error: 'Usage: /admin say @username [text]' }
      }
      return { parsed: { target: firstArg, message }, missing: [] }
    }

    return { parsed: { message: args.join(' ') }, missing: [] }
  },
  steps: [],
}
