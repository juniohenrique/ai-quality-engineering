import { randomUUID } from "node:crypto";
import { Payment } from "../domain/payment.js";
import type { CreatePaymentDTO } from "../dto/create-payment.dto.js";
import type { PaymentRepository } from "../repositories/payment.repository.js";
import { isUniqueViolation } from "../utils/postgres-errors.js";

export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}

  /**
   * Creates a new payment while enforcing idempotency.
   *
   * **Idempotency strategy (two layers):**
   *
   * 1. **Optimistic check** — before inserting, the repository is queried for
   *    an existing payment with the same `idempotencyKey`.  If one is found it
   *    is returned immediately, skipping the INSERT entirely.
   *
   * 2. **Race-condition guard** — if two concurrent requests both pass the
   *    optimistic check and race to INSERT, the database-level
   *    `UNIQUE` constraint on `idempotency_key` rejects the second
   *    `INSERT` with SQLSTATE `"23505"`.  The service catches this and
   *    fetches the payment that was created by the winning request,
   *    returning it to the caller as if it had been created by this request.
   *
   * If the catch block finds no corresponding payment (e.g. because of a
   * non-unique violation or data inconsistency), the original error is
   * re-thrown so it is not silently swallowed.
   *
   * @param input - The payment creation data transfer object.
   * @returns The persisted payment (either newly created or a pre-existing
   *   one with the same idempotency key).
   * @throws {Error} When the input is invalid and the {@link Payment}
   *   constructor rejects it, or when an unexpected database error occurs.
   */
  async createPayment(input: CreatePaymentDTO): Promise<Payment> {
    const idempotencyKey = input.idempotencyKey.trim();
    const userId = input.userId.trim();
    const amount = input.amount;
    const currency = input.currency.trim();
    const status = input.status;

    // Layer 1 — optimistic check: avoid a redundant INSERT when the key
    // was already used.  This is the common case for idempotent retries
    // where the client re-sends the same request after a network timeout.
    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
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

    try {
      await this.repository.create(payment);
    } catch (error) {
      // Layer 2 — race-condition guard: the UNIQUE constraint on
      // `idempotency_key` rejected the INSERT.  Another request created
      // the payment in the meantime, so fetch and return it.
      if (isUniqueViolation(error)) {
        const duplicate = await this.repository.findByIdempotencyKey(idempotencyKey);
        if (duplicate) {
          return duplicate;
        }
      }
      throw error;
    }

    return payment;
  }

  async findPaymentById(id: string): Promise<Payment | undefined> {
    return this.repository.findById(id);
  }
}
