# Learning Log

Registro cronológico de aprendizados por sprint e issue.
Cada entrada responde: o que aprendi, o que implementei, o que quebrei,
o que faria diferente.

---

## Sprint 01 — Engineering Foundation + PostgreSQL

### Issues #1 e #2: fluxo de trabalho

- Automatizar a criação de branches e a integração reduz passos manuais e
  mantém o fluxo repetível.
- Regras de merge e quality gates precisam estar versionadas junto do projeto.
- Workflows de validação (`merge-policy`, `audit`) complementam o que o
  GitHub não permite forçar nativamente (estratégia de merge por origem).

### Issue #3: separação de responsabilidades

- Controllers, services e repositories devem ter responsabilidades distintas
  para que regras de negócio possam ser testadas sem depender de HTTP ou banco.
- A composição das dependências no ponto de entrada torna explícito o grafo da
  aplicação e facilita substituir implementações em testes.

### Issues #4 a #6: domínio e health check

- Invariantes como normalização de e-mail e validação de campos pertencem ao
  domínio, não ao controller.
- Um health check deve distinguir a disponibilidade da aplicação da
  disponibilidade de suas dependências, retornando `503` quando o banco não
  está disponível.

### Issues #7 a #9: API de usuários

- Contratos de repository permitem evoluir a persistência sem alterar o
  service.
- Respostas HTTP devem refletir o resultado da operação: `201` para criação,
  `200` para leitura e atualização, `204` para remoção e `404` para recurso
  ausente.
- Testes de cada endpoint ajudam a preservar o comportamento enquanto a API
  cresce.

### Issue #10: erros HTTP

- Centralizar o formato de erro evita respostas inconsistentes entre rotas.
- O par `error` e `message` fornece uma categoria estável para clientes e uma
  explicação legível para diagnóstico.

### Issue #11: testes e cobertura

- Testes unitários de services com repositories em memória isolam regras de
  negócio e permitem cobrir cenários de sucesso, duplicidade e ausência.
- Um quality gate deve validar lint, typecheck, build, testes unitários,
  integração e cobertura, e não apenas a execução feliz da aplicação.

### Issue #12: testes de integração

- Testes HTTP complementam testes unitários ao validar roteamento, parsing de
  corpos, status e integração entre controller, service e repository.
- Um repository em memória torna o fluxo de API determinístico e independente
  de um banco de dados nos testes.

### Issue #13: documentação da arquitetura

- Documentar arquitetura **enquanto** se implementa é diferente de documentar
  depois — o contexto ainda está fresco e as decisões ficam explícitas.
- ADRs são mais úteis quando escritos no momento da decisão.
- Um diagrama Mermaid no README economiza horas de explicação para novos
  leitores.

### Issue #14: cliente PostgreSQL

- Validar variáveis de ambiente no boot (fail-fast) evita bugs sutis em
  produção.
- Pool de conexões precisa de healthcheck e retry no boot — o banco pode
  não estar pronto quando a app sobe.
- `.env.example` versionado evita onboarding ruim.

### Issue #15: migrations

- Migrations devem ser versionadas no Git — nunca geradas ad-hoc.
- `migrate:up` / `migrate:down` precisam ser idempotentes.
- Rodar migrations automaticamente no `docker compose up` simplifica o dev
  loop.
- Constraints no banco (UNIQUE, NOT NULL) são a primeira linha de defesa.

### Issue #16: migração do UserRepository

- Trocar implementação (in-memory → PostgreSQL) sem mudar a interface é o
  valor real de programar para contratos.
- Mapear erros do banco para erros de domínio (`USER_NOT_FOUND`,
  `EMAIL_ALREADY_EXISTS`) isola o resto da aplicação do driver.
- InMemoryRepository continua útil para testes unitários rápidos.

### Issue #17: testes de integração contra banco real

- Testar contra banco real pega bugs que mocks nunca pegariam (constraints,
  tipos, transações).
- `resetDatabase()` com `TRUNCATE CASCADE` é mais rápido que recriar schema.
- `DATABASE_URL_TEST` separado evita destruir dados de dev.
- Sem isolamento entre testes, o CI vira cassino — flaky tests matam a
  confiança.

### Sprint 01 — Aprendizado consolidado

