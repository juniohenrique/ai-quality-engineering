# Failure Modes

Este documento cataloga todos os modos de falha do sistema distribuído
implementado no Sprint 05 — a pipeline assíncrona **Producer → RabbitMQ →
Consumer → PaymentService → PostgreSQL** — e como cada um deles é detectado,
tratado e validado pelos testes de integração.

Cada modo de falha abaixo traz os quatro campos especificados:

| Campo               | Descrição                               |
| ------------------- | --------------------------------------- |
| **Causa**           | O que provoca a falha.                  |
| **Sintoma**         | Como se manifesta no sistema.           |
| **Mitigação**       | O que o sistema faz em resposta.        |
| **Teste que cobre** | Path do arquivo de teste de integração. |

## Visão geral

O `RabbitMqConsumer` (`src/queue/consumer.ts`) lida com cinco categorias
principais de falha:

1. **Falha de processamento** — o `PaymentService.createPayment` rejeita a mensagem.
2. **Conexão perdida com o broker** — RabbitMQ ou a rede cai durante o consumo.
3. **Consumer indisponível** — o processo consumer está offline enquanto o producer publica.
4. **Mensagem duplicada** — o broker ou o producer re-entregam a mesma mensagem.
5. **Timeout de processamento** — a mensagem leva mais tempo do que o limite configurado.

Além disso, o sistema implementa **DLQ (Dead Letter Queue)** para isolar
mensagens que esgotam todas as tentativas, e **Correlation ID** para rastrear
mensagens entre producer e consumer.

---

## Diagrama de fluxo

```mermaid
flowchart TD
    Producer["Producer
(src/queue/producer.ts)"] --> Queue["Queue `payments`
durable, DLX config"]
    Queue --> Consumer["Consumer
(src/queue/consumer.ts)"]
    Consumer --> Process{"Processamento OK?"}
    Process -->|Não| Retry{"retryCount < maxRetries?"}
    Retry -->|Sim| Backoff["Backoff exponencial
retryBaseDelayMs x 2^retryCount"]
    Backoff --> Requeue["Re-publica na fila
com x-retry-count incrementado"]
    Requeue --> Queue
    Retry -->|Não| DLQ["Dead Letter Queue
payments-dlq via DLX"]
    Process -->|Sim| Persist["Persiste no PostgreSQL
(src/services/payment.service.ts)"]
    DLQ --> Alert["Alerta / reprocessamento manual"]
    Persist --> Done["Fim"]
```

---

