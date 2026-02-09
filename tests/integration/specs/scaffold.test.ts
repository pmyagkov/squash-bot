import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import { clearTestDb } from '../database'
import { createTestContainer, type TestContainer } from '../helpers/container'
import type { ScaffoldRepo } from '~/storage/repo/scaffold'

describe('Scaffold Integration Tests', () => {
  let container: TestContainer
  let scaffoldRepository: ScaffoldRepo

  beforeEach(async () => {
    await clearTestDb()

    // Create mock bot for testing
    const bot = new Bot('test-token')
    container = createTestContainer(bot)
    scaffoldRepository = container.resolve('scaffoldRepository')
  })

  it('should create scaffold', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Tue', '21:00', 2)

    expect(scaffold.id).toMatch(/^sc_/)
    expect(scaffold.dayOfWeek).toBe('Tue')
    expect(scaffold.time).toBe('21:00')
    expect(scaffold.defaultCourts).toBe(2)
    expect(scaffold.isActive).toBe(true)
  })

  it('should get all scaffolds', async () => {
    await scaffoldRepository.createScaffold('Tue', '21:00', 2)
    await scaffoldRepository.createScaffold('Sat', '18:00', 3)

    const scaffolds = await scaffoldRepository.getScaffolds()
    expect(scaffolds).toHaveLength(2)
    expect(scaffolds[0].dayOfWeek).toBe('Tue')
    expect(scaffolds[0].defaultCourts).toBe(2)
    expect(scaffolds[0].isActive).toBe(true)
    expect(scaffolds[1].dayOfWeek).toBe('Sat')
    expect(scaffolds[1].defaultCourts).toBe(3)
    expect(scaffolds[1].isActive).toBe(true)
  })

  it('should find scaffold by id', async () => {
    const created = await scaffoldRepository.createScaffold('Wed', '19:00', 2)
    const found = await scaffoldRepository.findById(created.id)

    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
  })

  it('should toggle scaffold active status', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Thu', '20:00', 1)

    await scaffoldRepository.setActive(scaffold.id, false)
    const updated = await scaffoldRepository.findById(scaffold.id)

    expect(updated?.isActive).toBe(false)

    let instance = await scaffoldRepository.setActive(scaffold.id, true)
    expect(instance.isActive).toBe(true)

    instance = await scaffoldRepository.setActive(scaffold.id, false)
    expect(instance.isActive).toBe(false)
  })

  it('should remove scaffold', async () => {
    const scaffold = await scaffoldRepository.createScaffold('Fri', '21:00', 2)

    await scaffoldRepository.remove(scaffold.id)
    const found = await scaffoldRepository.findById(scaffold.id)

    expect(found).toBeUndefined()
  })
})
