import type { ParserInput, ParseResult } from '~/services/command/types'

export function resolveScaffoldId({ args }: ParserInput): ParseResult<{ scaffoldId: string }> {
  if (args.length > 0) {
    return { parsed: { scaffoldId: args[0] }, missing: [] }
  }

  return { parsed: {}, missing: ['scaffoldId'] }
}

export function resolveDeletedScaffoldId({
  args,
}: ParserInput): ParseResult<{ scaffoldId: string }> {
  if (args.length >= 1) return { parsed: { scaffoldId: args[0] }, missing: [] }
  return { parsed: {}, missing: [], error: 'Usage: /scaffold undo-delete <scaffoldId>' }
}

export function resolveScaffoldIdAndUsername({
  args,
}: ParserInput): ParseResult<{ scaffoldId: string; targetUsername: string }> {
  if (args.length >= 2) {
    const targetUsername = args[1].startsWith('@') ? args[1].substring(1) : args[1]
    return { parsed: { scaffoldId: args[0], targetUsername }, missing: [] }
  }
  if (args.length === 1) {
    return { parsed: { scaffoldId: args[0] }, missing: ['targetUsername'] }
  }
  return { parsed: {}, missing: ['scaffoldId', 'targetUsername'] }
}