## 1. Consumer indisponível

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Causa**           | O processo consumer está offline (parado, reiniciando, ou nunca foi iniciado) enquanto o producer publica mensagens na fila.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Sintoma**         | Mensagens ficam acumuladas na fila `payments` aguardando um consumer ativo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Mitigação**       | Como a fila `payments` é declarada como **durable** (via `assertDeadLetteredQueue` em [`src/queue/setup.ts`](src/queue/setup.ts)) e as mensagens são publicadas com `persistent` (default do amqplib), o RabbitMQ **persiste** todas as mensagens no disco enquanto nenhum consumer está ativo. Quando o consumer se conecta e chama `channel.consume`, o broker entrega as mensagens pendentes na ordem de publicação (FIFO). O consumer não precisa estar ativo no momento da publicação — ele não perde mensagens. Ao chamar `start()` → `connect()` → `startConsuming()`, o consumer se registra na fila e imediatamente começa a receber as mensagens acumuladas. |
| **Teste que cobre** | [`tests/integration/queue/consumer-failure.test.ts`](tests/integration/queue/consumer-failure.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Detalhes do teste

O teste `consumer-failure.test.ts` valida dois cenários:

1. **Publica 3 mensagens sem que o consumer esteja rodando** → verifica que as 3
   mensagens ficam na fila (count = 3) → inicia o consumer → aguarda o esvaziamento
   da fila (`waitForQueueDrained`) → confirma que todas as 3 mensagens foram persistidas
   como pagamentos, sem perda ou duplicação (`countPaymentsByKeys` retorna 3).

2. **Inicia e encerra o consumer (simulando restart)** → publica 3 novas mensagens →
   inicia um segundo consumer → confirma que exatamente 3 pagamentos foram persistidos
   (sem duplicação de leftovers do primeiro consumer).

> **Nota:** como a fila é `durable: true` e as mensagens são publicadas com
> `persistent` (default do `sendToQueue` do amqplib), uma reinicialização do broker
> também não afeta as mensagens pendentes — o consumer só precisa reconectar para
> retomá-las. Essa durabilidade é configurada em
> [`src/queue/setup.ts`](src/queue/setup.ts:56).

---

## 2. Mensagem duplicada

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Causa**           | O broker re-entrega a mesma mensagem (por exemplo, por consumo sem ACK após timeout de rede) ou o producer re-tenta a publicação de forma descoordenada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Sintoma**         | A mesma mensagem (mesmo `idempotencyKey` e `correlationId`) aparece duas ou mais vezes na fila, correndo o risco de dupla persistência.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Mitigação**       | O sistema implementa **idempotência em duas camadas**: 1) **Optimistic check** — o `PaymentService.createPayment` consulta o repositório por uma payment com o mesmo `idempotencyKey` antes de inserir; se encontrada, retorna a existente sem inserir. 2) **Race-condition guard** — se duas requisições concorrentes passarem o check otimista e disputarem o INSERT, a constraint `UNIQUE` de `idempotency_key` no PostgreSQL rejeita a segunda (SQLSTATE `23505`); o service captura esse erro e retorna a payment criada pela requisição vencedora. O `PaymentService` recebe o `correlationId` via `PaymentContext` e o propaga nos logs. Além disso, no consumer, a mensagem original é **ACKada antes de re-publicar** no retry (linha do `channel.ack(msg)` após `sendToQueue`), evitando dupla entrega durante o ciclo de retry. |
| **Teste que cobre** | [`tests/integration/queue/duplicates.test.ts`](tests/integration/queue/duplicates.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Detalhes do teste

O teste `duplicates.test.ts` publica **a mesma mensagem duas vezes** com o **mesmo
`correlationId`** (simulando um producer ou broker retry). Em seguida:

- Verifica que apenas **1 linha** foi persistida (`countPaymentsByKey` retorna 1).
- Confirma que a `payments` table contém exatamente **1 row** no total.
- Confirma que o pagamento persistido corresponde ao payload original.

A idempotência é garantida pela combinação do **optimistic check** no service
(`PaymentService.createPayment`) e pela **constraint UNIQUE** no banco de dados
(`idempotency_key`), implementada em
[`src/services/payment.service.ts`](src/services/payment.service.ts:63).

---

## 3. Mensagem inválida

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Causa**           | A mensagem publicada não é um JSON válido ou não contém os campos esperados de `CreatePaymentDTO` (`idempotencyKey`, `userId`, `amount`, `currency`, `status`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Sintoma**         | O `parsePayload` do consumer falha ao fazer `JSON.parse`, ou o `PaymentService.createPayment` lança exceção por validação de domínio (ex.: `amount <= 0`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Mitigação**       | O consumer não descarta a mensagem silenciosamente. Mensagens mal-formadas ou inválidas entram no **mesmo ciclo de retry com backoff exponencial**. O `parsePayload` (`src/queue/consumer.ts`) tenta `JSON.parse` e, se falhar, lança `"Invalid JSON payload: ..."` — essa exceção é capturada pelo bloco `catch` de `processMessage`, acionando o ciclo de retry. Após esgotar `maxRetries` tentativas, o consumer faz `NACK` sem `requeue`, e a mensagem é **dead-lettered** para `payments-dlq` via DLX `payments-dlx`, onde pode ser inspecionada. Para payloads que são JSON válido mas com campos ausentes ou inválidos, o `PaymentService.createPayment` chama `.trim()` em campos e o construtor `Payment` valida invariantes (ex.: `amount > 0`), lançando exceção que também segue pelo ciclo de retry e DLQ. |
| **Teste que cobre** | [`tests/integration/queue/invalid-messages.test.ts`](tests/integration/queue/invalid-messages.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Detalhes do teste

O teste `invalid-messages.test.ts` valida três cenários:

1. **JSON mal-formado** (`"not valid json{{"`) — o `parsePayload` falha antes
   mesmo de chamar `PaymentService.createPayment` (`service.callCount` = 0). A
   mensagem passa por 2 retries (com `maxRetries = 2`) e é dead-lettered para a
   DLQ. O conteúdo raw é preservado intacto na DLQ.

2. **Payload JSON válido mas incompleto** (`{ foo: "bar" }`) — o service é chamado
   `maxRetries + 1 = 3` vezes (o `.trim()` em campos `undefined` lança exceção).
   A mensagem é dead-lettered para a DLQ com o payload original preservado.

3. **Resiliência do consumer** — após processar mensagens inválidas (e mandá-las
   para a DLQ), o consumer permanece ativo (`consumer.isConsuming === true`) e
   processa com sucesso uma mensagem válida subsequente.

---

## 4. Timeout de processamento

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Causa**           | O `PaymentService.createPayment` leva mais tempo do que o limite configurado (`processingTimeoutMs`), deixando a mensagem em voo sem ser ACKada. Pode ser causado por latência no banco de dados (lock, I/O lento), chamada a serviço externo sem timeout, ou carga excessiva no consumer.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Sintoma**         | A mensagem permanece não-ACKed por mais tempo do que o timeout configurado. O `Promise.race` entre o processamento e o timer dispara primeiro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Mitigação**       | O consumer envolve a chamada `paymentService.createPayment` em `Promise.race` contra um timer de `processingTimeoutMs` (via método privado `withProcessingTimeout` em `src/queue/consumer.ts`). Se o timer vence primeiro, um `ProcessingTimeoutError` é lançado — o timer é limpo no bloco `finally` para evitar _leaks_ de event-loop. O `ProcessingTimeoutError` é capturado pelo mesmo bloco `catch` de falha de processamento: a mensagem entra no ciclo normal de **retry com backoff exponencial** e, ao esgotar `maxRetries`, é **NACKed sem requeue** → roteada para a DLQ (`payments-dlq`) via DLX. A mensagem do timeout é logada com a mensagem `"exceeded timeout of Nms"` no campo `error` do log estruturado. |
| **Teste que cobre** | [`tests/integration/queue/timeout.test.ts`](tests/integration/queue/timeout.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Configuração relevante

| Propriedade           | Env var                       | Default | Descrição                              |
| --------------------- | ----------------------------- | ------- | -------------------------------------- |
| `processingTimeoutMs` | `QUEUE_PROCESSING_TIMEOUT_MS` | 5000    | Timeout por mensagem em milissegundos. |

### Detalhes do teste

O teste `timeout.test.ts` usa um `SlowPaymentService` que demora 2 segundos por
chamada (`createPayment`) contra um timeout de 500ms (`processingTimeoutMs`):

1. **Timeout → DLQ**: com `maxRetries = 2`, o service é chamado 3 vezes
   (`maxRetries + 1`). Cada tentativa excede o timeout. A mensagem chega à DLQ
   com o payload preservado. Nenhum pagamento é persistido. O consumer permanece
   ativo (`consumer.isConsuming === true`).

2. **Consumer sobrevive ao timeout**: após o timeout, o consumer continua vivo,
   recebe uma nova mensagem válida (processada por um `FastPaymentService`) e a
   persiste com sucesso — `fastService.callCount === 1`.

---

## 5. Broker indisponível

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Causa**           | O broker RabbitMQ reinicia, cai de rede, ou a conexão/channel é fechada inesperadamente durante o consumo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Sintoma**         | Eventos `close` ou `error` dis­param no `ChannelModel` (conexão) ou no `Channel`. O consumer perde a conexão e deixa de receber mensagens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Mitigação**       | O consumer anexa handlers para `close` e `error` tanto na conexão quanto no channel (`attachConnectionHandlers` / `attachChannelHandlers` em `src/queue/consumer.ts`). Em `handleConnectionLost`, o consumer limpa `connection`, `channel`, `consumerTag` e `dlqConsumerTag`. Se não estiver fechado (`closed === false`), dispara `reconnectWithRetry` — um loop que tenta reconectar (com retry de `attempts` tentativas e intervalo de `delayMs`) e, ao restabelecer, chama `startConsuming()` para re-registrar o consumer na fila. As mensagens **não-ACKed** (unacknowledged) no channel fechado são re-entregues pelo broker automaticamente — o RabbitMQ re-entrega mensagens não-ACKed quando o consumer cancela ou desconecta. O `closed` flag impede reconexão após `close()` ser chamado explicitamente. |
| **Teste que cobre** | Sem teste de integração específico para reconexão automática. O reconhecimento de conexão perdida é validado indiretamente pelo teste de consumer failure/restart (consumer é encerrado e re-iniciado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

> **Conhecido sem teste dedicado:** o mecanismo de reconexão (`reconnectWithRetry`)
> em `src/queue/consumer.ts` não possui um teste de integração que simule
> desconexão do broker e reconexão automática. A lógica é implementada e documentada
> pelo código, mas não é validada por um teste end-to-end no Sprint 05.

---

## 6. DB indisponível

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Causa**           | O PostgreSQL fica indisponível — durante o boot da aplicação (não responde às tentativas de conexão) ou durante o processamento de uma mensagem (conexão cai ou transação falha).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Sintoma**         | Erros de conexão (`ECONNREFUSED`, `ETIMEDOUT`) ou falhas em queries (`SELECT`, `INSERT`) no `PostgresPaymentRepository`. O `PaymentService.createPayment` lança exceção ao tentar persistir o pagamento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Mitigação**       | 1) **Boot time** — `src/server.ts` chama `waitForDatabase(pool)` (em `src/db/client.ts`) que tenta `SELECT 1` até 3 vezes (com `delayMs = 100`). Se o DB permanecer indisponível, o servidor inicia normalmente e o endpoint `/health` reporta status `degraded` (503). 2) **Runtime (consumo)** — quando o DB cai durante o processamento de uma mensagem, o `PostgresPaymentRepository.create` ou `findByIdempotencyKey` lança exceção. Essa exceção é capturada pelo bloco `catch` de `processMessage`, acionando o ciclo de **retry com backoff exponencial**. Como o erro não é um `DuplicateIdempotencyKeyError` (SQLSTATE `23505`), não é capturado como idempotência — propaga para o catch. Após esgotar `maxRetries`, a mensagem é **NACKed sem requeue** → roteada para a DLQ (`payments-dlq`). O retry exponencial dá ao DB tempo para se recuperar (ex.: failover de réplica). |
| **Teste que cobre** | Sem teste de integração específico para falha do DB durante consumo. O boot-time retry é validado por testes de server integration (`tests/integration/server.integration.test.ts`). A falha do DB durante consumo é tratada pelo mesmo mecanismo de retry/DLQ, validado indiretamente pelos testes de `retry.test.ts` e `dlq.test.ts` (que usam falhas simuladas no service, mas o caminho de error é o mesmo).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

> **Conhecido sem teste dedicado:** a falha do PostgreSQL durante o processamento
> de uma mensagem não possui um teste de integração específico no Sprint 05. O
> comportamento é coberto pelo mesmo ciclo de retry/DLQ, mas não há um teste que
> caia o DB mid-flight e verifique a recuperação.

---

## 7. DLQ crescendo

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Causa**           | Mensagens que esgotam todas as tentativas de retry (`maxRetries + 1` tentativas) são dead-lettered para a DLQ (`payments-dlq`). Se houver uma taxa de falhas persistente (ex.: schema de banco incompatível, bug de validação), a DLQ cresce continuamente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Sintoma**         | A fila `payments-dlq` acumula mensagens. O consumer principal esvazia a `payments`, mas a DLQ continua a crescer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Mitigação**       | 1) **Isolamento** — mensagens com falha permanente são separadas na DLQ, não bloqueando o consumer principal. 2) **Consumer opcional da DLQ** — quando `consumeDlq: true` é passado na configuração, um consumer secundário é iniciado na DLQ (`startDlqConsumer` em `src/queue/consumer.ts`). A cada mensagem que chega à DLQ, o `handleDlqMessage` loga um alerta no nível `warn` (incluindo os headers `x-death`, routing key original e conteúdo) e faz `ACK`, removendo a mensagem da DLQ. 3) **Configuração DLX** — a infrastructure de dead-letter é declarada de forma idempotente em `src/queue/setup.ts` via `setupDeadLetterInfrastructure` (exchange `direct` `payments-dlx` durable + binding `payments-dlq`). 4) **Observabilidade** — o log estruturado da DLQ inclui `correlationId`, `x-death` headers (`reason`, `count`, `queue`), e o payload original, permitindo diagnóstico. |
| **Teste que cobre** | [`tests/integration/queue/dlq.test.ts`](tests/integration/queue/dlq.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Configuração relevante

A topologia de DLQ é definida em [`src/queue/setup.ts`](src/queue/setup.ts):

```text
src/queue/setup.ts
├── DLX_NAME        = "payments-dlx"    (exchange direct, durable)
├── DLQ_NAME        = "payments-dlq"    (queue, durable)
├── DEFAULT_QUEUE   = "payments"        (queue, durable, deadLetterExchange)
└── assertDeadLetteredQueue()
    → setupDeadLetterInfrastructure()
      → assertExchange(DLX, "direct", { durable: true })
      → assertQueue(DLQ, { durable: true })
      → bindQueue(DLQ, DLX, DLQ)
    → assertQueue(QUEUE, {
        durable: true,
        deadLetterExchange: DLX,
        deadLetterRoutingKey: DLQ,
      })
```

### Detalhes dos testes

O teste `dlq.test.ts` valida:

1. **Mensagem com falha permanente → DLQ**: com `maxRetries = 2`, o service é
   chamado 3 vezes (`maxRetries + 1`). A mensagem chega à `payments-dlq` com o
   payload original preservado. Nenhum pagamento é persistido. O log de erro é
   emitido com `retryCount = 2` e `maxRetries = 2`.

2. **Mensagem bem-sucedida → NÃO vai para DLQ**: uma mensagem processada com
   sucesso não aparece na DLQ. O consumer não loga erro de DLQ.

3. **Topologia preservada**: o exchange `payments-dlx`, a DLQ `payments-dlq`, e a
   fila principal `payments` (com argumentos `x-dead-letter-exchange` e
   `x-dead-letter-routing-key`) existem com os nomes e configurações esperados.

---

## 8. Correlation ID (tracing entre producer e consumer)

| Campo               | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Causa**           | Em um sistema distribuído, uma única operação de pagamento atravessa múltiplas camadas (producer, broker RabbitMQ, consumer, service, repositório), cada uma emitindo logs em serviços ou processos distintos. Sem um identificador compartilhado, é impossível reconstruir a jornada de uma mensagem a partir de seus logs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Sintoma**         | A mensagem é processada, mas não é possível correlacionar os logs do producer com os do consumer, ou com os do retry, ou com o alerta de DLQ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Mitigação**       | 1) **Producer** (`src/queue/producer.ts`): gera ou reutiliza um `correlationId` via `crypto.randomUUID()` quando o caller não fornece um. O `correlationId` é enviado tanto como propriedade AMQP `correlationId` quanto como header `x-correlation-id`, e **retornado** ao caller para inclusão em seus próprios logs. 2) **Consumer** (`src/queue/consumer.ts`): lê o `correlationId` de `msg.properties.correlationId`, com fallback para o header `x-correlation-id`, e com último recurso usa `delivery-{tag}`. O valor é passado para `PaymentService.createPayment` via `PaymentContext` e incluído em **todos** os logs estruturados (info, warn, error). 3) **Retry**: quando o consumer re-publica a mensagem (backoff exponencial), o `correlationId` é preservado nas propriedades da nova mensagem. 4) **DLQ**: a mensagem que esgota tentativas mantém o `correlationId` original, permitindo correlacionar o alerta de DLQ com a tentativa inicial. |
| **Teste que cobre** | [`tests/integration/queue/correlation.test.ts`](tests/integration/queue/correlation.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Detalhes do teste

O teste `correlation.test.ts` valida três cenários:

1. **Correlation ID fornecido pelo producer chega ao service e aos logs**: o
   producer publica com `correlationId: "corr-trace-001"` → o service recebe o
   mesmo valor → o log `"Payment processed"` contém `correlationId: "corr-trace-001"`.

2. **UUID gerado quando não fornecido**: quando o caller não passa `correlationId`,
   o producer gera um UUID v4 válido (`crypto.randomUUID()`) que é propagado ao
   service e aos logs.

3. **Correlation ID preservado entre retry e sucesso**: quando o service falha na
   primeira tentativa e sucesso na retry, ambas as chamadas recebem o mesmo
   `correlationId`. O warn do retry também carrega o mesmo `correlationId`.

> **Nota:** o `PaymentService` aceita `PaymentContext` (interface com
> `correlationId?: string`) como segundo parâmetro de `createPayment`
> (`src/services/payment.service.ts`). Ainda não possui logger próprio — o
> contexto está disponível para futuras integrações com OpenTelemetry ou sistemas
> de tracing distribuído.

---

## Configuração

As variáveis de ambiente que controlam os modos de falha estão em
[`.env.example`](.env.example) e são documentadas abaixo:

| Propriedade           | Env var                       | Default                             | Descrição                                                                                       |
| --------------------- | ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `maxRetries`          | `QUEUE_MAX_RETRIES`           | 3                                   | Número máximo de tentativas de retry antes do DLQ.                                              |
| `retryBaseDelayMs`    | —                             | 1000                                | Base do backoff exponencial (em ms). O delay de cada retry é `retryBaseDelayMs × 2^retryCount`. |
| `processingTimeoutMs` | `QUEUE_PROCESSING_TIMEOUT_MS` | 5000                                | Timeout por mensagem em milissegundos.                                                          |
| `RABBITMQ_URL`        | —                             | `amqp://guest:guest@localhost:5672` | URL de conexão ao broker RabbitMQ.                                                              |

---

## Recovery checklist

| Cenário                                               | Recovery automático?                           | Teste de validação                                                             |
| ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Consumer offline (mensagens acumuladas)               | Sim (fila durable)                             | [`consumer-failure.test.ts`](tests/integration/queue/consumer-failure.test.ts) |
| Mensagem duplicada (mesmo `correlationId`)            | Sim (idempotência)                             | [`duplicates.test.ts`](tests/integration/queue/duplicates.test.ts)             |
| Payload inválido (JSON corrompido ou campos ausentes) | Não — vai para DLQ                             | [`invalid-messages.test.ts`](tests/integration/queue/invalid-messages.test.ts) |
| Timeout de processamento (> timeout configurado)      | Sim (retry + DLQ)                              | [`timeout.test.ts`](tests/integration/queue/timeout.test.ts)                   |
| Falha transitória no `PaymentService`                 | Sim (retry + backlog)                          | [`retry.test.ts`](tests/integration/queue/retry.test.ts)                       |
| Falha permanente (DLQ)                                | Não — exige intervenção manual                 | [`dlq.test.ts`](tests/integration/queue/dlq.test.ts)                           |
| Conexão com broker perdida                            | Sim (loop de reconexão)                        | Sem teste dedicado — conhecido sem teste                                       |
| DB indisponível durante consumo                       | Sim (retry + DLQ)                              | Sem teste dedicado — coberto indiretamente por `retry.test.ts` e `dlq.test.ts` |
| DLQ crescendo                                         | Parcial (consumer opcional de DLQ loga e ACKa) | [`dlq.test.ts`](tests/integration/queue/dlq.test.ts)                           |

---

## Glossário

- **DLQ** (Dead Letter Queue) — `payments-dlq`. Mensagens que esgotaram todas as tentativas.
- **DLX** (Dead Letter Exchange) — `payments-dlx`. Exchange `direct` que encaminha mensagens NACKed para a DLQ.
- **ACK** — confirmação de entrega: o broker descarta a mensagem.
- **NACK** — rejeição sem requeue: a mensagem é roteada para a DLX.
- **`x-retry-count`** — header incrementado pelo consumer a cada retry (inicia em 0).
- **`x-correlation-id`** — header (também exposta como propriedade AMQP `correlationId`) que identifica unicamente uma mensagem em toda a cadeia producer → broker → consumer → service. Gerado pelo producer via `crypto.randomUUID()` quando não fornecido pelo caller.
- **`PaymentContext`** — objeto opcional passado ao `PaymentService.createPayment` com o `correlationId`, permitindo tracing nos logs da camada de serviço.
- **`durable`** — flag AMQP que persiste a fila/mensagem no disco.
- **`prefetch`** — número máximo de mensagens não-ACKed que o broker entrega ao consumer (default: 10).
- **`ProcessingTimeoutError`** — exceção lançada quando o processamento excede `processingTimeoutMs` (definida em `src/queue/consumer.ts`).
