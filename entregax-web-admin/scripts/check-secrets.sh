#!/usr/bin/env bash
# Pre-build security gate.
# Bloquea el build si encuentra patrones que NO deben llegar a producción.
#
# Uso: se ejecuta automáticamente vía npm script "prebuild".

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$(dirname "$0")/.."

echo "🔒 Pre-build security check..."

FOUND=0

# 1) Secretos típicos de Stripe / AWS / claves API (deben ir entre comillas con valor real)
SECRET_PATTERNS='["'\'']sk_live_[A-Za-z0-9]{20,}["'\'']|["'\'']sk_test_[A-Za-z0-9]{20,}["'\'']|["'\'']AKIA[0-9A-Z]{16}["'\'']|aws_secret_access_key\s*=\s*["'\''][A-Za-z0-9/+=]{20,}'
if grep -rEn "$SECRET_PATTERNS" src 2>/dev/null; then
  echo -e "${RED}❌ Posibles secretos hardcodeados encontrados.${NC}"
  FOUND=1
fi

# 2) URLs de localhost en código no-comentado
if grep -rEn "['\"]http://localhost" src 2>/dev/null | grep -v '^\s*//' | grep -v '\.test\.' ; then
  echo -e "${YELLOW}⚠️  Referencias a localhost detectadas (revisar si son intencionales).${NC}"
fi

# 3) console.log con tokens / passwords
if grep -rEn "console\.(log|info|debug).*(token|password|secret|jwt)" src 2>/dev/null; then
  echo -e "${RED}❌ console con tokens/secretos detectado.${NC}"
  FOUND=1
fi

if [ $FOUND -ne 0 ]; then
  echo -e "${RED}Build cancelado por security gate.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Pre-build OK.${NC}"
