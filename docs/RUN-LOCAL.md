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

**Roue en local (tickets illimités)** : le front affiche des tickets illimités sur `localhost` / `127.0.0.1` ; le backend **ne débite pas** le wallet au spin si le `Host` est local et `NODE_ENV !== 'production'` (voir `shouldSkipTicketConsumptionForLocalDev` dans `games-helpers.js`). `FIDPASS_LOCAL_UNLIMITED_TICKETS=0` désactive ce mode ; `=1` l’active même avec `NODE_ENV=production` (utile si tu testes en local avec `NODE_ENV=production`).

## Lancer séparément

- Terminal 1 — backend : `npm run backend` (ou `node backend/src/index.js`)
- Terminal 2 — frontend : `npm run frontend` (ou `cd frontend && npm run dev`)

## Vérifier que tout tourne

- Backend : `curl http://localhost:3001/health` → doit renvoyer `{"ok":true}`
- Frontend : ouvrir http://localhost:5174 dans le navigateur
