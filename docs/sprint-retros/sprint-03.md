# Sprint Retrospective — Sprint 03

**Data:** 2026-09-XX
**Release:** v0.3.0

## KEEP ✅

- **Contract testing pegando breaking changes em segundos**
- **Property-based testing encontrando bugs que exemplos não pegariam**
- **Meta-testes (S03-05, S03-13) provando que as ferramentas funcionam**
- **Documentação em paralelo com implementação**
- **Experimentos em `.skip`** — documenta sem quebrar CI
- **Bug proposital nunca commitado** — disciplina mantida

## PROBLEM ❌

- **Config do Vitest com bugs** — só `.test.ts`, sem exclude de `tests/e2e/`
- **`.spec.ts` (pagination, validation) rodaram no CI só no Sprint 3** — silenciosamente ignorados antes
- **Teste de integração do server flaky** — timeout curto em CI
- **Verificações locais nem sempre coincidem com CI** — descoberta recorrente

## CHANGE 🔄

- **Sempre validar que os testes novos aparecem na lista de execução** — `npm test` deve mostrar o arquivo
- **Rodar suite 3x antes de fechar sprint** — detectar flaky cedo
- **Config de testes é código de infra** — revisar a cada sprint
- **Contract testing sem Pact Broker local** — PactFlow free é suficiente
- **Property tests devem cobrir invariantes, não exemplos disfarçados**

## LEARNING 📚

### Contract Testing
- Consumer define **o que espera** do provider
- Provider verification testa contra contrato real
- Breaking changes bloqueiam o merge em segundos
- Pact Broker é útil a partir do 2º serviço integrado

### Property-Based Testing
- Invariantes > exemplos: `∀ x: sort(sort(x)) === sort(x)`
- `fc.array`, `fc.integer`, `fc.emailAddress` geram inputs válidos
- Shrinking reduz contraexemplo ao mínimo reproduzível
- Contraexemplo mínimo facilita debug em 10x

### Meta-testes
- Provar que a ferramenta funciona vale o esforço
- Bug proposital + documentação = material didático
- `.skip` em experimentos evita quebrar CI

## EVIDENCE 🎯

- `tests/contract/user.consumer.pact.spec.ts` — consumer contract
- `tests/contract/user.provider.verify.ts` — provider verification
- `tests/property/sorting.property.spec.ts` — 5 propriedades
- `tests/property/pagination.property.spec.ts` — 3 propriedades
- `tests/property/validation.property.spec.ts` — 4 propriedades
- `tests/property/shrinking.experiment.spec.ts` — experimento de shrinking
- `docs/test-architecture.md` — seções Contract, Property, Shrinking, Prova de Detecção
- `.github/workflows/ci.yml` — job `contract`
