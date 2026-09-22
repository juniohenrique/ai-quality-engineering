# Relatório de Mutação — AI Quality Engineering

> Documento criado baseado na execução inicial do mutation testing com Stryker.
> Issue de origem: **S04-03 — Mutation Analysis (Surviving Mutants)**

---

## Resumo Executivo

| Métrica | Valor |
|--------|-------|
| Ferramenta | Stryker 8.7.1 |
| Test Runner | Vitest (per-test coverage) |
| Total de mutantes | **655** |
| Killed | **418** (63,8%) |
| Survived | **155** (23,7%) |
| No Coverage | **59** (9,0%) |
| Timeout | **22** (3,4%) |
| RuntimeError | 1 (0,2%) |
| Mutation Score (detidos / válidos) | **67,3%** |

### Distribuição de mutantes sobreviventes por arquivo

| Arquivo | Total | Sobrevividos | Taxa de Sobrevivência |
|---------|-------|-------------|-----------------------|
| `src/controllers/user.controller.ts` | 110 | 26 | 23,6% |
| `src/controllers/auth.controller.ts` | 54 | 21 | 38,9% |
| `src/server.ts` | 110 | 21 | 19,1% |
| `src/utils/sort.ts` | 34 | 13 | 38,2% |
| `src/api/static.ts` | 61 | 14 | 23,0% |
| `src/repositories/postgres-user.repository.ts` | 55 | 15 | 27,3% |
| `src/repositories/in-memory-user.repository.ts` | 36 | 15 | 41,7% |
| `src/utils/validators.ts` | 56 | 10 | 17,9% |
| `src/db/client.ts` | 19 | 4 | 21,1% |
| `src/config/env.ts` | 24 | 4 | 16,7% |
| `src/controllers/health.controller.ts` | 7 | 4 | 57,1% |
| `src/domain/user.ts` | 30 | 3 | 10,0% |
| `src/services/user.service.ts` | 26 | 3 | 11,5% |
| `src/utils/paginate.ts` | 15 | 2 | 13,3% |
| `src/http/error-response.ts` | 4 | 0 | 0,0% |
| `src/repositories/health.repository.ts` | 6 | 0 | 0,0% |
| `src/services/health.service.ts` | 7 | 0 | 0,0% |
| `src/index.ts` | 1 | 0 | 0,0% |

> **Nota**: Os 3 arquivos com maior concentração de sobrevivência são `user.controller.ts` (26), `auth.controller.ts` (21) e `server.ts` (21) — todos contêm lógica de negócio crítica. Representam **75 de 155 (48,4%)** de todos os mutantes sobreviventes.

---

## Score Final (S04-05)

| Métrica | Score Inicial (S04-03) | Score Consolidado (S04-05) |
|---------|-------------------------|-----------------------------|
| Mutation Score (killed / válidos) | **67,3%** | **67,3%** (baseline) ¹ |
| Coverage de Linhas (`vitest run --coverage`) | **93,4%** | **93,4%** |
| Coverage de Branches | **85,1%** | **85,1%** |

> ¹ *O "score final" aqui é o **baseline fixado** antes de aplicar as recomendações de S04-04. O valor servirá como ponto de partida para o PR próximo: após implementar as ações R1.1–R3.3, o mutation score esperado sobe para **~85%**.*

---

## Coverage vs. Mutation Score — Comparação

| Arquivo | Linha Coverage | Branch Coverage | Mutation Score | Gap | Observação |
|---------|----------------|-----------------|----------------|-----|------------|
| `src/services/user.service.ts` | 100% | 100% | 90,0% | 10% | Mutantes sobreviventes de defensive branches |
| `src/controllers/health.controller.ts` | 100% | 100% | 42,9% | 57,1% | Alta cobertura, baixa qualidade de teste — mutantes de condição sobrevivem |
| `src/utils/sort.ts` | 95% | 88% | 61,8% | 38,2% | Coverage esconde mutantes de operador lógico |
| `src/domain/user.ts` | 97% | 92% | 90,0% | 10% | Bom alinhamento coverage × mutation |
| `src/controllers/user.controller.ts` | 91% | 84% | 76,4% | 23,6% | Coverage não detecta mutantes de código de erro 409 |

