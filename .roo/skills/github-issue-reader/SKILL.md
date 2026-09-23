---
name: github-issue-reader
description: Le a issue completa do GitHub a partir de #N, SXX-YY, URL direta (/issues/N), URL do Projects (?issue=OWNER|REPO|N) ou itemId. Cruza com .github/SCOPES.md e .github/CONVENTIONS.md para sugerir tipo, scope, branch e commit. Use quando o usuario citar issue, URL de issue/projeto, SXX-YY, ou pedir para analisar/implementar issue.
---

# Skill: GitHub Issue Reader

## Objetivo

Ler o conteudo COMPLETO de uma issue do GitHub, cruzando com as convencoes do
projeto (.github/SCOPES.md e .github/CONVENTIONS.md), para sugerir:

- Tipo do commit (feat, fix, test, docs, chore, refactor, perf, security, ci, build)
- Scope (um dos 12 em SCOPES.md)
- Nome da branch no padrao aceito pelo CI
- Formato do commit com [SXX-YY] + Refs: #N

## Quando usar

- Usuario menciona issue: "issue #53", "S05-01", "trabalhe na #31"
- Usuario cola URL direta: https://github.com/OWNER/REPO/issues/N
- Usuario cola URL do Projects (board):
  https://github.com/users/OWNER/projects/N?pane=issue&itemId=X&issue=OWNER%7CREPO%7CNUMBER
- Usuario cola URL de PR: https://github.com/OWNER/REPO/pull/N
- Usuario pede: "leia a issue", "analise a issue", "o que essa issue pede"

## Arquivos de referencia (leia SEMPRE antes de sugerir)

1. `.github/SCOPES.md` — 12 scopes oficiais e mapeamento SXX -> scope
2. `.github/CONVENTIONS.md` — formato de commit, nomes de branch, fluxo

## Repositorio padrao

`juniohenrique/ai-quality-engineering`

## Autenticacao

Ordem de precedencia:

1. Variavel GH_TOKEN ou GITHUB_TOKEN
2. git config --get github.token
3. Sem token (rate limit 60/h)

Para obter o token sem expor no chat:

    TOKEN=$(git config --get github.token || echo "$GH_TOKEN")

## Passo 1: Extrair OWNER, REPO e NUMBER

Aceite QUALQUER um destes formatos de entrada:

### 1.1 Numero simples

    "#53"        -> 53
    "issue 53"   -> 53
    "53"         -> 53

### 1.2 Codigo SXX-YY

    "S05-01"     -> precisa mapear via .github/SCOPES.md ou buscar nas issues
                     abertas por titulo contendo [S05-01]

### 1.3 URL direta de issue

    https://github.com/juniohenrique/ai-quality-engineering/issues/53

Extracao:
OWNER=juniohenrique
REPO=ai-quality-engineering
NUMBER=53 (ultimo segmento numerico do path)

### 1.4 URL direta de PR

    https://github.com/juniohenrique/ai-quality-engineering/pull/42

Trate igual ao item 1.3, usando /issues/ na API (PRs sao issues na API v3).

### 1.5 URL do GitHub Projects (board) — CRITICO

Formato tipico:

    https://github.com/users/juniohenrique/projects/1?pane=issue&itemId=250369703&issue=juniohenrique%7Cai-quality-engineering%7C53

Extracao:

    a) Procure o parametro "issue=" na query string
    b) Decodifique %7C (pipe url-encoded) para |
    c) Split por | -> [OWNER, REPO, NUMBER]

Exemplo com o URL acima:
issue=juniohenrique%7Cai-quality-engineering%7C53
decodificado: juniohenrique|ai-quality-engineering|53
OWNER=juniohenrique
REPO=ai-quality-engineering
NUMBER=53

Se a URL tiver APENAS "itemId" (sem parametro "issue"):
NAO tente adivinhar. Pergunte ao usuario o numero da issue.

### 1.6 Nao conseguiu extrair nada

Pergunte ao usuario:

    "Nao consegui identificar o numero da issue a partir dessa URL.
    Me passe um dos formatos:
    - S05-01
    - #53
    - https://github.com/juniohenrique/ai-quality-engineering/issues/53"

## Passo 2: Buscar dados da issue

    TOKEN=$(git config --get github.token || echo "$GH_TOKEN")
    REPO_SLUG="$OWNER/$REPO"
    ISSUE_NUM="$NUMBER"

    curl -s -H "Accept: application/vnd.github+json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      "https://api.github.com/repos/$REPO_SLUG/issues/$ISSUE_NUM"

