#!/bin/bash
# scripts/merge.sh
# Uso: ./scripts/merge.sh <número-PR> <tipo>
# Tipo: feature | bugfix | docs | release | hotfix

set -e

PR=$1
TYPE=$2

if [ -z "$PR" ] || [ -z "$TYPE" ]; then
    echo "❌ Uso: $0 <número-PR> <tipo>"
    echo "   Tipos: feature | bugfix | docs | chore| release | hotfix"
    echo ""
    echo "   Ex: $0 42 feature"
    exit 1
fi

case "$TYPE" in
    feature|bugfix|docs|chore)
        echo "🔀 Squash merge (PR #$PR) — histórico limpo"
        gh pr merge "$PR" --squash --delete-branch
        ;;
    release|hotfix)
        echo "🔀 Merge commit (PR #$PR) — preserva histórico"
        gh pr merge "$PR" --merge --delete-branch
        ;;
    *)
        echo "❌ Tipo inválido: $TYPE"
        echo "   Use: feature, bugfix, docs, chore, release, hotfix"
        exit 1
        ;;
esac

echo ""
echo "✅ Merge concluído"
