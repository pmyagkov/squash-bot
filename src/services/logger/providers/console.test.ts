import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConsoleProvider } from './console'

describe('ConsoleProvider', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  it('should output valid JSON for info level', async () => {
    const provider = new ConsoleProvider(['info', 'warn', 'error'])
    await provider.log('test message', 'info')

    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    const output = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output.trim())
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('test message')
    expect(parsed.ts).toBeDefined()
  })

  it('should output error level to stderr', async () => {
    const provider = new ConsoleProvider(['info', 'warn', 'error'])
    await provider.log('error message', 'error')

    expect(stderrSpy).toHaveBeenCalledTimes(1)
    expect(stdoutSpy).not.toHaveBeenCalled()
    const output = stderrSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output.trim())
    expect(parsed.level).toBe('error')
    expect(parsed.msg).toBe('error message')
  })

  it('should output warn level to stdout', async () => {
    const provider = new ConsoleProvider(['info', 'warn', 'error'])
    await provider.log('warn message', 'warn')

    expect(stdoutSpy).toHaveBeenCalledTimes(1)
    const output = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output.trim())
    expect(parsed.level).toBe('warn')
    expect(parsed.msg).toBe('warn message')
  })

  it('should respect level filtering', async () => {
    const provider = new ConsoleProvider(['error'])
    expect(provider.shouldLog('info')).toBe(false)
    expect(provider.shouldLog('error')).toBe(true)
  })
})
