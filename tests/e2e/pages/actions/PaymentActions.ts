import { TelegramWebPage } from '@e2e/pages/base/TelegramWebPage'
import { Page } from '@playwright/test'
import { TIMEOUTS } from '@e2e/config/config'

/**
 * Page Object for Payment actions
 * Covers Scenarios 7-8 from architecture.md: Payment Message and Payment Marking
 */
export class PaymentActions extends TelegramWebPage {
  constructor(page: Page) {
    super(page)
  }

  /**
   * Click "Paid ✓" button to mark payment
   *
   * From architecture.md Scenario 8:
   * On press — identify user, put ✓ next to their name
   */
  async markAsPaid(): Promise<void> {
    await this.clickInlineButton('Paid ✓')
    // Wait for message update
    await this.page.waitForTimeout(500)
  }

  /**
   * Click "Cancel payment ✗" button to cancel payment
   *
   * From architecture.md Scenario 8:
   * Set is_paid = false, paid_at = null, remove ✓
   */
  async cancelPayment(): Promise<void> {
    await this.clickInlineButton('Cancel payment ✗')
    // Wait for message update
    await this.page.waitForTimeout(500)
  }

  /**
   * Wait for payment message to appear
   * @param timeout - Maximum time to wait
   * @returns Payment message text
   *
   * Expected format from architecture.md:
   * 💰 Payment for squash: Tuesday, January 21
   * Courts: 3
   * Court cost: 2000
   * @pasha (×2) — 2000 ₽
   * @vasya — 1000 ₽ ✓
   */
  async waitForPaymentMessage(timeout = TIMEOUTS.payment): Promise<string> {
    return await this.waitForMessageContaining('💰 Payment', timeout)
  }

  /**
   * Parse payment details from payment message
   * @param message - Payment message text
   * @returns Payment details object
   */
  parsePaymentMessage(message: string): {
    courts: number
    courtCost: number
    participants: Array<{ username: string; amount: number; paid: boolean }>
  } | null {
    // Parse courts and cost from "Courts: 3 × 2000 din = 6000 din"
    const courtsMatch = message.match(/Courts:\s*(\d+)\s*×\s*(\d+)\s*din/)
    if (!courtsMatch) return null

    // Parse participants and their payments
    const participants: Array<{ username: string; amount: number; paid: boolean }> = []

    // Match pattern: @username — amount din (×count) [✓]
    const regex = /@(\w+)\s*—\s*(\d+)\s*din(?:\s*\(×\d+\))?\s*(✓)?/g
    let match

    while ((match = regex.exec(message)) !== null) {
      participants.push({
        username: match[1],
        amount: parseInt(match[2], 10),
        paid: match[3] === '✓',
      })
    }

    return {
      courts: parseInt(courtsMatch[1], 10),
      courtCost: parseInt(courtsMatch[2], 10),
      participants,
    }
  }

  /**
   * Check if user has paid
   * @param message - Payment message text
   * @param username - Username to check (without @)
   * @returns True if user has paid
   */
  hasUserPaid(message: string, username: string): boolean {
    const payment = this.parsePaymentMessage(message)
    if (!payment) return false

    const participant = payment.participants.find((p) => p.username === username)
    return participant ? participant.paid : false
  }

  /**
   * Get user's payment amount
   * @param message - Payment message text
   * @param username - Username to check (without @)
   * @returns Payment amount or null if user not found
   */
  getUserPaymentAmount(message: string, username: string): number | null {
    const payment = this.parsePaymentMessage(message)
    if (!payment) return null

    const participant = payment.participants.find((p) => p.username === username)
    return participant ? participant.amount : null
  }

  /**
   * Check if all participants have paid
   * @param message - Payment message text
   * @returns True if all have paid
   */
  areAllPaid(message: string): boolean {
    const payment = this.parsePaymentMessage(message)
    if (!payment) return false

    return payment.participants.every((p) => p.paid)
  }

  /**
   * Get list of unpaid participants
   * @param message - Payment message text
   * @returns Array of usernames who haven't paid
   */
  getUnpaidParticipants(message: string): string[] {
    const payment = this.parsePaymentMessage(message)
    if (!payment) return []

    return payment.participants.filter((p) => !p.paid).map((p) => p.username)
  }

  /**
   * Calculate total amount to be paid
   * @param message - Payment message text
   * @returns Total amount
   */
  getTotalAmount(message: string): number {
    const payment = this.parsePaymentMessage(message)
    if (!payment) return 0

    return payment.participants.reduce((sum, p) => sum + p.amount, 0)
  }

  /**
   * Verify payment calculation is correct
   * @param message - Payment message text
   * @returns True if calculation is correct based on formula
   *
   * Formula from architecture.md:
   * amount_to_pay = court_cost × number_of_courts × your_participations / sum_of_all_participations
   */
  verifyPaymentCalculation(
    message: string,
    participations: { [username: string]: number }
  ): boolean {
    const payment = this.parsePaymentMessage(message)
    if (!payment) return false

    const totalParticipations = Object.values(participations).reduce((sum, count) => sum + count, 0)
    const expectedTotal = payment.courtCost * payment.courts

    // Verify each participant's amount
    for (const participant of payment.participants) {
      const userParticipations = participations[participant.username] || 0
      const expectedAmount = Math.round(
        (payment.courtCost * payment.courts * userParticipations) / totalParticipations
      )

      // Allow small rounding differences
      if (Math.abs(participant.amount - expectedAmount) > 1) {
        return false
      }
    }

    // Verify total
    const actualTotal = this.getTotalAmount(message)
    return Math.abs(actualTotal - expectedTotal) <= payment.participants.length // Allow rounding error per participant
  }

  /**
   * Wait for payment message to update
   * @param timeout - Maximum time to wait
   * @returns Updated payment message text
   */
  async waitForPaymentUpdate(timeout = TIMEOUTS.paymentUpdate): Promise<string> {
    // Wait a bit for the update
    await this.page.waitForTimeout(500)
    return await this.waitForPaymentMessage(timeout)
  }
}
