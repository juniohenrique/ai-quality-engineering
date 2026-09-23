# Failure Modes

Este documento cataloga os modos de falha do `RabbitMqConsumer`
(`src/queue/consumer.ts`), como cada um é detectado e tratado, e como os
testes de integração validam o comportamento esperado.

## Visão geral dos modos de falha

O consumer (`RabbitMqConsumer`) lida com três categorias principais de falha:

1. **Falha de processamento** — o `PaymentService.createPayment` rejeita a mensagem.
2. **Conexão perdida com o broker** — RabbitMQ ou a rede cai durante o consumo.
3. **Encerramento / reinício do processo** — o consumer é fechado enquanto
   mensagens ainda estão na fila ou em voo.

---

## 1. Falha de processamento (retry com backoff exponencial)

### Sintoma

O `PaymentService.createPayment` lança uma exceção ao tentar persistir o
pagamento. Isso pode ser causado por:

- Validação de domínio rejeitando o payload (ex.: `amount <= 0`).
- Erro de banco (constraint, lock, etc.).
- Falha transitória no repositório.

### Comportamento do consumer

Para cada mensagem que falha:

1. O consumer lê o header `x-retry-count` (0 na primeira entrega).
2. Se `retryCount < maxRetries` (default: 3), aguarda `retryBaseDelayMs × 2^retryCount`
   milissegundos e **re-publica** a mensagem na mesma fila com o contador
   incrementado.
3. O consumer **ACKa** a mensagem original antes de re-publicar, evitando
   dupla entrega.
4. Após `maxRetries` tentativas, o consumer **NACKa sem requeue** — a mensagem
   é dead-lettered para `payments-dlq` via DLX `payments-dlx`.

### Configuração relevante

| Propriedade         | Env var              | Default | Descrição                                  |
|---------------------|----------------------|---------|--------------------------------------------|
| `maxRetries`        | `QUEUE_MAX_RETRIES`  | 3       | Número máximo de tentativas antes do DLQ.  |
| `retryBaseDelayMs`  | —                    | 1000    | Base do backoff exponencial (em ms).       |

### Testes de validação

- `tests/integration/queue/retry.test.ts` — verifica o backoff `50 ms → 100 ms`
  e a contagem de chamadas ao service (exatamente `maxRetries + 1`).
- `tests/integration/queue/dlq.test.ts` — verifica que mensagens que
  esgotam as tentativas chegam a `payments-dlq` com o payload original.

---

## 2. Conexão perdida com o broker (reconexão automática)

### Sintoma

O broker RabbitMQ reinicia, cai de rede, ou a conexão/channel é fechada
inesperadamente. Eventos `close` ou `error` dis­para no `ChannelModel` ou no
`Channel`.

### Comportamento do consumer

1. O consumer remove os listeners antigos e anexa handlers para `close` e
   `error` tanto na conexão quanto no channel (`attachConnectionHandlers` /
   `attachChannelHandlers`).
2. Em `handleConnectionLost`, o consumer limpa `connection`, `channel`,
   `consumerTag` e `dlqConsumerTag`.
3. Se não estiver fechado, dispara `reconnectWithRetry` — um loop que tenta
   reconectar (com retry de `attempts` tentativas e `delayMs` de intervalo) e,
   ao restabelecer, chama `startConsuming()` para re-registrar o consumer na
   fila.
4. As mensagens que estavam **não-ACKed** (unacknowledged) no channel fechado
   são re-entregues pelo broker automaticamente (RabbitMQ re-entrega mensagens
   não-ACKed quando o consumer cancela ou desconecta).

### Considerações

- O consumer não reinicia o `inFlight` set — promessas resolvidas
  automaticamente quando o channel é recriado.
- O `closed` flag impede reconexão após `close()` ser chamado explicitamente.

---

## 3. Consumer indisponível — mensagens publicadas durante a indisponibilidade

### Sintoma

O processo consumer está offline (parado, reiniciando, ou nunca foi iniciado)
enquanto o producer publica mensagens na fila. O título da issue é
**"Consumer indisponível"**.

### Comportamento do broker

