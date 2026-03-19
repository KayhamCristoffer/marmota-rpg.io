#!/bin/bash
# ================================================================
# deploy-rules.sh  –  Publica as regras de segurança do Firebase
# ================================================================
# USO:
#   chmod +x deploy-rules.sh
#   ./deploy-rules.sh
#
# PRÉ-REQUISITOS:
#   npm install -g firebase-tools
#   firebase login
# ================================================================

set -e

PROJECT_ID="marmota-rpg"

echo "========================================"
echo "  Publicando Regras Firebase Realtime DB"
echo "  Projeto: $PROJECT_ID"
echo "========================================"
echo ""

# Verifica se firebase-tools está instalado
if ! command -v firebase &> /dev/null; then
  echo "❌ Firebase CLI não encontrado."
  echo "   Instale com: npm install -g firebase-tools"
  exit 1
fi

# Verifica login
echo "🔐 Verificando autenticação..."
firebase projects:list --no-interactive 2>/dev/null | grep -q "$PROJECT_ID" || {
  echo "⚠️  Não logado ou projeto não encontrado. Execute: firebase login"
  exit 1
}

echo "📋 Regras a publicar (firebase-rules.json):"
echo "--------------------------------------------"
cat firebase-rules.json
echo ""
echo "--------------------------------------------"
echo ""

read -p "Confirmar publicação? (s/N): " resp
if [[ ! "$resp" =~ ^[sS]$ ]]; then
  echo "Cancelado."
  exit 0
fi

echo ""
echo "🚀 Publicando regras..."
firebase deploy --only database --project "$PROJECT_ID"

echo ""
echo "✅ Regras publicadas com sucesso!"
echo ""
echo "📌 Qualquer usuário com role='admin' no banco pode agora:"
echo "   • Criar, editar e deletar quests"
echo "   • Criar, editar e deletar conquistas"
echo "   • Gerenciar usuários"
