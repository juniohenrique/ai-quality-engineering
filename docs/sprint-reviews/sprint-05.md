# Sprint Review — Sprint 05

**Período:** Semanas 9–10
**Status:** ✅ Concluído
**Release:** v0.5.0
**Data:** 2026-09-XX

## Objetivo do Sprint

Implementar e validar a pipeline assíncrona distribuída
(Producer → RabbitMQ → Consumer → PostgreSQL) com resiliência,
observabilidade e testes de falha end-to-end.

## Técnica

### Construído

**Infra**
- S05-01: RabbitMQ via Docker Compose (exchange, DLX, DLQ)
- S05-02: Producer (`src/queue/producer.ts`) com Correlation ID

**Producer/Consumer**
- S05-03: Consumer (`src/queue/consumer.ts`) com ACK/NACK
- S05-07: Consumer indisponível — fila durable acumula mensagens
- S05-09: Timeout de processamento (SlowPaymentService x timeout)
- S05-10: Mensagem inválida (JSON corrompido / campos ausentes)

**Resiliência**
- S05-04: Dead Letter Queue (`payments-dlq`) via DLX (`payments-dlx`)
- S05-05: Retry com backoff exponencial (base 1000ms × 2^retryCount)
- S05-06: Idempotência por `idempotencyKey` (optimistic check + UNIQUE constraint)
- S05-08: Mensagem duplicada processada exatamente uma vez
- S05-11: Correlation ID propagado end-to-end (producer → consumer → service)
- S05-12: Documentação de failure modes

**Testes de falha**
- `consumer.test.ts` — processa e persiste mensagem publicada
- `consumer-failure.test.ts` — consumer offline, mensagens acumuladas, restart
- `duplicates.test.ts` — mensagem duplicada (mesmo correlationId) processada uma vez
- `invalid-messages.test.ts` — JSON mal-formado e payload incompleto → DLQ
- `retry.test.ts` — falha transitória, sucesso no 3º retry, DLQ após esgotar
- `timeout.test.ts` — timeout de processamento → DLQ, consumer sobrevive
- `dlq.test.ts` — falha permanente → DLQ, sucesso → não vai para DLQ, topologia preservada
- `correlation.test.ts` — correlation ID fornecido / gerado / preservado em retry
- `producer-consumer.test.ts` — pipeline completo producer → consumer → DB

### O que quebrou

- Branch `feature/S05-09-mensagem-invalida` com nome errado (deveria refletir timeout)
- Prompts com títulos trocados (S05-07 a S05-10) geraram commits com nomes imprecisos
- Sync PR #251 não propagou versão 0.4.0 para `develop`
- Zoo Code commitou artefatos de documentação sem confirmação prévia

## Decisões tomadas

- DLX + DLQ implementados nativamente no `docker-compose.yml` e `src/queue/setup.ts`
- Retry com backoff exponencial em vez de linear — reduz sobrecarga no broker
- ACK explícito após re-publicação no retry — evita dupla entrega
- Correlation ID via header AMQP (`x-correlation-id`) — padrão de tracing

## Qualidade

### Riscos cobertos

- [x] Consumer offline — mensagens acumuladas e recuperadas na reconexão
- [x] Mensagem duplicada — idempotência via `idempotencyKey`
- [x] Payload inválido — dead-lettering para `payments-dlq`
- [x] Timeout de processamento — `Promise.race` + `ProcessingTimeoutError`
- [x] Falha transitória — retry com backoff exponencial
- [x] Falha permanente — NACK sem requeue → DLQ
- [x] Conexão perdida — handlers de `close`/`error` + reconexão automática
- [x] Correlation ID — tracing end-to-end através de toda a cadeia

### Riscos descobertos

- [ ] Conexão com broker perdida — sem teste de integração dedicado
- [ ] DB indisponível durante consumo — coberto indiretamente por retry/DLQ
- [ ] DLQ crescendo — consumer opcional de DLQ loga e ACKa, mas sem reprocessamento automático
- [ ] Segurança avançada — Sprint 06
- [ ] Performance sob carga — Sprint 06

## Próximo Sprint

**Sprint 06 — Security + Performance (Semanas 11–12)**
