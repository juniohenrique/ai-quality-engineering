---
description: Gerar uma mensagem de commit seguindo as convenções do projeto a partir das alterações staged
---

Utilize a skill `gitflow`.

Gere uma mensagem de commit com base SOMENTE nas alterações atualmente staged.

Antes de gerar a mensagem:

1. Leia `.github/SCOPES.md` e `.github/CONVENTIONS.md`.
2. Execute:
   ```bash
   git branch --show-current
   git status --short
   git diff --cached
   git log -10 --oneline
   ```

3. Verifique se os jobs do CI passam localmente (lint, unit, integration, etc.) conforme a seção 9 do `CONVENTIONS.md`.
4. Se não houver alterações staged, informe que não existem alterações staged e pare.

Se houver alterações staged:

- Analise as alterações reais.
- Identifique o tipo e o scope correto baseado nos 12 scopes do `SCOPES.md`.
- Se não conseguir inferir o `[SXX-YY]` ou o `Refs: #N`, **pergunte ao usuário**.
- Respeite o formato: `<tipo>(<scope>): <descrição> [SXX-YY]`
- Inclua o corpo com 3-5 bullets.
- Inclua o rodapé `Refs: #N` ou `Closes: #N`.
- Retorne SOMENTE a mensagem final de commit.

**Não crie o commit.**
**Não altere nenhum arquivo.**
**Não faça push.**
