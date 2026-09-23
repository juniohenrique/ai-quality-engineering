import { randomUUID } from "node:crypto";
import { connect, type Channel, type ChannelModel, type Options } from "amqplib";

export interface PublishOptions {
  correlationId?: string;
  headers?: Record<string, unknown>;
  contentType?: string;
  contentEncoding?: string;
  deliveryMode?: boolean | number;
  priority?: number;
  persistent?: boolean;
  mandatory?: boolean;
  expiration?: string | number;
  messageId?: string;
  replyTo?: string;
  timestamp?: number;
  type?: string;
  userId?: string;
  appId?: string;
}

export interface ProducerConfig {
  url?: string;
  attempts?: number;
  delayMs?: number;
}

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_CONTENT_TYPE = "application/json";

/**
 * RabbitMQ producer that publishes JSON payloads to a queue.
 *
 * The connection is established lazily with retry and is re-established
 * automatically when the broker drops the connection. Headers always carry
 * a `correlationId`, which is generated (via `randomUUID`) when the caller
 * does not supply one.
 */
export class RabbitMqProducer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly url: string;
  private readonly attempts: number;
  private readonly delayMs: number;
  private closed = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: ProducerConfig = {}) {
    this.url = config.url ?? process.env.RABBITMQ_URL ?? "";
    this.attempts = config.attempts ?? DEFAULT_ATTEMPTS;
    this.delayMs = config.delayMs ?? DEFAULT_DELAY_MS;
  }

  /** True when both the connection and the channel are available. */
  get isConnected(): boolean {
    return this.channel !== null && this.connection !== null && !this.closed;
  }

  /** Establishes the connection (and underlying channel) with retry. */
  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error("Producer is closed and cannot connect to RabbitMQ");
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
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const connection = await connect(this.url);
        const channel = await connection.createChannel();
        this.connection = connection;
        this.channel = channel;
        this.attachConnectionHandlers(connection);
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

  private attachConnectionHandlers(connection: ChannelModel): void {
    connection.removeAllListeners("close");
    connection.removeAllListeners("error");
    connection.on("close", () => this.handleConnectionLost());
    connection.on("error", () => this.handleConnectionLost());
  }

    private handleConnectionLost(): void {
    this.connection = null;
    this.channel = null;
    if (this.closed || this.connectionPromise !== null) {
      return;
    }

    this.connectionPromise = this.connectWithRetry().finally(() => {
      this.connectionPromise = null;
    });
  }

  /**
   * Publishes a JSON payload to `queue`.
   *
   * The payload is serialized to JSON and sent through `sendToQueue` after
   * asserting the queue exists. A `correlationId` is always present in the
   * message headers (generated when absent) and is also exposed as a
   * top-level message property for idiomatic request/reply correlation.
   */
  async publish(queue: string, payload: unknown, options?: PublishOptions): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const channel = this.channel;
    if (!channel) {
      throw new Error("No channel available to publish the message");
    }

    const correlationId = this.resolveCorrelationId(options);
    const headers = this.buildHeaders(options, correlationId);
    const content = Buffer.from(JSON.stringify(payload));
    const publishOptions = this.buildPublishOptions(options, correlationId, headers);

    await channel.assertQueue(queue);
    channel.sendToQueue(queue, content, publishOptions);
  }

  private resolveCorrelationId(options: PublishOptions | undefined): string {
    if (options?.correlationId) {
      return options.correlationId;
    }
    const headerCorrelationId = options?.headers?.correlationId;
    if (typeof headerCorrelationId === "string") {
      return headerCorrelationId;
    }
    return randomUUID();
  }

  private buildHeaders(
    options: PublishOptions | undefined,
    correlationId: string,
  ): Record<string, unknown> {
    return { ...(options?.headers ?? {}), correlationId };
  }

  private buildPublishOptions(
    options: PublishOptions | undefined,
    correlationId: string,
    headers: Record<string, unknown>,
  ): Options.Publish {
    return {
      contentType: options?.contentType ?? DEFAULT_CONTENT_TYPE,
      correlationId,
      headers,
      ...(options?.contentEncoding ? { contentEncoding: options.contentEncoding } : {}),
      ...(options?.deliveryMode !== undefined ? { deliveryMode: options.deliveryMode } : {}),
      ...(options?.priority !== undefined ? { priority: options.priority } : {}),
      ...(options?.persistent !== undefined ? { persistent: options.persistent } : {}),
      ...(options?.mandatory !== undefined ? { mandatory: options.mandatory } : {}),
      ...(options?.expiration !== undefined ? { expiration: options.expiration } : {}),
      ...(options?.messageId ? { messageId: options.messageId } : {}),
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options?.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
      ...(options?.type ? { type: options.type } : {}),
      ...(options?.userId ? { userId: options.userId } : {}),
      ...(options?.appId ? { appId: options.appId } : {}),
    };
  }

  /** Gracefully closes the channel and the connection, stopping reconnections. */
  async close(): Promise<void> {
    this.closed = true;

    if (this.connectionPromise !== null) {
      try {
        await this.connectionPromise;
      } catch {
        // Ignore reconnection errors that surface during shutdown.
      }
    }

    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;

    if (channel) {
      await channel.close().catch(() => undefined);
    }
    if (connection) {
      await connection.close().catch(() => undefined);
    }
  }

  private wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
