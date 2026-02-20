import { Context } from 'grammy'
import type { CallbackTypes, ChatType, CallbackAction } from './types'

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
