---
name: css-styling
description: Aplica estilizacao CSS moderna e consistente no projeto.
---

# Skill: Estilizacao com CSS Moderno

## Design tokens (obrigatorio)

Defina no `:root` do CSS principal:

    :root {
      --color-primary: #2563eb;
      --color-primary-hover: #1d4ed8;
      --color-error: #dc2626;
      --color-success: #16a34a;
      --color-bg: #f8fafc;
      --color-surface: #ffffff;
      --color-text: #0f172a;
      --color-text-muted: #64748b;
      --color-border: #e2e8f0;
      --radius: 10px;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
      --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
      --space-1: 0.25rem;
      --space-2: 0.5rem;
      --space-3: 0.75rem;
      --space-4: 1rem;
      --space-6: 1.5rem;
      --space-8: 2rem;
      --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      --transition: 0.2s ease;
    }

## Regras

- Nunca hardcode cores, espacamentos ou fontes. Use as variaveis.
- Prefira `flex`/`grid` para layout.
- Animacoes devem ser sutis (`transition: var(--transition)`).
- Use `@media (prefers-reduced-motion: reduce)` para desligar animacoes.

## Formularios

- `form` com `max-width: 480px`, `margin: auto`, `padding: var(--space-8)`.
- Campos com `border: 1px solid var(--color-border)`, `border-radius: var(--radius)`, transicao no `:focus`.
- Botao primario com `background: var(--color-primary)`, hover mais escuro.
