# AI Quality Engineering

Base TypeScript para os exercicios de engenharia de qualidade, com uma
arquitetura organizada em controller, service, repository e domain.

## Requisitos

- Node.js 22 ou superior
- npm
- Docker e Docker Compose para executar a aplicacao com PostgreSQL

## Configuracao local

Instale as dependencias:

```bash
npm install
```

Para executar a aplicacao diretamente, copie `.env.example` para `.env` e
ajuste as variaveis quando necessario:

```bash
cp .env.example .env
npm start
```

`DATABASE_URL` e obrigatoria e `PORT` usa `3000` por padrao. A aplicacao tenta
conectar ao PostgreSQL antes de iniciar o servidor e falha rapidamente se a
configuracao obrigatoria estiver ausente.

O servidor usa a porta `3000` por padrao. A porta pode ser alterada com a
variavel `PORT`.

### Migrations

As migrations SQL ficam versionadas em `migrations/`. Para criar ou atualizar
o schema local, execute:

```bash
npm run migrate:up
```

Para desfazer a migration mais recente ou criar uma nova migration:

```bash
npm run migrate:down
npm run migrate:create -- add_orders_table
```

O Docker Compose executa `migrate:up` automaticamente antes de iniciar a
aplicacao.

## Docker Compose

O Compose inicia a aplicacao e um PostgreSQL 16 com health check:

```bash
docker compose up --build
```

Verifique a aplicacao:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/users
curl http://localhost:3000/users/<id>
curl -X POST http://localhost:3000/users \
	-H 'content-type: application/json' \
	-d '{"email":"ada@example.com","name":"Ada Lovelace"}'
curl -X PUT http://localhost:3000/users/<id> \
	-H 'content-type: application/json' \
	-d '{"email":"ada.updated@example.com","name":"Ada Byron Lovelace"}'
curl -X DELETE http://localhost:3000/users/<id>
```

O endpoint `/users` retorna a lista de usuarios cadastrados em JSON. Em
producao, os usuarios sao persistidos no PostgreSQL; os testes HTTP podem usar
o repositorio em memoria com `USER_REPOSITORY=memory`.
O endpoint `/users/:id` retorna o usuario encontrado ou HTTP `404` quando o ID
nao existe.
O endpoint `POST /users` cria um usuario e retorna HTTP `201`. Payloads
invalidos retornam HTTP `400`.
O endpoint `PUT /users/:id` atualiza um usuario existente e retorna HTTP `200`.
Quando o ID nao existe, retorna HTTP `404`.
O endpoint `DELETE /users/:id` remove um usuario e retorna HTTP `204`. Quando o
ID nao existe, retorna HTTP `404`.

## Frontend minimo

O backend serve paginas HTML vanilla em `/`, `/login`, `/users` e `/user-form`.
A pagina de usuarios usa `fetch` para listar, editar e excluir usuarios, e a
pagina de formulario permite criar ou editar registros. A pagina de login
oferece um fluxo simulado para os testes E2E. Os controles interativos
possuem atributos `data-testid` estaveis.

As respostas de erro seguem o formato JSON `{ "error": "...", "message": "..." }`.
Por exemplo, uma rota inexistente retorna `{ "error": "not_found", "message":
"Route not found" }`.

O endpoint retorna HTTP `200` e o payload abaixo quando o banco esta
disponivel:

```json
{ "status": "ok", "database": "connected" }
```

Quando a aplicacao nao consegue consultar o banco, retorna HTTP `503` com
`status: "degraded"` e `database: "unavailable"`.

Para evitar conflitos com portas locais, use:

```bash
APP_PORT=3001 DB_PORT=5433 docker compose up --build
```

`APP_PORT` altera a porta exposta da aplicacao e `DB_PORT` altera a porta
exposta do PostgreSQL. Internamente, a aplicacao continua usando a porta
`3000` e o banco continua usando a porta `5432` na rede do Compose.

`RABBITMQ_PORT` altera a porta exposta do AMQP (5672) e
`RABBITMQ_MANAGEMENT_PORT` altera a porta exposta da UI de gerenciamento
(15672). Internamente, o RabbitMQ continua usando as portas `5672` e `15672`
na rede do Compose.

### RabbitMQ

O Compose tambem provisiona um RabbitMQ 3.13 com interface de gerenciamento:

```bash
docker compose up -d rabbitmq
```

A UI de gerenciamento esta disponivel em `http://localhost:15672` com as
credenciais `guest` / `guest` (configuradas via `RABBITMQ_DEFAULT_USER` e
`RABBITMQ_DEFAULT_PASS`). A porta AMQP para clientes de mensagens e `5672`.
O healthcheck usa `rabbitmq-diagnostics ping`.

