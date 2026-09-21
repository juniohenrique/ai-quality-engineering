# Sprint Retrospective — Sprint 01

**Data:** 2025-09-XX
**Releases:** v0.1.0, v0.1.1

## KEEP ✅

- **Docker Compose desde o primeiro commit** — evita "funciona na minha máquina"
- **CI configurado antes de qualquer feature** — feedback rápido desde o dia 1
- **Snippets do Copilot + workflow de branches** — fluxo repetível
- **Rulesets bloqueando merge sem review** — disciplina forçada
- **Testes junto com a feature** — nunca ficou dívida técnica
- **Documentação em paralelo** — ADR-001 escrito no momento da decisão

## PROBLEM ❌

- **Include do Vitest quebrou várias vezes** — descoberta de arquivos `.spec.ts` só funcionou no Sprint 3
- **Flakiness em teste de integração** — server demorava mais que o timeout em CI
- **Confusão inicial com rulesets** — várias tentativas até acertar
- **Duplicação de issues** — S02-16 a S02-18 foram criadas 2x (CSV + UI)
- **Push direto tentado em `develop`** — bloqueado pelo ruleset (não percebi)
- **Squash merge em release** — aprendi na dor que releases precisam de merge commit

## CHANGE 🔄

- **Sempre verificar que os testes novos aparecem na lista do `npm test`** — se não aparecem, não estão rodando
- **Rodar a suite 3x antes de fechar sprint** — detectar flaky cedo
- **Não duplicar issues** — usar só uma fonte de criação (CSV ou UI)
- **Ler rulesets antes de tentar push direto** — sempre via PR
- **Merge commit em release, sempre** — usar `./scripts/merge.sh <PR> release`
- **Teste de integração com timeout mais generoso** — CI é mais lento que local

## LEARNING 📚

### Engenharia
- Programar para contratos (interfaces) permite evoluir sem quebrar
- Fail-fast com env vars evita bugs sutis
- Docker Compose é a forma mais barata de garantir reprodutibilidade

### Testes
- Testes unitários com mocks isolam regras de negócio
- Testes de integração com banco real pegam bugs que mocks nunca pegariam
- Isolamento entre testes (reset de banco) é pré-requisito para sustentabilidade

### Ferramentas
- `gh` CLI automatiza muito do que o GitHub não faz nativamente
- Rulesets são a única forma de forçar PR
- Vitest strict mode + `noUncheckedIndexedAccess` = mais segurança, mais trabalho

## EVIDENCE 🎯

- `src/controllers/`, `src/services/`, `src/repositories/` — arquitetura em camadas
- `src/db/client.ts` — pool PostgreSQL com retry
- `migrations/` — schema versionado
- `tests/unit/user.service.test.ts` — cobertura > 80%
- `tests/integration/users.test.ts` — todos os endpoints
- `docs/architecture.md` — ADR-001
- `.github/SCOPES.md` — glossário de scopes
- `.github/workflows/ci.yml` — quality gate funcional
