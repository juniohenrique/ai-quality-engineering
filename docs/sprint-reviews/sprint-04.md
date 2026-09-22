# Sprint Review — Sprint 04

**Período:** Semanas 7–8
**Status:** ✅ Concluído
**Release:** v0.4.0
**Data:** 2026-09-XX

## Objetivo do Sprint

Testar a qualidade dos próprios testes (mutation testing) e validar
comportamento sob concorrência (idempotência real).

## Técnica

### Construído

**Mutation Testing (Stryker)**
- S04-01: Stryker instalado e configurado
- S04-02: Mutation baseline
- S04-03: Análise de surviving mutants
- S04-04: Testes para matar mutantes relevantes
- S04-05: Documentação de mutation score

**Payment + Concurrency**
- S04-06: Payment domain (entidade, repository, service)
- S04-07: POST /payments
- S04-08: Idempotency key
- S04-09: Teste de repetição
- S04-10: Teste concorrente (100 requests)
- S04-11: Race condition proposital (meta-teste)

### O que quebrou

- Lint pegou `any` em repositórios de pagamento (S04-06)
- Config do Stryker exigiu ajuste (cobertura parcial)
- Testes concorrentes exigem reset de banco entre execuções

### Decisões tomadas

- Stryker roda local, não no CI (documentado em S04-05)
- Constraint UNIQUE no banco é a defesa principal de idempotência
- 100 requests simultâneos como teste padrão de concorrência

## Qualidade

### Riscos cobertos

- [x] Testes fracos detectados via mutation score
- [x] Duplicação de cobrança sob concorrência bloqueada
- [x] Race condition demonstrada e prevenida
- [x] Idempotência validada em 100 requests simultâneos

### Riscos descobertos

- [ ] Sistemas distribuídos (filas) — Sprint 05
- [ ] Segurança avançada — Sprint 06
- [ ] Performance sob carga — Sprint 06

## Próximo Sprint

**Sprint 05 — Distributed Systems (Semanas 9–10)**
