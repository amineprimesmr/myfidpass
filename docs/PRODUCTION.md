# Fidpass — Production, backend et scalabilité

## Pourquoi « Erreur lors de la création » ?

En production, le **frontend** (myfidpass.fr) et l’**API** (backend Node) sont séparés :

1. **Le site myfidpass.fr** (Vercel) sert uniquement des fichiers statiques (HTML, JS, CSS). Il n’y a **pas** de route `/api` sur Vercel.
2. **La création de carte** envoie une requête `POST /api/businesses` au **backend**. Si la variable **`VITE_API_URL`** n’est pas définie sur Vercel au moment du build, le frontend appelle `myfidpass.fr/api/businesses` → **404**, donc « Erreur lors de la création ».

**À faire pour que ça marche :**

- Déployer le **backend** (Railway, Render, etc.) et exposer l’URL (ex. `https://api.myfidpass.fr`).
- Sur **Vercel** (projet Fidpass) : **Settings → Environment Variables** → ajouter **`VITE_API_URL`** = `https://api.myfidpass.fr` (sans slash final).
- Redéployer le frontend (nouveau build avec cette variable).
- Sur le backend : définir **`FRONTEND_URL`** = `https://myfidpass.fr`, **`NODE_ENV`** = `production` et **`JWT_SECRET`** (chaîne aléatoire forte pour signer les tokens de connexion restaurateur).

Après ça, le bouton « Créer ma carte » enverra bien la requête à l’API et la création pourra réussir.

---

## Comment on gère le backend ?

| Élément | Rôle |
|--------|------|
| **Hébergement** | Un serveur Node (Railway, Render, VPS) qui exécute `backend/src/index.js`. |
| **Variables d’environnement** | `.env` ou config dans le dashboard (PORT, FRONTEND_URL, PASS_TYPE_ID, TEAM_ID, ORGANIZATION_NAME, certificats Apple si besoin). |
| **Démarrage** | `node backend/src/index.js` ou `npm run start` dans le dossier backend. |
| **Santé** | `GET /health` → `{ ok: true }` pour vérifier que l’API répond. |
| **Logs** | Sortie console (stdout). En prod, les hébergeurs les agrègent (Railway/Render onglet Logs). |

Le backend ne sert **que** l’API (pas les pages du site). Le site est servi par Vercel.

---

## Base de données (base « clients »)

- **Moteur** : **SQLite** (fichier `backend/data/fidelity.db`).
- **Contenu** :
  - **users** : comptes restaurateurs (email, mot de passe hashé, nom). Un user peut posséder plusieurs **businesses**.
  - **businesses** : commerces (nom, slug, couleurs, token dashboard, règles de points, **user_id** optionnel pour lier au compte).
  - **members** : clients finaux (nom, email, points, last_visit_at, liés à un business).
  - **transactions** : historique des ajouts de points et remises.
- **Emplacement** : sur la machine qui exécute le backend (ex. disque persistant Railway/Render).
- **Sauvegarde** : à faire côté hébergeur (backups du volume/disque où se trouve `data/`) ou script qui copie `fidelity.db` vers un stockage externe.

Pour l’instant il n’y a **pas** d’interface pour « voir toute la base » : tout passe par l’API (dashboard par commerce, création de membres, etc.). Un admin pourrait ouvrir le fichier SQLite en lecture seule pour analyse.

---

## C’est vraiment prêt pour la production ?

**Oui, sous conditions :**

- **Backend déployé** avec les bonnes variables (FRONTEND_URL, certificats Apple, etc.).
- **Frontend** avec **VITE_API_URL** pointant vers ce backend.
- **DNS** : myfidpass.fr → Vercel, api.myfidpass.fr → backend.
- **Certificats Apple Wallet** présents sur le serveur (ou chargés via variables d’env).
- **HTTPS** partout (Vercel et hébergeur backend le gèrent en général).

**À améliorer pour une prod « parfaite » :**

- **Auth** : le dashboard est protégé par un lien secret (token dans l’URL). Pour plus de sécurité, ajouter une vraie connexion (email/mot de passe ou magic link) plus tard.
- **Limite de taille** : logo limité à 5 Mo côté API ; pas de rate limiting global (possible d’en ajouter).
- **Sauvegarde DB** : automatiser des backups réguliers de `fidelity.db`.

---

## Scalabilité

| Composant | État actuel | Évolutif ? |
|-----------|-------------|------------|
| **Frontend** | Statique sur Vercel | Oui, Vercel scale bien. |
| **API** | Une instance Node, une base SQLite | Suffisant pour des centaines de commerces et des milliers de membres. |
| **SQLite** | Un fichier, un seul writer | Jusqu’à un certain volume (ordre de grandeur : dizaines de milliers de lignes) ; pas de réplication multi-instances. |
| **Fichiers** | Logo/certs sur le disque du serveur | Idem : un seul serveur = pas de partage de disque entre instances. |

Pour **scaler fort** (plusieurs instances API, haute dispo) :

- Remplacer SQLite par **PostgreSQL** (ou autre SGBD géré).
- Stocker les logos/certs dans un **stockage objet** (S3, etc.) au lieu du disque local.
- Ajouter **rate limiting** et **cache** si besoin.

Pour l’accueil de « tout le monde » au début (nombre raisonnable de commerces et de clients), l’architecture actuelle est **adaptée** si le backend est bien déployé et configuré.

---

## Checklist rapide « tout est prêt »

- [ ] Backend déployé (URL ex. https://api.myfidpass.fr).
- [ ] Variables backend : NODE_ENV=production, FRONTEND_URL=https://myfidpass.fr, + Apple Wallet.
- [ ] Sur Vercel : VITE_API_URL = URL du backend (ex. https://api.myfidpass.fr).
- [ ] Redéploiement frontend après ajout de VITE_API_URL.
- [ ] Test : création d’une carte sur myfidpass.fr → succès (et pas « Erreur lors de la création »).
- [ ] Test : lien reçu → page carte → ajout Apple Wallet qui fonctionne.

Une fois ces points ok, le logiciel est prêt à accueillir des utilisateurs en production.
