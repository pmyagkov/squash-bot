import { describe, it, expect } from 'vitest'
import { mockEventBusiness, mockScaffoldBusiness, mockUtilityBusiness } from './business'

describe('Business layer mocks', () => {
  describe('mockEventBusiness', () => {
    it('should create mock with all methods', () => {
      const business = mockEventBusiness()

      expect(business.checkAndCreateEventsFromScaffolds).toBeDefined()
      expect(business.checkAndSendPaymentReminders).toBeDefined()
      expect(business.init).toBeDefined()
    })

    it('should have reasonable defaults', async () => {
      const business = mockEventBusiness()

      expect(await business.checkAndCreateEventsFromScaffolds()).toBe(0)
      expect(await business.checkAndSendPaymentReminders()).toBe(0)
    })

    it('should allow overriding return values', async () => {
      const business = mockEventBusiness()
      business.checkAndCreateEventsFromScaffolds.mockResolvedValue(5)

      expect(await business.checkAndCreateEventsFromScaffolds()).toBe(5)
    })
  })

  describe('mockScaffoldBusiness', () => {
    it('should create mock with init method', () => {
      const business = mockScaffoldBusiness()

      expect(business.init).toBeDefined()
    })
  })

  describe('mockUtilityBusiness', () => {
    it('should create mock with init method', () => {
      const business = mockUtilityBusiness()

      expect(business.init).toBeDefined()
    })
  })
})
