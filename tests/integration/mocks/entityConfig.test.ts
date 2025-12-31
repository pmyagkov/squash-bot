import { describe, it, expect } from 'vitest'
import type { EntityConfig, EntityStore } from './entityConfig'
import type { Scaffold } from '~/types'

describe('EntityConfig types', () => {
  it('should enforce type safety for entity config', () => {
    const mockScaffoldStore: EntityStore<Scaffold> = {
      getAll: () => [],
      create: (entity: Scaffold) => entity,
      update: (id: string, updates: Partial<Scaffold>) => ({} as Scaffold),
      findById: (id: string) => undefined,
      delete: (id: string) => {},
      clear: () => {},
    }
    expect(mockScaffoldStore).toBeDefined()
  })
})
