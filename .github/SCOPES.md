# Scopes Permitidos — Conventional Commits

Este arquivo define os **scopes oficiais** usados nos commits deste projeto.
Todo commit deve seguir o formato:

```
<tipo>(<scope>): <descrição curta> [SXX-YY]
```

O `scope` deve ser **um dos listados abaixo**. Não invente scopes novos sem
antes atualizar este arquivo.

---

## 🎯 Como escolher o scope

Ordem de prioridade ao decidir:

1. **Domínio de negócio** (quando a mudança é claramente de um domínio)
   → `users`, `payments`, `queue`
2. **Camada técnica** (quando cruza domínios ou é infra)
   → `api`, `tests`, `ci`, `config`
3. **Preocupação de qualidade** (quando é sobre uma qualidade específica)
   → `security`, `perf`, `observability`
4. **IA** (Sprint 09+)
   → `ai`
5. **Documentação** (quando é só doc)
   → `docs`

Se duas opções se aplicam, prefira a **mais específica** (domínio > técnico > qualidade).

---

## 📋 Os 12 Scopes

### Domínio de negócio

#### `users`

**O que cobre:** Tudo relacionado ao domínio de usuários — entidade, repositório,
serviço, controller, rotas e testes específicos de usuário.

**Onde aparece:**
- `src/domain/user*`
- `src/controllers/user*`
- `src/services/user*`
- `src/repositories/user*`
- `tests/**/user*`

**Exemplos:**
```
feat(users): implementa GET /users [S01-05]
feat(users): adiciona validação de email no UserService [S01-04]
test(users): adiciona teste unitário do UserService [S01-11]
```

**Não usar quando:** a mudança afeta vários domínios → use `api` ou `db`.

---

#### `payments`

**O que cobre:** Domínio de pagamentos — entidade Payment, `POST /payments`,
idempotência, concorrência.

**Onde aparece:**
- `src/domain/payment*`
- `src/controllers/payment*`
- `src/services/payment*`
- `tests/**/payment*`

**Exemplos:**
```
feat(payments): implementa POST /payments [S04-07]
feat(payments): adiciona idempotency key [S04-08]
test(payments): adiciona teste concorrente [S04-10]
```

---

#### `queue`

**O que cobre:** Mensageria — producer, consumer, retry, DLQ, correlation ID.

**Onde aparece:**
- `src/queue/**`
- `docker-compose.yml` (serviço RabbitMQ)
- `tests/**/queue*`

**Exemplos:**
```
feat(queue): adiciona producer de mensagens [S05-02]
feat(queue): implementa retry e DLQ [S05-05, S05-06]
test(queue): adiciona teste de mensagem duplicada [S05-07]
```

---

### Camadas técnicas

#### `api`

**O que cobre:** Servidor HTTP, rotas, middlewares, error handler global,
serialização de request/response.

**Onde aparece:**
- `src/index.ts`
- `src/routes/**`
- `src/middlewares/**`
- `src/controllers/**` (quando é infra, não domínio)

**Exemplos:**
```
feat(api): adiciona servidor HTTP com GET /health [S01-03]
feat(api): adiciona error handler global [S01-10]
refactor(api): extrai middleware de validação [S01-07]
```

**Não usar quando:** a mudança é claramente de um domínio → use o scope do domínio.

---

#### `tests`

**O que cobre:** Infraestrutura de testes — factories, fixtures, helpers, setup
de banco, test runner, configuração geral de testes.

**Onde aparece:**
- `tests/factories/**`
- `tests/fixtures/**`
- `tests/setup/**`
- `vitest.config.*`
- `playwright.config.*`

**Exemplos:**
```
test(tests): adiciona UserFactory [S02-02]
test(tests): cria estrutura de diretórios [S02-01]
chore(tests): configura database reset entre testes [S02-07]
```

**Não usar quando:** o teste é específico de um domínio → use o scope do domínio
(ex: `test(users)`, `test(payments)`).

---

### Preocupações de qualidade

#### `security`

**O que cobre:** Testes de segurança (OWASP API Top 10 + OWASP LLM Top 10) —
autenticação, autorização, IDOR, rate limiting, prompt injection, data leakage.

**Onde aparece:**
- `tests/security/**`
- `security/**`
- `docs/threat-model.md`

**Exemplos:**
```
test(security): adiciona authentication test suite [S06-01]
test(security): adiciona teste de IDOR em GET /users/:id [S06-03]
test(security): adiciona prompt injection test [S11-02]
docs(security): documenta threat model de LLM [S11-11]
```

---

#### `perf`

**O que cobre:** Performance — k6, baselines, load/stress/spike, análise de
p95/p99, thresholds, gargalos.

**Onde aparece:**
- `tests/performance/**`
- `reports/performance.md`

**Exemplos:**
```
feat(perf): configura k6 e baseline test [S06-07, S06-08]
feat(perf): adiciona stress test [S06-10]
docs(perf): documenta bottleneck de p95 [S06-12]
```

---

#### `observability`

**O que cobre:** OpenTelemetry, traces, spans, métricas, logs estruturados,
correlation ID, dashboards.

**Onde aparece:**
- `src/observability/**`
- `observability/**` (configs de Grafana, Prometheus)
- `tests/observability/**`

**Exemplos:**
```
feat(observability): configura OpenTelemetry [S07-01]
feat(observability): instrumenta HTTP com spans [S07-02]
feat(observability): adiciona correlation ID aos logs [S07-05]
```

---

### Infraestrutura

#### `ci`

**O que cobre:** GitHub Actions, workflows, quality gates, build, Docker
(Dockerfile, docker-compose), dependências de build.

