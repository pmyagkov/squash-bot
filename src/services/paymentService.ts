import { db } from '~/storage/db'
import { payments } from '~/storage/db/schema'
import { eq } from 'drizzle-orm'
import type { Payment } from '~/types'

class PaymentService {
  async createPayment(eventId: string, participantId: string, amount: number): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values({
        eventId,
        participantId,
        amount,
        isPaid: false,
        reminderCount: 0,
      })
      .returning()

    return this.toDomain(payment)
  }

  async getPaymentsByEvent(eventId: string): Promise<Payment[]> {
    const results = await db.select().from(payments).where(eq(payments.eventId, eventId))

    return results.map(this.toDomain)
  }

  async markAsPaid(paymentId: number): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({
        isPaid: true,
        paidAt: new Date(),
      })
      .where(eq(payments.id, paymentId))
      .returning()

    return this.toDomain(payment)
  }

  async incrementReminderCount(paymentId: number): Promise<Payment> {
    const payment = await db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
    })

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`)
    }

    const [updated] = await db
      .update(payments)
      .set({
        reminderCount: payment.reminderCount + 1,
      })
      .where(eq(payments.id, paymentId))
      .returning()

    return this.toDomain(updated)
  }

  private toDomain(row: typeof payments.$inferSelect): Payment {
    return {
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      amount: row.amount,
      isPaid: row.isPaid,
      paidAt: row.paidAt ?? undefined,
      reminderCount: row.reminderCount,
    }
  }
}

export const paymentService = new PaymentService()
