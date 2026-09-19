# ADR 0001: Arquitetura em camadas

- Status: Aceita
- Data: 2026-09-14
- Contexto: Issues #1 a #12

## Contexto

A aplicacao precisava evoluir de um health check para uma API de usuarios com
regras de negocio, persistencia substituivel e testes em diferentes niveis.
Colocar essas responsabilidades no servidor HTTP dificultaria testar as regras
e trocar a persistencia.

## Decisao

Adotar uma arquitetura em camadas com as seguintes responsabilidades:

- `domain`: entidades e invariantes;
- `services`: regras de negocio e orquestracao;
- `repositories`: portas e implementacoes de persistencia;
- `controllers`: adaptacao entre HTTP e services;
- `http`: formatos compartilhados de resposta HTTP;
- `server.ts`: composicao das dependencias e roteamento.

O dominio de usuarios usa `InMemoryUserRepository` nesta fase. O PostgreSQL e
usado pelo health check por meio de `HealthRepository`.

## Consequencias

### Positivas

- Regras de negocio podem ser testadas sem servidor ou banco.
- Controllers ficam focados em protocolo HTTP.
- Repositories podem ser substituidos sem alterar o service.
- Testes de integracao podem validar o fluxo completo com estado em memoria.

### Trade-offs

- A estrutura adiciona interfaces e arquivos para um projeto pequeno.
- O roteamento ainda esta concentrado em `server.ts` e pode exigir uma camada
  propria quando o numero de recursos crescer.
- A persistencia de usuarios em memoria nao e adequada para producao com mais
  de uma instancia ou reinicio do processo.

## Alternativas consideradas

- **Tudo no servidor HTTP:** rejeitada por misturar transporte, regras e dados.
- **Acesso direto ao PostgreSQL pelo service:** rejeitada por acoplar regras de
  negocio a uma tecnologia de persistencia e dificultar testes.
- **Banco real nos testes de todos os cenarios:** rejeitada nesta fase por
  aumentar custo e instabilidade sem necessidade para as regras de usuarios.
