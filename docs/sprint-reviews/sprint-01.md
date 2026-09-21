# Sprint Review — Sprint 01

**Período:** Semanas 1–2
**Status:** ✅ Concluído
**Releases:** v0.1.0 (base) + v0.1.1 (PostgreSQL)
**Data:** 2025-09-XX

## Objetivo do Sprint

Transformar a aplicação de exemplo em um backend com arquitetura testável, cobrindo desde o bootstrap até persistência real com PostgreSQL.

## Técnica

### Construído

**Fundação de engenharia**
- Bootstrap TypeScript 5.3 + Node 20
- ESLint + Prettier + Vitest
- Docker Compose com app + PostgreSQL
- CI com quality gate (lint, unit, integration, build)

**API de usuários**
- `GET /users`, `GET /users/:id`
- `POST /users`, `PUT /users/:id`, `DELETE /users/:id`
- Arquitetura Controller/Service/Repository
- Error handler padronizado (`{ error, message }`)

**Testes**
- Testes unitários do UserService (cobertura > 80%)
- Testes de integração de todos os endpoints
- Testes de cobertura configurados (V8)

**Persistência real**
- Cliente PostgreSQL com pool e env vars
- Schema e migrations da tabela `users`
- Migração do `UserRepository` in-memory → PostgreSQL
- Testes de integração contra banco real
- Database reset entre testes (`TRUNCATE CASCADE`)

**Documentação**
- README com setup + arquitetura
- `docs/architecture.md` com ADR-001 (camadas)
- `.github/SCOPES.md` (glossário de scopes)
- Configs compartilhadas do VS Code (snippets, settings)

### O que quebrou

- TypeScript strict mode reclamou de acesso a índices em alguns pontos
- Include do Vitest precisou ser ajustado várias vezes (`.test.ts` + `.spec.ts`)
- Teste de integração do server teve flakiness pontual
- Configuração de rulesets no GitHub exigiu ajustes

### Decisões tomadas

- **Node.js + TypeScript** (ADR-001) — ecossistema e tipagem forte
- **Docker Compose** desde o início — reprodutibilidade
- **Vitest** em vez de Jest — mais rápido, ESM nativo
- **PostgreSQL** em vez de SQLite — mais próximo de produção
- **Estrutura em camadas** desde o primeiro commit — testabilidade

## Qualidade

### Riscos cobertos

- [x] Regras de negócio isoladas em testes unitários
- [x] Integração HTTP validada por testes de ponta a ponta
- [x] Persistência testada contra banco real
- [x] Erros HTTP padronizados e testados
- [x] Quality gate bloqueando regressões

### Riscos descobertos

- [ ] Performance sob carga (Sprint 06)
- [ ] Segurança (autenticação, IDOR, rate limit) — Sprint 06
- [ ] Observabilidade — Sprint 07
- [ ] Contract testing entre serviços — Sprint 03

## Engenharia

- **Duplicação:** mínima — camadas bem separadas
- **Acoplamento:** baixo — interfaces (repository, service)
- **Testabilidade:** ✅ alta — DI em uso
- **Pipeline:** ✅ confiável

## Aprendizado

### O que ficou claro
- Programar para interfaces permite trocar in-memory → PostgreSQL sem quebrar nada
- Test Data Engineering começa com isolamento de banco
- Fail-fast com env vars evita bugs sutis em produção

### O que ainda não consigo explicar bem
- Diferença entre `strict` e `noUncheckedIndexedAccess` (aprendi na prática)
- Quando usar `docker compose` vs. rodar local

## Próximo Sprint

**Sprint 02 — Test Architecture + Playwright (Semanas 3–4)**
