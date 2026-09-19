---
name: api-integration
description: Padroniza chamadas à API do projeto.
---

# Skill: Integração com API

## Padrões

- Todas as chamadas vão em `src/services/<domínio>Service.ts`.
- Use `fetch` nativo ou `axios` (se já estiver no projeto).
- Sempre trate erros e retorne mensagens amigáveis.
- Use `import.meta.env.VITE_API_URL` para a URL base.

## Estrutura de um serviço

```typescript
export const userService = {
  async list(): Promise<User[]> { ... },
  async create(input: CreateUserInput): Promise<User> { ... },
  async update(id: string, input: Partial<CreateUserInput>): Promise<User> { ... },
  async remove(id: string): Promise<void> { ... },
};
```