Como a fila `payments` é declarada como **durable** (via
`assertDeadLetteredQueue` em `src/queue/setup.ts`), o RabbitMQ **persiste**
todas as mensagens publicadas enquanto nenhum consumer está ativo. Quando o
consumer se conecta e chama `channel.consume`, o broker entrega as mensagens
pendentes (ready) na ordem de publicação (FIFO).

### Comportamento do consumer

1. O consumer não precisa estar ativo no momento da publicação — ele não
   "perde" mensagens. Elas ficam na fila até que ele se conecte.
2. Ao chamar `start()` → `connect()` → `startConsuming()`, o consumer se
   registra na fila e imediatamente começa a receber as mensagens acumuladas.
3. Cada mensagem é processada, ACKada (ou rejeitada/retryada conforme o modo de
   falha #1).

### Teste de validação

`tests/integration/queue/consumer-failure.test.ts`:

- **Publica 3 mensagens** sem que o consumer esteja rodando.
- **Verifica** que as 3 mensagens estão na fila (count = 3).
- **Inicia o consumer** (simulação de "reinício" — o processo voltou).
- **Aguarda o esvaziamento** da fila (`waitForQueueDrained`).
- **Confirma** que todas as 3 mensagens foram persistidas como pagamentos,
  sem perda ou duplicação.

> **Nota:** como a fila é `durable: true` e as mensagens são publicadas com
> `persistent` (default do `sendToQueue`), uma reinicialização do broker não
> também afeta as mensagens pendentes. O consumer só precisa reconectar para
> retomá-las.

---

## 4. Mensagens inválidas (payload corrompido)

### Sintema

A mensagem publicada não é um JSON válido ou não contém os campos esperados
`CreatePaymentDTO`.

### Comportamento do consumer

1. `parsePayload` tenta fazer `JSON.parse` — se falhar, lança
   `"Invalid JSON payload: ..."`.
2. Se o parse falhar ou o objeto for `null`, o consumer rejeita a mensagem
   como qualquer outra exceção de processamento: retry com backoff, e após
   `maxRetries`, NACK sem requeue → DLQ.

> **Importante:** o consumer não descarta a mensagem silenciosamente. Mensagens
> mal-formadas também passam pelo ciclo de retry e, ao esgotar tentativas, vão
> para a DLQ, onde podem ser inspecionadas.

---

## 5. Timeout no processamento (processing timeout)

### Sintoma

O `PaymentService.createPayment` leva mais tempo do que o limite configurado,
deixando a mensagem em voo sem ser ACKada. Isso pode ser causado por:

- Latência no banco de dados (lock, I/O lento).
- Chamada a serviço externo sem timeout (ex.: gateway de pagamento).
- Carga excessiva no consumer.

### Comportamento do consumer

1. O consumer envolve a chamada `paymentService.createPayment` em
   `Promise.race` contra um timer de `processingTimeoutMs` (via método privado
   `withProcessingTimeout`).
2. Se o timer vence primeiro, um `ProcessingTimeoutError` é lançado — o timer
   é limpo no `finally` para evitar *leaks* de event-loop.
3. O `ProcessingTimeoutError` é capturado pelo mesmo bloco `catch` de falha de
   processamento: a mensagem entra no ciclo normal de **retry com backoff
   exponencial** e, ao esgotar `maxRetries`, é **NACKed sem requeue** →
   roteada para a DLQ (`payments-dlq`) via DLX.
4. O motivo do timeout ("exceeded timeout of Nms") é incluído no campo `error`
   do log estruturado, facilitando correlação em logs.

### Configuração relevante

| Propriedade            | Env var                      | Default | Descrição                                            |
|------------------------|------------------------------|---------|------------------------------------------------------|
| `processingTimeoutMs`  | `QUEUE_PROCESSING_TIMEOUT_MS`| 5000    | Timeout por mensagem em milissegundos.               |

### Testes de validação

- `tests/integration/queue/timeout.test.ts` — simula processamento lento (2s)
  com timeout de 500ms. Verifica que: (a) o service é chamado `maxRetries + 1`
  vezes, (b) cada tentativa registra timeout no log, (c) a mensagem chega à
  DLQ com o payload preservado, (d) nenhum pagamento é persistido, e (e) o
  consumer permanece ativo.

---

## 6. Correlation ID (tracing entre producer e consumer)

### Sintoma

Em um sistema distribuído, uma única operação de pagamento pode tocar várias
camadas — producer, broker RabbitMQ, consumer, service, repositório — e cada
uma delas emite logs em serviços distintos. Sem um identificador compartilhado,
é impossível reconstruir a jornada de uma mensagem a partir de seus logs.

### Comportamento do pipeline

1. **Producer** (`src/queue/producer.ts`): sempre gera ou reutiliza um
   `correlationId` (via `crypto.randomUUID()` quando o caller não fornece um),
   o envia tanto como propriedade AMQP `correlationId` quanto como header
   `x-correlation-id`, e **retorna** o valor para o caller — que pode incluí-lo
   nos seus próprios logs.

2. **Consumer** (`src/queue/consumer.ts`): no `processMessage`, lê o
   `correlationId` de `msg.properties.correlationId`, com fallback para o
   header `x-correlation-id`, e com último recurso usa `delivery-{tag}`. O
   valor é passado para `PaymentService.createPayment` via `PaymentContext` e
   incluído em **todos** os logs estruturados do consumer (info, warn, error).

3. **Retry**: quando o consumer re-publica a mensagem (backoff exponencial), o
   `correlationId` é preservado nas propriedades da nova mensagem — todas as
   tentativas compartilham o mesmo identificador.

4. **DLQ**: a mensagem que esgota as tentativas mantém o `correlationId`
   original, permitindo correlacionar o alerta de DLQ com a tentativa inicial.

### Configuração relevante

| Propriedade           | Env var          | Default                          | Descrição                                      |
|-----------------------|------------------|----------------------------------|------------------------------------------------|
| _(nenhuma)_           | —                | —                                | O correlation id é sempre propagado automaticamente. |

### Testes de validação

- `tests/integration/queue/correlation.test.ts` — verifica três cenários:
  - O `correlationId` fornecido pelo producer chega ao `PaymentService` e
    aparece nos logs do consumer.
  - Quando o producer não fornece um, `crypto.randomUUID()` gera um UUID v4
    válido que também é propagado.
  - O `correlationId` é preservado entre a tentativa que falha (retry) e a
    tentativa bem-sucedida.

> **Nota:** o `PaymentService` aceita `PaymentContext` (interface com
> `correlationId?: string`) como segundo parâmetro de `createPayment`. Ainda
> não possui logger próprio — o contexto está disponível para futuras
> integrações com OpenTelemetry ou sistemas de tracing distribuído.

---

## Recovery checklist

| Cenário                                    | Recovery automático? | Teste de validação                  |
|-------------------------------------------|----------------------|-------------------------------------|
| Falha transitória no `PaymentService`     | Sim (retry + backlog)| `retry.test.ts`                     |
| Falha permanente (DLQ)                    | Não — exige intervenção manual | `dlq.test.ts`              |
| Conexão com broker perdida                | Sim (reconnect loop) | `consumer.ts#reconnectWithRetry`    |
| Processo consumer reiniciado (offline)    | Sim (fila durable)   | `consumer-failure.test.ts`           |
| Timeout no processamento (> 5s)            | Sim (retry + DLQ)    | `timeout.test.ts`                   |
| Payload inválido (JSON corrompido)        | Não — vai para DLQ   | `consumer.test.ts` (NACK path)      |

---

## Glossário

- **DLQ** (Dead Letter Queue) — `payments-dlq`. Mensagens que esgotaram todas
  as tentativas.
- **DLX** (Dead Letter Exchange) — `payments-dlx`. Exchange `direct` que
  encaminha mensagens NACKed para a DLQ.
- **ACK** — confirmação de entrega: o broker descarta a mensagem.
- **NACK** — rejeição sem requeue: a mensagem é roteada para a DLX.
- **`x-retry-count`** — header incrementado pelo consumer a cada retry.
- **`x-correlation-id`** — header (também exposta como propriedade AMQP
  `correlationId`) que identifica unicamente uma mensagem em toda a cadeia
  producer → broker → consumer → service. Gerado pelo producer via
  `crypto.randomUUID()` quando não fornecido pelo caller.
- **`PaymentContext`** — objeto opcional passado ao `PaymentService.createPayment`
  com o `correlationId`, permitindo tracing nos logs da camada de serviço.
- **`durable`** — flag AMQP que persiste a fila/mensagem no disco.
