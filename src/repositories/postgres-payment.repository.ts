import type { Pool } from "pg";
import type { PaymentRepository, PaymentFilters, PaymentPage } from "./payment.repository.js";
import { Payment, type PaymentStatus } from "../domain/payment.js";
import { isUniqueViolation } from "../utils/postgres-errors.js";

interface PaymentRow {
  id: string;
  idempotency_key: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: Date;
}

/**
 * Domain error thrown when a payment cannot be persisted because its
 * `idempotency_key` collides with an existing row.
 *
 * The `code` property intentionally mirrors the PostgreSQL SQLSTATE `"23505"`
 * so that the {@link isUniqueViolation} utility can detect this error at the
 * service layer, enabling an idempotent retry-and-return-existing strategy.
 */
export class DuplicateIdempotencyKeyError extends Error {
  readonly code = "23505";

  constructor(idempotencyKey: string) {
    super(`Payment with idempotency key "${idempotencyKey}" already exists`);
    this.name = "DuplicateIdempotencyKeyError";
  }
}

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async findById(id: string): Promise<Payment | undefined> {
    const result = await this.pool.query<PaymentRow>("SELECT * FROM payments WHERE id = $1", [id]);
    return result.rows[0] ? rowToPayment(result.rows[0]) : undefined;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | undefined> {
    const result = await this.pool.query<PaymentRow>(
      "SELECT * FROM payments WHERE idempotency_key = $1",
      [key],
    );
    return result.rows[0] ? rowToPayment(result.rows[0]) : undefined;
  }

  async findMany(filters: PaymentFilters): Promise<PaymentPage> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (filters.userId) {
      conditions.push(`user_id = $${idx++}`);
      params.push(filters.userId);
    }
    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.minAmount !== undefined) {
      conditions.push(`amount >= $${idx++}`);
      params.push(filters.minAmount);
    }
    if (filters.maxAmount !== undefined) {
      conditions.push(`amount <= $${idx++}`);
      params.push(filters.maxAmount);
    }
    if (filters.from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(filters.to);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM payments ${where}`,
      params,
    );
    const itemsResult = await this.pool.query<PaymentRow>(
      `SELECT id, idempotency_key AS "idempotencyKey",
              user_id AS "userId", amount, currency, status,
              created_at AS "createdAt"
       FROM payments ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, filters.offset],
    );
    return {
      items: itemsResult.rows.map((row) => rowToPayment(row)),
      total: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  /**
   * Persists a payment row.
   *
   * If the `idempotency_key` violates the UNIQUE constraint, the raw
   * PostgreSQL error (SQLSTATE `"23505"`) is converted to a
   * {@link DuplicateIdempotencyKeyError}.
   *
   * The service layer is responsible for catching this error and returning
   * the previously persisted payment, guaranteeing idempotency under
   * concurrent requests (race-condition guard).
   *
   * @throws {DuplicateIdempotencyKeyError} when a payment with the same
   *   idempotency key already exists.
   */
  async create(payment: Payment): Promise<void> {
    try {
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateIdempotencyKeyError(payment.idempotencyKey);
      }
      throw error;
    }
  }

  /**
   * Persists a status change for an existing payment.
   *
   * Only the `status` column is mutable after creation; `idempotency_key`,
   * `user_id`, `amount` and `currency` are immutable and must not be updated
   * here.
   */
  async update(payment: Payment): Promise<void> {
    await this.pool.query("UPDATE payments SET status = $1 WHERE id = $2", [
      payment.status,
      payment.id,
    ]);
  }
}

function rowToPayment(row: PaymentRow): Payment {
  return new Payment({
    id: row.id,
    idempotencyKey: row.idempotency_key,
    userId: row.user_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PaymentStatus,
    createdAt: row.created_at,
  });
}
