# Convenções do Projeto — AI Quality Engineering

Fonte única de verdade. Consumido por Cline, GitHub Copilot Chat e humanos.

## 1. Contexto

Projeto de AI Quality Engineering. Stack: Node.js, TypeScript, HTTP nativo, 
HTML/CSS/JS vanilla no frontend, PostgreSQL, RabbitMQ, Vitest, Playwright.

## 2. Padrões de Código

TypeScript sempre. Nomes em kebab-case (arquivos), camelCase (variáveis), 
PascalCase (classes). Controllers orquestram, Services têm lógica, Repositories 
isolam dados. Frontend sem frameworks e sem bibliotecas CSS.

## 3. UI (HTML/CSS/JS)

Arquitetura:
- public/css/base.css — tokens, reset, componentes compartilhados
- public/css/<pagina>.css — estilos específicos
- Importar base.css antes do específico

Design tokens obrigatórios em :root:
--color-primary #2563eb, --color-primary-hover #1d4ed8, --color-error #dc2626,
--color-success #16a34a, --color-bg #f8fafc, --color-surface #ffffff,
--color-text #0f172a, --color-text-muted #64748b, --color-border #e2e8f0,
--radius 10px, --shadow-sm/md/lg, --space-1 a --space-8,
--font-sans 'Inter', --transition 0.2s ease

Acessibilidade: label for em todo input, role=alert + aria-describedby nos erros,
aria-busy=true durante loading, botão disabled durante envio.

Formulários: .form-card, fieldset com legend, feedback em [data-testid="user-message"]
com role=status e aria-live=polite.

## 4. Commits

Formato: <tipo>(<scope>): <descrição> [SXX-YY]

Tipos: feat, fix, test, docs, chore, refactor, perf, security, ci, build.
Scope: um dos 12 em .github/SCOPES.md.
Descrição imperativa, ≤ 72 caracteres. Corpo com 3-5 bullets.
Rodapé: Refs: #N ou Closes: #N.

## 5. Pull Requests

Base: develop. Template: .github/pull_request_template.md.
Rascunho em .tmp/pr_body.md antes de mostrar.
Nunca fazer push ou abrir PR sem confirmação.

## 6. Scopes

Consulte .github/SCOPES.md. Resumo: users, payments, queue, api, tests,
security, perf, observability, ci, config, docs, ai.

## 7. Skills

user-form: vanilla HTML/CSS/JS, validação HTML5+JS, span.error por campo,
feedback em [data-testid="user-message"], POST /users ou PUT /users/:id,
payload { email, name }.

css-styling: design tokens sempre, flex/grid, .form-card com fadeInUp,
botão primário com hover translateY(-1px), @media (max-width: 640px).

## 8. Fluxo de Trabalho

1. Ler issue, identificar tipo.
2. Consultar SCOPES.md.
3. Branch a partir de develop: <tipo>/<scope>/<SXX-YY>-<descricao>.
4. Implementar seguindo convenções.
5. Commit com [SXX-YY] + Refs: #N.
6. Gerar .tmp/pr_body.md.
7. Mostrar antes de push.

Última atualização: Setembro 2026
