---
name: ci-check
description: Roda localmente os mesmos checks do CI antes de sugerir commit, push ou PR. Cobre lint, unit, integration, contract, build, provider-verify, coverage e quality-gate. Use SEMPRE antes de propor commit.
---

# Skill: CI Check (rodar localmente antes do commit)

## Objetivo

Garantir que a branch passa em TODOS os jobs do CI antes de propor commit,
push ou PR. Evita empurrar trabalho quebrado para o GitHub Actions.

## Jobs do CI (ordem oficial)

1. lint - ESLint
2. unit - Vitest (testes unitarios)
3. integration - Vitest (testes de integracao, com DB)
4. contract - Pact
5. build - tsc / build do projeto
6. provider-verify - verificacao de contratos do provider
7. coverage - cobertura de testes
8. quality-gate - consolidacao dos checks acima

## Passo 1: Descobrir os scripts reais do package.json

NUNCA invente nomes de script. Leia o package.json primeiro:

    cat package.json | python3 -c "import sys,json; print('\n'.join(json.load(sys.stdin).get('scripts',{}).keys()))"

Mapeie os jobs do CI para scripts:

| Job CI          | Script provavel no package.json |
| --------------- | ------------------------------- |
| lint            | lint                            |
| unit            | test:unit ou test               |
| integration     | test:integration                |
| contract        | test:contract ou pact           |
| build           | build                           |
| provider-verify | provider:verify ou verify       |
| coverage        | test:coverage ou coverage       |
| quality-gate    | quality:gate ou gate            |

Se um script nao existir, pule o job e avise o usuario.

## Passo 2: Rodar os checks em ordem

Execute um por um. PARE no primeiro que falhar.

    npm run lint
    npm run test:unit
    npm run test:integration
    npm run test:contract
    npm run build
    npm run provider:verify
    npm run test:coverage
    npm run quality:gate

Se algum script tiver nome diferente no package.json, use o nome real
descoberto no Passo 1.

## Passo 3: Reportar resultado com checkboxes

Depois de rodar, apresente SEMPRE neste formato:

    ## Checks locais (equivalentes ao CI)

    - [x] lint
    - [x] unit
    - [ ] integration  <- FALHOU
    - [ ] contract     (nao rodou, parou antes)
    - [ ] build        (nao rodou, parou antes)
    - [ ] provider-verify
    - [ ] coverage
    - [ ] quality-gate

    ### Detalhes da falha

    <mensagem do erro completo + arquivo:linha + stacktrace relevante>

## Passo 4: Se algo falhar

NAO proponha commit. Faca:

1. Identifique a causa raiz (arquivo, linha, contexto)
2. Explique em 2-3 linhas o que esta errado
3. Sugira a CORRECAO MINIMA (nao refatoracoes amplas)
4. Pergunte se o usuario quer aplicar a correcao agora
5. So depois de corrigido e com todos os checks passando, proponha o commit

## Passo 5: Se tudo passar

Somente entao proponha o commit, seguindo:

- `.github/SCOPES.md` para tipo e scope
- `.github/CONVENTIONS.md` para formato e mensagem

Formato da proposta:

    Todos os 8 checks passaram. Posso commitar:

    <tipo>(<scope>): <descricao> [SXX-YY]

    - <bullet 1>
    - <bullet 2>
    - <bullet 3>

    Refs: #N

## Passo 6: Ordem de execucao recomendada

Para economizar tempo, rode na ordem de "mais rapido para mais lento":

1. lint (segundos)
2. build (segundos)
3. unit (rapido)
4. integration (depende de DB)
5. contract (depende de Pact)
6. provider-verify
7. coverage
8. quality-gate (consolida tudo)

Assim, se o lint falhar, voce nao perde tempo rodando integration.

## Regras criticas (nao violar)

1. NUNCA proponha commit sem ter rodado os checks locais
2. NUNCA invente nomes de script - leia o package.json
3. SEMPRE reporte o resultado com checkboxes
4. Se falhar, proponha CORRECAO primeiro - commit so depois
5. Nao modifique arquivos de teste para "fazer o CI passar" sem investigar
   a causa raiz primeiro
6. Se o erro for de integracao, verifique se o DB/container esta rodando
   antes de culpar o codigo
7. Reporte o tempo total e o numero de testes (passed/failed) quando
   disponivel
