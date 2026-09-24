---
name: gitflow
description: Gera mensagens de commit e descrições de Pull Request com base no estado real do repositório, nas convenções do projeto (.github/SCOPES.md, .github/CONVENTIONS.md) e no template oficial. Use quando o usuário solicitar commit ou PR.
---

# Gitflow

Você é responsável por gerar mensagens de commit e descrições de Pull Request com base exclusivamente no estado real do repositório e nas convenções do projeto.

## Princípios

- Nunca invente alterações.
- Nunca afirme que testes foram executados sem evidências.
- Nunca afirme que um problema foi corrigido sem que as alterações sustentem essa conclusão.
- Seja objetivo e tecnicamente preciso.
- Respeite as convenções já utilizadas pelo repositório.
- Analise o estado real do Git antes de gerar qualquer conteúdo.
- Não altere arquivos fora do escopo de geração de texto (o único arquivo que pode ser gerado é o `.tmp/pr_body.md`).
- Não crie commits ou faça push sem confirmação explícita.
- Não crie Pull Requests sem confirmação explícita.

## Validação de Convenções (Obrigatório)

Antes de gerar qualquer commit ou PR, você DEVE ler os seguintes arquivos:

1. `.github/SCOPES.md` — Para validar se o scope escolhido é um dos 12 permitidos.
2. `.github/CONVENTIONS.md` — Para verificar as regras de branch, CI e fluxo.
3. `.github/pull_request_template.md` — Para o formato exato do PR.

## Inspeção do repositório

Antes de gerar uma mensagem de commit, analise:

1. Branch atual:

   ```bash
   git branch --show-current
   ```

2. Estado do repositório:

   ```bash
   git status --short
   ```

3. Alterações staged:

   ```bash
   git diff --cached
   ```

4. Histórico recente:

   ```bash
   git log -10 --oneline
   ```

5. **Verificação de CI (CONVENTIONS.md seção 9):**
   Execute os comandos de CI localmente para garantir que o commit não está quebrado.
   ```bash
   npm run lint
   npm run test:unit
   npm run test:integration
   npm run test:contract
   npm run build
   npm run provider:verify
   npm run test:coverage
   npm run quality:gate
   ```
   Se algum falhar, **não gere o commit**. Corrija o problema primeiro.

## Convenção de commits

Utilize Conventional Commits, com o padrão exato do projeto:

```text
<tipo>(<scope>): <descrição> [SXX-YY]
```

Tipos permitidos:

- `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `perf`, `security`, `ci`, `build`

Scopes permitidos (consulte `.github/SCOPES.md` para detalhes):

- `users`, `payments`, `queue`, `api`, `tests`, `security`, `perf`, `observability`, `ci`, `config`, `docs`, `ai`

Regras adicionais:

- A descrição deve ser imperativa e ter no máximo 72 caracteres.
- O ID `[SXX-YY]` deve estar presente. Se não for possível inferir, pergunte ao usuário.
- O corpo deve conter de 3 a 5 bullets explicando o que foi feito.
- O rodapé deve conter `Refs: #N` ou `Closes: #N`. Se não for possível inferir, pergunte ao usuário.

## Estrutura do Pull Request

O PR deve seguir o template em `.github/pull_request_template.md`.

### Título

Crie um título curto no formato Conventional Commits que represente a alteração como um todo.

### Corpo

Preencha todos os campos do template:

- **Issue:** `Closes #N`
- **Sprint:** `Sprint XX — Semanas Y–Z`
- **Objetivo:** Cole o objetivo da issue
- **O que foi feito:** Bullets das mudanças
- **Evidências:** Código, Teste, Documentação
- **Checklist:** Marcar o que foi feito
- **Dependências:** Depende de / Bloqueia

## Formato da resposta

### Para commit

Retorne SOMENTE a mensagem final de commit, sem explicações:

```text
tipo(scope): descrição [SXX-YY]

- Bullet 1
- Bullet 2
- Bullet 3

Refs: #N
```

### Para PR

Gere o arquivo `.tmp/pr_body.md` com o conteúdo preenchido.
Depois, mostre o conteúdo para o usuário revisar.
Nunca faça push ou abra o PR sem confirmação explícita.
