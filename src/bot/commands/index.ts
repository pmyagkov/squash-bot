import { Context, Bot } from 'grammy'
import { readdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface CommandModule {
  commandName: string
  handleCommand: (ctx: Context, args: string[], chatId?: number | string) => Promise<void>
  setBotInstance?: (bot: Bot | null) => void
  setCommandMap?: (commandMap: Map<string, CommandModule>) => void
}

/**
 * Load all command modules from the commands directory
 * Automatically discovers command files by scanning the directory
 */
export async function loadCommands(): Promise<CommandModule[]> {
  const commandModules: CommandModule[] = []
  const commandsDir = __dirname

  try {
    const files = await readdir(commandsDir)

    for (const file of files) {
      // Skip index.ts and non-TypeScript files
      if (
        file === 'index.ts' ||
        file === 'index.js' ||
        (!file.endsWith('.ts') && !file.endsWith('.js'))
      ) {
        continue
      }

      try {
        // Remove file extension for import
        const moduleName = file.replace(/\.(ts|js)$/, '')
        const module = await import(`./${moduleName}`)

        if (module.commandName && module.handleCommand) {
          commandModules.push({
            commandName: module.commandName,
            handleCommand: module.handleCommand,
            setBotInstance: module.setBotInstance,
            setCommandMap: module.setCommandMap,
          })
        }
      } catch (error) {
        console.error(`Failed to load command from ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('Failed to read commands directory:', error)
  }

  return commandModules
}
