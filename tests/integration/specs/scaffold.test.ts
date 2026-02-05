import { describe, it, expect, beforeEach } from 'vitest'
import { clearTestDb } from '../setup'
import { scaffoldRepo } from '~/storage/repo/scaffold'

describe('Scaffold Integration Tests', () => {
  beforeEach(async () => {
    await clearTestDb()
  })

  it('should create scaffold', async () => {
    const scaffold = await scaffoldRepo.createScaffold('Tue', '21:00', 2)

    expect(scaffold.id).toMatch(/^sc_/)
    expect(scaffold.dayOfWeek).toBe('Tue')
    expect(scaffold.time).toBe('21:00')
    expect(scaffold.defaultCourts).toBe(2)
    expect(scaffold.isActive).toBe(true)
  })

  it('should get all scaffolds', async () => {
    await scaffoldRepo.createScaffold('Tue', '21:00', 2)
    await scaffoldRepo.createScaffold('Sat', '18:00', 3)

    const scaffolds = await scaffoldRepo.getScaffolds()
    expect(scaffolds).toHaveLength(2)
    expect(scaffolds[0].dayOfWeek).toBe('Tue')
    expect(scaffolds[0].defaultCourts).toBe(2)
    expect(scaffolds[0].isActive).toBe(true)
    expect(scaffolds[1].dayOfWeek).toBe('Sat')
    expect(scaffolds[1].defaultCourts).toBe(3)
    expect(scaffolds[1].isActive).toBe(true)
  })

  it('should find scaffold by id', async () => {
    const created = await scaffoldRepo.createScaffold('Wed', '19:00', 2)
    const found = await scaffoldRepo.findById(created.id)

    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
  })

  it('should toggle scaffold active status', async () => {
    const scaffold = await scaffoldRepo.createScaffold('Thu', '20:00', 1)

    await scaffoldRepo.setActive(scaffold.id, false)
    const updated = await scaffoldRepo.findById(scaffold.id)

    expect(updated?.isActive).toBe(false)

    let instance = await scaffoldRepo.setActive(scaffold.id, true)
    expect(instance.isActive).toBe(true)

    instance = await scaffoldRepo.setActive(scaffold.id, false)
    expect(instance.isActive).toBe(false)
  })

  it('should remove scaffold', async () => {
    const scaffold = await scaffoldRepo.createScaffold('Fri', '21:00', 2)

    await scaffoldRepo.remove(scaffold.id)
    const found = await scaffoldRepo.findById(scaffold.id)

    expect(found).toBeUndefined()
  })
})
