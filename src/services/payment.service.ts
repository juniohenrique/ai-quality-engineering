import { randomUUID } from 'node:crypto';
import { Payment } from '../domain/payment.js';
import type { CreatePaymentDTO } from '../dto/create-payment.dto.js';
import type { PaymentRepository } from '../repositories/payment.repository.js';

export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}

  async createPayment(input: CreatePaymentDTO): Promise<Payment> {
    // Basic validation (could be enhanced)
    const idempotencyKey = input.idempotencyKey.trim();
    const userId = input.userId.trim();
    const amount = input.amount;
    const currency = input.currency.trim();
    const status = input.status;

    // Ensure idempotencyKey uniqueness (not enforced here; S04-08 will handle)
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      throw new Error('Payment with this idempotency key already exists');
    }

    const payment = new Payment({
      id: randomUUID(),
      idempotencyKey,
      userId,
      amount,
      currency,
      status,
      createdAt: new Date(),
    });

    await this.repository.create(payment);
    return payment;
  }

  async findPaymentById(id: string): Promise<Payment | undefined> {
    return this.repository.findById(id);
  }
}
