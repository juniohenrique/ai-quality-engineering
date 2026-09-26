import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { DEFAULT_QUEUE, DLQ_NAME, DLX_NAME, assertDeadLetteredQueue } from "./setup.js";

export interface ConsumerConfig {
  url?: string;
  queue?: string;
  attempts?: number;
  delayMs?: number;
  prefetch?: number;
  logger?: ConsumerLogger;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  /** Nome da exchange de dead-letter (default: `payments-dlx`). */
  dlxName?: string;
  /** Nome da DLQ (default: `payments-dlq`). */
  dlqName?: string;
  /** Quando `true`, também consome da DLQ para log/alerta (default: `false`). */
  consumeDlq?: boolean;
  /**
   * Timeout máximo (em ms) para o processamento de uma única mensagem.
   *
   * Env var equivalente: `QUEUE_PROCESSING_TIMEOUT_MS` (default 5000).
   * Se o handler não completar dentro desse limite, a mensagem é tratada
   * como falha de processamento — acionando o ciclo de retry (backoff
   * exponencial) e, ao esgotar tentativas, a DLQ.
   */
  processingTimeoutMs?: number;
}

// Re-export DLQ constants para uso em testes e consumer opcional da DLQ.
export { DLX_NAME, DLQ_NAME, DEFAULT_QUEUE };

/**
 * Minimal contract for a structured logger.
 *
 * Each method emits a single structured record (`message` + arbitrary
 * `context`). The default implementation (`consoleLogger`) serializes every
 * record as one JSON line so it can be shipped to any log aggregator and
 * correlated by `correlationId`.
 */
export interface ConsumerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export type LogLevel = "info" | "warn" | "error";

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_PREFETCH = 10;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_PROCESSING_TIMEOUT_MS = 5000;
const RETRY_COUNT_HEADER = "x-retry-count";
const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Lançado quando o processamento de uma mensagem excede o limite
 * configurado por `QUEUE_PROCESSING_TIMEOUT_MS`.
 *
 * O timeout é tratado como uma falha de processamento — a mensagem entra
 * no ciclo normal de retry (backoff exponencial) e, ao esgotar tentativas,
 * é roteada para a DLQ.
 */
