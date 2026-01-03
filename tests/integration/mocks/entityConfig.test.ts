import { describe, it, expect } from 'vitest'
import type { EntityStore } from './entityConfig'
import type { Scaffold } from '~/types'

describe('EntityConfig types', () => {
  it('should enforce type safety for entity config', () => {
    const mockScaffoldStore: EntityStore<Scaffold> = {
      getAll: () => [],
      create: (entity: Scaffold) => entity,
      update: (_id: string, _updates: Partial<Scaffold>) => ({} as Scaffold),
      findById: (_id: string) => undefined,
      delete: (_id: string) => {},
      clear: () => {},
    }
    expect(mockScaffoldStore).toBeDefined()
  })
})
