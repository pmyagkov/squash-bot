#!/usr/bin/env tsx
/**
 * Manual authentication script for Playwright tests
 *
 * This script opens a browser and lets you manually authenticate with Telegram.
 * Once done, it saves the authentication state for use in tests.
 *
 * Usage:
 *   npm run auth:manual
 *   TELEGRAM_TEST_SERVER=true npm run auth:manual   # for test environment
 */

import { chromium } from '@playwright/test'
import * as readline from 'readline'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const authFile = '.auth/telegram-auth.json'
const useTestServer = process.env.TELEGRAM_TEST_SERVER === 'true'
const telegramUrl = useTestServer
  ? 'https://webk.telegram.org/?test=1'
  : 'https://web.telegram.org/k/'

async function manualAuth() {
  const envLabel = useTestServer ? 'TEST SERVER' : 'PRODUCTION'

  console.log('')
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║       MANUAL AUTHENTICATION FOR PLAYWRIGHT TESTS      ║')
  console.log(`║       Environment: ${envLabel.padEnd(37)}║`)
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`Opening: ${telegramUrl}`)
  console.log('')
  console.log('A browser window will open. Please:')
  console.log('')
  console.log('1. Log in to Telegram Web')
  console.log('2. Search for the bot')
  console.log('3. Open the bot chat')
  console.log('4. Send /start command')
  console.log('5. Wait for the bot to respond')
  console.log('')
  console.log('When ready, press ENTER in this terminal to save the session.')
  console.log('')

  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  })

  const context = await browser.newContext({
    viewport: null,
  })

  const page = await context.newPage()

  // Navigate to Telegram
  await page.goto(telegramUrl)

  // Wait for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  await new Promise<void>((resolve) => {
    rl.question('Press ENTER when you are ready to save the session...', () => {
      rl.close()
      resolve()
    })
  })

  // Save authentication state
  await context.storageState({ path: authFile })

  console.log('')
  console.log('✅ Authentication saved successfully!')
  console.log(`   File: ${authFile}`)
  console.log('')
  console.log('You can now run tests:')
  console.log('   npm run test:e2e:ui')
  console.log('   npm run test:e2e')
  console.log('')

  await browser.close()
}

manualAuth().catch(console.error)