A arquitetura evoluiu de um health check simples para uma API de usuários
com persistência real, sem acoplar regras de negócio ao transporte. A
combinação de portas (interfaces), implementação PostgreSQL, testes por
camada e um teste HTTP de ponta a ponta mantém o ciclo de feedback rápido
e deixa uma futura troca de persistência localizada nos repositories.

---

## Sprint 02 — Test Architecture + Playwright + Frontend E2E

### Issue #14 (S02-01): estrutura de diretórios de testes

- Separar `tests/unit`, `tests/integration` e `tests/e2e` reduz acoplamento
  entre testes e deixa explícito o que cada camada cobre.
- Preservar testes existentes em `src` durante migração permite transição
  gradual sem quebrar CI.

### Issue #15 (S02-02): UserFactory

- Factory determinística elimina uma fonte enorme de flakiness.
- Overrides parciais (`create({ name: 'X' })`) tornam testes expressivos.
- Padrão "defaults + override" reduz duplicação em 70%+.

### Issue #16 (S02-03): PaymentFactory

- Test Data Engineering é uma disciplina — a mesma factory precisa servir
  unit, integration e E2E.
- IDs determinísticos ajudam no debug (você reconhece o padrão).

### Issue #17 (S02-04): TransactionFactory

- `createMany(n)` com IDs distintos e previsíveis é essencial para testes
  de concorrência (Sprint 04).
- Validar `n` inválido (`n <= 0`) evita surpresas downstream.

### Issue #18 (S02-05): UserApiClient

- Abstrair HTTP em um client único reduz duplicação e padroniza tratamento
  de erro.
- Retornar `{ status, body, headers }` (em vez de lançar) dá poder ao teste
  — ele decide o que é sucesso.
- Base URL configurável via env permite rodar contra local, staging ou CI.

### Issue #19 (S02-06): migração para API Client

- Refatorar testes que passam dá confiança para simplificar sem perder
  cobertura.
- Reduzir duplicação em testes é tão importante quanto em código de
  produção.

### Issue #20 (S02-07): database reset entre testes

- `TRUNCATE ... CASCADE` é mais rápido que `DROP + CREATE`.
- Sem reset, testes compartilham estado → flaky tests.
- Estratégias paralelas: banco por worker vs. transação + rollback — cada
  uma tem trade-offs (setup mais lento vs. limites com DDL).
- Performance do reset importa: > 1s por teste mata a produtividade.

### Issue #21 (S02-08): configuração do Playwright

- `trace: 'on-first-retry'` e `screenshot: 'only-on-failure'` deveriam ser
  configurados **antes** do primeiro E2E — sem isso, debug é chute.
- Retries em CI fazem sentido; em local, não (esconde flakiness real).
- HTML report + `npx playwright show-report` acelera investigação.

### Issues #22 a #25 (S02-09 a S02-12): E2E de login e CRUD

- `data-testid` é o contrato entre frontend e teste E2E — CSS classes mudam,
  `data-testid` não.
- E2E deve ser **independente** — cada teste cria e limpa seus próprios
  dados via `beforeEach`.
- Fluxos destrutivos (delete) precisam de confirmação + teste do caminho
  de cancelamento.
- E2E é caro — só cobrir caminhos críticos, o resto é unit/integration.

### Issue #26 (S02-13): trace e screenshot

- Trace viewer (`npx playwright show-trace`) mostra DOM, console, rede e
  screenshots passo a passo — é como um "vídeo do bug".
- Screenshot em falha é o primeiro artefato a olhar.
- Adicionar `test-results/` ao `.gitignore` é obrigatório.

### Issue #27 (S02-14): HTML report

- Relatório navegável por trace é essencial para comunicação com time.
- `open: 'never'` evita abrir browser em CI.

### Issue #28 (S02-15): documentação de test-architecture

- Documentar a pirâmide **aplicada** (não a teórica) ajuda a evitar
  discussões repetidas.
- Trade-offs explícitos ("por que E2E só 10% dos testes") economizam
  reuniões futuras.

### Issues #178 a #180 (S02-16 a S02-18): frontend para E2E

- Frontend mínimo (HTML + fetch) é suficiente para validar E2E — não
  precisa de framework.
- Servir estático pelo próprio backend simplifica deploy de dev.
- `data-testid` em todos os elementos interativos desde o início evita
  refactor depois.

### Sprint 02 — Aprendizado consolidado

