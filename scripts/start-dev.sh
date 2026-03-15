#!/bin/bash
# Démarre frontend + backend pour le dev local
cd "$(dirname "$0")/.."
echo ""
echo "  Démarrage..."
echo "  Backend  → http://localhost:3001"
echo "  Frontend → http://localhost:5173"
echo "  App      → http://localhost:5173/app"
echo ""
echo "  Ne ferme pas ce terminal !"
echo ""
exec npm run dev
