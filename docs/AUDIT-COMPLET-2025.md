# Audit complet Fidpass (myfidpass.fr) — Bilan cru et intégral

**Date :** 16 mars 2025  
**Périmètre :** 100 % du code (frontend, backend, config, flux), sécurité, qualité, maintenabilité.

---

## 1. Synthèse exécutive

| Critère | Verdict |
|--------|--------|
| **Fonctionnel** | ✅ Complet : auth, dashboard, carte fidélité (Apple/Google Wallet), caisse, jeux, notifs, paiement Stripe. |
| **Sécurité** | 🟠 Correcte de base, mais manques importants (rate limit, secrets par défaut, vulnérabilités npm). |
| **Qualité code** | 🔴 Problèmes majeurs : un fichier frontend monolithique (~8k lignes), pas de tests, pas de lint. |
| **Maintenabilité** | 🟠 Migrations DB en dur, peu de typage, duplication. |
| **Production** | ✅ Déploiement Vercel + Railway opérationnel, CORS et webhook Stripe OK. |

**En résumé :** le produit est livrable et cohérent, mais la dette technique et quelques risques de sécurité doivent être traités pour une base saine à long terme.

---

## 2. Architecture et flux

### 2.1 Stack

- **Frontend :** Vite 5, React 19, Tailwind 4, Framer Motion, Three.js, html5-qrcode. Point d’entrée unique : `frontend/src/main.js` (routage pathname + hash).
- **Backend :** Node (ESM), Express 4, better-sqlite3. Point d’entrée : `backend/src/index.js`.
- **Données :** SQLite (`backend/data/fidelity.db` ou `DATA_DIR` en prod).
- **Auth :** JWT (90j), bcrypt, Google OAuth2, Sign in with Apple.
- **Paiement :** Stripe Checkout + webhook vérifié par signature.
- **Déploiement :** Vercel (front, rewrites `/api` → api.myfidpass.fr), Railway (backend).

### 2.2 Flux utilisateur principaux

1. **Landing** → `/creer-ma-carte` (templates) → `/choisir-offre` → `/checkout` (Stripe) → `/app`.
2. **Auth :** `/login` ou `/register` → POST `/api/auth/*` → JWT en `localStorage` → redirection.
3. **Commerçant :** `/app` (JWT) ou `/dashboard?token=...` (dashboard_token) → API businesses/dashboard.
4. **Client fidélité :** `/fidelity/:slug` → bootstrap client → création membre, Apple/Google Wallet, QR.
5. **Jeu :** `/fidelity/:slug/jeu` → tickets, conversion, spins → API games.

Tout le routage et l’UI sont gérés dans `main.js` (routage pathname, affichage/masquage de blocs, formulaires, appels API).

---

## 3. Problèmes critiques (à traiter en priorité)

### 3.1 Sécurité

- **JWT_SECRET et PASSKIT_SECRET par défaut en code**
  - `backend/src/routes/auth.js` : `JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production"`.
  - `backend/src/middleware/auth.js` : même fallback.
  - `backend/src/pass.js` : `PASSKIT_SECRET || "fidpass-default-secret-change-in-production"`.
  - **Risque :** si en prod une de ces variables n’est pas définie (oubli Railway), les tokens sont signés avec une valeur connue → usurpation de session ou de pass.
  - **Recommandation :** en production, refuser de démarrer si `JWT_SECRET` ou `PASSKIT_SECRET` sont absents (pas de fallback).

- **Pas de rate limiting sur auth et création de membres**
  - `/api/auth/login`, `/api/auth/register` et `POST .../members` sont sans limite par IP.
  - **Risque :** brute-force sur mots de passe, création de comptes en masse, abus sur création de membres.
  - **Recommandation :** ajouter `express-rate-limit` (ex. 5–10 req/min pour login/register, quota raisonnable pour members).

- **Vulnérabilités npm (backend)**
  - `npm audit` (backend) : **3 vulnérabilités haute gravité** (jsonwebtoken via `apn`, node-forge via `apn`).
  - Correctif proposé : `npm audit fix --force` → changement majeur de `apn` (risque de régression).
  - **Recommandation :** soit migrer vers une alternative à `apn` compatible avec une version sûre de jsonwebtoken, soit accepter le risque temporairement et planifier la mise à jour.

- **Route de reset globale**
  - `POST /api/dev/reset` : en production, protégée par `RESET_SECRET` ; en dev, si `RESET_SECRET` n’est pas défini, **toute personne pouvant appeler l’API peut vider la base**.
  - **Recommandation :** en dev aussi exiger un secret ou désactiver la route par défaut.

