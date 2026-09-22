# Race Conditions

## Contexto

O serviço de pagamentos expõe o endpoint `POST /payments` com **idempotência**
baseada em uma chave (`idempotencyKey`) fornecida pelo cliente. Para uma mesma
chave, múltiplas chamadas devem resultar em **uma única cobrança** — seja por
retento cliente após *timeout* de rede, seja por requisições concorrentes.

A idempotência é garantida em **duas camadas**
(`src/services/payment.service.ts` → `PaymentService.createPayment`):

1. **Checagem otimista (código):** antes de inserir, o repositório consulta se
   já existe uma cobrança com a mesma chave. Se existir, retorna-a sem fazer
   `INSERT`.
2. **Guarda contra race condition (banco):** se duas requisições concorrentes
   passarem juntas pela checagem otimista e disputarem o `INSERT`, o
   `UNIQUE` constraint no banco rejeita a segunda inserção com SQLSTATE `23505`
   (`DuplicateIdempotencyKeyError`). O serviço capta esse erro e devolve a
   cobrança criada pela requisição vencedora.

A segunda camada só funciona porque **existe um `UNIQUE CONSTRAINT` sobre
`idempotency_key`** na tabela `payments`
(`migrations/002_create_payments.up.sql`).

## Bug introduzido (experimento)

Para reproduzir a race condition, o `UNIQUE CONSTRAINT` sobre
`idempotency_key` foi **removido diretamente no banco de teste**, sem tocar
os arquivos de migração:

```sql
-- Apenas no ambiente de teste — NUNCA commitado
ALTER TABLE payments DROP CONSTRAINT payments_idempotency_key_key;
```

Com a constraint ausente, a camada 2 (banco) deixa de existir. A camada 1
(código) é insuficiente sozinha: é uma **checagem não atômica**.

## Sintoma

100 requisições concorrentes com a **mesma** `idempotencyKey` geraram
**100 cobranças distintas** (uma por requisição), em vez de 1.

Evidência capturada no banco após o experimento:

```
 idempotency_key                                          | n
----------------------------------------------------------+----
 db-concurrent-db318a80-e72a-4de1-85b3-65466cc30e3e | 100
```

Ou seja, 100 linhas com a **mesma** `idempotency_key` e `id`s distintos
(`uuid`). O serviço devolveou 100 respostas `201` diferentes, cada qual com um
`id` próprio — cobrando o cliente 100 vezes por uma única intenção.

## Causa raiz

A idempotência por "checagem prévia" (`SELECT` antes do `INSERT`) é uma

### Exemplo T1/T2

Suponha duas requisições concorrentes `T1` e `T2`, ambas com a mesma chave
`K`, e a UNIQUE constraint **ausente**. Cronograma clássico de race condition:

| Passo | Transação T1                                   | Transação T2                                   | Resultado |
|-------|------------------------------------------------|------------------------------------------------|-----------|
| 1     | `SELECT * FROM payments WHERE idempotency_key = K` → nada |                                                | T1 continua |
| 2     |                                                | `SELECT * FROM payments WHERE idempotency_key = K` → nada | T2 continua |
| 3     | `INSERT INTO payments (...) VALUES (id1, K, ...)` |                                                | Linha 1 criada |
| 4     |                                                | `INSERT INTO payments (...) VALUES (id2, K, ...)` | Linha 2 criada |

Ambos os `SELECT` executaram **antes** de qualquer `INSERT` ser commitado, por
isso nenhum viu a outra cobrança. Com a UNIQUE constraint, o `INSERT` da T2 na
etapa 4 falharia com `23505`, e o serviço faria o *catch-and-fetch* para
devolver a linha criada por T1 — mantendo a idempotência.

> Observação sobre o experimento: o cenário mais sensível foi o **database
> level** (`Promise.all` de 100 chamadas a `service.createPayment` diretamente,
> sem passar pelo servidor HTTP), onde o *pool* de conexões do `pg` expõe
> concorrência real no banco. O cenário via HTTP, por sua vez, pode mascarar a
> race por conta da serialização do *event loop* do Node, mas a vulnerabilidade
> continua real.

## Correção

Restaurar o `UNIQUE CONSTRAINT` sobre `idempotency_key` elimina a janela
entre `SELECT` e `INSERT`:

```sql
ALTER TABLE payments ADD CONSTRAINT payments_idempotency_key_key UNIQUE (idempotency_key);
```

Com a constraint ativa, o segundo `INSERT` concorrente falha com SQLSTATE
`23505`. O utilitário `isUniqueViolation`
(`src/utils/postgres-errors.ts`) detecta o erro e o serviço trata-o:

```
PostgresPaymentRepository.create  → 23505  →  DuplicateIdempotencyKeyError
        PaymentService.createPayment → catch (isUniqueViolation) → findByIdempotencyKey → return existing
```

Assim, a requisição vencedora persiste a cobrança e as concorrentes recebem a
mesma cobrança de volta — idempotência restaurada.

## Prevenção

- **Constraint no banco > checagem no código.** A verdadeira authoridade para a
  idempotência é o `UNIQUE CONSTRAINT`, porque é **atômica e imutável**. Uma
  checagem de aplicação (`SELECT` + `INSERT`) é sempre vulnerável a race
  conditions dentro da janela entre as duas operações.
- **Atomicidade > checagem prévia.** `SELECT` não equivale a exclusão. O padrão
  correto é tentar inserir e tratar a colisão (`try-insert-catch-23505`) ou
  usar `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` / `UPSERT`.
- **Defense in depth, não defense and hope.** A camada de serviço (checagem
  otimista) é um *fast path* para o caso comum (retry idempotente), mas **nunca
  deve ser a única proteção**.
- Mantenha o constraint versionado em migrations e valide-o nos testes de
  concorrência (`payments.concurrency.test.ts`), que falham imediatamente se o
  número de cobranças divergir de 1.

## Teste de regressão

`tests/integration/payments.concurrency.test.ts` mantém a proteção viva:

- **HTTP level:** `POST /payments` — 100 requisições simultâneas com a mesma
  chave → exatamente **1** cobrança persistida e `paymentIds.size === 1`.
- **Database level:** 100 chamadas concorrentes a `PaymentService.createPayment`
  → exatamente **1** linha persistida (`service-level: 100 concurrent
  createPayment ... | 1 row persisted`).

Qualquer remoção acidental da UNIQUE constraint faz o database-level test
falhar com `expected 100 to be 1`.

## Lições

- Checagem prévia (`SELECT`) sozinha **não garante** idempotência sob
  concorrência — a janela entre o `SELECT` e o `INSERT` é onde a race nasce.
- O banco de dados é o último reduto de verdade para invariantes de
  integridade; confie nele antes do que na lógica da aplicação.
- Constraint de unicidade é barata, semântica e atômica: prefira
  `UNIQUE` + `ON CONFLICT` a qualquer tentativa de resolver isso em código.
- Testes de concorrência devem ser parte da suíte de regressão: eles não são
  "teste de estresse", são **teste de corretude**.
- Erros `23505` não são falhas a serem corrigidas — são **sinais de que o
  mecanismo de idempotência está funcionando**; capture-os e devolva o recurso
  existente.

**leitura-modificação-escrita não atômica**. Entre o `SELECT` (que não encontra
nada) e o `INSERT` (que confirma a ausência), há uma **janela de tempo** em que
outras transações podem intercalar-se.
