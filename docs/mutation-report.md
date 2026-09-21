# Relatório de Baseline de Mutação - AI Quality Engineering

> Documento criado baseado na execução inicial do mutation testing com Stryker.

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

## Status

O relatório HTML completo está disponível em:
🔗 **[reports/mutation/index.html](../../reports/mutation/index.html)**

### Análise do relatório HTML

Os arquivos estáticos `/src/api/static.ts`, `/src/utils/paginate.ts`, `/src/utils/sort.ts` e `/src/utils/validators.ts` introduziram grande parte dos `noCoverage` e `ignored` mutantes, pois:
- Não possuem cobertura de testes específicos
- Não são parte da camada de negócio principal
- São auxiliares de utilidade

### Próximos Passos (S04-03/S04-04)

1. **Mapear mutantes sobreviventes**: Identificar os que são "legitimamente difíceis" (edge cases, lógica complexa) vs. faltando testes
2. **Criar/melhorar testes**: Adicionar testes zuando ou tornar específicos para casos que falharam no mutation score
3. **Melhorar cobertura**: Cobrir arquivos de utilidade e API static

---

## Legenda de Status de Mutante

| Status | Descrição | Ação Recomendada |
|--------|-----------|------------------|
| ✅ Killed | Teste detectou a mutação | OK - mantenha o teste |
| ⚠️ No Coverage | Mutação não coberta por nenhum teste | Adicione testes |
| 👽 Survived | Mutação não foi detectada | Verifique se é bug ou falta de teste |
| ⏰ Timeout | Teste não completou com a mutação | Verifique asserts/loops infinitos |
| ⏹️ Ignored | Mutação foi ignorada manualmente | Ajuste se for válido ignorar |

---

**Referência**: Baseline fixado em 2026-09-21 para futuro comparativo de evolução do teste quality。