- **Bypass paiement (dev)**
  - Header `X-Dev-Bypass-Payment: 1` + variable `DEV_BYPASS_PAYMENT=true` côté backend permettent de créer des businesses sans abonnement.
  - Côté frontend, en localhost le bypass est activé par défaut (`isDevBypassPayment()`).
  - **Risque :** si en prod quelqu’un définit `DEV_BYPASS_PAYMENT=true` sur Railway et envoie le header, création de cartes sans payer.
  - **Recommandation :** en production, ignorer systématiquement ce header (ne jamais activer le bypass si `NODE_ENV === "production"`).

### 3.2 Qualité et maintenabilité

- **Fichier frontend monolithique**
  - `frontend/src/main.js` : **~7 961 lignes**. Tout y est : routage, auth, app, dashboard, caisse, membres, notifs, intégration, checkout, fidélité client, jeux, légales, etc.
  - **Conséquences :** navigation difficile, risques de régressions, merge conflictuels, pas de découpage par fonctionnalité.
  - **Recommandation :** découper par domaines (auth, app, dashboard, checkout, fidelity, legal) en modules/écrans, en gardant un point d’entrée léger.

- **Aucun test automatisé**
  - Aucun fichier `*.test.*` ou `*.spec.*` trouvé.
  - **Risque :** régressions sur auth, paiement, création de membres, ajout de points, PassKit.
  - **Recommandation :** introduire des tests (ex. Vitest + tests API) sur les chemins critiques (auth, payment webhook, members, businesses).

- **Pas de middleware global d’erreur Express**
  - Les routes utilisent des `try/catch` et renvoient des JSON d’erreur, mais il n’y a pas de `app.use((err, req, res, next) => ...)`.
  - **Risque :** une erreur non catchée (ex. dans un middleware ou une route oubliée) peut faire renvoyer du HTML d’erreur ou crasher sans réponse structurée.
  - **Recommandation :** ajouter un middleware d’erreur en dernier qui renvoie systématiquement du JSON (ex. 500 + message générique).

- **Pas de lint ni config TypeScript centralisée**
  - Pas de `.eslintrc*` / `eslint.config.*` à la racine. Quelques fichiers en `.ts`/`.tsx` (hooks, lib) sans `tsconfig.json` dédié au frontend.
  - **Recommandation :** ESLint (et éventuellement Prettier) sur tout le repo ; si le front reste en JS, au moins des règles de base (no-unused-vars, etc.).

---

## 4. Problèmes importants (à planifier)

### 4.1 Base de données et schéma

- **Migrations non versionnées**
  - Les migrations sont des blocs `PRAGMA table_info` + `ALTER TABLE` / `CREATE INDEX` au démarrage dans `db.js`. Aucun numéro de version ou fichier de migration séparé.
  - **Risque :** sur une base déjà en prod, l’ordre ou la répétition des migrations peut poser problème (ex. colonne déjà existante, index en doublon).
  - **Constat :** duplication dans `db.js` (migration `stamp_icon_base64` en double, lignes 192–198).

- **Dashboard token**
  - `dashboard_token` = 2 × UUID sans tirets, tronqué (32 + 16 caractères). Suffisant en entropie, mais exposé dans l’URL (`/dashboard?token=...`). Si les logs ou l’historique du navigateur fuient, accès au dashboard du commerce.
  - **Recommandation :** documenter la confidentialité du lien ; à terme, envisager des tokens de courte durée pour un accès “invité” ou renouvelables.

### 4.2 Frontend et UX

- **Gestion des erreurs API**
  - Beaucoup d’endroits font `res.json().catch(() => ({}))` puis affichent `data.error`. Certains chemins n’affichent pas de message utilisateur en cas d’erreur réseau ou 500.
  - **Recommandation :** un helper central (ex. `handleApiError(res, errEl)` ou toast) pour afficher systématiquement un message (erreur serveur, réseau, session expirée).

- **404 / URL inconnue**
  - En SPA, toute URL non gérée par `getRoute()` renvoie à la landing (Vercel renvoie `index.html`). Pas de page “Page introuvable” dédiée.
  - Déjà noté dans `docs/ETAT-DU-PROJET.md`.

- **innerHTML et contenu serveur**
  - `dataDirHint` (message backend) est injecté dans le DOM sans échappement (`diagEl.innerHTML = ... ${data.dataDirHint}`). Le contenu est contrôlé par le backend (texte fixe), donc risque XSS faible mais présent si ce champ évolue.
  - **Recommandation :** échapper ou utiliser `textContent` pour tout contenu serveur affiché en HTML.