Test Architecture é sobre **sustentabilidade**, não sobre cobertura. Uma
suite que roda em 30 segundos e dá feedback confiável vale mais que uma
suite "completa" que leva 20 minutos e falha aleatoriamente. Factories
determinísticas, API Client reutilizável e Playwright com trace são os
três pilares que tornam isso possível.

---

## Sprint 03 — Contract + Property Testing

### Issue #29 (S03-01): instalação do Pact

- Contract testing é sobre **contratos entre serviços**, não sobre
  testar tudo de novo.
- Pact Flow free tier é suficiente para começar (5 contratos).
- Configuração inicial é overhead alto — vale a pena a partir do 2º
  serviço integrado.

### Issue #30 (S03-02): primeiro consumer contract

- Consumer define **o que espera** do provider — não o que o provider
  oferece.
- `.pact.json` gerado é artefato versionável (ou publicável em broker).
- Cobre status, headers, body — qualquer mudança incompatível quebra o
  contrato.

### Issue #31 (S03-03): provider verification

- Provider verification pega o contrato e testa contra o provedor real.
- Falha se o provedor mudar de forma incompatível.
- Roda **antes** do merge — bloqueia breaking changes no CI.

### Issue #32 (S03-04): contract no CI

- Job `contract` precisa rodar em paralelo com integration (economiza
  tempo).
- `quality-gate` depende dele → merge bloqueado se contrato quebra.
- Tempo de execução < 2 min para não atrasar feedback.

### Issue #33 (S03-05): breaking change proposital

- Mudar `name` → `userName` quebra contrato → CI falha → PR fechado.
- Este é o **meta-teste**: prova que a estratégia funciona.
- Vale fazer essa prova uma vez para confiar no mecanismo.

### Issue #34 (S03-06): documentação de contract testing

- Contract testing é pouco conhecido — documentação é essencial.
- Explicar **quando NÃO usar** evita over-engineering.

### Issue #35 (S03-07): instalação do fast-check

- Property-based testing complementa (não substitui) testes de exemplo.
- `numRuns` controla iterações por propriedade — 100 é um bom default.
- Diferença: exemplo (`expect([3,1,2]).toEqual([1,2,3])`) vs. propriedade
  (`∀ x: sort(sort(x)) === sort(x)`).

### Issue #36 (S03-08): arbitrary de User

- `fc.record()` compõe arbitraries de forma declarativa.
- `fc.emailAddress()` gera emails válidos automaticamente.
- Reutilizar arbitraries em múltiplas propriedades reduz setup.

### Issue #37 (S03-09): property para sorting

- Propriedades válidas: idempotência, tamanho, ordem, permutação.
- Contraexemplo mínimo `[1, 0]` prova que a técnica funciona.
- Bug em bubble sort (`>` → `>=`) falha a idempotência.

### Issue #38 (S03-10): property para pagination

- Propriedades: número de páginas, concatenação preserva ordem, nenhuma
  página excede `size`.
- `fc.array` com `minLength` e `maxLength` controla range de geração.
- Bônus: verificar que última página nunca é vazia quando `items.length > 0`.

### Issue #39 (S03-11): property para validation

- Determinismo é uma propriedade **universal** — vale para qualquer
  função pura.
- `fc.emailAddress()` para input positivo, `fc.string()` para negativo.
- Strings vazias/espaços são casos especiais que merecem teste explícito.

### Issue #40 (S03-12): investigação do shrinking

- Shrinking reduz o contraexemplo automaticamente ao menor caso que
  ainda falha.
- `Counterexample` e `Shrunk N time(s)` são o idioma do fast-check para
  relatar o mínimo reproduzido.
- Nem todo tipo é shrinkeável de forma trivial; strings e números têm
  reduções bem definidas, mas estruturas aninhadas podem precisar de
  arbitraries customizados.
- Sem shrinking, você debugaria um array de 1000 elementos em vez de
  `[1, 0]`.
- Experimentos controlados em `.skip` são a forma correta de documentar
  sem quebrar CI.

### Issue #41 (S03-13): bug proposital

- Meta-teste: introduzir bug sutil em `sort.ts`, rodar propriedades,
  capturar contraexemplo, reverter.
- Bug **nunca** é commitado — só a documentação do experimento sobe.
- Dupla proteção: `.skip` + verificação manual antes do `git add`.
- Contraexemplo mínimo mostra a diferença entre "testes que passam" e
  "testes que detectam regressões".

### Sprint 03 — Aprendizado consolidado

