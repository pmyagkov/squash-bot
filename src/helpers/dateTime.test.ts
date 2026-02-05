import { describe, it, expect } from 'vitest'
import { parseDayOfWeek } from './dateTime'

describe('parseDayOfWeek', () => {
  it('should parse abbreviated day names', () => {
    expect(parseDayOfWeek('mon')).toBe('Mon')
    expect(parseDayOfWeek('tue')).toBe('Tue')
    expect(parseDayOfWeek('wed')).toBe('Wed')
    expect(parseDayOfWeek('thu')).toBe('Thu')
    expect(parseDayOfWeek('fri')).toBe('Fri')
    expect(parseDayOfWeek('sat')).toBe('Sat')
    expect(parseDayOfWeek('sun')).toBe('Sun')
  })

  it('should parse full day names', () => {
    expect(parseDayOfWeek('monday')).toBe('Mon')
    expect(parseDayOfWeek('tuesday')).toBe('Tue')
    expect(parseDayOfWeek('wednesday')).toBe('Wed')
    expect(parseDayOfWeek('thursday')).toBe('Thu')
    expect(parseDayOfWeek('friday')).toBe('Fri')
    expect(parseDayOfWeek('saturday')).toBe('Sat')
    expect(parseDayOfWeek('sunday')).toBe('Sun')
  })

  it('should be case-insensitive', () => {
    expect(parseDayOfWeek('MON')).toBe('Mon')
    expect(parseDayOfWeek('Monday')).toBe('Mon')
    expect(parseDayOfWeek('MONDAY')).toBe('Mon')
  })

  it('should return null for invalid day', () => {
    expect(parseDayOfWeek('invalid')).toBeNull()
    expect(parseDayOfWeek('')).toBeNull()
    expect(parseDayOfWeek('xyz')).toBeNull()
  })
})
