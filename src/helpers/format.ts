/** Wrap text in HTML <code> tags (renders as monospace, tap-to-copy in Telegram) */
export function code(text: string): string {
  return `<code>${text}</code>`
}

/** Strip first N whitespace-separated words from text, preserving the rest (including newlines) */
export function stripWords(text: string, n: number): string {
  let result = text
  for (let i = 0; i < n; i++) {
    result = result.replace(/^\S+\s?/, '')
  }
  return result
}
