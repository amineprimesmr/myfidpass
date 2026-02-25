#!/usr/bin/env sh
# Déploie les changements sur myfidpass.fr (commit + push → Vercel/Railway)
set -e
cd "$(dirname "$0")/.."
git add -A
if git diff --staged --quiet; then
  echo "Aucun changement à déployer."
  exit 0
fi
git commit -m "Deploy: mise à jour $(date +%Y-%m-%d)"
git push origin main
echo "Déployé. Attends 1–2 min puis rafraîchis myfidpass.fr (Cmd+Shift+R)."
