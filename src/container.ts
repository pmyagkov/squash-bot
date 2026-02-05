import { createContainer, asValue, InjectionMode } from 'awilix'
import type { AwilixContainer } from 'awilix'
import type { Bot } from 'grammy'
import { config } from './config'

// Placeholder - will be populated in later tasks
export interface Container {
  bot: Bot
  config: typeof config
  container: AppContainer
}

export type AppContainer = AwilixContainer<Container>

export function createAppContainer(bot: Bot): AppContainer {
  const container = createContainer<Container>({
    injectionMode: InjectionMode.CLASSIC,
  })

  container.register({
    bot: asValue(bot),
    config: asValue(config),
    container: asValue(container),
  })

  return container
}
