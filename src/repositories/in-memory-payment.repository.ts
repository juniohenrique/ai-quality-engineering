import type { PaymentRepository } from './payment.repository.js';
import { Payment } from '../domain/payment.js';

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments: Payment[] = [];

  async findById(id: string): Promise<Payment | undefined> {
    return this.payments.find((p) => p.id === id);
  }

  async findByIdempotencyKey(key: string): Promise<Payment | undefined> {
    return this.payments.find((p) => p.idempotencyKey === key);
  }

  async create(payment: Payment): Promise<void> {
    this.payments.push(payment);
  }
}
