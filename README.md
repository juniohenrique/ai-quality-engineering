# AI Quality Engineering

Base TypeScript do projeto.

## Comandos

```bash
npm install
npm run build
npm run lint
npm run format
npm test
```

## Docker Compose

```bash
docker compose up --build
curl http://localhost:3000/health
```

O endpoint de health check retorna `database: connected` quando a aplicacao
consegue consultar o PostgreSQL.

Para evitar conflito com portas locais, use `APP_PORT` e `DB_PORT`.
