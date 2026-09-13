#!/bin/bash
# scripts/new-branch.sh
# Uso: ./scripts/new-branch.sh <ID-issue> <título> [tipo]
# Tipo: feature (padrão) | bugfix | hotfix | docs | chore

set -e

ISSUE_ID=$1
TITLE=$2
TYPE=${3:-feature}

if [ -z "$ISSUE_ID" ] || [ -z "$TITLE" ]; then
    echo "❌ Uso: $0 <ID-issue> <título> [tipo]"
    echo "   Tipos: feature (padrão) | bugfix | hotfix | docs | chore"
    echo ""
    echo "   Ex: $0 S01-03 'Criar arquitetura Controller/Service/Repository'"
    exit 1
fi

# Gera slug: minúsculas, sem acentos, espaços → hífen
SLUG=$(echo "$TITLE" \
    | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g' \
    | sed -E 's/^-+|-+$//g' \
    | cut -c1-50)

BRANCH_NAME="${TYPE}/${ISSUE_ID}-${SLUG}"

echo "🌿 Criando branch: $BRANCH_NAME"
echo ""

# Garantir que develop está atualizada
CURRENT=$(git branch --show-current)
if git rev-parse --verify develop >/dev/null 2>&1; then
    BASE=develop
elif git rev-parse --verify main >/dev/null 2>&1; then
    BASE=main
else
    BASE=$(git branch --show-current)
fi

echo "📍 Base: $BASE"
git checkout "$BASE"
git pull origin "$BASE" 2>/dev/null || echo "   (sem remote ou offline, continuando)"

# Criar branch
git checkout -b "$BRANCH_NAME"

echo ""
echo "✅ Branch criada: $BRANCH_NAME"
echo ""
echo "Próximos passos:"
echo "  1. Implementar a tarefa"
echo "  2. git add ."
echo "  3. git commit -m 'feat(escopo): descrição [$ISSUE_ID]'"
echo "  4. git push -u origin $BRANCH_NAME"
echo "  5. gh pr create --base develop --title '[$ISSUE_ID] $TITLE'"