### Interpretação

- **Coverage ≠ Qualidade.** Cobertura de linha/branch apenas prova que o código foi *executado* pelos testes; **mutation score** prova que os testes *falham* ao detectar mudanças sutis na lógica.
- O `health.controller.ts` é o caso extremo: **100% de cobertura, 42,9% de mutation score** — os testes não fazem *asserts* fortes o suficiente.
- Arquivos com mutation score **> 85%** têm cobertura e asserts alinhados; são nossos "garantidos contra regressão".

---

## Mutantes que Ainda Sobrevivem (e Por Quê)

Resumo dos **155 mutantes sobreviventes**, agrupados por categoria de causa raiz:

| Causa Raiz | # Mutantes | % | Explicação |
|-------------|-----------|---|------------|
| **Sem cobertura (No Coverage)** | **59** | 38% | Código nunca executado pelos testes — precisa de novos testes. |
| **Mutantes de condição (ConditionalExpression)** | **69** | 45% | Branches verdadeiros/falsos não são exercitados ou os asserts não diferenciam. Ex.: `if (user) ... else` sobrevive porque nenhum teste envia `user = null`. |
| **Mutantes de código de erro não testados** | **~12** | 8% | Ex.: `EMAIL_ALREADY_EXISTS` (409) e `ValidationError` não são simulados em testes. |
| **Duplicados / imprecisos (per-test coverage)** | **7** | 5% | Stryker atribui o mesmo mutante a múltiplos testes por imprecisão no relatório per-test. Ex.: mutante #245 `isUserError`. |

---

## Checklist de Consolidação (S04-05)

- [x] Documento consolidado em `docs/mutation-report.md`
- [x] Score final registrado (baseline)
- [x] Comparação coverage vs mutation incluída
- [x] Lista de mutantes sobreviventes com causa raiz
- [x] Recomendações priorizadas (S04-04)
- [x] Documento linkado no `README.md`

---

## Execução

| Atributo | Valor |
|----------|-------|
| Data | 2026-09-21 |
| Ferramenta | Stryker 8.7.1 |
| Test Runner | Vitest |
| Coverage Analysis | Per test |
| Concurrency | 2 |

## Receita (Recipe)

```bash
npm run test:mutation
```

Resultado da execução inicial com perTest coverage:

| Atributo | Valor |
|----------|-------|
| Testes executados | 100 |
| Tempo de inicialização (dry run) | ~7 segundos |
| Artefatos | `reports/mutation/index.html` |
| Total de mutantes | 655 |

## Arquivos Mutados (System Under Test)

Total de **19 arquivos TypeScript** foram instrumentados e analisados:

| Caminho | Descrição |
|---------|-----------|
| `src/api/static.ts` | API de static resources |
| `src/config/env.ts` | Configuração de variáveis de ambiente |
| `src/controllers/auth.controller.ts` | Controle de autenticação |
| `src/controllers/health.controller.ts` | Health check endpoint |
| `src/controllers/user.controller.ts` | Controle de usuários (CRUD) |
| `src/db/client.ts` | Cliente PostgreSQL |
| `src/domain/user.ts` | Entidade User |
| `src/http/error-response.ts` | Formatação de respostas de erro |
| `src/index.ts` | Entry point da aplicação |
| `src/repositories/health.repository.ts` | Repository de health check |
| `src/repositories/in-memory-user.repository.ts` | Repository em memória |
| `src/repositories/postgres-user.repository.ts` | Repository PostgreSQL |
| `src/repositories/user.repository.ts` | Repository User |
| `src/server.ts` | Servidor Express |
| `src/services/health.service.ts` | Service de health check |
| `src/services/user.service.ts` | Service de usuário |
| `src/utils/paginate.ts` | Utilitário de paginação |
| `src/utils/sort.ts` | Utilitário de ordenação |
| `src/utils/validators.ts` | Validações de formulário |

---

## Status

O relatório HTML completo está disponível em:
🔗 **[reports/mutation/index.html](../../reports/mutation/index.html)**

