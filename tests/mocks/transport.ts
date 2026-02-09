import { mockClass } from './utils'
import { TelegramTransport } from '~/services/transport/telegram'

/**
 * Mock for TelegramTransport
 * All methods return successful results by default
 */
export function mockTelegramTransport() {
  const mock = mockClass<typeof TelegramTransport>()

  // Defaults: successful operations
  mock.sendMessage.mockResolvedValue(123) // mock message_id
  mock.editMessage.mockResolvedValue(undefined)
  mock.answerCallback.mockResolvedValue(undefined)
  mock.pinMessage.mockResolvedValue(undefined)
  mock.unpinMessage.mockResolvedValue(undefined)
  mock.unpinAllMessages.mockResolvedValue(undefined)

  return mock
}