## Arquitetura

O projeto separa responsabilidades por camada:

- `src/controllers`: adapta requisicoes HTTP para os servicos.
- `src/services`: concentra regras de negocio e orquestra repositorios.
- `src/repositories`: define contratos e implementa acesso a dados.
- `src/domain`: contem entidades e suas invariantes.
- `src/http`: concentra respostas de erro HTTP padronizadas.
- `src/server.ts`: compoe as dependencias e roteia as requisicoes.

Uma descricao detalhada dos componentes e fluxos esta em
[`docs/architecture.md`](docs/architecture.md).

A estrategia de testes, suas camadas, dados, isolamento e fluxos E2E esta em
[`docs/test-architecture.md`](docs/test-architecture.md).

### Health check

O fluxo de `/health` e:

1. `HealthController` recebe a requisicao e define o status HTTP.
2. `HealthService` transforma o resultado da consulta em um `HealthStatus`.
3. `HealthRepository` executa `SELECT 1` no PostgreSQL.

### User domain

O dominio de usuario esta organizado em:

- `src/domain/user.ts`: entidade `User` com `id`, `email` e `name`.
- `src/repositories/user.repository.ts`: contrato `UserRepository` com
  operacoes de listagem, busca e persistencia.
- `src/services/user.service.ts`: regras de criacao, busca, listagem,
  atualizacao e remocao de usuarios.

A entidade remove espacos externos, normaliza o e-mail para minusculas e
valida `id`, `email` e `name`. O servico gera o ID com `randomUUID`, impede
duplicidade de e-mail e delega a persistencia ao repositorio. O endpoint
`GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id` e
`DELETE /users/:id` usam um repositorio em memoria.

## Testes e qualidade

Execute os comandos individualmente ou em conjunto:

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:e2e
npm run test:coverage
npm run build
npm run lint
npm run format
```

O comando `npm run test:coverage` executa toda a suíte com cobertura V8 e
gera relatório no terminal, HTML em `coverage/index.html` e LCOV em
`coverage/lcov.info`. O quality gate exige:

- Lines: 80%
- Statements: 80%
- Functions: 80%
- Branches: 75%

Quando qualquer threshold não é atingido, o Vitest retorna código de erro e o
job de coverage faz o pipeline falhar.

Os testes de integração HTTP ficam em `src/server.integration.test.ts` e
iniciam o servidor com um repositório de usuários em memória. A suíte valida
health check, rotas inexistentes e o ciclo completo de usuários.

### Contract testing

Os consumer contracts usam `@pact-foundation/pact` e ficam em
`tests/contract/`. O contrato de usuário cobre `GET /users/:id`, incluindo
método, path, headers, status e body esperados pelo consumidor. O teste também
gera o arquivo JSON em `pacts/` (diretório versionado no `.gitignore`).

Para a estratégia completa — conceitos de consumer/provider, quando usar e
quando não usar, trade‑offs e o passo a passo para adicionar novos contratos —
consulte [`docs/test-architecture.md`](docs/test-architecture.md#contrato).

Execute os contratos com:

```bash
npm run test:contract
```

A verificação do provider (`test:verify`) roda o `Verifier` do Pact contra o
servidor real em memória. O endpoint `POST /setup` expõe os _provider states_
para o ambiente de verificação, e o Pact Broker é opcional — defina
`PACT_PACT_FILE` com o caminho do arquivo `.json` em `pacts/` para rodar sem
broker (modo CI/local):

```bash
npm run test:verify
# ou, apontando diretamente para o pact local:
PACT_PACT_FILE=pacts/ai-quality-engineering-consumer-ai-quality-engineering-api.json \
DATABASE_URL=postgresql://localhost:1/unavailable npm run test:verify
```

No CI, os jobs `contract` e `provider-verify` da workflow `.github/workflows/ci.yml`
executam esses testes automaticamente em PRs para `develop`.

### Testes E2E

Os testes E2E usam Playwright e validam fluxos completos no browser. O comando
`npm run test:e2e` inicia o servidor automaticamente, executa os testes e gera
relatório HTML em `playwright-report/`. A configuração está em
`playwright.config.ts` e define:

- Base URL: `http://localhost:3000`
- Timeout: 30 segundos por teste
- Retries: 1 em CI, 0 local
- Reporter: HTML + list