export class ProcessingTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Processing exceeded timeout of ${timeoutMs}ms`);
    this.name = "ProcessingTimeoutError";
  }
}

function logLine(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/** Default `ConsumerLogger` that writes structured JSON to stdout/stderr. */
export const consoleLogger: ConsumerLogger = {
  info: (message, context) => logLine("info", message, context),
  warn: (message, context) => logLine("warn", message, context),
  error: (message, context) => logLine("error", message, context),
};

/**
 * Base class for a RabbitMQ consumer that handles the reusable plumbing:
 * connection management with retry/reconnect, prefetch, dead-letter
 * exchange wiring, exponential-backoff retries, processing timeout,
 * correlation-id propagation, graceful shutdown and optional DLQ
 * consumption.
 *
 * Subclasses provide domain-specific handling by implementing
 * {@link BaseConsumer.handlePayload}. The same message is parsed as JSON
 * and passed to the handler; failures (including
 * {@link ProcessingTimeoutError}) automatically flow through the retry /
 * DLQ cycle.
 */
export abstract class BaseConsumer<TPayload> {
  private connection: ChannelModel | null = null;
  protected channel: Channel | null = null;
  private readonly url: string;
  protected readonly queue: string;
  private readonly attempts: number;
  private readonly delayMs: number;
  private readonly prefetch: number;
  protected readonly logger: ConsumerLogger;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly processingTimeoutMs: number;
  private readonly dlxName: string;
  private readonly dlqName: string;
  private readonly consumeDlq: boolean;
  protected dlqConsumerTag: string | null = null;
  protected consumerTag: string | null = null;
  private closed = false;
  protected connectionPromise: Promise<void> | null = null;
  protected readonly inFlight = new Set<Promise<void>>();

  /**
   * Log message emitted when a message is successfully processed.
   *
   * Subclasses may override to provide domain-specific wording (e.g.
   * `"Payment processed"`).
   */
  protected successLogMessage = "Message processed";

  /**
   * Log message emitted when a message fails and is scheduled for retry.
   *
   * Subclasses may override to provide domain-specific wording (e.g.
   * `"Payment processing failed, scheduling retry"`).
   */
  protected retryLogMessage = "Message processing failed, scheduling retry";

  /**
   * Log message emitted when a message is routed to the DLQ after exhausting
   * all retries.
   *
   * Subclasses may override to provide domain-specific wording (e.g.
   * `"Payment processing failed after max retries, routing to DLQ"`).
   */
  protected dlqLogMessage = "Message processing failed after max retries, routing to DLQ";

  constructor(config: ConsumerConfig = {}) {
    this.url = config.url ?? process.env.RABBITMQ_URL ?? "";
    this.queue = config.queue ?? DEFAULT_QUEUE;
    this.attempts = config.attempts ?? DEFAULT_ATTEMPTS;
    this.delayMs = config.delayMs ?? DEFAULT_DELAY_MS;
    this.prefetch = config.prefetch ?? DEFAULT_PREFETCH;
    this.logger = config.logger ?? consoleLogger;
    this.maxRetries =
      config.maxRetries ?? (Number(process.env.QUEUE_MAX_RETRIES) || DEFAULT_MAX_RETRIES);
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.processingTimeoutMs =
      config.processingTimeoutMs ??
      (Number(process.env.QUEUE_PROCESSING_TIMEOUT_MS) || DEFAULT_PROCESSING_TIMEOUT_MS);
    this.dlxName = config.dlxName ?? DLX_NAME;
    this.dlqName = config.dlqName ?? DLQ_NAME;
    this.consumeDlq = config.consumeDlq ?? false;
  }

  /**
   * Parses a raw AMQP message into the concrete payload type expected by
   * {@link handlePayload}.
   *
   * Defaults to JSON-parsing the message body. Subclasses may override this
   * when a custom deserialization is needed (e.g. protobuf, Avro).
   */
  protected parsePayload(msg: ConsumeMessage): TPayload {
    const raw = msg.content.toString();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Payload must be a JSON object");
    }
    return parsed as TPayload;
  }

  /** True when the connection and the channel are both available. */
  get isConnected(): boolean {
    return this.channel !== null && this.connection !== null && !this.closed;
  }

  /** True when the consumer is actively registered against the queue. */
  get isConsuming(): boolean {
    return this.consumerTag !== null && this.isConnected;
  }

  /** Establishes the connection (and underlying channel) with retry. */
  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error("Consumer is closed and cannot connect to RabbitMQ");
    }
    if (this.isConnected) {
      return;
    }
    if (this.connectionPromise !== null) {
      await this.connectionPromise;
      return;
    }

    this.connectionPromise = this.connectWithRetry();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async connectWithRetry(): Promise<void> {
    if (!this.url) {
      throw new Error("RABBITMQ_URL is required to connect to RabbitMQ");
    }

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.attempts && !this.closed; attempt += 1) {
      try {
        await this.connectOnce();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.attempts) {
          await this.wait(this.delayMs);
        }
      }
    }

    throw new Error(
      `Failed to connect to RabbitMQ after ${this.attempts} attempt(s): ${lastError?.message ?? "unknown error"}`,
    );
  }

  private async connectOnce(): Promise<void> {
    const connection = await connect(this.url);
    const channel = await connection.createChannel();
    this.connection = connection;
    this.channel = channel;
    this.attachConnectionHandlers(connection);
    this.attachChannelHandlers(channel);
  }

  private attachConnectionHandlers(connection: ChannelModel): void {
    connection.removeAllListeners("close");
    connection.removeAllListeners("error");
    connection.on("close", () => this.handleConnectionLost());
    connection.on("error", () => this.handleConnectionLost());
  }

  private attachChannelHandlers(channel: Channel): void {
    channel.removeAllListeners("close");
    channel.removeAllListeners("error");
    channel.on("close", () => this.handleConnectionLost());
    channel.on("error", () => this.handleConnectionLost());
  }

  /** Connects (if needed) and starts consuming from the queue. */
  async start(): Promise<void> {
    if (this.isConsuming) {
      return;
    }
    await this.connect();
    await this.startConsuming();

    if (this.consumeDlq) {
      await this.startDlqConsumer().catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn("Failed to start DLQ consumer, continuing without it", {
          queue: this.dlqName,
          error: reason,
        });
      });
    }
  }

  private async startConsuming(): Promise<void> {
    if (this.closed) {
      throw new Error("Consumer is closed and cannot start consuming");
    }
    const channel = this.channel;
    if (!channel) {
      throw new Error("No channel available to consume messages");
    }

    const assertReply = await assertDeadLetteredQueue(
      channel,
      this.queue,
      this.dlxName,
      this.dlqName,
    );
    await channel.prefetch(this.prefetch);
    const reply = await channel.consume(this.queue, this.handleMessage, { noAck: false });
    this.consumerTag = reply.consumerTag;
    this.logger.info("Consumer started", {
      queue: this.queue,
      consumerTag: reply.consumerTag,
      messageCount: assertReply.messageCount,
    });
  }

  private handleConnectionLost(): void {
    this.connection = null;
    this.channel = null;
    this.consumerTag = null;
    this.dlqConsumerTag = null;
    if (this.closed || this.connectionPromise !== null) {
      return;
    }

    // Automatic reconnection: keep retrying (backed off) until the consumer is
    // closed, then re-register on the queue once the broker is reachable.
    this.connectionPromise = this.reconnectWithRetry().finally(() => {
      this.connectionPromise = null;
    });
  }

  private async reconnectWithRetry(): Promise<void> {
    while (!this.closed) {
      try {
        await this.connectOnce();
        await this.startConsuming();
        this.logger.info("Consumer reconnected", { queue: this.queue });

        if (this.dlqConsumerTag === null && this.consumeDlq) {
          await this.startDlqConsumer().catch((error) => {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn("Failed to re-start DLQ consumer after reconnection", {
              queue: this.dlqName,
              error: reason,
            });
          });
        }
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn("Failed to reconnect, retrying", {
          queue: this.queue,
          error: reason,
        });
        await this.wait(this.delayMs);
      }
    }
  }

  private readonly handleMessage = (msg: ConsumeMessage | null): void => {
    if (!msg) {
      return;
    }
    const work = this.processMessage(msg);
    this.inFlight.add(work);
    void work.finally(() => {
      this.inFlight.delete(work);
    });
  };

  private async processMessage(msg: ConsumeMessage): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      return;
    }
    const correlationId = this.resolveCorrelationId(msg);
    const retryCount = this.resolveRetryCount(msg);

    try {
      const payload = this.parsePayload(msg);
      await this.withProcessingTimeout(() =>
        this.handlePayload(payload, { correlationId, queue: this.queue }),
      );
      channel.ack(msg);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const nextRetryCount = retryCount + 1;

      if (retryCount < this.maxRetries) {
        const backoffMs = this.retryBaseDelayMs * 2 ** retryCount;
        this.logger.warn(this.retryLogMessage, {
          correlationId,
          queue: this.queue,
          error: reason,
          retryCount: nextRetryCount,
          maxRetries: this.maxRetries,
          backoffMs,
        });

        await this.wait(backoffMs);

        // Re-publish the message with an incremented retry count so the
        // consumer picks it up on the next available turn. The original
        // message is ACKed first to avoid double-delivery.
        const originalHeaders = msg.properties.headers ?? {};
        const headers = { ...originalHeaders, [RETRY_COUNT_HEADER]: nextRetryCount };
        channel.sendToQueue(this.queue, msg.content, {
          correlationId,
          headers,
          contentType: "application/json",
        });
        channel.ack(msg);
      } else {
        // Max retries exhausted — NACK without requeue so the message is
        // dead-lettered via the DLX configured on the queue.
        channel.nack(msg, false, false);
        this.logger.error(this.dlqLogMessage, {
          correlationId,
          queue: this.queue,
          error: reason,
          retryCount,
          maxRetries: this.maxRetries,
        });
      }
    }
  }

  /**
   * Domain-specific handler invoked for each successfully-delivered message.
   *
   * Implementations must perform the actual work (e.g. persisting a payment,
   * sending an email) and reject on failure so the retry/DLQ machinery can
   * kick in.
   *
   * @param payload         - The deserialized message body.
   * @param context.correlationId - The propagated correlation id for tracing.
   * @param context.queue        - The queue the message was consumed from.
   */
  protected abstract handlePayload(
    payload: TPayload,
    context: { correlationId: string; queue: string },
  ): Promise<void>;

  /**
   * Resolves the correlation id for a message, used to propagate tracing
   * context to the downstream service and structured logs.
   *
   * The producer always emits a `correlationId` (both as a top-level message
   * property and inside the `x-correlation-id` header). We read the top-level
   * property first, then fall back to the header, then to the delivery tag so
   * logs are always traceable.
   */
  private resolveCorrelationId(msg: ConsumeMessage): string {
    const correlationId = msg.properties.correlationId;
    if (typeof correlationId === "string") {
      return correlationId;
    }
    const headerCorrelationId = msg.properties.headers?.[CORRELATION_ID_HEADER];
    if (typeof headerCorrelationId === "string") {
      return headerCorrelationId;
    }
    return `delivery-${msg.fields.deliveryTag}`;
  }

  /**
   * Reads the current retry count from the `x-retry-count` message header.
   *
   * Returns `0` for the initial delivery (no retry header present) so the
   * backoff formula `baseDelay × 2^retryCount` yields the expected
   * 1 s, 2 s, 4 s sequence.
   */
  private resolveRetryCount(msg: ConsumeMessage): number {
    const headers = msg.properties.headers;
    if (!headers) {
      return 0;
    }
    const value = headers[RETRY_COUNT_HEADER];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  /** Gracefully closes the consumer: lets in-flight work finish, then tears down. */
  async close(): Promise<void> {
    this.closed = true;

    // Let in-flight messages finish (they ACK/NACK themselves) before tearing
    // the channel down so acknowledgements are never lost.
    const pending = Array.from(this.inFlight);
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }

    const channel = this.channel;
    const connection = this.connection;
    const consumerTag = this.consumerTag;
    const dlqConsumerTag = this.dlqConsumerTag;

    this.channel = null;
    this.connection = null;
    this.consumerTag = null;
    this.dlqConsumerTag = null;

    if (channel) {
      if (consumerTag) {
        await channel.cancel(consumerTag).catch(() => undefined);
      }
      if (dlqConsumerTag) {
        await channel.cancel(dlqConsumerTag).catch(() => undefined);
      }
      await channel.close().catch(() => undefined);
    }
    if (connection) {
      await connection.close().catch(() => undefined);
    }

    // If a reconnection is underway, let it observe `closed` and stop.
    if (this.connectionPromise !== null) {
      await this.connectionPromise.catch(() => undefined);
    }
  }

  /**
   * Starts an optional consumer on the Dead Letter Queue (DLQ).
   *
   * When `consumeDlq` is enabled in the config, the DLQ consumer logs every
   * message that arrives in the DLQ (including the `x-death` header that
   * RabbitMQ attaches automatically) and ACKs it. This is useful for
   * monitoring and alerting on messages that exhausted all retries.
   *
   * The DLQ consumer is **not** started automatically — set `consumeDlq:
   * true` in the {@link ConsumerConfig} to enable it.
   */
  private async startDlqConsumer(): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      throw new Error("No channel available to consume DLQ messages");
    }

    await channel.assertQueue(this.dlqName, { durable: true });
    const reply = await channel.consume(this.dlqName, this.handleDlqMessage, { noAck: false });
    this.dlqConsumerTag = reply.consumerTag;
    this.logger.info("DLQ consumer started", {
      queue: this.dlqName,
      consumerTag: reply.consumerTag,
    });
  }

  private readonly handleDlqMessage = (msg: ConsumeMessage | null): void => {
    if (!msg) {
      return;
    }
    const channel = this.channel;
    const correlationId = this.resolveCorrelationId(msg);
    const deathHeader = msg.properties.headers?.["x-death"] as
      { reason: string; count: number; queue: string }[] | undefined;

    this.logger.warn("Message landed in DLQ after exhausting retries", {
      queue: this.dlqName,
      correlationId,
      originalQueue: deathHeader?.[0]?.queue,
      deadLetterReason: deathHeader?.[0]?.reason,
      deliveryCount: deathHeader?.[0]?.count,
      payload: JSON.parse(msg.content.toString()),
    });

    if (channel) {
      channel.ack(msg);
    }
  };

  /**
   * Executes `work` with a time limit.
   *
   * Uses `Promise.race` between the operation and a `setTimeout` that
   * rejects with {@link ProcessingTimeoutError}. The timer is always cleared
   * (even on success) to avoid event-loop leaks. Any rejection — whether
   * from the timeout or the operation itself — propagates to the `catch` in
   * `processMessage`, triggering the retry/DLQ cycle.
   */
  private async withProcessingTimeout<T>(work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ProcessingTimeoutError(this.processingTimeoutMs)),
            this.processingTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
