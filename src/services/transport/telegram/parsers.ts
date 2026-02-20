import { Context } from 'grammy'
import type { CallbackTypes, CommandTypes, ChatType, CallbackAction, CommandName } from './types'

// === Parse Error ===
export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

// === Helper ===
function getChatType(ctx: Context): ChatType {
  return ctx.chat?.type === 'private' ? 'private' : 'group'
}

// === Callback Parsers ===
type CallbackParsers = {
  [K in CallbackAction]: (ctx: Context) => CallbackTypes[K]
}

const baseCallbackParser = (ctx: Context) => {
  if (!ctx.from || !ctx.chat || !ctx.callbackQuery?.message) {
    throw new ParseError('Invalid callback context')
  }

  return {
    userId: ctx.from.id,
    chatId: ctx.chat.id,
    chatType: getChatType(ctx),
    messageId: ctx.callbackQuery.message.message_id,
    callbackId: ctx.callbackQuery.id,
  }
}

const userCallbackParser = (ctx: Context) => {
  const base = baseCallbackParser(ctx)
  return {
    ...base,
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
  }
}

const paymentCallbackParser = (ctx: Context) => {
  const base = baseCallbackParser(ctx)
  const parts = ctx.callbackQuery?.data?.split(':') ?? []
  const eventId = parts[2]
  if (!eventId) {
    throw new ParseError('Missing event ID in payment callback')
  }
  return { ...base, eventId }
}

export const callbackParsers: CallbackParsers = {
  'event:join': userCallbackParser,
  'event:leave': userCallbackParser,
  'event:add-court': baseCallbackParser,
  'event:remove-court': baseCallbackParser,
  'event:finalize': baseCallbackParser,
  'event:cancel': baseCallbackParser,
  'event:undo-cancel': baseCallbackParser,
  'event:undo-finalize': baseCallbackParser,
  'payment:mark-paid': paymentCallbackParser,
  'payment:undo-mark-paid': paymentCallbackParser,
}

// === Command Parsers ===
type CommandParsers = {
  [K in CommandName]: (ctx: Context, args: string[]) => CommandTypes[K]
}

const baseCommandParser = (ctx: Context) => {
  if (!ctx.from || !ctx.chat) {
    throw new ParseError('Invalid command context')
  }

  return {
    userId: ctx.from.id,
    chatId: ctx.chat.id,
    chatType: getChatType(ctx),
  }
}

export const commandParsers: CommandParsers = {
  start: baseCommandParser,
  help: baseCommandParser,
  myid: (ctx) => {
    const base = baseCommandParser(ctx)
    return {
      ...base,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      lastName: ctx.from?.last_name,
    }
  },
  getchatid: (ctx) => {
    const base = baseCommandParser(ctx)
    return {
      ...base,
      chatTitle: 'title' in ctx.chat! ? ctx.chat.title : undefined,
    }
  },
  'event:list': baseCommandParser,
  'event:create': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 3) {
      throw new ParseError('Usage: /event create <day> <time> <courts>')
    }
    return {
      ...base,
      day: args[0],
      time: args[1],
      courts: parseInt(args[2], 10),
    }
  },
  'event:announce': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 1) {
      throw new ParseError('Usage: /event announce <eventId>')
    }
    return {
      ...base,
      eventId: args[0],
    }
  },
  'event:spawn': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 1) {
      throw new ParseError('Usage: /event spawn <scaffoldId>')
    }
    return {
      ...base,
      scaffoldId: args[0],
    }
  },
  'event:cancel': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 1) {
      throw new ParseError('Usage: /event cancel <eventId>')
    }
    return {
      ...base,
      eventId: args[0],
    }
  },
  'payment:mark-paid': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 2) {
      throw new ParseError('Usage: /payment mark-paid <event_id> @username')
    }
    return {
      ...base,
      eventId: args[0],
      username: args[1].replace(/^@/, ''),
    }
  },
  'payment:undo-mark-paid': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 2) {
      throw new ParseError('Usage: /payment undo-mark-paid <event_id> @username')
    }
    return {
      ...base,
      eventId: args[0],
      username: args[1].replace(/^@/, ''),
    }
  },
  'scaffold:create': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 3) {
      throw new ParseError('Usage: /scaffold create <day> <time> <courts>')
    }
    return {
      ...base,
      day: args[0],
      time: args[1],
      courts: parseInt(args[2], 10),
    }
  },
  'scaffold:list': baseCommandParser,
  'scaffold:update': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 1) {
      throw new ParseError('Usage: /scaffold update <id>')
    }
    return {
      ...base,
      scaffoldId: args[0],
    }
  },
  'scaffold:delete': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 1) {
      throw new ParseError('Usage: /scaffold delete <id>')
    }
    return {
      ...base,
      scaffoldId: args[0],
    }
  },
  'scaffold:transfer': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 2) {
      throw new ParseError('Usage: /scaffold transfer <id> @username')
    }
    const targetUsername = args[1].startsWith('@') ? args[1].substring(1) : args[1]
    return {
      ...base,
      scaffoldId: args[0],
      targetUsername,
    }
  },
  'event:transfer': (ctx, args) => {
    const base = baseCommandParser(ctx)
    if (args.length < 2) {
      throw new ParseError('Usage: /event transfer <id> @username')
    }
    const targetUsername = args[1].startsWith('@') ? args[1].substring(1) : args[1]
    return {
      ...base,
      eventId: args[0],
      targetUsername,
    }
  },
}
