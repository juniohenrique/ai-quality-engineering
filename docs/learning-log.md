# Learning log

## Sprint 01

### Issues #1 e #2: fluxo de trabalho

- Automatizar a criacao de branches e a integracao reduz passos manuais e
  mantem o fluxo repetivel.
- Regras de merge e quality gates precisam estar versionadas junto do projeto.

### Issue #3: separacao de responsabilidades

- Controllers, services e repositories devem ter responsabilidades distintas
  para que regras de negocio possam ser testadas sem depender de HTTP ou banco.
- A composicao das dependencias no ponto de entrada torna explicito o grafo da
  aplicacao e facilita substituir implementacoes em testes.

### Issues #4 a #6: dominio e health check

- Invariantes como normalizacao de e-mail e validacao de campos pertencem ao
  dominio, nao ao controller.
- Um health check deve distinguir a disponibilidade da aplicacao da
  disponibilidade de suas dependencias, retornando `503` quando o banco nao
  esta disponivel.

### Issues #7 a #9: API de usuarios

- Contratos de repository permitem evoluir a persistencia sem alterar o
  service.
- Respostas HTTP devem refletir o resultado da operacao: `201` para criacao,
  `200` para leitura e atualizacao, `204` para remocao e `404` para recurso
  ausente.
- Testes de cada endpoint ajudam a preservar o comportamento enquanto a API
  cresce.

### Issue #10: erros HTTP

- Centralizar o formato de erro evita respostas inconsistentes entre rotas.
- O par `error` e `message` fornece uma categoria estavel para clientes e uma
  explicacao legivel para diagnostico.

### Issue #11: testes e cobertura

- Testes unitarios de services com repositories em memoria isolam regras de
  negocio e permitem cobrir cenarios de sucesso, duplicidade e ausencia.
- Um quality gate deve validar lint, typecheck, build, testes unitarios,
  integracao e cobertura, e nao apenas a execucao feliz da aplicacao.

### Issue #12: testes de integracao

- Testes HTTP complementam testes unitarios ao validar roteamento, parsing de
  corpos, status e integracao entre controller, service e repository.
- Um repository em memoria torna o fluxo de API deterministico e independente
  de um banco de dados nos testes.

## Aprendizado consolidado

A arquitetura evoluiu de um health check simples para uma API de usuarios sem
precisar acoplar as regras de negocio ao transporte. A combinacao de portas,
implementacao em memoria, testes por camada e um teste HTTP de ponta a ponta
mantem o ciclo de feedback rapido e deixa uma futura troca de persistencia
localizada nos repositories.