Property-based testing muda a forma de pensar em testes: você não
escolhe exemplos, você **define invariantes**. Se a invariante é
verdadeira, os exemplos são consequência. Se é falsa, o fast-check
encontra o contraexemplo mínimo — e o shrinking transforma um caso
gigante em algo que cabe na cabeça.

Contract testing, por outro lado, é sobre **evitar integração quebrada
entre serviços**. Não substitui E2E, mas pega breaking changes em
segundos em vez de minutos — e bloqueia o merge.

---

## Aprendizado consolidado — 24 semanas

### Engenharia

- Programar para **contratos** (interfaces, tipos) é o que permite
  evoluir partes do sistema sem quebrar o resto.
- Testabilidade não é um extra — é uma propriedade de design.
- Documentar decisões (ADRs) enquanto você as toma vale 10x mais que
  documentar depois.

### Testes

- Cada camada de teste (unit, integration, contract, E2E) pega um tipo
  diferente de bug. Não são intercambiáveis.
- Test Data Engineering (factories determinísticas + isolamento) é
  pré-requisito para sustentabilidade.
- Property-based testing é sobre invariantes, não exemplos.
- Contract testing previne breaking changes entre serviços.
- Quality gates automatizados valem mais que checklists manuais.

### Ferramentas

- `gh` CLI + workflows automatizam o que o GitHub não faz nativamente.
- `fast-check` shrinking é o que torna property-based testing prático.
- `Pact` precisa de Pact Broker (ou PactFlow) para ser útil em time.
- Playwright trace viewer é o melhor debugger de E2E que existe.

### Mentalidade

- **Meta-testes** (provar que a ferramenta funciona) valem o esforço.
- **Bug proposital controlado** é didático e não deve subir para o repo.
- **Feedback rápido** (CI < 5 min) é mais importante que cobertura alta.
- **Documentar trade-offs** economiza discussões futuras.

### O que faria diferente

- Configuraria trace/screenshot do Playwright **antes** do primeiro E2E.
- Documentaria ADRs no momento da decisão, não depois.
- Não misturaria "estudar X" com "implementar X" na mesma issue.
- Manteria o `learning-log.md` atualizado **semanalmente**, não ao final
  do sprint.
---

## Sprint 04 — Mutation + Concurrency

### Issues #42 a #46 (S04-01 a S04-05): mutation testing

- Coverage mede **linhas executadas**; mutation mede **asserções que
  importam**. Os dois números não se substituem.
- Baseline inicial baixo (score ~60%) é comum — o valor está na
  evolução, não no número absoluto.
- Surviving mutants são um **mapa de testes fracos**: cada um aponta
  uma asserção que falta ou uma que é fraca demais.
- Meta-testes com mutantes propositais provam que o Stryker funciona
  antes de você confiar nele.
- Documentar **por que** alguns mutantes sobrevivem (equivalentes,
  inalcançáveis) evita perseguição infinita por 100%.

### Issues #47 a #48 (S04-06, S04-07): Payment domain e POST /payments

- Modelar status como enum explícito (`pending`, `completed`, etc.)
  prepara o terreno para state machine (Sprint 06).
- Validação de valor positivo pertence ao domínio, não ao controller.
- Pagamentos têm invariantes mais fortes que User — `amount > 0`,
  `currency` válida, `idempotencyKey` única.

### Issue #49 (S04-08): idempotency key

- Idempotência é **contrato HTTP**, não detalhe de banco. O cliente
  manda a chave, o servidor garante "no máximo uma execução".
- UNIQUE constraint no banco é a fonte da verdade — não confie em
  check-then-insert (race condition).
- Mapear `23505` (unique violation) para erro de domínio isola o
  resto da aplicação do driver.

### Issue #50 (S04-09): teste de repetição

- Requisições repetidas com a mesma chave devem retornar o **mesmo
  recurso**, não criar um novo.
- Testar "mesma chave + mesmo payload" e "mesma chave + payload
  diferente" são cenários distintos.

### Issue #51 (S04-10): teste concorrente (100 requests)

- Concorrência expõe bugs que teste serial não pega: race conditions,
  deadlocks, transações perdidas.
- 100 requests simultâneos no mesmo endpoint é o "happy path" de
  caos — se o sistema aguenta, aguenta qualquer coisa menor.
- Medir tempo total E número de erros 5xx é mais informativo que só
  "passou/falhou".

