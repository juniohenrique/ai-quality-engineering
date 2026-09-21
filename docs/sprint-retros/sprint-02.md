# Sprint Retrospective — Sprint 02

**Data:** 2025-09-XX
**Release:** v0.2.0

## KEEP ✅

- **Playwright desde o início dos E2E** — paralelismo + trace viewer desde o dia 1
- **Factories determinísticas** — zero faker random, zero surpresas
- **API Client reduzindo duplicação** — testes mais expressivos
- **`data-testid` como contrato** — CSS classes mudam, testid não
- **Documentação em paralelo** — `test-architecture.md` cobre pirâmide + trade-offs
- **Isolamento entre testes** — cada teste cria seu próprio estado

## PROBLEM ❌

- **Trace não configurado antes do primeiro E2E** — debug ficou cego por tempo demais
- **Flakiness inicial nos E2E** — timing + dados compartilhados
- **Estrutura inicial de testes colidia com testes em `src/`** — migração gradual demorou
- **Config do Vitest não pegava `.spec.ts`** — descoberta só no Sprint 3
- **Issues duplicadas** (S02-16 a S02-18 criadas 2x)
- **Setup do Playwright levou mais tempo que o previsto** — browsers no CI

## CHANGE 🔄

- **Configurar trace/screenshot no dia 1 do E2E** — não depois
- **Verificar que os testes aparecem na lista de execução** — não confiar cegamente
- **Uma fonte de criação de issues** — CSV **ou** UI, nunca os dois
- **Rodar a suite 3x antes de fechar sprint** — detectar flaky cedo
- **Playwright com `webServer` configurado** — evita subir manual
- **`data-testid` desde o primeiro componente HTML**

## LEARNING 📚

### Test Architecture
- Pirâmide de testes aplicada: 60% unit, 30% integration, 10% E2E
- E2E é caro — cobrir só caminhos críticos
- Test data engineering é uma disciplina, não um helper

### Playwright
- Trace viewer (`npx playwright show-trace`) é o melhor debugger de E2E
- Screenshot em falha é o primeiro artefato a olhar
- `data-testid` é mais estável que CSS/XPath
- Retries em CI fazem sentido, em local não

### Factories
- Determinismo > faker random
- Overrides parciais (`create({ name: 'X' })`) tornam testes legíveis
- A mesma factory serve unit, integration e E2E

## EVIDENCE 🎯

- `tests/factories/user.factory.ts` — UserFactory
- `tests/factories/payment.factory.ts` — PaymentFactory
- `tests/factories/transaction.factory.ts` — TransactionFactory
- `tests/clients/user-api.client.ts` — API Client
- `tests/e2e/login.spec.ts` — E2E de login com trace
- `tests/e2e/users-create.spec.ts` — E2E de criação
- `public/login.html`, `public/users.html` — frontend mínimo
- `playwright.config.ts` — trace + screenshot + HTML report
- `docs/test-architecture.md` — pirâmide + trade-offs
