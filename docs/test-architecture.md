# Arquitetura de dados de teste

As factories reutilizáveis ficam em `tests/factories/` e fornecem dados
determinísticos para testes unitários, de integração e E2E.

## TransactionFactory

`TransactionFactory.create()` cria uma transação com valores padrão. Overrides
parciais podem adaptar um cenário específico:

```ts
const transaction = TransactionFactory.create({ amount: 500 });
const transactions = TransactionFactory.createMany(3);
```

`createMany(n)` gera IDs determinísticos distintos para cada item do lote, sem
usar dados aleatórios ou dependência de banco.

## Testes de integração

Os testes de integração usam um banco PostgreSQL separado em
`DATABASE_URL_TEST`. O comando `npm run test:integration` aplica as migrations
e executa os arquivos sem paralelismo entre eles. `resetDatabase()` trunca as
tabelas antes de cada teste para manter o isolamento dos cenários.

## Testes E2E

Os testes E2E usam Playwright para validar fluxos completos no browser. A
configuração em `playwright.config.ts` inclui captura automática de traces e
screenshots em falhas:

- **Trace**: `on-first-retry` — captura trace apenas quando o teste falha e é
  reexecutado
- **Screenshot**: `only-on-failure` — captura screenshot apenas em falhas

### Debugging de falhas

Quando um teste E2E falha, o Playwright gera artefatos em `test-results/`:

```bash
test-results/
  login-chromium/
    trace.zip
    test-failed-1.png
```

Para visualizar o trace interativo com timeline, logs, network e DOM:

```bash
npx playwright show-trace test-results/*/trace.zip
```

O trace viewer mostra cada ação do teste, estado da página, console logs,
network requests e permite inspecionar o DOM em qualquer momento da execução.
