import type { Pool } from 'pg';
import type { PaymentRepository } from './payment.repository.js';
import { Payment } from '../domain/payment.js';

interface PaymentRow {
  id: string;
  idempotency_key: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: Date;
}

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async findById(id: string): Promise<Payment | undefined> {
    const result = await this.pool.query<PaymentRow>(
      'SELECT * FROM payments WHERE id = $1',
      [id],
    );
    return result.rows[0] ? this.toPayment(result.rows[0]) : undefined;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | undefined> {
    const result = await this.pool.query<PaymentRow>(
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

  private toPayment(row: PaymentRow): Payment {
    return new Payment({
      id: row.id,
      idempotencyKey: row.idempotency_key,
      userId: row.user_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status as unknown as 'pending' | 'completed' | 'failed',
      createdAt: row.created_at,
    });
  }
}
