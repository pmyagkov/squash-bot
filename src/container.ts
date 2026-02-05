import { createContainer, asClass, asValue, InjectionMode } from 'awilix'
import type { AwilixContainer } from 'awilix'
import type { Bot } from 'grammy'
import { config } from './config'
import type { TelegramOutput } from './services/transport/telegram/output'
import { TelegramOutput as TelegramOutputImpl } from './services/transport/telegram/output'
import type { Logger } from './services/logger'
import { Logger as LoggerImpl } from './services/logger/logger'
import type { EventBusiness } from './business/event'
import { EventBusiness as EventBusinessImpl } from './business/event'
import type { EventRepo } from './storage/repo/event'
import { EventRepo as EventRepoImpl } from './storage/repo/event'

// Placeholder - will be populated in later tasks
export interface Container {
  bot: Bot
  config: typeof config
  container: AppContainer
  telegramOutput: TelegramOutput
  logger: Logger
  eventRepository: EventRepo
  eventBusiness: EventBusiness
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
    telegramOutput: asClass(TelegramOutputImpl).singleton(),
    logger: asClass(LoggerImpl).singleton(),
    eventRepository: asClass(EventRepoImpl).singleton(),
    eventBusiness: asClass(EventBusinessImpl).singleton(),
  })

  return container
}
