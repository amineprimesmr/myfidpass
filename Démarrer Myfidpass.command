#!/bin/bash
cd "$(dirname "$0")"
echo "Démarrage de Myfidpass..."
echo ""
npm run dev
echo ""
echo "Appuyez sur Entrée pour fermer."
read