### Issue #52 (S04-11): race condition proposital

- Reproduzir a race (remover UNIQUE, rodar 100 requests) **antes** de
  corrigir documenta a natureza do problema.
- `await` mal posicionado, check-then-act, cache sem invalidação são
  as 3 causas mais comuns.
- Regressão: o teste deve falhar se alguém remover a constraint.

### Sprint 04 — Aprendizado consolidado

Mutation testing inverte a lógica: em vez de perguntar "meu teste
cobre essa linha?", pergunta "se essa linha mudar, meu teste
detecta?". A resposta honesta é frequentemente desconfortável — e é
exatamente por isso que vale a pena.

Concorrência, por outro lado, é onde a teoria encontra a realidade:
todo sistema sério tem race condition latente. Testar com 100
requests simultâneos + idempotência forçada é a forma mais barata de
descobrir se você tem uma.

---

## Sprint 05 — Distributed Systems (RabbitMQ)

### Issues #53 a #54 (S05-01, S05-02): RabbitMQ e producer

- Broker introduz uma **fronteira assíncrona** que muda o modelo
  mental — operações deixam de ser request/response.
- Producer deve ser idempotente por natureza; broker não garante
  entrega única.
- Configurar exchange, queue e bindings via código (setup.ts) em vez
  de UI é a forma reproducível.

### Issue #55 (S05-03): consumer

- Consumer precisa decidir entre ACK, NACK (com/sem requeue) e drop
  em cada mensagem — não é automático.
- Prefetch count controla quantas mensagens o consumer pega de uma
  vez; valor alto pode causar starvation em múltiplos consumers.
- Logging estruturado com `correlationId` é essencial para rastrear
  mensagens através do sistema.

### Issue #56 (S05-04): teste producer/consumer

- Teste ponta a ponta da fila é o análogo de integration test para
  HTTP — valida o caminho real, não mocks.
- Esperar mensagens assíncronas exige polling com timeout
  (`waitForPayment`), não sleep arbitrário.

### Issues #57 a #59 (S05-05 a S05-07): retry, DLQ, duplicatas

- **Retry com backoff exponencial** é padrão para falhas transientes;
  retry imediato piora congestionamento.
- **DLQ (Dead Letter Queue)** é onde mensagens permanentemente
  quebradas vão morrer — sem ela, você perde mensagens silenciosamente.
- **Duplicatas são inevitáveis** em sistemas distribuídos. Idempotência
  por `correlationId` é a única defesa real.

### Issue #60 (S05-08): mensagem inválida

- Mensagens malformadas (JSON quebrado, campos faltando) devem cair
  em DLQ após esgotar retries, **sem** derrubar o consumer.
- O consumer precisa ser resiliente a payloads arbitrários.

### Issue #61 (S05-09): timeout

- Timeout de processamento é diferente de timeout de rede — é sobre
  "quanto tempo aceito esperar por essa mensagem?".
- Timeout + retry + DLQ formam uma **tríade de resiliência**.

### Issue #62 (S05-10): consumer indisponível

- Mensagens **não podem ser perdidas** se o consumer está fora — o
  broker retém até o próximo consumer conectar.
- Documentar esse comportamento é parte do contrato operacional.

### Issue #63 (S05-11): correlation ID

- Correlation ID propagado do producer → consumer → logs → banco
  permite rastrear uma operação inteira.
- Sem ele, debugging de sistema distribuído é arqueologia.

### Issue #64 (S05-12): failure modes

- Documentar 8 modos de falha (retry, DLQ, duplicata, timeout,
  consumer down, broker down, mensagem inválida, backpressure)
  transforma conhecimento tácito em referência.
- Cada modo deve ter: sintoma, mitigação, teste que cobre.

### Sprint 05 — Aprendizado consolidado

Sistemas distribuídos quebram de formas que sistemas monolíticos não
quebram. O que muda: você não pode assumir "se eu mandei, chegou";
você não pode assumir "se chegou, foi uma vez só"; você não pode
assumir "se falhou, posso tentar de novo imediatamente".

A tríade **retry + DLQ + idempotência** é o mínimo para sobreviver à
realidade assíncrona. E correlation ID é o que separa "sistema
observável" de "caixa preta que às vezes funciona".

---

## Sprint 06 — Security + Performance (em andamento)

### Issue #270 (S06-00a): migration auth

