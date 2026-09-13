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

Para executar a aplicacao diretamente, defina `DATABASE_URL` quando quiser
usar uma conexao diferente da padrao e inicie o servidor:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/quality npm start
```

O servidor usa a porta `3000` por padrao. A porta pode ser alterada com a
variavel `PORT`.

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

O endpoint `/users` retorna a lista de usuarios cadastrados em JSON. Nesta
versao, os usuarios sao mantidos em memoria enquanto a aplicacao esta em
execucao.
O endpoint `/users/:id` retorna o usuario encontrado ou HTTP `404` quando o ID
nao existe.
O endpoint `POST /users` cria um usuario e retorna HTTP `201`. Payloads
invalidos retornam HTTP `400`.
O endpoint `PUT /users/:id` atualiza um usuario existente e retorna HTTP `200`.
Quando o ID nao existe, retorna HTTP `404`.
O endpoint `DELETE /users/:id` remove um usuario e retorna HTTP `204`. Quando o
ID nao existe, retorna HTTP `404`.

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

## Arquitetura

O projeto separa responsabilidades por camada:

- `src/controllers`: adapta requisicoes HTTP para os servicos.
- `src/services`: concentra regras de negocio e orquestra repositorios.
- `src/repositories`: define contratos e implementa acesso a dados.
- `src/domain`: contem entidades e suas invariantes.

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
- `src/services/user.service.ts`: criacao e busca de usuarios.

A entidade remove espacos externos, normaliza o e-mail para minusculas e
valida `id`, `email` e `name`. O servico gera o ID com `randomUUID`, impede
duplicidade de e-mail e delega a persistencia ao repositorio. O endpoint
`GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id` e
`DELETE /users/:id` usam um repositorio em memoria.

## Testes e qualidade

Execute os comandos individualmente ou em conjunto:

```bash
npm test
npm run build
npm run lint
npm run format
```

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

## Estrutura

```text
src/
	controllers/
		health.controller.ts
	domain/
		user.ts
		user.test.ts
	repositories/
		health.repository.ts
		user.repository.ts
	services/
		health.service.ts
		user.service.ts
		user.service.test.ts
	index.ts
	index.test.ts
	server.ts
```
