/** Wrap text in HTML <code> tags (renders as monospace, tap-to-copy in Telegram) */
export function code(text: string): string {
  return `<code>${text}</code>`
}
