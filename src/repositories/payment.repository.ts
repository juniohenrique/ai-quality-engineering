import type { Payment } from "../domain/payment.js";

export interface PaymentRepository {
  findById(id: string): Promise<Payment | undefined>;
  findByIdempotencyKey(key: string): Promise<Payment | undefined>;
  create(payment: Payment): Promise<void>;
}
