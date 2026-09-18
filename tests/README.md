# Estrutura de testes

As suítes são organizadas por tipo de teste:

- `unit/`: testa unidades isoladas, agrupadas por camada em subdiretórios.
- `integration/`: testa a integração entre componentes e o fluxo HTTP.
- `e2e/`: testa a aplicação completa por meio de seus pontos de entrada externos.

Os testes unitários existentes foram movidos para `unit/` e o teste de API foi
movido para `integration/`. Novos testes devem ser criados no diretório
correspondente.

Os comandos disponíveis são:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
