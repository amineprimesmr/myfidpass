# Réinitialiser le dev local (nettoyage complet)

Pour lancer **sans taper au terminal** au quotidien, voir **[LANCER-SANS-TERMINAL.md](./LANCER-SANS-TERMINAL.md)**.

## Une commande

```bash
npm run clean:all
npm run setup
npm run dev:local
```

`dev:local` ouvre le navigateur sur **http://localhost:5174** (Vite est configuré sur ce port).

### Front OK mais « Connexion au serveur impossible » sur `/app`

Le proxy Vite envoie `/api/*` vers le backend. Si `localhost` résout en **IPv6 (::1)** alors que Node n’écoute qu’en **IPv4**, le proxy échoue. Le projet force par défaut **`http://127.0.0.1:3001`** comme cible (`vite.config.js`). Redémarre Vite après mise à jour. Vérifie aussi : `curl -s http://127.0.0.1:3001/api/health`.

## Backend qui ne démarre pas (`better-sqlite3`)

Le script `dev-local` utilise souvent **Node 22** (`/opt/homebrew/opt/node@22/bin`).  
Si `npm run setup` a été lancé avec **Node 24** (ou autre), le module natif SQLite est compilé pour la mauvaise version.

**Correctif :**

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
cd backend && npm rebuild better-sqlite3
cd .. && npm run dev:local
```

## Ce qui est supprimé par `clean:all`

- `node_modules` (racine, `backend/`, `frontend/`)
- `frontend/dist/`, `.dev-local/`, caches Vite / couverture de tests
- **Non supprimé :** `.env`, `backend/.env`, certificats, dépôt Git

Pour aussi repartir d’une base SQLite vide : supprime manuellement les fichiers `*.db` sous `backend/data/` (s’ils existent).
