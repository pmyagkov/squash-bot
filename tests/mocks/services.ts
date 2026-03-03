import { mockClass } from './utils'
import { NotificationService } from '~/services/notification'

export function mockNotificationService() {
  const mock = mockClass<typeof NotificationService>()
  mock.processQueue.mockResolvedValue([])
  return mock
}
