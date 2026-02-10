import { chromium } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getTelegramWebUrl } from '@e2e/config/config'

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

  // Navigate to chat (Web K: goto + reload for hash navigation)
  await page.goto(getTelegramWebUrl(chatId), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chatlist-chat', { timeout: 15000 })
  await page.evaluate(() => window.location.reload())
  await page.waitForSelector('.input-message-input[contenteditable="true"]', { timeout: 15000 })

  console.log('\n=== Inspecting Telegram Web K Message Structure ===\n')

  // Get all message bubbles
  const messages = await page.locator('.bubble[data-mid]').all()
  console.log(`Total messages found: ${messages.length}`)

  if (messages.length > 0) {
    console.log('\n=== Last 3 messages structure ===\n')
    const lastMessages = messages.slice(-3)

    for (let i = 0; i < lastMessages.length; i++) {
      const msg = lastMessages[i]
      const msgId = await msg.getAttribute('data-mid')
      const msgPeerId = await msg.getAttribute('data-peer-id')
      const text = await msg.locator('.translatable-message').textContent().catch(() => '[no text]')

      console.log(`Message ${i + 1}:`)
      console.log(`  ID (data-mid): ${msgId}`)
      console.log(`  Peer ID: ${msgPeerId}`)
      console.log(`  Text: ${text?.substring(0, 100)}`)
      console.log()
    }
  }

  // Try alternative selectors
  console.log('\n=== Selector counts ===\n')

  const bubblesCount = await page.locator('.bubble').count()
  console.log(`.bubble: ${bubblesCount}`)

  const bubblesWithMid = await page.locator('.bubble[data-mid]').count()
  console.log(`.bubble[data-mid]: ${bubblesWithMid}`)

  const messageContent = await page.locator('.translatable-message').count()
  console.log(`.translatable-message: ${messageContent}`)

  console.log('\n=== Browser will stay open for inspection ===')
  console.log('Press Ctrl+C to close')

  // Keep browser open
  await new Promise(() => {})
}

inspect().catch(console.error)
