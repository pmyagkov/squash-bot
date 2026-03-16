export class EventLock {
  private locks = new Map<string, boolean>()

  acquire(key: string): boolean {
    const held = this.locks.get(key) ?? false
    console.log(`[LOCK] acquire(${key}) — held=${held} → ${held ? 'REJECTED' : 'ACQUIRED'}`)
    if (held) {
      return false
    }
    this.locks.set(key, true)
    return true
  }

  release(key: string): void {
    console.log(`[LOCK] release(${key})`)
    this.locks.delete(key)
  }
}
