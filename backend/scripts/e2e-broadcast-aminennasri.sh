#!/usr/bin/env bash
# Test prod : 2 campagnes consécutives (compte démo App Review).
# Usage: DEMO_PASSWORD='…' ./scripts/e2e-broadcast-aminennasri.sh
set -euo pipefail
cd "$(dirname "$0")/.."

API="${API_BASE:-https://api.myfidpass.fr}"
EMAIL="aminennasri@outlook.com"
PASS="${DEMO_PASSWORD:?DEMO_PASSWORD requis}"
DEMO_SECRET="${DEMO_SECRET:-myfidpass-appstore-review-2026}"

echo "── ensure-demo (reset mot de passe démo) ──"
curl -sS -X POST "$API/api/auth/ensure-demo" \
  -H "Content-Type: application/json" \
  -H "x-demo-secret: $DEMO_SECRET" \
  -d '{}' | tee /tmp/ensure-demo.json
echo ""

echo "── login ──"
LOGIN_JSON=$(curl -sS -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(node -e "const j=JSON.parse(process.argv[1]); if(!j.token) { console.error(j); process.exit(1);} console.log(j.token)" "$LOGIN_JSON")
echo "token OK (${#TOKEN} chars)"

echo "── GET /me ──"
curl -sS "$API/api/auth/me" -H "Authorization: Bearer $TOKEN" > /tmp/me.json
SLUG=$(node -e "
const j=JSON.parse(require('fs').readFileSync('/tmp/me.json','utf8'));
const b=(j.businesses||[])[0];
if(!b||!b.slug){console.error('no business slug',j);process.exit(1)}
console.log(b.slug);
")
echo "slug=$SLUG"

echo "── stats notif ──"
curl -sS "$API/api/businesses/$SLUG/notifications/stats" \
  -H "Authorization: Bearer $TOKEN" | tee /tmp/notif-stats.json
echo ""

send_one() {
  local msg="$1"
  local n="$2"
  echo "── POST send #$n : $msg ──"
  curl -sS -X POST "$API/api/businesses/$SLUG/notifications/send" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"$msg\",\"title\":\"Test E2E\"}" | tee "/tmp/send-$n.json"
  echo ""
}

send_one "E2E test campagne A $(date +%H:%M:%S)" 1
sleep 2
send_one "E2E test campagne B $(date +%H:%M:%S)" 2
sleep 4

echo "── batches récents ──"
curl -sS "$API/api/businesses/$SLUG/notifications/batches?limit=5" \
  -H "Authorization: Bearer $TOKEN" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
const batches=(j.batches||[]).slice(0,3);
for (const b of batches) {
  const s=b.summary||{};
  console.log(b.created_at, b.trigger_name, 'sent_pass_kit=', s.sent_pass_kit, 'sent=', s.sent, 'failed=', s.failed);
}
"

echo "── history (passkit) ──"
curl -sS "$API/api/businesses/$SLUG/notifications/history?limit=6" \
  -H "Authorization: Bearer $TOKEN" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const e of (j.entries||[]).slice(0,6)) {
  console.log(e.created_at, e.channel, e.status, (e.body||'').slice(0,40));
}
"

echo "Done."
