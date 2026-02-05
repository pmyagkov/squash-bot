import { describe, it, expect, beforeEach } from 'vitest'
import { clearTestDb } from '../setup'
import { scaffoldService } from '~/services/scaffoldService'

describe('Scaffold Integration Tests', () => {
  beforeEach(async () => {
    await clearTestDb()
  })

  it('should create scaffold', async () => {
    const scaffold = await scaffoldService.createScaffold('Tue', '21:00', 2)

    expect(scaffold.id).toMatch(/^sc_/)
    expect(scaffold.dayOfWeek).toBe('Tue')
    expect(scaffold.time).toBe('21:00')
    expect(scaffold.defaultCourts).toBe(2)
    expect(scaffold.isActive).toBe(true)
  })

  it('should get all scaffolds', async () => {
    await scaffoldService.createScaffold('Tue', '21:00', 2)
    await scaffoldService.createScaffold('Sat', '18:00', 3)

    const scaffolds = await scaffoldService.getScaffolds()
    expect(scaffolds).toHaveLength(2)
  })

  it('should find scaffold by id', async () => {
    const created = await scaffoldService.createScaffold('Wed', '19:00', 2)
    const found = await scaffoldService.findById(created.id)

    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
  })

  it('should toggle scaffold active status', async () => {
    const scaffold = await scaffoldService.createScaffold('Thu', '20:00', 1)

    await scaffoldService.setActive(scaffold.id, false)
    const updated = await scaffoldService.findById(scaffold.id)

    expect(updated?.isActive).toBe(false)

    let instance = await scaffoldService.setActive(scaffold.id, true)
    expect(instance.isActive).toBe(true)

    instance = await scaffoldService.setActive(scaffold.id, false)
    expect(instance.isActive).toBe(false)
  })

  it('should remove scaffold', async () => {
    const scaffold = await scaffoldService.createScaffold('Fri', '21:00', 2)

    await scaffoldService.remove(scaffold.id)
    const found = await scaffoldService.findById(scaffold.id)

    expect(found).toBeUndefined()
  })
})
