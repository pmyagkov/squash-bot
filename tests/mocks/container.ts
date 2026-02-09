import { createContainer, asValue, InjectionMode } from 'awilix'
import type { AppContainer, Container } from '~/container'
import { Bot } from 'grammy'
import { mockConfig } from './config'
import { mockEventRepo, mockScaffoldRepo, mockEventParticipantRepo, mockPaymentRepo, mockSettingsRepo, mockParticipantRepo } from './repos'
import { mockEventBusiness, mockScaffoldBusiness, mockUtilityBusiness } from './business'
import { mockTelegramTransport } from './transport'
import { mockLogger } from './logger'

/**
 * Creates mock container for unit tests
 * All dependencies are mocked by default, can be overridden
 *
 * @param overrides - Replace specific dependencies
 * @returns Fully functional AppContainer with mocks
 *
 * @example
 * // Default mocks
 * const container = createMockContainer()
 * const business = new EventBusiness(container)
 *
 * @example
 * // Override specific dependency
 * const customRepo = mockEventRepo()
 * customRepo.findById.mockResolvedValue(buildEvent())
 *
 * const container = createMockContainer({
 *   eventRepository: customRepo
 * })
 */
export function createMockContainer(overrides?: Partial<Container>): AppContainer {
  const container = createContainer<Container>({
    injectionMode: InjectionMode.CLASSIC,
  })

  const bot = overrides?.bot ?? new Bot('test-token')

  container.register({
    bot: asValue(bot),
    config: asValue(overrides?.config ?? mockConfig()),
    container: asValue(container),
    transport: asValue(overrides?.transport ?? mockTelegramTransport()),
    logger: asValue(overrides?.logger ?? mockLogger()),
    eventRepository: asValue(overrides?.eventRepository ?? mockEventRepo()),
    scaffoldRepository: asValue(overrides?.scaffoldRepository ?? mockScaffoldRepo()),
    eventParticipantRepository: asValue(overrides?.eventParticipantRepository ?? mockEventParticipantRepo()),
    paymentRepository: asValue(overrides?.paymentRepository ?? mockPaymentRepo()),
    settingsRepository: asValue(overrides?.settingsRepository ?? mockSettingsRepo()),
    participantRepository: asValue(overrides?.participantRepository ?? mockParticipantRepo()),
    eventBusiness: asValue(overrides?.eventBusiness ?? mockEventBusiness()),
    scaffoldBusiness: asValue(overrides?.scaffoldBusiness ?? mockScaffoldBusiness()),
    utilityBusiness: asValue(overrides?.utilityBusiness ?? mockUtilityBusiness()),
  })

  return container
}
