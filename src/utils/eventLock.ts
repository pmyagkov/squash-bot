export class EventLock {
  private locks = new Map<string, boolean>()

  acquire(eventId: string): boolean {
    if (this.locks.get(eventId)) return false
    this.locks.set(eventId, true)
    return true
  }

  release(eventId: string): void {
    this.locks.delete(eventId)
  }
}
