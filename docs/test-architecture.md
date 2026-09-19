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
