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

## Recovery checklist

| Cenário                                    | Recovery automático? | Teste de validação                  |
|-------------------------------------------|----------------------|-------------------------------------|
| Falha transitória no `PaymentService`     | Sim (retry + backlog)| `retry.test.ts`                     |
| Falha permanente (DLQ)                    | Não — exige intervenção manual | `dlq.test.ts`              |
| Conexão com broker perdida                | Sim (reconnect loop) | `consumer.ts#reconnectWithRetry`    |
| Processo consumer reiniciado (offline)    | Sim (fila durable)   | `consumer-failure.test.ts`           |
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
- **`durable`** — flag AMQP que persiste a fila/mensagem no disco.