## Passo 3: Buscar comentarios

    curl -s -H "Accept: application/vnd.github+json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      "https://api.github.com/repos/$REPO_SLUG/issues/$ISSUE_NUM/comments"

## Passo 4: Apresentar a issue

    # Issue #<N>: <titulo>

    **Estado:** <open|closed>
    **Autor:** <login>
    **Labels:** <lista>
    **Assignees:** <lista ou "nenhum">
    **Milestone:** <nome ou "nenhum">
    **Sprint:** <extraido do corpo ou labels>
    **Estimate:** <extraido do corpo>
    **Depende de:** <extraido do corpo>
    **Criada em:** <created_at>
    **Atualizada em:** <updated_at>

    ## Corpo

    <body completo>

    ## Comentarios (<N> total)

    ### <autor> (<data>)
    <body do comentario>

## Passo 5: Determinar tipo, scope e branch

Leia .github/SCOPES.md e use a tabela "Mapeamento rapido — Issue -> Scope".

### 5.1 Tipo

- Nova funcionalidade -> feat
- Correcao de bug -> fix
- Adicao de testes -> test
- Documentacao -> docs
- Configuracao/infra -> chore
- Refatoracao sem mudanca funcional -> refactor
- Performance -> perf
- Seguranca -> security ou test(security) se for teste
- CI/CD -> chore ou feat com scope ci

### 5.2 Scope

Exemplos do SCOPES.md:

- S01-04 a S01-12 -> users
- S02-01 a S02-07 -> tests
- S02-08 a S02-14 -> tests (infra) ou users (fluxo)
- S03-01 a S03-13 -> tests
- S04-06 a S04-11 -> payments
- S05-01 a S05-12 -> queue
- S06-01 a S06-06 -> security
- S06-07 a S06-12 -> perf
- S07-01 a S07-06 -> observability
- S07-07 a S07-13 -> ci
- S08-01 a S08-10 -> docs
- S09 a S12 -> ai

Se a issue for de um dominio claro, prefira o dominio sobre o tecnico.

### 5.3 Prefixo da branch

O CI aceita APENAS:

    feature/  bugfix/  chore/  docs/  release/  hotfix/

NAO use "feat/", "fix/", "test/". Mapeamento:

- feat -> feature/
- fix -> bugfix/
- chore -> chore/
- docs -> docs/
- test -> chore/
- refactor -> chore/
- perf -> feature/ ou chore/
- security -> chore/

### 5.4 Nome da branch

    <prefixo>/<scope>/<SXX-YY>-<descricao-kebab-case>

Exemplo: feature/users/S02-13-melhorar-formulario

## Passo 6: Formato final

    ## Analise da Issue #<N>

    **SXX-YY:** <extraido>
    **Tipo:** <feat|fix|test|docs|chore|refactor|perf|security>
    **Scope:** <um dos 12>
    **Branch sugerida:** <prefixo>/<scope>/<SXX-YY>-<descricao>

    **Commit sugerido:**
    <tipo>(<scope>): <descricao curta> [<SXX-YY>]

    - <bullet 1>
    - <bullet 2>
    - <bullet 3>

    Refs: #<N>

    **Justificativa do scope:** <2 linhas citando a regra do SCOPES.md>

## Passo 7: Perguntar proximos passos

1. "Quer que eu crie a branch com este nome?"
2. "Quer que eu implemente a issue agora?"
3. "Quer que eu gere apenas o plano em bullets?"

Nunca execute sem confirmacao explicita.

## Tratamento de erros

- URL do Projects sem parametro "issue" -> pedir numero ao usuario
- 404 -> issue nao existe ou repo privado sem acesso
- 401 -> token invalido; tentar sem token
- 403 -> rate limit; pedir git config github.token
- Sem jq -> usar python3 -m json.tool ou grep/sed
- SXX-YY nao identificado -> buscar nas issues abertas por titulo

## Alternativa: usar gh CLI (se instalado)

Se `gh` estiver disponivel e autenticado, use:

    gh issue view $NUMBER --repo $OWNER/$REPO --comments

Retorna formatado. Fallback para curl se falhar.

## Regras criticas (nao violar)

1. NUNCA criar branch, push, commit ou PR sem confirmacao
2. NUNCA inventar scope fora dos 12 do SCOPES.md
3. NUNCA usar prefixo de branch fora de: feature/, bugfix/, chore/, docs/, release/, hotfix/
4. SEMPRE citar qual regra do SCOPES.md justifica o scope
5. SEMPRE suportar URL do Projects com parametro issue=OWNER|REPO|N