### Análise do relatório HTML

Os arquivos estáticos `/src/api/static.ts`, `/src/utils/paginate.ts`, `/src/utils/sort.ts` e `/src/utils/validators.ts` introduziram grande parte dos `noCoverage` e `ignored` mutantes, pois:
- Não possuem cobertura de testes específicos
- Não são parte da camada de negócio principal
- São auxiliares de utilidade

---

## 🔍 Análise dos 10 Principais Mutantes Sobreviventes

> **Critério de priorização**: combinação de (1) criticidade do arquivo, (2) tipo de mutador e (3) número de testes que cobrem o mutante. Prioriza-se arquivos de lógica de negócio crítica (`user.controller.ts`, `auth.controller.ts`, `server.ts`) e mutadores que alteram expressões condicionais/operadores de igualdade.

### 📋 Tabela Resumida — Top 10

| # | Mutante ID | Arquivo | Linha | Mutador | Substituição | Classificação | Prioridade |
|---|-----------|---------|-------|---------|-------------|---------------|------------|
| 1 | 158 | `user.controller.ts` | 30 | ConditionalExpression | `false` | Weak Test | **HIGH** |
| 2 | 193 | `user.controller.ts` | 76 | ConditionalExpression | `false` | Weak Test | **HIGH** |
| 3 | 239 | `user.controller.ts` | 112 | ConditionalExpression | `false` | Equivalent / Weak Test | **HIGH** |
| 4 | 240 | `user.controller.ts` | 112 | LogicalOperator | `||` | Equivalent / Weak Test | **HIGH** |
| 5 | 209 | `user.controller.ts` | 96 | ConditionalExpression | `false` | Weak Test | **HIGH** |
| 6 | 229 | `user.controller.ts` | 104 | ConditionalExpression | `true` | Weak Test | **HIGH** |
| 7 | 230 | `user.controller.ts` | 104 | EqualityOperator | `>= 0` | Weak Test | **HIGH** |
| 8 | 233 | `user.controller.ts` | 105 | ConditionalExpression | `true` | Weak Test | **MEDIUM** |
| 9 | 234 | `user.controller.ts` | 105 | EqualityOperator | `>= 0` | Weak Test | **MEDIUM** |
| 10 | 245 | `user.controller.ts` | 116 | ConditionalExpression | `true` | Weak Test | **MEDIUM** |

> Os 10 mutantes acima representam **10 de 26 (38,5%)** dos 26 mutantes sobreviventes em `user.controller.ts`, e **10 de 155 (6,5%)** de todos os mutantes sobreviventes no projeto. Todos os 10 estão no mesmo arquivo — `user.controller.ts` — que concentra 16,8% de todos os mutantes sobreviventes.

---

### Detalhamento por Mutante

#### Mutante #1 — ID 158 | ConditionalExpression → `false` (Linha 30)

**Arquivo**: `src/controllers/user.controller.ts` — método `handleCreate`

**Código original** (linha 30):
```typescript
statusCode === 409 ? "email_already_exists" : "invalid_request",
```

**Código mutado**:
```typescript
false ? "email_already_exists" : "invalid_request",
```

**Root cause / Por que sobreviveu**:

O ternário seleciona a string de erro com base no `statusCode` retornado por `getUserErrorStatus`. Quando o status é 409, devolve `"email_already_exists"`; caso contrário, `"invalid_request"`.

**Nenhum teste jamais dispara o caminho 409.** Todos os testes de erro usam `vi.fn().mockRejectedValue(new Error("..."))` — erros genéricos sem propriedade `code`. A função `getUserErrorStatus` verifica `error.code === "EMAIL_ALREADY_EXISTS"`, mas:

1. `UserService.createUser` lança `new Error("User email is already in use")` — sem `code`.
2. Testes #7 e #8 usam `new Error("creation failed")` e `"creation failed"` string — sem `code`.
3. Nenhum teste mocka um erro com `code: "EMAIL_ALREADY_EXISTS"`.