- **Accessibilité**
  - Scanner : `ETAT-DU-PROJET.md` signale le manque d’`aria-live` / `aria-label` pour les états “Vérification…”, “Client reconnu”, “Code non reconnu”, et le focus après ouverture du panneau.

### 4.3 Backend

- **Validation des entrées**
  - Pas de schéma central (ex. Joi, Zod). Validation manuelle dans chaque route (longueur, type, champs requis). Risque d’incohérence ou de champs oubliés.
  - **Recommandation :** schémas partagés pour les body/query des routes sensibles (auth, members, businesses, payment).

- **Logs et observabilité**
  - Beaucoup de `console.log` / `console.warn` / `console.error`. En prod, pas de niveau de log ni de structure (ex. JSON pour un agrégateur).
  - **Recommandation :** logger structuré (ex. pino) et niveau configurable.

### 4.4 Déploiement et configuration

- **Secrets et env**
  - Documentation correcte (`.env.example`, docs ETAPES-DEPLOIEMENT, PRODUCTION). En prod, s’assurer que `JWT_SECRET`, `PASSKIT_SECRET`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL` sont bien définis et que les clés API (Google, Apple, Stripe) ne sont pas en dur.
  - Clés côté client (ex. Google Places, Mapbox) : à restreindre par domaine/référent si possible.

---

## 5. Points positifs

- **SQL :** utilisation de prepared statements (better-sqlite3) partout dans `db.js` → pas d’injection SQL.
- **CORS :** restreint en production aux origines attendues (FRONTEND_URL, myfidpass.fr).
- **Stripe :** webhook avec vérification de signature ; body brut réservé à cette route.
- **Auth :** JWT + requireAuth/optionalAuth cohérents ; Sign in with Apple (JWKS) et Google OAuth correctement branchés.
- **XSS côté données utilisateur :** usage d’`escapeHtml` / `escapeHtmlPerimetre` / `escapeHtmlFidelity` pour les noms, emails, labels dans le HTML généré.
- **Rate limiting partiel :** engagement “start” limité par IP (20/min) et idempotency sur spins/conversions.
- **Docs :** nombreux fichiers dans `docs/` (Apple/Google Wallet, Stripe, déploiement, diagnostic).

---

## 6. Checklist corrective (ordre suggéré)

1. **Sécurité**
   - [ ] En prod : refuser le démarrage si `JWT_SECRET` ou `PASSKIT_SECRET` manquent.
   - [ ] Rate limiting sur `/api/auth/login`, `/api/auth/register`, `POST .../members`.
   - [ ] En prod : ignorer `X-Dev-Bypass-Payment` (jamais bypass paiement).
   - [ ] Traiter les vulnérabilités npm (apn / jsonwebtoken / node-forge) ou documenter le risque.
   - [ ] Protéger `/api/dev/reset` en dev (secret ou désactivation par défaut).

2. **Backend**
   - [ ] Middleware global d’erreur Express (réponse JSON, 500).
   - [ ] Nettoyer la migration dupliquée `stamp_icon_base64` dans `db.js`.

3. **Frontend**
   - [ ] Échapper ou utiliser `textContent` pour `dataDirHint` (et tout contenu serveur injecté en HTML).
   - [ ] Découper `main.js` en modules par domaine (même sans framework supplémentaire).
   - [ ] Page 404 dédiée pour les URLs inconnues.

4. **Qualité**
   - [ ] ESLint (au moins racine + frontend).
   - [ ] Tests automatisés sur auth, payment webhook, members, businesses (même basiques).

5. **Optionnel**
   - [ ] Helmet pour en-têtes de sécurité.
   - [ ] Validation centralisée (Joi/Zod) pour les routes sensibles.
   - [ ] Logger structuré et niveau de log.

---

## 7. Conclusion

Le projet Fidpass est **fonctionnel et déployable** : les parcours principaux (inscription, création de carte, caisse, Wallet, jeux, notifs, paiement) sont en place et cohérents. La sécurité de base (CORS, JWT, Stripe webhook, prepared statements, échappement HTML côté données utilisateur) est correcte.

En revanche, **la dette technique est forte** (fichier géant, pas de tests, pas de lint, migrations en dur, secrets par défaut) et **quelques risques de sécurité** (rate limit, secrets en fallback, bypass paiement, vulnérabilités npm) doivent être traités pour un lancement serein et une base maintenable. Le présent audit donne une vision 100 % du flux et des fichiers pour prioriser les actions.
