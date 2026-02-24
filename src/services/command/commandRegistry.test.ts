import { describe, it, expect } from 'vitest'
import { CommandRegistry } from './commandRegistry'
import type { CommandDef } from './types'

describe('CommandRegistry', () => {
  it('registers and retrieves a command', () => {
    const registry = new CommandRegistry()
    const def: CommandDef<{ eventId: string }> = {
      parser: ({ args }) => {
        if (args.length > 0) return { parsed: { eventId: args[0] }, missing: [] }
        return { parsed: {}, missing: ['eventId'] }
      },
      steps: [],
    }
    const handler = async () => {}

    registry.register('event:join', def, handler)

    const registered = registry.get('event:join')
    expect(registered).toBeDefined()
    expect(registered!.parser).toBe(def.parser)
    expect(registered!.steps).toBe(def.steps)
    expect(registered!.handler).toBe(handler)
  })

  it('returns undefined for unknown key', () => {
    const registry = new CommandRegistry()
    expect(registry.get('unknown')).toBeUndefined()
  })

  it('throws on duplicate key', () => {
    const registry = new CommandRegistry()
    const def: CommandDef<{ eventId: string }> = {
      parser: () => ({ parsed: {}, missing: [] }),
      steps: [],
    }
    registry.register('event:join', def, async () => {})

    expect(() => {
      registry.register('event:join', def, async () => {})
    }).toThrow('Command "event:join" is already registered')
  })
})
