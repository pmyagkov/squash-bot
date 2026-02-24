import type { CommandDef, RegisteredCommand, SourceContext } from './types'

export class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>()

  register<T>(
    key: string,
    def: CommandDef<T>,
    handler: (data: T, source: SourceContext) => Promise<void>
  ): void {
    if (this.commands.has(key)) {
      throw new Error(`Command "${key}" is already registered`)
    }
    this.commands.set(key, {
      parser: def.parser as RegisteredCommand['parser'],
      steps: def.steps,
      handler: handler as RegisteredCommand['handler'],
    })
  }

  get(key: string): RegisteredCommand | undefined {
    return this.commands.get(key)
  }
}
