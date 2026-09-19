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
