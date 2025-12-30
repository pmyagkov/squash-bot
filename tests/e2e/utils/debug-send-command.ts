import { chromium } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'

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

  // Navigate to chat
  await page.goto(`https://web.telegram.org/a/#${chatId}`)
  await page.waitForTimeout(2000)

  // Get last message ID before sending
  const messagesBefore = await page.locator('.Message').all()
  const lastMsgBefore = messagesBefore[messagesBefore.length - 1]
  const lastIdBefore = await lastMsgBefore?.getAttribute('data-message-id')

  console.log(`\n=== Before sending command ===`)
  console.log(`Last message ID: ${lastIdBefore}`)

  // Send command
  const composer = page.locator('#message-input-text [role="textbox"][contenteditable="true"]')
  await composer.waitFor({ state: 'visible' })
  await composer.fill('/scaffold list')
  await composer.press('Enter')

  console.log(`\n=== Command sent, waiting for response... ===`)
  await page.waitForTimeout(2000)

  // Get new messages
  const messagesAfter = await page.locator('.Message').all()
  console.log(`\nTotal messages after: ${messagesAfter.length}`)

  // Find new messages
  const newMessages = messagesAfter.slice(messagesBefore.length)
  console.log(`New messages: ${newMessages.length}`)

  for (let i = 0; i < newMessages.length; i++) {
    const msg = newMessages[i]
    const msgId = await msg.getAttribute('data-message-id')
    const isOwn = await msg.getAttribute('class')
    const text = await msg.locator('.text-content').textContent().catch(() => '[no text]')

    console.log(`\nNew message ${i + 1}:`)
    console.log(`  ID: ${msgId}`)
    console.log(`  Classes: ${isOwn}`)
    console.log(`  Text: ${text}`)
  }

  // Check for .own class
  const ownMessages = await page.locator('.Message.own').count()
  const notOwnMessages = await page.locator('.Message:not(.own)').count()

  console.log(`\n=== Message types ===`)
  console.log(`Own messages (.Message.own): ${ownMessages}`)
  console.log(`Not own messages (.Message:not(.own)): ${notOwnMessages}`)

  console.log('\n=== Browser will stay open for inspection ===')
  console.log('Press Ctrl+C to close')

  // Keep browser open
  await new Promise(() => {})
}

debugSendCommand().catch(console.error)