- Adicionar `password_hash` e `role` a uma tabela existente é mudança
  **retrocompatível** — password_hash é NULLABLE, role tem DEFAULT.
- Fail-fast em migration: `up` e `down` precisam ser idempotentes.
- 13 arquivos de teste precisaram ajustar o shape do User — sinal
  saudável de que o domínio é tipado corretamente.

### Issues #271 (S06-00b): login real com bcrypt + JWT + RBAC

Cinco bugs encontrados durante a implementação, cada um de uma
natureza diferente:

1. **`jti` ausente no token** — `signAccess`/`signRefresh` não passavam
   `jwtid`, mascarado por `vi.mock("jsonwebtoken")` nos unit tests.
   Só apareceu no integration. **Lição:** mockar a lib que você está
   embrulhando torna o teste quase vazio.

2. **`passwordHash` vazando em `GET /users`** — bug pré-existente, só
   visível quando o seed começou a inserir hash real. Corrigido com
   `toUserResponse()` serializer. **Lição:** teste de segurança
   implícito ("o response NÃO contém X") é tão valioso quanto teste
   positivo.

3. **UUID inválido no seed** — `'test-user-id'` não é UUID; Postgres
   rejeitou quando o seed rodou pela primeira vez. **Lição:** seeds
   têm que ser sintaticamente válidos desde o início.

4. **`JWT_SECRET` em CI** — fail-fast do `token.service.ts` cobrou o
   preço em 5 jobs do workflow. **Lição:** fail-fast local não é
   fail-fast em CI; workflow precisa de env fake explícita.

5. **Contract desatualizado** — Pact pegou `passwordHash` removido,
   expondo que consumers quebrariam. **Lição:** contract testing não
   decide quem está certo, mas expõe a incompatibilidade; consumer
   estava errado, provider correto.

Bônus: **role do refresh token vinha do token, não do banco**. Um
admin rebaixado continuava admin até fazer login de novo. Corrigido
buscando role atual do banco em cada refresh. **Lição:** token nunca
deve ser fonte de verdade para autorização; é só um transporte.

### Job coverage — 3 patches consecutivos

O job `coverage` do CI exigiu 3 fixes para funcionar:

1. Faltavam `services:` (postgres + rabbitmq) — copiados do
   `integration`.
2. Faltava `migrate:up` antes do `test:coverage` — o script
   `test:integration` auto-gerencia, o `test:coverage` não.
3. `test:coverage` rodava sem `--no-file-parallelism`, causando races
   em TRUNCATE e nas filas RabbitMQ.

**Refactor sugerido para o Sprint 07:** padronizar todos os scripts
de teste com hooks `pretest:*` que rodam migração, setam env e
escolhem paralelismo conforme a natureza do teste. O acoplamento
entre `package.json` e workflow está gerando dívida.

### Sprint 06 — Aprendizado parcial (S06-00a/b)

Segurança não é uma feature — é uma propriedade emergente de várias
decisões pequenas: onde o secret vive, quando o hash é comparado,
qual mensagem de erro é retornada, o que o token carrega, quando o
token expira, o que o banco guarda.

A pergunta certa não é "está seguro?", é **"o que um atacante
aprende em cada resposta?"**. 401 genérico em login, resposta idêntica
para email existente/inexistente, `passwordHash` nunca na resposta,
role sempre vinda do banco — cada uma dessas decisões fecha um canal
de informação.

E CI é onde essas propriedades são testadas. Um PR que passa local
mas falha em CI está revelando **acoplamento escondido** entre o
código e o ambiente — e é exatamente por isso que CI existe.

### S06-00c — Endpoints de reset E2E

Fluxo manual testado em dev (não em CI): forgot → Ethereal → reset →
login. Confirmado 204 idêntico para email existente/inexistente (anti-
enumeration real), email real via Ethereal (SMTP 250 Accepted), token
sha256 no banco, single-use via used_at, senha antiga 401, nova 200.

**Tempo do endpoint `/auth/forgot-password`:** ~30ms (retorna antes do
email sair — RabbitMQ desacoplou). Síncrono seria ~500ms.

**Bug encontrado:** `auth.controller.ts` truncado pelo Zoo Code no PART A
do 3d.1 — as 4 funções de type guard foram perdidas. Corrigido com
`cat >>` manual. **Lição:** prompts que escrevem >100 linhas em um
arquivo devem ser divididos; verificar com `tail` antes de rodar
`typecheck`.
