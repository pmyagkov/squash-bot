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
  error?: string
}

export interface ChatContext {
  id: number
}

export interface UserContext {
  id: number
  username?: string
  firstName?: string
  lastName?: string
}

// Where the request came from (for reply routing)
export type SourceContext =
  | {
      type: 'command'
      chat: ChatContext
      user: UserContext
    }
  | {
      type: 'callback'
      callbackId: string
      chat: ChatContext
      user: UserContext
    }

// Static command definition — what command files export (no handler)
export interface CommandDef<T> {
  parser: (input: ParserInput) => ParseResult<T> | Promise<ParseResult<T>>
  steps: WizardStep<unknown>[]
}

// Runtime: what registry stores (with bound handler)
export interface RegisteredCommand<T = unknown> {
  parser: (input: ParserInput) => ParseResult<T> | Promise<ParseResult<T>>
  steps: WizardStep<unknown>[]
  handler: (data: T, source: SourceContext) => Promise<void>
}
