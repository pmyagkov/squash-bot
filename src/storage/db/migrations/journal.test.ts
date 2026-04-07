import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const META_DIR = path.resolve(__dirname, 'meta')

interface JournalEntry {
  idx: number
  tag: string
}

interface Journal {
  entries: JournalEntry[]
}

function readJournal(filename: string): Journal {
  return JSON.parse(fs.readFileSync(path.join(META_DIR, filename), 'utf-8'))
}

describe('migration journal sync', () => {
  it('test journal includes all production migrations in order', () => {
    const prod = readJournal('_journal.json')
    const test = readJournal('_test_journal.json')

    const prodTags = prod.entries.map((e) => e.tag)
    const testTags = test.entries.map((e) => e.tag)

    for (const tag of prodTags) {
      expect(testTags, `Missing migration "${tag}" in test journal`).toContain(tag)
    }

    let lastIndex = -1
    for (const tag of prodTags) {
      const index = testTags.indexOf(tag)
      expect(
        index,
        `"${tag}" appears before previous production migration in test journal`
      ).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })
})
