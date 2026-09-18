# Estrutura de testes

As suítes são organizadas por tipo de teste:

- `unit/`: testa unidades isoladas, como domínio, services e controllers.
- `integration/`: testa a integração entre componentes e o fluxo HTTP.
- `e2e/`: testa a aplicação completa por meio de seus pontos de entrada externos.

Os testes existentes em `src/` permanecem no lugar durante a migração gradual
para esta estrutura. Novos testes devem ser criados no diretório correspondente.

Os comandos disponíveis são:

- `npm run test:unit`
- `npm run test:integration`
