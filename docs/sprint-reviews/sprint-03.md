# Sprint Review — Sprint 03

**Período:** Semanas 5–6
**Status:** ✅ Concluído
**Release:** v0.3.0
**Data:** 2026-09-21

## Objetivo do Sprint

Sair de testes baseados apenas em exemplos. Introduzir Contract Testing
(entre serviços) e Property-Based Testing (invariantes + geração automática).

## Técnica

### Construído

**Contract Testing (Pact)**
- S03-01: Pact instalado e configurado
- S03-02: Consumer contract para `GET /users/:id`
- S03-03: Provider verification
- S03-04: Job `contract` no CI
- S03-05: Breaking change proposital (meta-teste)
- S03-06: Documentação da estratégia

**Property-Based Testing (fast-check)**
- S03-07: fast-check instalado
- S03-08: Arbitrary de User
- S03-09: Property para sorting
- S03-10: Property para pagination
- S03-11: Property para validation
- S03-12: Shrinking investigado e documentado
- S03-13: Bug proposital (meta-teste de detecção)

### O que quebrou

- `vitest.config.ts` não cobria `.spec.ts` — pagination e validation só rodaram no CI na S03-13
- `vitest.config.ts` não excluía `tests/e2e/` — Playwright conflitou com Vitest
- Teste de integração do server estava flaky — timeout curto em CI

### Decisões tomadas

- PactFlow free tier como Pact Broker
- Property tests **complementam** (não substituem) testes de exemplo
- Experimentos didáticos em `.skip` (não quebram CI)
- Bug proposital **nunca** é commitado — só documentação

## Qualidade

### Riscos cobertos

- [x] Breaking changes entre serviços detectadas antes do merge
- [x] Invariantes validadas por property tests
- [x] Contraexemplo mínimo gerado por shrinking
- [x] Bug sutil detectado por propriedade (prova de eficácia)

### Riscos descobertos

- [ ] Mutation score real — Sprint 04
- [ ] Concorrência e race conditions — Sprint 04
- [ ] Performance sob carga — Sprint 06
- [ ] Segurança avançada — Sprint 06

## Engenharia

- **Duplicação:** mínima
- **Acoplamento:** baixo — propriedades isoladas
- **Testabilidade:** ✅ contract + property + shrinking documentados
- **Pipeline:** ✅ confiável após fix do Vitest

## Aprendizado

### O que ficou claro
- Contract testing pega breaking changes em segundos, não em minutos
- Property-based testing muda a forma de pensar: invariantes > exemplos
- Shrinking transforma um bug de "1000 elementos" em "`[1, 0]`"
- Meta-testes (breaking change + bug proposital) provam que a ferramenta funciona

### O que ainda não consigo explicar bem
- Quando usar contract testing vs. E2E (limite real)
- Como o fast-check decide qual estratégia de shrinking usar

## Próximo Sprint

**Sprint 04 — Mutation + Concurrency (Semanas 7–8)**
