#!/usr/bin/env bash
# Test GET /api/v1/passes/... en local (seed DB, démarre serveur, curl, affiche logs).
set -e
cd "$(dirname "$0")/.."
TEST_DIR="./test-data"
export DATA_DIR="$TEST_DIR"
export PORT=3099
export NODE_ENV=development

# Seed
mkdir -p "$TEST_DIR"
node scripts/seed-passkit-test.js

# Token ApplePass (même algo que getPassAuthenticationToken)
TOKEN=$(node -e "
const crypto = require('crypto');
const secret = process.env.PASSKIT_SECRET || 'fidpass-default-secret-change-in-production';
const serial = 'a86a5b11-0b01-4076-b853-5c369807ce55';
console.log(crypto.createHmac('sha256', secret).update(serial).digest('hex').slice(0, 32));
")

echo "--- Démarrage serveur (port $PORT) ---"
node src/index.js 2>&1 | tee /tmp/passkit-test-server.log &
PID=$!
trap "kill $PID 2>/dev/null || true" EXIT

# Attendre que le serveur écoute
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 1
done

echo ""
echo "--- Requête GET pass (simulation iPhone) ---"
HTTP=$(curl -s -o /tmp/passkit-response.bin -w "%{http_code}" \
  -H "Authorization: ApplePass $TOKEN" \
  "http://127.0.0.1:$PORT/api/v1/passes/pass.com.fidelity/a86a5b11-0b01-4076-b853-5c369807ce55")
echo "HTTP $HTTP"
echo "--- Dernières lignes du serveur ---"
tail -20 /tmp/passkit-test-server.log

if [ "$HTTP" = "200" ]; then
  echo "OK: le serveur renvoie 200 (pass généré)."
else
  echo "Échec: attendu 200, reçu $HTTP."
  head -c 500 /tmp/passkit-response.bin | xxd | head -5
fi
