import type { Pool } from 'pg';
import type { PaymentRepository } from './payment.repository.js';
import { Payment } from '../domain/payment.js';

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async findById(id: string): Promise<Payment | undefined> {
    const result = await this.pool.query<any>(
      'SELECT * FROM payments WHERE id = $1',
      [id],
    );
    return result.rows[0] ? this.toPayment(result.rows[0]) : undefined;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | undefined> {
    const result = await this.pool.query<any>(
      'SELECT * FROM payments WHERE idempotency_key = $1',
      [key],
    );
    return result.rows[0] ? this.toPayment(result.rows[0]) : undefined;
  }

  async create(payment: Payment): Promise<void> {
    await this.pool.query(
      `INSERT INTO payments (id, idempotency_key, user_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        payment.id,
        payment.idempotencyKey,
        payment.userId,
        payment.amount,
        payment.currency,
        payment.status,
        payment.createdAt,
      ],
    );
  }

  private toPayment(row: any): Payment {
    return new Payment({
      id: row.id,
      idempotencyKey: row.idempotency_key,
      userId: row.user_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      createdAt: row.created_at,
    } as any);
  }
}
