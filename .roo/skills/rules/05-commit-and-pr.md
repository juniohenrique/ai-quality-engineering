# Convenções de Commit e PR

## Commits

- Siga **Conventional Commits**: `<tipo>(<scope>): <descrição> [SXX-YY]`
- O `<scope>` deve ser um dos 12 definidos em `.github/SCOPES.md`.
- Sempre inclua o ID da issue no formato `[SXX-YY]`.
- O corpo deve ter 3-5 bullets do que foi feito.
- Sempre termine com `Refs: #N` ou `Closes: #N`.

## Pull Requests

- Use o template em `.github/pull_request_template.md`.
- Gere o arquivo em `.tmp/pr_body.md` antes de mostrar para revisão.
- Nunca faça push ou abra PR sem confirmação explícita.

## Fluxo esperado

1. Leia a issue e identifique o tipo (`feat`, `fix`, `test`, etc.).
2. Consulte `.github/SCOPES.md` para escolher o scope correto.
3. Gere o commit seguindo o formato acima.
4. Gere o `.tmp/pr_body.md` seguindo o template.
5. Mostre ambos para o usuário revisar antes de qualquer ação.
