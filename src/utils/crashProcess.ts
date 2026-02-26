import type { Logger } from '~/services/logger/logger'

export function crashProcess(reason: string, logger?: Logger): never {
  console.error(`[FATAL] ${reason}`)
  // Force exit after 3s even if logging hangs
  setTimeout(() => process.exit(1), 3000).unref()
  // Best-effort log to Telegram, then exit
  const logPromise = logger ? logger.error(`FATAL: ${reason}`).catch(() => {}) : Promise.resolve()
  logPromise.then(() => process.exit(1))
  // TypeScript: unreachable, but satisfies 'never' return type
  throw new Error(reason)
}
