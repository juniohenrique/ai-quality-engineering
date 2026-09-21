---
name: github-issue-reader
description: Le a issue completa do GitHub a partir do numero ou URL e cruza com .github/SCOPES.md e .github/CONVENTIONS.md para sugerir tipo, scope, nome da branch e formato de commit. Use quando o usuario citar uma issue (#N), URL de issue, SXX-YY, ou pedir para analisar/implementar uma issue.
---

# Skill: GitHub Issue Reader

## Objetivo

Ler o conteudo COMPLETO de uma issue do GitHub, cruzar com as convencoes do
projeto (.github/SCOPES.md e .github/CONVENTIONS.md) e sugerir:

- Tipo do commit (feat, fix, test, docs, chore, refactor, perf, security, ci, build)
- Scope (um dos 12 em SCOPES.md)
- Nome da branch no padrao aceito pelo CI
- Formato do commit com [SXX-YY] + Refs: #N

## Quando usar

- Usuario menciona uma issue: "issue #26", "S02-13", "trabalhe na #31"
- Usuario cola URL: https://github.com/OWNER/REPO/issues/N
- Usuario pede: "leia a issue", "analise a issue", "o que essa issue pede"

## Arquivos de referencia (leia SEMPRE antes de sugerir)

1. `.github/SCOPES.md` — lista dos 12 scopes oficiais e mapeamento SXX -> scope
2. `.github/CONVENTIONS.md` — convencoes gerais, formato de commit, nomes de branch

## Repositorio padrao

`juniohenrique/ai-quality-engineering`

Se a URL for de outro repo, extraia OWNER/REPO da propria URL.

## Autenticacao

A API do GitHub aceita tokens para aumentar o rate limit (de 60/h para 5000/h).
Ordem de precedencia:

1. Variavel de ambiente GH_TOKEN ou GITHUB_TOKEN
2. git config --get github.token
3. Sem token (rate limit baixo, funciona para poucas chamadas)

Para obter o token sem expor no chat:

    TOKEN=$(git config --get github.token || echo "$GH_TOKEN")

## Passo 1: Extrair o numero da issue

A partir da entrada do usuario:

- "#26" -> 26
- "S02-13" -> precisa mapear via .github/SCOPES.md (tabela de mapeamento)
- URL do GitHub -> extrair o ultimo numero do path
- "issue 31" -> 31

Se nao conseguir, pergunte ao usuario o numero exato.

## Passo 2: Buscar dados da issue

Execute:

    TOKEN=$(git config --get github.token || echo "$GH_TOKEN")
    REPO="juniohenrique/ai-quality-engineering"
    ISSUE_NUM="<numero extraido>"

    curl -s -H "Accept: application/vnd.github+json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      "https://api.github.com/repos/$REPO/issues/$ISSUE_NUM"

## Passo 3: Buscar comentarios

    curl -s -H "Accept: application/vnd.github+json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      "https://api.github.com/repos/$REPO/issues/$ISSUE_NUM/comments"

## Passo 4: Apresentar a issue

Formate a saida assim:

    # Issue #<numero>: <titulo>

    **Estado:** <open|closed>
    **Autor:** <login>
    **Labels:** <lista>
    **Assignees:** <lista ou "nenhum">
    **Milestone:** <nome ou "nenhum">
    **Criada em:** <created_at>
    **Atualizada em:** <updated_at>

    ## Corpo

    <body completo>

    ## Comentarios (<N> total)

    ### <autor> (<data>)
    <body do comentario>

## Passo 5: Determinar tipo, scope e branch (CRUZANDO COM SCOPES.md)

Leia `.github/SCOPES.md` e use a tabela "Mapeamento rapido — Issue -> Scope".

### 5.1 Determinar o TIPO

Baseado no conteudo da issue e no mapeamento:

- Nova funcionalidade -> `feat`
- Correcao de bug -> `fix`
- Adicao de testes -> `test`
- Documentacao -> `docs`
- Configuracao/infra -> `chore`
- Refatoracao sem mudanca funcional -> `refactor`
- Performance -> `perf`
- Seguranca -> `security` (mas no commit use `test(security)` se for teste)
- CI/CD -> `chore` ou `feat` com scope `ci`

### 5.2 Determinar o SCOPE

Consulte a coluna "Scope" da tabela de mapeamento. Exemplos:

- S01-04 a S01-12 -> `users`
- S02-01 a S02-07 -> `tests`
- S02-08 a S02-14 -> `tests` (infra) ou `users` (fluxo)
- S03-01 a S03-13 -> `tests`
- S04-06 a S04-11 -> `payments`
- S05-01 a S05-12 -> `queue`
- S06-01 a S06-06 -> `security`
- S06-07 a S06-12 -> `perf`
- S07-01 a S07-06 -> `observability`
- S07-07 a S07-13 -> `ci`
- S08-01 a S08-10 -> `docs`
- S09 a S12 -> `ai`

Se a issue for claramente de um dominio, prefira o dominio (ex: users) sobre
o tecnico (ex: tests).

### 5.3 Determinar o TIPO DA BRANCH

O CI exige um dos prefixos ACEITOS. Sao ELES:

    feature/  bugfix/  chore/  docs/  release/  hotfix/

NAO use "feat/", "fix/", "test/", etc. — o CI rejeita.

Mapeamento tipo do commit -> prefixo da branch:

- `feat` -> `feature/`
- `fix` -> `bugfix/`
- `chore` -> `chore/`
- `docs` -> `docs/`
- `test` -> `chore/` (testes sao chore na branch)
- `refactor` -> `chore/`
- `perf` -> `feature/` ou `chore/`
- `security` -> `chore/`

### 5.4 Montar o nome da branch

Formato:

    <prefixo>/<scope>/<SXX-YY>-<descricao-kebab-case>

Exemplo:

    feature/users/S02-13-melhorar-formulario

## Passo 6: Sugerir proximos passos

Depois de apresentar a issue E as sugestoes, pergunte:

1. "Quer que eu crie a branch com este nome?"
2. "Quer que eu implemente a issue agora?"
3. "Quer que eu gere apenas o plano de implementacao em bullets?"

Nunca execute nada sem confirmacao explicita.

## Passo 7: Formato final da resposta

Sempre termine a analise com este bloco:

    ## Analise da Issue #<N>

    **SXX-YY:** <extraido da issue ou inferido pelo titulo>
    **Tipo:** <feat|fix|test|docs|chore|refactor|perf|security>
    **Scope:** <um dos 12 de SCOPES.md>
    **Branch sugerida:** <prefixo>/<scope>/<SXX-YY>-<descricao>

    **Commit sugerido:**
    <tipo>(<scope>): <descricao curta> [<SXX-YY>]

    - <bullet 1>
    - <bullet 2>
    - <bullet 3>

    Refs: #<N>

    **Justificativa do scope:** <2 linhas explicando por que este scope,
    referenciando a regra de prioridade do SCOPES.md>

## Tratamento de erros

- 404 -> issue nao existe ou repo privado sem acesso
- 401 -> token invalido; tente sem token
- 403 -> rate limit (60/h sem token); peca para configurar git config github.token
- Sem jq -> use python3 -m json.tool ou grep/sed
- SXX-YY nao identificado -> pergunte ao usuario ou busque no titulo da issue

## Regras criticas (nao violar)

1. NUNCA crie branch, faca push, commit ou PR sem confirmacao
2. NUNCA invente scope fora dos 12 do SCOPES.md
3. NUNCA use prefixo de branch fora de: feature/, bugfix/, chore/, docs/, release/, hotfix/
4. SEMPRE cite qual regra do SCOPES.md justifica o scope escolhido
5. SEMPRE mostre o commit sugerido no formato final antes de executar
