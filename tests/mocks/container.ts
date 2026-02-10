import { createContainer, asValue, InjectionMode, type AwilixContainer } from 'awilix'
import { Bot } from 'grammy'
import type { MockProxy } from 'vitest-mock-extended'
import { mockConfig } from './config'
import { mockEventRepo, mockScaffoldRepo, mockEventParticipantRepo, mockPaymentRepo, mockSettingsRepo, mockParticipantRepo } from './repos'
import { mockEventBusiness, mockScaffoldBusiness, mockUtilityBusiness } from './business'
import { mockTelegramTransport } from './transport'
import { mockLogger } from './logger'
import type { EventRepo } from '~/storage/repo/event'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'
import type { EventParticipantRepo } from '~/storage/repo/eventParticipant'
import type { PaymentRepo } from '~/storage/repo/payment'
import type { SettingsRepo } from '~/storage/repo/settings'
import type { ParticipantRepo } from '~/storage/repo/participant'
import type { EventBusiness } from '~/business/event'
import type { ScaffoldBusiness } from '~/business/scaffold'
import type { UtilityBusiness } from '~/business/utility'
import type { TelegramTransport } from '~/services/transport/telegram'
import type { Logger } from '~/services/logger'
import { config } from '~/config'

/**
 * Mock versions of all container dependencies
 * Each dependency is a MockProxy, allowing .mockResolvedValue() and other mock methods
 */
export interface MockContainer {
  bot: Bot
  config: typeof config
  container: MockAppContainer
  transport: MockProxy<InstanceType<typeof TelegramTransport>>
  logger: MockProxy<InstanceType<typeof Logger>>
  eventRepository: MockProxy<InstanceType<typeof EventRepo>>
  scaffoldRepository: MockProxy<InstanceType<typeof ScaffoldRepo>>
  eventParticipantRepository: MockProxy<InstanceType<typeof EventParticipantRepo>>
  paymentRepository: MockProxy<InstanceType<typeof PaymentRepo>>
  settingsRepository: MockProxy<InstanceType<typeof SettingsRepo>>
  participantRepository: MockProxy<InstanceType<typeof ParticipantRepo>>
  eventBusiness: MockProxy<InstanceType<typeof EventBusiness>>
  scaffoldBusiness: MockProxy<InstanceType<typeof ScaffoldBusiness>>
  utilityBusiness: MockProxy<InstanceType<typeof UtilityBusiness>>
}

/**
 * Type-safe mock container
 * resolve() returns MockProxy versions of dependencies
 */
export type MockAppContainer = AwilixContainer<MockContainer>

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
export function createMockContainer(overrides?: Partial<MockContainer>): MockAppContainer {
  const container = createContainer<MockContainer>({
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
