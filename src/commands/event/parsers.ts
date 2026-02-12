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
