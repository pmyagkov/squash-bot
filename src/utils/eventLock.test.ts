import { describe, it, expect } from 'vitest'
import { EventLock } from './eventLock'

describe('EventLock', () => {
  it('should acquire lock for unlocked event', () => {
    const lock = new EventLock()
    expect(lock.acquire('ev_1')).toBe(true)
  })

  it('should fail to acquire lock for already locked event', () => {
    const lock = new EventLock()
    lock.acquire('ev_1')
    expect(lock.acquire('ev_1')).toBe(false)
  })

  it('should allow re-acquire after release', () => {
    const lock = new EventLock()
    lock.acquire('ev_1')
    lock.release('ev_1')
    expect(lock.acquire('ev_1')).toBe(true)
  })

  it('should handle independent locks for different events', () => {
    const lock = new EventLock()
    expect(lock.acquire('ev_1')).toBe(true)
    expect(lock.acquire('ev_2')).toBe(true)
    expect(lock.acquire('ev_1')).toBe(false)
  })
})
