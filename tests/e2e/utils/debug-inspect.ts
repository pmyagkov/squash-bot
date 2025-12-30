import { chromium } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

async function inspect() {
  // Load .env.test
  const envPath = path.join(__dirname, '../../.env.test')
  dotenv.config({ path: envPath })

  const chatId = process.env.TELEGRAM_MAIN_CHAT_ID
  if (!chatId) {
    console.error('TELEGRAM_MAIN_CHAT_ID not set')
    process.exit(1)
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000,
  })

  const context = await browser.newContext({
    storageState: '.auth/telegram-auth.json',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
  })

  const page = await context.newPage()

  // Navigate to chat
  await page.goto(`https://web.telegram.org/a/#${chatId}`)
  await page.waitForTimeout(3000)

  console.log('\n=== Inspecting Telegram Web Message Structure ===\n')

  // Get all message containers
  const messages = await page.locator('.Message').all()
  console.log(`Total messages found: ${messages.length}`)

  if (messages.length > 0) {
    console.log('\n=== Last 3 messages structure ===\n')
    const lastMessages = messages.slice(-3)

    for (let i = 0; i < lastMessages.length; i++) {
      const msg = lastMessages[i]
      const msgId = await msg.getAttribute('data-message-id')
      const msgPeerId = await msg.getAttribute('data-peer-id')
      const text = await msg.locator('.text-content').textContent().catch(() => '[no text]')

      console.log(`Message ${i + 1}:`)
      console.log(`  ID: ${msgId}`)
      console.log(`  Peer ID: ${msgPeerId}`)
      console.log(`  Text: ${text?.substring(0, 100)}`)
      console.log()
    }
  }

  // Try alternative selectors
  console.log('\n=== Trying different selectors ===\n')

  const messagesBubble = await page.locator('.message-bubble').count()
  console.log(`Messages with .message-bubble: ${messagesBubble}`)

  const messagesContainer = await page.locator('.messages-container .Message').count()
  console.log(`Messages in .messages-container: ${messagesContainer}`)

  const textContent = await page.locator('.text-content').count()
  console.log(`Elements with .text-content: ${textContent}`)

  console.log('\n=== Browser will stay open for inspection ===')
  console.log('Press Ctrl+C to close')

  // Keep browser open
  await new Promise(() => {})
}

inspect().catch(console.error)