**Onde aparece:**
- `.github/workflows/**`
- `Dockerfile`
- `docker-compose.yml`
- `package.json` (scripts, devDependencies)
- `Makefile`

**Exemplos:**
```
chore(ci): adiciona workflow de CI [S01-01]
feat(ci): adiciona quality gate [S07-13]
chore(ci): atualiza Dockerfile para Node 20 [S01-02]
chore(ci): ajusta cache do npm no workflow [S07-08]
```

**Nota:** Docker entra aqui porque é usado primariamente para CI/CD e
reprodutibilidade local.

---

#### `config`

**O que cobre:** Configuração do projeto que não é CI — TypeScript, ESLint,
Prettier, tsconfig, gitignore, env vars, estrutura de pastas.

**Onde aparece:**
- `tsconfig.json`
- `.eslintrc.*`
- `.prettierrc.*`
- `.gitignore`
- `.env.example`
- `src/**/index.ts` (barrels, quando é só export)

**Exemplos:**
```
chore(config): configura TypeScript e tsconfig [S01-01]
chore(config): adiciona ESLint e Prettier [S01-02]
chore(config): adiciona .gitignore do projeto [S01-01]
```

---

#### `docs`

**O que cobre:** Documentação — README, architecture.md, test-strategy.md,
learning-log.md, ADRs, CONTRIBUTING, este arquivo de SCOPES.

**Onde aparece:**
- `README.md`
- `docs/**`
- `CONTRIBUTING.md`
- `.github/SCOPES.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/**`

**Exemplos:**
```
docs(docs): adiciona README inicial [S01-13]
docs(docs): cria architecture.md com trade-offs [S01-13]
docs(docs): documenta estratégia de contract testing [S03-06]
```

---

### IA (Sprint 09+)

#### `ai`

**O que cobre:** Guarda-chuva para tudo de IA — LLM, evals, RAG, agents, MCP,
red teaming de IA, structured output.

**Onde aparece:**
- `src/ai/**`
- `ai/**`
- `tests/ai/**`
- `evals/**`
- `datasets/**`

**Exemplos:**
```
feat(ai): adiciona endpoint POST /ai/answer [S09-05]
feat(ai): configura Promptfoo para evals [S10-01]
feat(ai): implementa retrieval no RAG [S10-13]
feat(ai): adiciona get_user tool [S11-04]
feat(ai): implementa MCP tool server [S12-02]
```

**Por que um único scope:** a fase de IA tem muitas sub-áreas (LLM, RAG, Agents,
MCP). Se cada uma tivesse um scope, ficaria difícil de lembrar. Use `ai` como
guarda-chuva e detalhe no corpo do commit.

---

## 🚫 Anti-patterns

### ❌ Não use scopes que não estão aqui

```
feat(user-service): ...           → use users
fix(http-server): ...             → use api
chore(deps): ...                  → use ci
test(e2e): ...                    → use tests (se infra) ou domínio (se específico)
```

### ❌ Não use scope em commits que não precisam

Commits que **não têm escopo específico** podem omitir (raro):

```
chore: bump version para 0.2.0
docs: corrige link quebrado
```

Mas na prática, quase todo commit do projeto terá um scope.

### ❌ Não invente scope novo sem atualizar este arquivo

Se você precisa de um scope que não existe, primeiro:

1. Abra uma issue `docs: adicionar scope <nome> ao SCOPES.md`
2. Atualize este arquivo
3. Só depois use o scope nos commits

---

## 📊 Mapeamento rápido — Issue → Scope

| Issue | Tipo | Scope |
|---|---|---|
| S01-01 Bootstrap TS | `chore` | `config` |
| S01-02 Docker | `chore` | `ci` |
| S01-03 Servidor HTTP | `feat` | `api` |
| S01-04 a S01-12 (users) | `feat`/`test` | `users` |
| S01-13 README | `docs` | `docs` |
| S02-01 a S02-07 (infra test) | `test`/`chore` | `tests` |
| S02-08 a S02-14 (E2E) | `test` | `tests` (infra) ou `users` (fluxo) |
| S03-01 a S03-06 (Pact) | `test` | `tests` |
| S03-07 a S03-13 (fast-check) | `test` | `tests` |
| S04-01 a S04-05 (Stryker) | `test` | `tests` |
| S04-06 a S04-11 (payments) | `feat`/`test` | `payments` |
| S05-01 a S05-12 (queue) | `feat`/`test` | `queue` |
| S06-01 a S06-06 (security) | `test` | `security` |
| S06-07 a S06-12 (k6) | `feat` | `perf` |
| S07-01 a S07-06 (OTel) | `feat` | `observability` |
| S07-07 a S07-13 (CI) | `chore`/`feat` | `ci` |
| S08-01 a S08-10 (strategy) | `docs` | `docs` |
| S09-01 a S09-14 (LLM) | `feat`/`test` | `ai` |
| S10-01 a S10-18 (evals + RAG) | `feat`/`test` | `ai` |
| S11-01 a S11-11 (security + agents) | `feat`/`test` | `ai` |
| S12-01 a S12-08 (MCP + gate) | `feat` | `ai` |

---

## ✅ Checklist antes de commitar

- [ ] O tipo está correto? (`feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `perf`, `security`, `ci`, `build`)
- [ ] O scope está nesta lista?
- [ ] A descrição é imperativa e curta (≤ 72 chars)?
- [ ] O ID `[SXX-YY]` está presente?
- [ ] O corpo tem 3-5 bullets do que foi feito?
- [ ] O `Refs: #N` (ou `Closes: #N`) está no final?

---

## 🔄 Histórico de mudanças

| Data | Mudança | Motivo |
|---|---|---|
| (inicial) | Criação com 12 scopes | Definição inicial do projeto |