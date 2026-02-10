import { describe, it, expect } from 'vitest'
import { mockEventRepo, mockScaffoldRepo, mockEventParticipantRepo, mockPaymentRepo, mockSettingsRepo, mockParticipantRepo } from './repos'

describe('Repository mocks', () => {
  describe('mockEventRepo', () => {
    it('should create mock with all methods', () => {
      const repo = mockEventRepo()

      expect(repo.findById).toBeDefined()
      expect(repo.getEvents).toBeDefined()
      expect(repo.createEvent).toBeDefined()
    })

    it('should have reasonable defaults', async () => {
      const repo = mockEventRepo()

      expect(await repo.findById('ev_123')).toBeUndefined()
      expect(await repo.getEvents()).toEqual([])
    })
  })

  describe('mockScaffoldRepo', () => {
    it('should create mock with all methods', () => {
      const repo = mockScaffoldRepo()

      expect(repo.findById).toBeDefined()
      expect(repo.getScaffolds).toBeDefined()
      expect(repo.createScaffold).toBeDefined()
    })

    it('should have reasonable defaults', async () => {
      const repo = mockScaffoldRepo()

      expect(await repo.findById('sc_123')).toBeUndefined()
      expect(await repo.getScaffolds()).toEqual([])
    })
  })

  describe('other repos', () => {
    it('should create mocks for all repositories', () => {
      expect(mockEventParticipantRepo()).toBeDefined()
      expect(mockPaymentRepo()).toBeDefined()
      expect(mockSettingsRepo()).toBeDefined()
      expect(mockParticipantRepo()).toBeDefined()
    })
  })
})