O Playwright requer browsers instalados. Execute `npx playwright install` após
adicionar `@playwright/test`.

Os testes sao executados pelo Vitest e ficam ao lado das implementacoes. A
cobertura atual inclui:

- bootstrap e arquitetura de health check;
- criacao e validacao da entidade `User`;
- normalizacao de e-mail e nome;
- prevencao de e-mails duplicados;
- delegacao de busca e persistencia pelo `UserService`.
- listagem de usuarios pelo endpoint `GET /users`.
- busca por ID e resposta `404` pelo endpoint `GET /users/:id`.
- criacao e validacao de usuarios pelo endpoint `POST /users`.
- atualizacao de usuario e resposta `404` pelo endpoint `PUT /users/:id`.
- remocao de usuario e resposta `404` pelo endpoint `DELETE /users/:id`.
- respostas de erro padronizadas com `error` e `message`.
- testes unitarios do `UserService` com cobertura de 100% no arquivo de servico.

### Testes de propriedade

Diferentemente dos testes de exemplo — que validam um caso específico, como
`age = 18` ao buscar usuários —, os testes de propriedade verificam invariantes
para entradas geradas aleatoriamente pelo `fast-check`. O exemplo em
`tests/property/example.test.ts` assegura que `sort(sort(x)) === sort(x)`, só
para validar que o toolchain funciona. O número de execuções é controlado pela
variável `FAST_CHECK_NUM_RUNS` (padrão `10`).

Execute com:

```bash
npm run test:property
```

### Testes de mutação

Os testes de mutação validam a qualidade das suítes de teste ao introduzir
mutações (ou "mutants") no código fonte e verificar se algum teste falha. O
objetivo é garantir que os testes detectem mudanças sutis na lógica, e não
apenas executem o código. A ferramenta usada é o [Stryker](https://stryker-mutator.io/)
via o runner do Vitest.

A configuração está em `stryker.config.json` e cobre todos os arquivos em
`src/**/*.ts`, excluindo arquivos de teste (`*.spec.ts`, `*.test.ts`) e
declarações de tipo (`*.d.ts`).

Execute com:

```bash
npm run test:mutation
```

Ao final, o Stryker:

- imprime um relatório `clear-text` no console;
- gera um relatório HTML em `reports/mutation/` (abra `reports/mutation/index.html`).
- cria um baseline em `docs/mutation-report.md` com score geral e arquivos problemáticos.

Para ver os detalhes do baseline:
- **[Relatório de Mutação (Score Final S04-05)](docs/mutation-report.md)**

    Os artefatos temporários do Stryker ficam em `stryker-tmp/` e já estão
    ignorados pelo `.gitignore`.

Dica: para acelerar em PRs grandes, use o modo incremental:

```bash
npx stryker run --incremental
```

## Estrutura

```text
src/
	controllers/
		health.controller.ts
		user.controller.ts
		user.controller.test.ts
	domain/
		user.ts
		user.test.ts
	http/
		error-response.ts
		error-response.test.ts
	repositories/
		health.repository.ts
		health.repository.test.ts
		in-memory-user.repository.ts
		user.repository.ts
	services/
		health.service.ts
		user.service.ts
		user.service.test.ts
	server.integration.test.ts
	index.ts
	index.test.ts
	server.ts
```

O PostgreSQL é usado pelo health check e é provisionado pelo Docker Compose.
Os usuários continuam sendo mantidos em memória nesta versão.
