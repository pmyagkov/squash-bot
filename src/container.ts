import { createContainer, asClass, asValue, InjectionMode } from 'awilix'
import type { AwilixContainer } from 'awilix'
import type { Bot } from 'grammy'
import { config } from './config'
import { TelegramTransport } from './services/transport/telegram'
import { ConsoleProvider, TelegramProvider, type Logger } from './services/logger'
import { Logger as LoggerImpl } from './services/logger/logger'
import type { EventBusiness } from './business/event'
import { EventBusiness as EventBusinessImpl } from './business/event'
import type { ScaffoldBusiness } from './business/scaffold'
import { ScaffoldBusiness as ScaffoldBusinessImpl } from './business/scaffold'
import type { UtilityBusiness } from './business/utility'
import { UtilityBusiness as UtilityBusinessImpl } from './business/utility'
import type { EventRepo } from './storage/repo/event'
import { EventRepo as EventRepoImpl } from './storage/repo/event'
import type { ScaffoldRepo } from './storage/repo/scaffold'
import { ScaffoldRepo as ScaffoldRepoImpl } from './storage/repo/scaffold'
import type { EventParticipantRepo } from './storage/repo/eventParticipant'
import { EventParticipantRepo as EventParticipantRepoImpl } from './storage/repo/eventParticipant'
import type { PaymentRepo } from './storage/repo/payment'
import { PaymentRepo as PaymentRepoImpl } from './storage/repo/payment'
import type { SettingsRepo } from './storage/repo/settings'
import { SettingsRepo as SettingsRepoImpl } from './storage/repo/settings'
import type { ParticipantRepo } from './storage/repo/participant'
import { ParticipantRepo as ParticipantRepoImpl } from './storage/repo/participant'
import type { CommandRegistry } from './services/command/commandRegistry'
import { CommandRegistry as CommandRegistryImpl } from './services/command/commandRegistry'
import type { WizardService } from './services/wizard/wizardService'
import { WizardService as WizardServiceImpl } from './services/wizard/wizardService'
import type { CommandService } from './services/command/commandService'
import { CommandService as CommandServiceImpl } from './services/command/commandService'
export interface Container {
  bot: Bot
  config: typeof config
  container: AppContainer
  transport: TelegramTransport
  logger: Logger
  eventRepository: EventRepo
  scaffoldRepository: ScaffoldRepo
  eventParticipantRepository: EventParticipantRepo
  paymentRepository: PaymentRepo
  settingsRepository: SettingsRepo
  participantRepository: ParticipantRepo
  commandRegistry: CommandRegistry
  wizardService: WizardService
  commandService: CommandService
  eventBusiness: EventBusiness
  scaffoldBusiness: ScaffoldBusiness
  utilityBusiness: UtilityBusiness
}

export type AppContainer = AwilixContainer<Container>

export function createAppContainer(bot: Bot): AppContainer {
  const container = createContainer<Container>({
    injectionMode: InjectionMode.CLASSIC,
  })

  // Register primitives first so TelegramProvider can resolve them
  container.register({
    bot: asValue(bot),
    config: asValue(config),
    container: asValue(container),
  })

  // Now create logger (TelegramProvider can resolve bot and config from container)
  const logger = new LoggerImpl([
    new ConsoleProvider(['info', 'warn', 'error']),
    new TelegramProvider(container, ['error']),
  ])

  // Register services
  container.register({
    transport: asClass(TelegramTransport).singleton(),
    logger: asValue(logger),
    eventRepository: asClass(EventRepoImpl).singleton(),
    scaffoldRepository: asClass(ScaffoldRepoImpl).singleton(),
    eventParticipantRepository: asClass(EventParticipantRepoImpl).singleton(),
    paymentRepository: asClass(PaymentRepoImpl).singleton(),
    settingsRepository: asClass(SettingsRepoImpl).singleton(),
    participantRepository: asClass(ParticipantRepoImpl).singleton(),
    commandRegistry: asClass(CommandRegistryImpl).singleton(),
    wizardService: asClass(WizardServiceImpl).singleton(),
    commandService: asClass(CommandServiceImpl).singleton(),
    eventBusiness: asClass(EventBusinessImpl).singleton(),
    scaffoldBusiness: asClass(ScaffoldBusinessImpl).singleton(),
    utilityBusiness: asClass(UtilityBusinessImpl).singleton(),
  })

  return container
}
