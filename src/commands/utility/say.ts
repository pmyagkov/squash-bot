import type { CommandDef } from '~/services/command/types'

export interface SayData {
  target?: string // '@username' for DM, undefined for group chat
  message: string
}

export const sayDef: CommandDef<SayData> = {
  parser: ({ args, argsString }) => {
    if (args.length === 0) {
      return {
        parsed: {},
        missing: [],
        error: 'Usage: /admin say [text] or /admin say @username [text]',
      }
    }

    const firstArg = args[0]
    if (firstArg.startsWith('@')) {
      const message = argsString.replace(/^\S+\s?/, '')
      if (!message.trim()) {
        return { parsed: {}, missing: [], error: 'Usage: /admin say @username [text]' }
      }
      return { parsed: { target: firstArg, message }, missing: [] }
    }

    return { parsed: { message: argsString }, missing: [] }
  },
  steps: [],
}