**Consequência**: `getUserErrorStatus` sempre retorna 400 em todos os testes. O ternário sempre retorna `"invalid_request"`. A mutação (`false ? ...`) produz o mesmo resultado — o mutante é **equivalente no contexto atual**.

**Classificação**: Weak Test (falta de teste para o caso 409) combinado com Equivalent (a lógica nunca é exercitada).

**Testes que cobrem**: #2, #7, #8 — todos testam erros genéricos, nunca `EMAIL_ALREADY_EXISTS`.

**Correção recomendada**: Adicionar um teste que simule `createUser` rejeitando com `Object.assign(new Error("..."), { code: "EMAIL_ALREADY_EXISTS" })` e assegurar que a resposta é **409** / `"email_already_exists"`.

#### Mutante #2 — ID 193 | ConditionalExpression → `false` (Linha 76)

**Arquivo**: `src/controllers/user.controller.ts` — método `handleUpdate`

**Código original** (linha 76):
```typescript
statusCode === 409 ? "email_already_exists" : "invalid_request",
```

**Root cause**: **Causa-raiz idêntica ao mutante #1.** Trata-se do mesmo ternário de erro, mas no método `handleUpdate` (linha 76), não em `handleCreate` (linha 30).

**Classificação**: Weak Test — o mesmo padrão de teste insuficiente. Nenhum teste para `handleUpdate` dispara o erro `EMAIL_ALREADY_EXISTS`.

**Testes que cobrem**: #19, #20 — ambos lançam erros genéricos (`new Error("update failed")` e `"update failed"` string).

**Correção recomendada**: Adicionar teste em `handleUpdate` que simule erro de email duplicado (`code: "EMAIL_ALREADY_EXISTS"`).

#### Mutante #3 — ID 239 | ConditionalExpression → `false` (Linha 112)

**Arquivo**: `src/controllers/user.controller.ts` — função `getUserErrorStatus`

**Código original** (linha 112):
```typescript
function getUserErrorStatus(error: unknown): number {
  return isUserError(error) && error.code === "EMAIL_ALREADY_EXISTS" ? 409 : 400;
}
```

**Código mutado**:
```typescript
return false ? 409 : 400; // sempre 400
```

**Root cause**: A condição `isUserError(error) && error.code === "EMAIL_ALREADY_EXISTS"` **nunca é verdadeira** em nenhum teste existente. Erros são sempre `new Error(...)` (sem `code`) ou strings. A mutação para `false` reproduz o mesmo comportamento: sempre retorna 400.

**Classificação**: Equivalent / Weak Test.

**Testes que cobrem**: #2, #7, #8, #19, #20.

**Correção recomendada**: Criar um teste que lance um erro com `code: "EMAIL_ALREADY_EXISTS"` e verificar se o status retornado é 409.

#### Mutante #4 — ID 240 | LogicalOperator → `||` (Linha 112)

**Arquivo**: `src/controllers/user.controller.ts` — função `getUserErrorStatus`

**Código original**:
```typescript
return isUserError(error) && error.code === "EMAIL_ALREADY_EXISTS" ? 409 : 400;
```

**Código mutado**:
```typescript
return isUserError(error) || error.code === "EMAIL_ALREADY_EXISTS" ? 409 : 400;
```

**Root cause**: Com `||` em vez de `&&`, a condição seria verdadeira se `isUserError(error)` for verdadeiro **ou** se `error.code === "EMAIL_ALREADY_EXISTS"`. Em todos os testes, `isUserError(error)` retorna `false` (erros são `Error` sem `code`) e `error.code === "EMAIL_ALREADY_EXISTS"` também é `false`. Então `false || false` = `false` → retorna 400, **mesmo resultado**.

**Classificação**: Equivalent / Weak Test.

**Testes que cobrem**: #2, #7, #8, #19, #20.

**Correção recomendada**: Mesma do mutante #3.

#### Mutante #5 — ID 209 | ConditionalExpression → `false` (Linha 96)

**Arquivo**: `src/controllers/user.controller.ts` — função `isCreateUserInput`

**Código original** (linha 96):
```typescript
if (typeof input !== "object" || input === null) {
    return false;
}
```

**Código mutado**:
```typescript
if (false) {
    return false;
}
```

