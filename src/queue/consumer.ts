import type { CreatePaymentDTO } from "../dto/create-payment.dto.js";
import type { PaymentService } from "../services/payment.service.js";
import { BaseConsumer, type ConsumerConfig } from "./base-consumer.js";

// Re-export types, constants and error class so consumers that previously
// imported from `consumer.js` keep working without changes.
export type { ConsumerConfig, ConsumerLogger, LogLevel } from "./base-consumer.js";
export { ProcessingTimeoutError } from "./base-consumer.js";
export { DEFAULT_QUEUE, DLQ_NAME, DLX_NAME } from "./setup.js";

/**
 * RabbitMQ consumer that drains the `payments` queue.
 *
 * Extends {@link BaseConsumer} which owns every piece of generic messaging
 * machinery (connection/reconnect, prefetch, retry with exponential backoff,
 * processing timeout, correlation-id propagation, graceful shutdown and
 * optional DLQ consumption).  This subclass only provides the domain-specific
 * bits: it knows how to dispatch a {@link CreatePaymentDTO} to the
 * {@link PaymentService} and how to word the structured logs.
 *
 * The public API is intentionally identical to the previous monolithic
 * implementation:
 *   - `constructor(paymentService, config = {})`
 *   - `connect()` / `start()` / `close()`
 *   - `isConnected` / `isConsuming` getters
 *
 * All messaging mechanics live in {@link BaseConsumer} and flow through the
 * {@link handlePayload} template-method hook.
 */
export class RabbitMqConsumer extends BaseConsumer<CreatePaymentDTO> {
  private readonly paymentService: PaymentService;

  protected override retryLogMessage = "Payment processing failed, scheduling retry";
  protected override dlqLogMessage = "Payment processing failed after max retries, routing to DLQ";

  constructor(paymentService: PaymentService, config: ConsumerConfig = {}) {
    super(config);
    this.paymentService = paymentService;
  }

  /**
   * Domain-specific handler invoked for each successfully-delivered message.
   *
   * Hands the deserialized {@link CreatePaymentDTO} to
   * {@link PaymentService.createPayment} (propagating the correlation id for
   * tracing) and logs a structured info record with the resulting payment
   * identifiers.
   *
   * Any rejection — including the timeout error — propagates back to
   * {@link BaseConsumer.processMessage} which drives the retry / DLQ cycle.
   */
  protected override async handlePayload(
    payload: CreatePaymentDTO,
    context: { correlationId: string; queue: string },
  ): Promise<void> {
    const { correlationId, queue } = context;
    const payment = await this.paymentService.createPayment(payload, {
      correlationId,
    });
    this.logger.info("Payment processed", {
      correlationId,
      paymentId: payment.id,
      queue,
      idempotencyKey: payment.idempotencyKey,
    });
  }
}
