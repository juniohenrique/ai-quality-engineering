---
description: Gerar título e descrição de Pull Request seguindo o template oficial, comparando a branch atual com develop
---

Utilize a skill `gitflow`.

Gere o conteúdo de um Pull Request para a branch atual.

A branch de destino padrão é `develop`.

Antes de gerar o Pull Request:

1. Leia `.github/SCOPES.md`, `.github/CONVENTIONS.md` e `.github/pull_request_template.md`.
2. Execute:
   ```bash
   git branch --show-current
   git status --short
   git log --oneline develop..HEAD
   git diff --stat develop...HEAD
   git diff develop...HEAD
   ```

3. Utilize o histórico de commits e a diferença completa da branch para entender o objetivo geral da alteração.
4. Não faça apenas um resumo do último commit.

Gere o conteúdo preenchendo o template em `.github/pull_request_template.md`:

- **Issue:** `Closes #N`
- **Sprint:** `Sprint XX — Semanas Y–Z`
- **Objetivo:** O objetivo da issue
- **O que foi feito:** Checkboxes com os itens
- **Evidências:** Código, Teste, Documentação
- **Checklist:** Marcar o que foi feito
- **Dependências:** Depende de / Bloqueia

Salve o rascunho em `.tmp/pr_body.md` antes de mostrar para revisão.

**Não crie o Pull Request.**
**Não altere arquivos.**
**Não faça push.**

Retorne somente o conteúdo final do Pull Request para revisão.