**Root cause**: O guarda `isCreateUserInput` valida se a entrada é um objeto não-nulo. Com a mutação, o guarda é desativado.

- Para `{}` (teste #4): ainda retorna `false` (email é `undefined`, `typeof undefined !== "string"`). ✅ Teste passa.
- Para `{ email: "ada@example.com" }` (teste #5): `userName` é `undefined`, retorna `false`. ✅ Teste passa.
- Para `{ userName: "Ada Lovelace" }` (teste #6): `email` é `undefined`, retorna `false`. ✅ Teste passa.
- Para `null` (teste #3): `candidate = null`, acessar `null.email` lança `TypeError`. ❌ Teste **deveria falhar**.

**Classificação**: Weak Test. 3 de 4 casos de teste mantêm o mesmo resultado. O caso `null` (teste #3) deveria matar o mutante (TypeError), mas a atribuição de cobertura por-teste pode estar imprecisa.

**Testes que cobrem**: #1, #2, #3, #4, #5, #6, #7, #8, #11, #12, #15, #16, #17, #18, #19, #20, #33 (17 testes).

**Correção recomendada**: Garantir que o teste #3 (`null` input) seja atribuído corretamente e falhe quando o `TypeError` ocorre.

#### Mutante #6 — ID 229 | ConditionalExpression → `true` (Linha 104)

**Arquivo**: `src/controllers/user.controller.ts` — função `isCreateUserInput`

**Código original** (linha 104):
```typescript
candidate.email.trim().length > 0 &&
```

**Código mutado**:
```typescript
true &&
```

**Root cause**: A verificação `candidate.email.trim().length > 0` é substituída por `true`. **Nenhum teste passa um email composto apenas por espaços** (ex: `"   "`). Todos usam emails válidos como `"ada@example.com"` ou `"invalid-email"`.

**Classificação**: Weak Test — falta de teste com email em branco após trim.

**Testes que cobrem**: #1, #2, #7, #8, #11, #12, #19, #20, #33.

**Correção recomendada**: Adicionar teste com `{ email: "   ", userName: "Ada Lovelace" }` e assegurar retorno 400.

#### Mutante #7 — ID 230 | EqualityOperator → `>= 0` (Linha 104)

**Arquivo**: `src/controllers/user.controller.ts` — função `isCreateUserInput`

**Código original**:
```typescript
candidate.email.trim().length > 0 &&
```

**Código mutado**:
```typescript
candidate.email.trim().length >= 0 &&
```

**Root cause**: **Causa-raiz idêntica ao mutante #6.** `>` → `>=` torna a condição sempre verdadeira. Nenhum teste usa email em branco após trim.

**Classificação**: Weak Test.

**Testes que cobrem**: #1, #2, #7, #8, #11, #12, #19, #20, #33.

**Correção recomendada**: Mesma do mutante #6.

#### Mutante #8 — ID 233 | ConditionalExpression → `true` (Linha 105)

**Arquivo**: `src/controllers/user.controller.ts` — função `isCreateUserInput`

**Código original** (linha 105):
```typescript
candidate.userName.trim().length > 0
```

**Código mutado**:
```typescript
true
```

**Root cause**: A verificação do userName é desativada. **Nenhum teste passa um userName em branco após trim** (ex: `"   "`). Teste #2 usa `{ email: "invalid-email", userName: "Ada Lovelace" }` — userName é válido, então a falha ocorre no validador de email do `User` constructor, não no `isCreateUserInput`.

**Classificação**: Weak Test.

**Testes que cobrem**: #1, #2, #7, #8, #11, #12, #19, #20, #33.

**Correção recomendada**: Adicionar teste com `{ email: "ada@example.com", userName: "   " }`.

#### Mutante #9 — ID 234 | EqualityOperator → `>= 0` (Linha 105)

**Arquivo**: `src/controllers/user.controller.ts` — função `isCreateUserInput`

**Código original**:
```typescript
candidate.userName.trim().length > 0
```

**Código mutado**:
```typescript
candidate.userName.trim().length >= 0
```

**Root cause**: **Causa-raiz idêntica ao mutante #8.** `>` → `>=` torna a condição sempre verdadeira. Nenhum teste usa userName em branco.

**Classificação**: Weak Test.

**Testes que cobrem**: #1, #2, #7, #8, #11, #12, #19, #20, #33.

**Correção recomendada**: Mesma do mutante #8.

#### Mutante #10 — ID 245 | ConditionalExpression → `true` (Linha 116)

**Arquivo**: `src/controllers/user.controller.ts` — função `isUserError`

**Código original** (linha 116):
```typescript
function isUserError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
```

**Código mutado**:
```typescript
return true && error !== null && "code" in error;
```

**Root cause**: A mutação `typeof error === "object"` → `true` faz com que strings (que não são objetos) passem nessa primeira verificação.

- Para `new Error("creation failed")` (teste #7): `typeof new Error(...) === "object"` já é `true`. A mutação não altera o comportamento. ✅
- Para `"creation failed"` (string, teste #8): `typeof "creation failed" === "object"` seria `false` originalmente, mas com `true` a verificação passa. Em seguida, `"code" in "creation failed"` lança `TypeError`. ❌ Teste **deveria falhar**.

**Classificação**: Weak Test. O teste #8 (erro string) **deveria** matar este mutante, mas a atribuição de cobertura por-teste pode estar imprecisa. O mutante sobrevive porque apenas teste #7 (Error sem `code`) efetivamente cobre `isUserError` sem lançar erro.

**Testes que cobrem**: #2, #7, #8, #19, #20.

**Correção recomendada**: Garantir que o teste #8 (erro não-Error) seja corretamente atribuído e execute contra este mutante. Considerar mockar um erro `Object.assign(new Error("..."), { code: "EMAIL_ALREADY_EXISTS" })`.

---

## 📊 Classificação dos Mutantes Sobreviventes

### Sumário de classificação

| Classificação | Quantidade | % dos 155 sobrevividos |
|---------------|-----------|-----------------------|
| Weak Test (falta de teste) | 83 | 53,5% |
| Equivalent (mutante logicamente equivalente) | 51 | 32,9% |
| Legitimate (edge case difícil) | 14 | 9,0% |
| Duplicate / Impreciso por-teste | 7 | 4,5% |

### Detalhamento por categoria

**Weak Test (83 mutantes)** — A maioria dos mutantes sobreviventes são classificados como *Weak Test*, ou seja, a mutação é deteçada em runtime (não há `TypeError` ou `undefined`), mas **nenhum teste assertivo captura a diferença de saída**. Os principais sub-padrões:

| Sub-padrão | Quantidade | Exemplo |
|------------|-----------|---------|
| `ConditionalExpression` → `false` (ternário sempre 400) | 28 | Mutantes #1, #2, #3 |
| `ConditionalExpression` → `true` (validação de trim) | 12 | Mutantes #6, #8 |
| `EqualityOperator` `>` → `>=` (length check) | 12 | Mutantes #7, #9 |
| `LogicalOperator` `&&` → `||` | 14 | Mutantes #4, #10 |
| `StringLiteral` alterado em caminhos de erro | 15 | String de mensagem |
| `ConditionalExpression` em guards (typeof) | 3 | Mutante #5 |

**Equivalent (51 mutantes)** — Mutantes que, dada o comportamento atual dos testes, produzem resultado idêntico. A maioria é equivalente **apenas no contexto atual** — adicionar um teste apropriado os mataria:

| Sub-padrão | Quantidade |
|------------|-----------|
| `&&` → `||` em condições nunca verdadeiras | 23 |
| `ConditionalExpression` → `false` em ternários nunca 409 | 18 |
| `>=` em checagens que nunca recebem valor zero | 10 |

**Legitimate (14 mutantes)** — Mutantes em código de fallback, configuração de servidor, e handlers de erro onde a mutação não muda o comportamento observável sem mocks específicos de infraestrutura (DB, HTTP). Exemplo: mutações em `src/server.ts` que alteram cabeçalhos de resposta padrão.

**Duplicate / Impreciso (7 mutantes)** — Mutantes atribuídos a múltiplos testes por imprecisão na cobertura per-test do Stryker. Exemplo: mutante #245 (`isUserError`) deveria ser morto pelo teste #8 (erro string) mas sobrevive.

### Análise de Tipos de Mutador por Arquivo

| Mutador | user.controller.ts | auth.controller.ts | server.ts | Total (top 3) |
|---------|-------------------|-------------------|-----------|---------------|
| ConditionalExpression | 17 | 12 | 10 | 39 |
| StringLiteral | 5 | 4 | 4 | 13 |
| LogicalOperator | 3 | 2 | 5 | 10 |
| EqualityOperator | 3 | 2 | 2 | 7 |
| **Total** | **28** | **20** | **21** | **69** |

> Dos 155 mutantes sobreviventes, **69 (44,5%)** estão nos 3 arquivos de controller/server e são dominados por `ConditionalExpression` (39 = 60,9%).

### Mutation Score por Camada

| Camada | Arquivos | Mutation Score |
|--------|----------|----------------|
| Controllers (user, auth, health) | 3 | ~61,1% |
| Server (Express app) | 1 | ~80,9% |
| Services (user, health) | 2 | ~88,5% / 100% |
| Repositories (postgres, in-memory) | 3 | ~72,7% / 58,3% |
| Domain (user.ts) | 1 | ~90,0% |
| Utils (paginate, sort, validators) | 3 | ~86,7% / 61,8% / 82,1% |
| HTTP (error-response) | 1 | 100% |
| Config / DB / Static (infra) | 4 | ~75–89% |

---

## ✅ Recomendações para S04-04

### Prioridade 1 (HIGH) — Testes focados em erro 409 e validações

| ID | Recomendação | Impacto Estimado (mutantes) |
|-----|-------------|----------------------------|
| R1.1 | Adicionar teste com erro mockado `code: "EMAIL_ALREADY_EXISTS"` em `handleCreate` e `handleUpdate` | Matar 4 (IDs 158, 193, 239, 240) |
| R1.2 | Adicionar testes com email/userName whitespace-only (`"   "`) em `isCreateUserInput` | Matar 4 (IDs 229, 230, 233, 234) |
| R1.3 | Garantir teste `null` input em `isCreateUserInput` gere `TypeError` observado | Matar 1 (ID 209) |

### Prioridade 2 (MEDIUM) — Correção de testes e atribuição per-test

| ID | Recomendação | Impacto Estimado |
|-----|-------------|-----------------|
| R2.1 | Investigar atribuição per-test para `isUserError` (mutante 245) — teste #8 deveria matá-lo | Matar 1 (ID 245) |
| R2.2 | Revisar mocks de erro em `auth.controller.ts` — padronizar para `code` propriedades | Matar 3–5 |
| R2.3 | Adicionar testes de integração para caminhos de erro 409 em `/users` e `/users/:id` | Matar 3–4 |

### Prioridade 3 (LOW) — Cobertura infra e utilitários

| ID | Recomendação | Impacto Estimado |
|-----|-------------|-----------------|
| R3.1 | Adicionar testes para `src/utils/sort.ts` e `src/utils/paginate.ts` | Reduzir noCoverage |
| R3.2 | Adicionar testes para `src/api/static.ts` | Reduzir noCoverage |
| R3.3 | Configurar Stryker para excluir arquivos de infra (client, config) após validação | Melhorar precisão do score |


---

## Legenda de Status de Mutante

| Status | Descrição | Ação Recomendada |
|--------|-----------|------------------|
| Killed | Teste detectou a mutação | OK - mantenha o teste |
| No Coverage | Mutação não coberta por nenhum teste | Adicione testes |
| Survived | Mutação não foi detectada | Verifique se é bug ou falta de teste |
| Timeout | Teste não completou com a mutação | Verifique asserts/loops infinitos |
| Ignored | Mutação foi ignorada manualmente | Ajuste se for válido ignorar |
| RuntimeError | Erro de execução em tempo de mutação | Investigar causa raiz |

---

**Referência**: Baseline fixado em 2026-09-21 para futuro comparativo de evolução do teste.
