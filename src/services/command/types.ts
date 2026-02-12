import type { Context } from 'grammy'
import type { AppContainer } from '~/container'
import type { WizardStep } from '~/services/wizard/types'

// What the parser receives
export interface ParserInput {
  args: string[]
  ctx: Context
  container: AppContainer
}

// What the parser returns
export interface ParseResult<T> {
  parsed: Partial<T>
  missing: (keyof T)[]
}

// Where the request came from (for reply routing)
export type SourceContext =
  | { type: 'command' }
  | { type: 'callback'; callbackId: string }

// Static command definition — what command files export (no handler)
export interface CommandDef<T> {
  parser: (input: ParserInput) => ParseResult<T> | Promise<ParseResult<T>>
  steps: WizardStep[]
}

// Runtime: what registry stores (with bound handler)
export interface RegisteredCommand<T = unknown> {
  parser: (input: ParserInput) => ParseResult<T> | Promise<ParseResult<T>>
  steps: WizardStep[]
  handler: (data: T, source: SourceContext) => Promise<void>
}
