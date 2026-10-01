import type { PaymentRepository, PaymentFilters, PaymentPage } from "./payment.repository.js";
import { Payment } from "../domain/payment.js";

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

  async update(payment: Payment): Promise<void> {
    const index = this.payments.findIndex((p) => p.id === payment.id);
    if (index >= 0) {
      this.payments[index] = payment;
    }
  }

  async findMany(filters: PaymentFilters): Promise<PaymentPage> {
    const filtered = this.payments.filter((p) => {
      if (filters.userId && p.userId !== filters.userId) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.minAmount !== undefined && p.amount < filters.minAmount) return false;
      if (filters.maxAmount !== undefined && p.amount > filters.maxAmount) return false;
      if (filters.from && p.createdAt < filters.from) return false;
      if (filters.to && p.createdAt > filters.to) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: sorted.slice(filters.offset, filters.offset + filters.limit),
      total: filtered.length,
    };
  }
}
