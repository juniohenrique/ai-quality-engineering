import type { Payment, PaymentStatus } from "../domain/payment.js";

export interface PaymentFilters {
  userId?: string;
  status?: PaymentStatus;
  minAmount?: number;
  maxAmount?: number;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface PaymentPage {
  items: Payment[];
  total: number;
}

export interface PaymentRepository {
  findById(id: string): Promise<Payment | undefined>;
  findByIdempotencyKey(key: string): Promise<Payment | undefined>;
  create(payment: Payment): Promise<void>;
  update(payment: Payment): Promise<void>;
  findMany(filters: PaymentFilters): Promise<PaymentPage>;
  countByStatus(): Promise<Record<PaymentStatus, number>>;
}
