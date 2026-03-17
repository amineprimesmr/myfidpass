# Lancer l’app en local (frontend + backend)

## Prérequis

- **Node.js 18, 20 ou 22 (LTS)** — le backend ne tourne pas correctement avec Node 24 à cause d’un souci de compatibilité avec Express/body-parser en ESM.
- Vérifier : `node -v` (affiche par ex. `v20.x.x` ou `v22.x.x`).
- Si tu as Node 24 : installe [nvm](https://github.com/nvm-sh/nvm) puis `nvm install 20` et `nvm use 20`.

## Une seule commande (recommandé)

À la racine du projet :

```bash
npm run dev
```

- **Backend** : http://localhost:3001  
- **Frontend** : http://localhost:5174  
- **Carte fidélité (démo)** : http://localhost:5174/fidelity/demo  

Le frontend envoie les appels API vers `/api/...` ; Vite les proxyfie vers le backend (voir `frontend/vite.config.js`).

## Lancer séparément

- Terminal 1 — backend : `npm run backend` (ou `node backend/src/index.js`)
- Terminal 2 — frontend : `npm run frontend` (ou `cd frontend && npm run dev`)

## Vérifier que tout tourne

- Backend : `curl http://localhost:3001/health` → doit renvoyer `{"ok":true}`
- Frontend : ouvrir http://localhost:5174 dans le navigateur
