import type { Channel } from "amqplib";

/** Nome da exchange de dead-letter para a fila `payments`. */
export const DLX_NAME = "payments-dlx";

/** Nome da Dead Letter Queue (DLQ) para a fila `payments`. */
export const DLQ_NAME = "payments-dlq";

/** Nome padrão da fila principal de pagamentos. */
export const DEFAULT_QUEUE = "payments";

/**
 * Asserta a infraestrutura de Dead Letter Exchange (DLX) e Dead Letter Queue (DLQ).
 *
 * Esta função é idempotente — pode ser chamada múltiplas vezes com segurança.
 * Ela:
 * 1. Cria a exchange `payments-dlx` (direct, durable)
 * 2. Cria a fila `payments-dlq` (durable)
 * 3. Faz o binding `payments-dlq` → `payments-dlx` com routing key `payments-dlq`
 *
 * Depois que a fila principal (`payments`) for asserida com
 * `x-dead-letter-exchange: payments-dlx`, mensagens NACKed sem requeue
 * (ou rejeitadas) serão automaticamente roteadas para esta DLQ.
 *
 * @param channel    - Channel AMQP já conectado.
 * @param exchange   - Nome da exchange de dead-letter (default: `payments-dlx`).
 * @param dlq        - Nome da DLQ (default: `payments-dlq`).
 */
export async function setupDeadLetterInfrastructure(
  channel: Channel,
  exchange: string = DLX_NAME,
  dlq: string = DLQ_NAME,
): Promise<void> {
  await channel.assertExchange(exchange, "direct", { durable: true });
  await channel.assertQueue(dlq, { durable: true });
  await channel.bindQueue(dlq, exchange, dlq);
}

/**
 * Asserta a fila principal (`payments`) com a dead-letter exchange configurada.
 *
 * Internamente chama {@link setupDeadLetterInfrastructure} e, em seguida,
 * afirma a fila com os argumentos `x-dead-letter-exchange` e
 * `x-dead-letter-routing-key` definidos, de modo que mensagens rejeitadas
 * sejam roteadas automaticamente para a DLQ.
 *
 * Esta função é idempotente e compatível com a asserção de fila feita pelo
 * {@link RabbitMqProducer.publish}.
 *
 * @param channel      - Channel AMQP já conectado.
 * @param queue        - Nome da fila principal (default: `payments`).
 * @param exchange     - Nome da DLX (default: `payments-dlx`).
 * @param routingKey   - Routing key usada pelo DLX (default: `payments-dlq`).
 * @returns O reply do `assertQueue` contendo `messageCount` e `consumerCount`.
 */
export async function assertDeadLetteredQueue(
  channel: Channel,
  queue: string = DEFAULT_QUEUE,
  exchange: string = DLX_NAME,
  routingKey: string = DLQ_NAME,
): Promise<{ messageCount: number; consumerCount: number }> {
  await setupDeadLetterInfrastructure(channel, exchange, routingKey);
  const reply = await channel.assertQueue(queue, {
    durable: true,
    deadLetterExchange: exchange,
    deadLetterRoutingKey: routingKey,
  });
  return {
    messageCount: reply.messageCount,
    consumerCount: reply.consumerCount,
  };
}
