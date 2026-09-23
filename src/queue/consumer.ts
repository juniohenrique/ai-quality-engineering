import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import type { CreatePaymentDTO } from "../dto/create-payment.dto.js";
import type { PaymentService } from "../services/payment.service.js";

export interface ConsumerConfig {
  url?: string;
  queue?: string;
  attempts?: number;
  delayMs?: number;
  prefetch?: number;
  logger?: ConsumerLogger;
}

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

const DEFAULT_QUEUE = "payments";
const DEFAULT_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_PREFETCH = 10;

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
const consoleLogger: ConsumerLogger = {
  info: (message, context) => logLine("info", message, context),
  warn: (message, context) => logLine("warn", message, context),
  error: (message, context) => logLine("error", message, context),
};

/**
 * RabbitMQ consumer that drains the `payments` queue.
 *
 * Every delivered message is parsed as a {@link CreatePaymentDTO} and handed to
 * {@link PaymentService.createPayment}. On success the message is ACKed and on
 * any failure it is NACKed (without requeue, so it is dropped — retry and DLQ
 * are intentionally out of scope here, see issues S05-05 / S05-06).
 *
 * The connection and channel are established lazily with retry and are
 * re-established automatically whenever the broker (or the channel) drops the
 * connection. Structured logs always carry the message `correlationId`.
 */
export class RabbitMqConsumer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly url: string;
  private readonly queue: string;
  private readonly attempts: number;
  private readonly delayMs: number;
  private readonly prefetch: number;
  private readonly logger: ConsumerLogger;
  private consumerTag: string | null = null;
  private closed = false;
  private connectionPromise: Promise<void> | null = null;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly paymentService: PaymentService,
    config: ConsumerConfig = {},
  ) {
    this.url = config.url ?? process.env.RABBITMQ_URL ?? "";
    this.queue = config.queue ?? DEFAULT_QUEUE;
    this.attempts = config.attempts ?? DEFAULT_ATTEMPTS;
    this.delayMs = config.delayMs ?? DEFAULT_DELAY_MS;
    this.prefetch = config.prefetch ?? DEFAULT_PREFETCH;
    this.logger = config.logger ?? consoleLogger;
  }

  /** True when both the connection and the channel are available. */
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
  }

  private async startConsuming(): Promise<void> {
    if (this.closed) {
      throw new Error("Consumer is closed and cannot start consuming");
    }
    const channel = this.channel;
    if (!channel) {
      throw new Error("No channel available to consume messages");
    }

    const assertReply = await channel.assertQueue(this.queue, { durable: true });
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

    try {
      const payload = this.parsePayload(msg);
      const payment = await this.paymentService.createPayment(payload);
      channel.ack(msg);
      this.logger.info("Payment processed", {
        correlationId,
        paymentId: payment.id,
        queue: this.queue,
        idempotencyKey: payment.idempotencyKey,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      channel.nack(msg, false, false);
      this.logger.error("Failed to process payment", {
        correlationId,
        queue: this.queue,
        error: reason,
      });
    }
  }

  /**
   * Resolves the correlation id carried by the message.
   *
   * The producer always emits a `correlationId` (both as a top-level property
   * and inside `headers`). We read the top-level property first, then fall back
   * to the header, then to the delivery tag so logs are always traceable.
   */
  private resolveCorrelationId(msg: ConsumeMessage): string {
    const correlationId = msg.properties.correlationId;
    if (typeof correlationId === "string") {
      return correlationId;
    }
    const headerCorrelationId = msg.properties.headers?.correlationId;
    if (typeof headerCorrelationId === "string") {
      return headerCorrelationId;
    }
    return `delivery-${msg.fields.deliveryTag}`;
  }

  private parsePayload(msg: ConsumeMessage): CreatePaymentDTO {
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
    return parsed as CreatePaymentDTO;
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

    this.channel = null;
    this.connection = null;
    this.consumerTag = null;

    if (channel && consumerTag) {
      await channel.cancel(consumerTag).catch(() => undefined);
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

  private wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
