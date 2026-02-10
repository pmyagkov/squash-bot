import { chromium } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { getTelegramWebUrl } from '@e2e/config/config'

async function debugSendCommand() {
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
    slowMo: 500,
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
  await page.waitForTimeout(1000)

  // Get last message ID before sending
  const messagesBefore = await page.locator('.bubble[data-mid]').all()
  const lastMsgBefore = messagesBefore[messagesBefore.length - 1]
  const lastIdBefore = await lastMsgBefore?.getAttribute('data-mid')

  console.log(`\n=== Before sending command ===`)
  console.log(`Last message ID (data-mid): ${lastIdBefore}`)

  // Send command
  const composer = page.locator('.input-message-input[contenteditable="true"]').first()
  await composer.waitFor({ state: 'visible' })
  await composer.fill('/scaffold list')
  await composer.press('Enter')

  console.log(`\n=== Command sent, waiting for response... ===`)
  await page.waitForTimeout(2000)

  // Get new messages
  const messagesAfter = await page.locator('.bubble[data-mid]').all()
  console.log(`\nTotal messages after: ${messagesAfter.length}`)

  // Find new messages
  const newMessages = messagesAfter.slice(messagesBefore.length)
  console.log(`New messages: ${newMessages.length}`)

  for (let i = 0; i < newMessages.length; i++) {
    const msg = newMessages[i]
    const msgId = await msg.getAttribute('data-mid')
    const classes = await msg.getAttribute('class')
    const text = await msg.locator('.translatable-message').textContent().catch(() => '[no text]')

    console.log(`\nNew message ${i + 1}:`)
    console.log(`  ID (data-mid): ${msgId}`)
    console.log(`  Classes: ${classes}`)
    console.log(`  Text: ${text}`)
  }

  // Check for .is-out class (own messages in Web K)
  const ownMessages = await page.locator('.bubble.is-out').count()
  const notOwnMessages = await page.locator('.bubble[data-mid]:not(.is-out)').count()

  console.log(`\n=== Message types ===`)
  console.log(`Own messages (.bubble.is-out): ${ownMessages}`)
  console.log(`Not own messages (.bubble:not(.is-out)): ${notOwnMessages}`)

  console.log('\n=== Browser will stay open for inspection ===')
  console.log('Press Ctrl+C to close')

  // Keep browser open
  await new Promise(() => {})
}

debugSendCommand().catch(console.error)
