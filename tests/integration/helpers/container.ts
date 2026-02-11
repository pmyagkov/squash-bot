import { Bot } from 'grammy'
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix'
import { config } from '~/config'
import type { Container } from '~/container'
import { TelegramTransport } from '~/services/transport/telegram'
import { Logger } from '~/services/logger/logger'
import { ConsoleProvider } from '~/services/logger/providers/console'
import { TelegramProvider } from '~/services/logger/providers/telegram'
import { EventBusiness } from '~/business/event'
import { ScaffoldBusiness } from '~/business/scaffold'
import { UtilityBusiness } from '~/business/utility'
import { EventRepo } from '~/storage/repo/event'
import { ScaffoldRepo } from '~/storage/repo/scaffold'
import { EventParticipantRepo } from '~/storage/repo/eventParticipant'
import { PaymentRepo } from '~/storage/repo/payment'
import { SettingsRepo } from '~/storage/repo/settings'
import { ParticipantRepo } from '~/storage/repo/participant'
import { EventLock } from '~/utils/eventLock'

export type TestContainer = AwilixContainer<Container>

/**
 * Create a test container with all dependencies
 * Uses the same structure as production container but configured for testing
 */
export function createTestContainer(bot: Bot): TestContainer {
  const container = createContainer<Container>({
    injectionMode: InjectionMode.CLASSIC,
  })

  // Register primitives first so TelegramProvider can resolve them
  container.register({
    bot: asValue(bot),
    config: asValue(config),
    container: asValue(container),
  })

  // Create logger (TelegramProvider can now resolve bot and config)
  const logger = new Logger([
    new ConsoleProvider(['info', 'warn', 'error']),
    new TelegramProvider(container, ['error']),
  ])

  // Register services
  container.register({
    transport: asClass(TelegramTransport).singleton(),
    logger: asValue(logger),
    eventRepository: asClass(EventRepo).singleton(),
    scaffoldRepository: asClass(ScaffoldRepo).singleton(),
    eventParticipantRepository: asClass(EventParticipantRepo).singleton(),
    paymentRepository: asClass(PaymentRepo).singleton(),
    settingsRepository: asClass(SettingsRepo).singleton(),
    participantRepository: asClass(ParticipantRepo).singleton(),
    eventLock: asClass(EventLock).singleton(),
    eventBusiness: asClass(EventBusiness).singleton(),
    scaffoldBusiness: asClass(ScaffoldBusiness).singleton(),
    utilityBusiness: asClass(UtilityBusiness).singleton(),
  })

  return container
}
