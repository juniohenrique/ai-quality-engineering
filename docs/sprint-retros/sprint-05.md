# Sprint Retrospective — Sprint 05

**Data:** 2026-09-XX
**Release:** v0.5.0

## KEEP ✅

- RabbitMQ + DLQ desde o início
- Testes de falha (invalid, duplicate, timeout, consumer down)
- Correlation ID end-to-end
- Migração para Zoo Code tranquila

## PROBLEM ❌

- Prompts com títulos trocados (S05-07 a S05-10)
- Branch `feature/S05-09-mensagem-invalida` com nome errado
- Sync PR #251 não propagou versão 0.4.0
- Zoo Code commitou quando não devia

## CHANGE 🔄

- Confirmar títulos reais das issues antes de gerar prompt
- Verificar version sync após cada release
- Prompts explícitos: "NÃO crie commits"

## LEARNING 📚

- DLX + DLQ nativos resolvem perda de mensagem
- Retry com backoff exponencial evita sobrecarga
- ACK/NACK explícitos no consumer
- Correlation ID via header é padrão

## EVIDENCE 🎯

- `docker-compose.yml`
- `src/queue/*.ts`
- `tests/integration/queue/*.test.ts` (9 arquivos)
- `docs/failure-modes.md` (328 linhas)
- `.roo/skills/`
