import type { ParserInput, ParseResult } from '~/services/command/types'
import { ParseError } from '~/services/wizard/types'

export async function resolveEventId({
  args,
  ctx,
  container,
}: ParserInput): Promise<ParseResult<{ eventId: string }>> {
  // Command path: eventId from args
  if (args.length > 0) {
    return { parsed: { eventId: args[0] }, missing: [] }
  }

  // Callback path: resolve messageId → eventId
  if (ctx.callbackQuery?.message) {
    const repo = container.resolve('eventRepository')
    const event = await repo.findByMessageId(String(ctx.callbackQuery.message.message_id))
    if (!event) throw new ParseError('Event not found for this message')
    return { parsed: { eventId: event.id }, missing: [] }
  }

  // Neither: need eventId from wizard
  return { parsed: {}, missing: ['eventId'] }
}

export function resolveEventIdAndUsername({
  args,
}: ParserInput): ParseResult<{ eventId: string; targetUsername: string }> {
  if (args.length >= 2) {
    const targetUsername = args[1].startsWith('@') ? args[1].substring(1) : args[1]
    return { parsed: { eventId: args[0], targetUsername }, missing: [] }
  }
  if (args.length === 1) {
    return { parsed: { eventId: args[0] }, missing: ['targetUsername'] }
  }
  return { parsed: {}, missing: ['eventId', 'targetUsername'] }
}

export function resolveDeletedEventId({ args }: ParserInput): ParseResult<{ eventId: string }> {
  if (args.length >= 1) return { parsed: { eventId: args[0] }, missing: [] }
  return { parsed: {}, missing: [], error: 'Usage: /event undo-delete <eventId>' }
}

export function resolveScaffoldIdForSpawn({
  args,
}: ParserInput): ParseResult<{ scaffoldId: string }> {
  if (args.length > 0) {
    return { parsed: { scaffoldId: args[0] }, missing: [] }
  }
  return { parsed: {}, missing: ['scaffoldId'] }
}
