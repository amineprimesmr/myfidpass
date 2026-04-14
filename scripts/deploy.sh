#!/usr/bin/env sh
# Déploie les changements sur myfidpass.fr (commit + push → Vercel/Railway)
set -e
cd "$(dirname "$0")/.."
git add -A
if ! git diff --staged --quiet; then
  git commit -m "Deploy: mise à jour $(date +%Y-%m-%d)"
fi
# Pousse même si rien à committer mais des commits locaux pas encore sur origin
git fetch origin 2>/dev/null || true
if git rev-parse --verify refs/remotes/origin/main >/dev/null 2>&1; then
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse refs/remotes/origin/main)" ]; then
    echo "Rien à pousser (déjà à jour avec origin/main)."
    exit 0
  fi
fi
git push origin main
echo "Déployé. Attends 1–2 min puis rafraîchis myfidpass.fr (Cmd+Shift+R)."
