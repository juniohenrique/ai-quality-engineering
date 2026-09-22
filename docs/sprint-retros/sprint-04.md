# Sprint Retrospective — Sprint 04

**Data:** 2026-09-XX
**Release:** v0.4.0

## KEEP ✅

- Mutation testing revelando fraquezas reais
- Constraint UNIQUE como defesa primária
- Meta-teste de race condition (S04-11)
- 100 requests simultâneos como teste padrão
- Deferral consciente de CI integration (S04-05)

## PROBLEM ❌

- Prompt do Cline para S04-06 sem verificação de lint → CI quebrou
- `any` apareceu em repositórios (não é padrão do projeto)
- Prompts longos demais fazem o Cline entrar em loop

## CHANGE 🔄

- Sempre incluir `npm run lint` + `typecheck` + `build` no prompt do Cline
- Prompts curtos (< 500 tokens) com checklist mínimo
- Reportar "Pronto" em vez de template gigante

## LEARNING 📚

- Coverage alto ≠ testes fortes (mutation score prova)
- Mutantes equivalentes existem e não valem esforço
- Idempotência em concorrência é sobre atomicidade, não check prévio
- Constraint no banco > check no código
- Race conditions só aparecem sob concorrência real

## EVIDENCE 🎯

- `stryker.config.json`
- `docs/mutation-report.md`
- `src/domain/payment.ts`
- `src/services/payment.service.ts`
- `tests/integration/payments.idempotency.test.ts`
- `tests/integration/payments.concurrency.test.ts`
- `docs/race-conditions.md`
