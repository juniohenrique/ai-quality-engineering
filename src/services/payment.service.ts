import { randomUUID } from "node:crypto";
import { Payment, type PaymentStatus } from "../domain/payment.js";
import type { CreatePaymentDTO } from "../dto/create-payment.dto.js";
import type {
  PaymentRepository,
  PaymentPage,
  PaymentFilters,
} from "../repositories/payment.repository.js";
import { isUniqueViolation } from "../utils/postgres-errors.js";
import type { RabbitMqProducer } from "../queue/producer.js";

/** Queue name used to publish payment lifecycle events to consumers. */
export const PAYMENT_EVENTS_QUEUE = "payment-events";

/**
 * Optional, request-scoped context propagated from the queue consumer so the
 * service layer (and any future logging/tracing hooks) can correlate work back
 * to a specific message.  The `correlationId` mirrors the `x-correlation-id`
 * header set by the producer.
 */
export interface PaymentContext {
  correlationId?: string;
}

export interface ListPaymentsQuery {
  userId?: string;
  status?: PaymentStatus;
  minAmount?: number;
  maxAmount?: number;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface PaymentRequester {
  userId: string;
  role: "admin" | "user";
}

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly producer?: RabbitMqProducer,
  ) {}

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
   * @param context - Optional request-scoped context (e.g. `correlationId`)
   *   used to propagate tracing information from the queue consumer.  This is
   *   passed through to downstream calls without changing the persistence logic.
   * @returns The persisted payment (either newly created or a pre-existing
   *   one with the same idempotency key).
   * @throws {Error} When the input is invalid and the {@link Payment}
   *   constructor rejects it, or when an unexpected database error occurs.
   */
  async createPayment(input: CreatePaymentDTO, context?: PaymentContext): Promise<Payment> {
    // context reservado para hook de events em createPayment — S06-14+
    void context;
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

  /**
   * Transitions an existing payment to a new status, persists the change and
   * publishes a `payment.status-changed` event when a producer is available.
   *
   * @param paymentId - The payment to transition.
   * @param newStatus - The target status. Must be an allowed transition from
   *   the current status, otherwise {@link InvalidStatusTransitionError} is
   *   thrown by {@link Payment.transitionTo}.
   * @param context - Optional request-scoped context (e.g. `correlationId`)
   *   propagated to the published event for tracing.
   * @returns The updated payment, or `undefined` when no payment matches the
   *   given id.
   * @throws {InvalidStatusTransitionError} when `newStatus` is not reachable
   *   from the current status.
   */
  async transitionStatus(
    paymentId: string,
    newStatus: PaymentStatus,
    context?: PaymentContext,
  ): Promise<Payment | undefined> {
    const payment = await this.repository.findById(paymentId);
    if (!payment) return undefined;

    const updated = payment.transitionTo(newStatus);
    await this.repository.update(updated);

    if (this.producer) {
      await this.producer.publish(PAYMENT_EVENTS_QUEUE, {
        type: "payment.status-changed",
        paymentId: updated.id,
        fromStatus: payment.status,
        toStatus: updated.status,
        occurredAt: new Date().toISOString(),
        correlationId: context?.correlationId,
      });
    }

    return updated;
  }

  /**
   * Lists payments with filtering, pagination and IDOR protection.
   *
   * **Pagination:** `limit` and `offset` are clamped to safe bounds
   * (1–100 and ≥0) so a malicious or buggy caller cannot request an
   * unbounded page.
   *
   * **Anti-IDOR:** a non-admin requester can only ever see their own
   * payments, regardless of the `userId` value supplied in `query`.
   * An admin may filter by any `userId`; omitting `userId` returns
   * payments across all users.
   *
   * @param query - Optional filter / pagination parameters.
   * @param requester - Identity and role of the caller.
   * @returns A {@link PaymentPage} with the matching payments and total count.
   */
  async listPayments(query: ListPaymentsQuery, requester: PaymentRequester): Promise<PaymentPage> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);

    // Anti-IDOR: user só vê os próprios pagamentos, mesmo que passe
    // outro userId no query. Admin pode filtrar por qualquer userId.
    const effectiveUserId = requester.role === "admin" ? query.userId : requester.userId;

    const filters: PaymentFilters = { limit, offset };
    if (effectiveUserId) filters.userId = effectiveUserId;
    if (query.status) filters.status = query.status;
    if (query.minAmount !== undefined) filters.minAmount = query.minAmount;
    if (query.maxAmount !== undefined) filters.maxAmount = query.maxAmount;
    if (query.from) filters.from = query.from;
    if (query.to) filters.to = query.to;

    return this.repository.findMany(filters);
  }
}
