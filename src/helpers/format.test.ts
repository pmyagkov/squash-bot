import { describe, it, expect } from 'vitest'
import { stripWords } from './format'

describe('stripWords', () => {
  // /event create arg1 arg2 → strip 2 → "arg1 arg2"
  it('strips /command subcommand, preserving args', () => {
    expect(stripWords('/event create arg1 arg2', 2)).toBe('arg1 arg2')
  })

  // /admin say hello\nworld → strip 2 → "hello\nworld"
  it('strips /admin command, preserving newlines in args', () => {
    expect(stripWords('/admin say hello\nworld', 2)).toBe('hello\nworld')
  })

  // /admin event create arg → strip 3 → "arg"
  it('strips /admin base subcommand, preserving args', () => {
    expect(stripWords('/admin event create arg', 3)).toBe('arg')
  })

  // /admin say @user line1\nline2 → strip 2 → "@user line1\nline2"
  it('preserves multiline text after admin say', () => {
    expect(stripWords('/admin say @user line1\nline2', 2)).toBe('@user line1\nline2')
  })

  // /command subcommand (no args) → strip 2 → ""
  it('returns empty string when no args remain', () => {
    expect(stripWords('/event create', 2)).toBe('')
  })

  // /event create (with trailing space) → strip 2 → ""
  it('handles trailing space after last stripped word', () => {
    expect(stripWords('/event create ', 2)).toBe('')
  })

  // strip 0 → returns original
  it('returns original text when n=0', () => {
    expect(stripWords('/event create arg', 0)).toBe('/event create arg')
  })

  // multiline: /admin say line1\nline2\nline3 → strip 2 → "line1\nline2\nline3"
  it('preserves all newlines in freeform text', () => {
    expect(stripWords('/admin say line1\nline2\nline3', 2)).toBe('line1\nline2\nline3')
  })
})
