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

**Roue en local (tickets illimités)** : le front affiche des tickets illimités sur `localhost` / `127.0.0.1` / `::1` ou avec `?tickets=unlimited`, et envoie `X-Fidpass-Unlimited-Tickets-Demo: 1` sur le POST spin. L’API ne débite pas si le `Host` est local (`shouldSkipTicketConsumptionForLocalDev`) **ou** si `Origin` / `Referer` est local — utile quand Vite appelle **api.myfidpass.fr** (`shouldSkipTicketConsumptionForLocalBrowser`). `FIDPASS_LOCAL_UNLIMITED_TICKETS=0` coupe tout ; `=1` force le mode Host local même en `NODE_ENV=production`. API prod : `FIDPASS_BLOCK_LOCAL_ORIGIN_UNLIMITED_SPINS=1` refuse le contournement via `Origin` localhost. `?tickets=unlimited` sur un domaine non-local : `FIDPASS_TRUST_REMOTE_UNLIMITED_TICKETS_HEADER=1` sur l’API.

## Lancer séparément

- Terminal 1 — backend : `npm run backend` (ou `node backend/src/index.js`)
- Terminal 2 — frontend : `npm run frontend` (ou `cd frontend && npm run dev`)

## Vérifier que tout tourne

- Backend : `curl http://localhost:3001/health` → doit renvoyer `{"ok":true}`
- Frontend : ouvrir http://localhost:5174 dans le navigateur
