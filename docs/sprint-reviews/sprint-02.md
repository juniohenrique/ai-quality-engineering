# Sprint Review — Sprint 02

**Período:** Semanas 3–4
**Status:** ✅ Concluído
**Release:** v0.2.0
**Data:** 2025-09-XX

## Objetivo do Sprint

Construir uma arquitetura de testes sustentável + automação E2E com Playwright + frontend mínimo para permitir fluxos reais.

## Técnica

### Construído

**Test Data Engineering**
- `UserFactory` (S02-02)
- `PaymentFactory` (S02-03)
- `TransactionFactory` (S02-04)
- Estrutura de diretórios de testes (unit, integration, e2e) (S02-01)

**API Client**
- `UserApiClient` para abstrair HTTP (S02-05)
- Migração de todos os testes para o client (S02-06)
- Database reset entre testes (S02-07)

**Playwright + E2E**
- Playwright configurado (S02-08)
- E2E de login (S02-09)
- E2E de criação de usuário (S02-10)
- E2E de edição (S02-11)
- E2E de exclusão (S02-12)
- Trace e screenshot em falhas (S02-13)
- HTML report configurado (S02-14)

**Frontend mínimo para E2E**
- HTML + fetch servido pelo backend (S02-16)
- Página de login com `data-testid` (S02-17)
- Páginas de CRUD de usuários (S02-18)

**Documentação**
- `docs/test-architecture.md` (S02-15)

### O que quebrou

- Trace não configurado antes do primeiro E2E — debug ficou manual por um tempo
- Flakiness inicial nos testes E2E (timing + dados)
- Estrutura inicial de testes colidia com testes em `src/`
- Dependência do Playwright com browsers instalados no CI

### Decisões tomadas

- **Frontend vanilla (HTML + fetch)** em vez de framework — simplicidade
- **Test Data Engineering com factories determinísticas** — zero faker random
- **API Client dedicado** — abstração HTTP para testes
- **Playwright** em vez de Cypress — paralelismo nativo, trace viewer melhor
- **`data-testid`** como contrato entre frontend e E2E

## Qualidade

### Riscos cobertos

- [x] Regressões em fluxos críticos (login, CRUD)
- [x] Isolamento entre testes (nada de ordem de execução)
- [x] Duplicação de teste reduzida via API Client
- [x] Debug de E2E via trace viewer

### Riscos descobertos

- [ ] Contract testing entre serviços — Sprint 03
- [ ] Performance sob carga — Sprint 06
- [ ] Segurança — Sprint 06
- [ ] Observabilidade — Sprint 07

## Engenharia

- **Duplicação:** mínima — API Client reduziu muito
- **Acoplamento:** baixo — factories isoladas
- **Testabilidade:** ✅ alta — data-testid + fixtures
- **Pipeline:** ✅ confiável (com trace em falhas)

## Aprendizado

### O que ficou claro
- Test Data Engineering não é sobre criar dados — é sobre criar **padrões**
- Factories determinísticas eliminam uma classe inteira de flaky tests
- API Client reduz duplicação em ~70%
- Playwright trace viewer é o melhor debugger de E2E

### O que ainda não consigo explicar bem
- Quando usar `beforeEach` vs. fixture global
- Diferença entre `webServer` do Playwright e subir manualmente

## Próximo Sprint

**Sprint 03 — Contract + Property Testing (Semanas 5–6)**
