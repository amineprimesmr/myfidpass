# Plan d’action — Correction complète des problèmes de l’audit Fidpass

**Référence :** [AUDIT-COMPLET-2025.md](./AUDIT-COMPLET-2025.md)  
**Objectif :** Appliquer toutes les corrections du diagnostic, par ordre de priorité et de dépendance.

---

## Vue d’ensemble des phases

| Phase | Thème | Durée estimée | Bloquant prod ? |
|-------|--------|----------------|-----------------|
| **1** | Sécurité critique (secrets, rate limit, bypass, reset) | 1–2 j | Oui |
| **2** | Backend (erreur globale, migrations, dev reset) | 0,5 j | Non |
| **3** | Frontend sécurité & UX (XSS, 404, erreurs API) | 1 j | Non |
| **4** | Qualité (ESLint, tests) | 1–2 j | Non |
| **5** | Refactor main.js (découpage en modules) | 2–3 j | Non |
| **6** | Optionnel (Helmet, validation, logger, migrations versionnées) | 1–2 j | Non |

---

# Phase 1 — Sécurité critique

## 1.1 Refuser le démarrage en prod sans JWT_SECRET et PASSKIT_SECRET

**Objectif :** En production, le serveur ne démarre pas si ces secrets sont absents.

**Fichiers à modifier :**
- `backend/src/index.js` (avant `startServer()`)
- Optionnel : `backend/src/routes/auth.js` et `backend/src/middleware/auth.js` (garder le fallback uniquement si `NODE_ENV !== 'production'`)

**Actions :**
1. Au tout début de `backend/src/index.js`, après `dotenv.config()`, ajouter un bloc :
   ```js
   const isProduction = process.env.NODE_ENV === "production";
   if (isProduction) {
     if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
       console.error("En production, JWT_SECRET doit être défini et faire au moins 32 caractères.");
       process.exit(1);
     }
     if (!process.env.PASSKIT_SECRET || process.env.PASSKIT_SECRET.length < 32) {
       console.error("En production, PASSKIT_SECRET doit être défini et faire au moins 32 caractères.");
       process.exit(1);
     }
   }
   ```
2. Dans `backend/src/routes/auth.js` et `backend/src/middleware/auth.js`, pour JWT_SECRET : utiliser le fallback uniquement si `!isProduction` (en important ou en recalculant `process.env.NODE_ENV`). Idem dans `backend/src/pass.js` pour PASSKIT_SECRET (le pass.js est chargé après index.js, donc le process.exit aura déjà eu lieu si secret manquant en prod ; on peut laisser le fallback pour le dev uniquement avec un `if (!process.env.PASSKIT_SECRET && process.env.NODE_ENV === "production")` déjà évité par le exit).

**Vérification :**
- En local : `NODE_ENV=production node backend/src/index.js` sans JWT_SECRET → le processus doit quitter avec code 1 et message clair.
- En prod (Railway) : s’assurer que `JWT_SECRET` et `PASSKIT_SECRET` sont bien définis (déjà le cas normalement).

---

## 1.2 Rate limiting sur auth et création de membres

**Objectif :** Limiter les requêtes par IP sur login, register et création de membres.

**Fichiers à créer/modifier :**
- `backend/package.json` — ajouter la dépendance `express-rate-limit`.
- `backend/src/index.js` — créer et appliquer les limiters avant les routes concernées.

**Actions :**
1. Dans `backend/` : `npm install express-rate-limit`.
2. Dans `backend/src/index.js` :
   - Importer : `import rateLimit from 'express-rate-limit';`.
   - Définir une fonction pour récupérer l’IP (ex. `req.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || ''`).
   - Créer un limiter auth (ex. 10 requêtes / 15 minutes par IP) et l’appliquer uniquement sur `app.use('/api/auth/login', authLimiter)` et `app.use('/api/auth/register', authLimiter)` — ou un seul limiter sur `app.use('/api/auth', authLimiter)` qui couvre login + register.
   - Créer un limiter pour la création de membres : soit sur `POST /api/members` (route globale), soit dans le routeur businesses pour `POST /:slug/members`. Le plus simple : un limiter global `membersCreateLimiter` (ex. 30 req / 15 min par IP) monté sur la route qui gère `POST .../members` (dans businesses, il faudrait soit un middleware appliqué à cette route, soit un limiter monté dans le routeur businesses avant les handlers). Solution propre : dans `index.js`, ajouter `app.use('/api/businesses/:slug/members', membersCreateLimiter)` en n’appliquant le limiter qu’aux méthodes POST (rateLimit accepte une option `methods: ['POST']`).
3. Documenter en tête de fichier ou dans un commentaire les seuils (ex. 10/15min auth, 30/15min members).

**Exemple de code (à adapter) :**
```js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
```

**Vérification :**
- Envoyer 11 requêtes POST sur `/api/auth/login` depuis la même IP en moins de 15 min → la 11e doit renvoyer 429 avec le message.

---

## 1.3 En production : ignorer le bypass paiement

**Objectif :** Même si `DEV_BYPASS_PAYMENT=true` est défini et qu’un client envoie `X-Dev-Bypass-Payment: 1`, ne jamais bypasser le paiement en production.

**Fichier à modifier :** `backend/src/routes/businesses.js`

**Actions :**
1. Trouver l’endroit où `canCreateBusiness` ou le bypass est utilisé (rechercher `DEV_BYPASS_PAYMENT` et `X-Dev-Bypass-Payment`).
2. Remplacer la condition actuelle par une qui exige **à la fois** :
   - `process.env.NODE_ENV !== "production"`, **et**
   - `process.env.DEV_BYPASS_PAYMENT === "true"` et `req.get("X-Dev-Bypass-Payment") === "1"`.
   - Donc : `const devBypass = process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_PAYMENT === "true" && req.get("X-Dev-Bypass-Payment") === "1";`

**Vérification :**
- En prod (Railway) : avec `DEV_BYPASS_PAYMENT=true` et header `X-Dev-Bypass-Payment: 1`, la création de business sans abonnement doit rester refusée (403 subscription_required).

---

## 1.4 Protéger la route /api/dev/reset en dev

**Objectif :** En développement, exiger aussi un secret ou désactiver la route par défaut pour éviter qu’un appel accidentel vide la base.

**Fichier à modifier :** `backend/src/routes/dev.js`

**Actions :**
1. Comportement cible :
   - En **production** : inchangé (404 si pas de RESET_SECRET, sinon exiger body.secret === RESET_SECRET).
   - En **dev** : si `RESET_SECRET` n’est pas défini, retourner 404 avec un message du type « Route désactivée. Définir RESET_SECRET dans .env pour l’activer. » au lieu d’accepter sans secret.
2. Implémentation : `if (!resetSecret) return res.status(404).json({ error: "Route désactivée. Définir RESET_SECRET dans .env pour l'activer en dev." });` avant la vérification du body, pour tout environnement.

**Vérification :**
- En local sans RESET_SECRET : `POST /api/dev/reset` → 404 et message.
- En local avec RESET_SECRET et body correct → 200 et reset.
- En prod avec RESET_SECRET et body correct → 200 ; sans secret → 403.

---

## 1.5 Vulnérabilités npm (backend) — décision et exécution

**Objectif :** Réduire ou documenter les vulnérabilités (jsonwebtoken, node-forge via apn).

**Options :**
- **A.** Tenter `npm audit fix` (sans --force) dans `backend/` ; si des correctifs sont appliqués sans casser apn, les garder.
- **B.** Si seul `npm audit fix --force` est proposé (changement majeur apn) : ne pas l’appliquer tout de suite ; ajouter une section dans `docs/SECURITE.md` ou `docs/ETAT-DU-PROJET.md` qui décrit les 3 vulnérabilités, le fait qu’elles viennent de la dépendance `apn` (push Apple), et que la mise à jour est planifiée (ou qu’une alternative à apn est à l’étude).
- **C.** Rechercher une alternative à `apn` (ex. `@parse/node-apn` ou autre lib à jour) et planifier une migration dans une phase dédiée.

**Actions concrètes :**
1. Exécuter `cd backend && npm audit` et noter les paquets concernés.
2. Exécuter `npm audit fix` (sans --force). Si des mises à jour sont faites, lancer les tests manuels (auth, envoi notif PassKit si possible).
3. Si des vulnérabilités restent : créer ou mettre à jour `docs/SECURITE.md` avec la liste, l’impact (push Apple uniquement), et la stratégie (planifier mise à jour apn ou migration).

**Vérification :**
- `npm audit` après correctifs : nombre de vulnérabilités connu et documenté.

---

# Phase 2 — Backend (erreur globale, migrations, nettoyage)

## 2.1 Middleware global d’erreur Express

**Objectif :** Toute erreur non gérée renvoie du JSON (500 + message générique).

**Fichier à modifier :** `backend/src/index.js`

**Actions :**
1. Après toutes les routes (après `app.use("/api/passes", passesRouter)` et les `app.get("/api/passes/demo", ...)`), ajouter :
   - Un middleware 404 : `app.use((req, res) => res.status(404).json({ error: "Not found" }));`
   - Un middleware d’erreur à 4 arguments : `app.use((err, req, res, next) => { console.error("Unhandled error:", err); res.status(500).json({ error: "Une erreur interne est survenue." }); });`
2. S’assurer que les routes asynchrones passent les erreurs à `next(err)` (ex. dans les catch) pour que ce middleware les prenne en charge. Vérifier au moins auth, payment, businesses, members.

**Vérification :**
- Provoquer une erreur dans une route (ex. `throw new Error("test")`) → réponse 500 JSON avec le message générique, pas de stack exposée en prod (ne pas mettre `err.message` dans la réponse en production si sensible).

---

## 2.2 Nettoyer la migration dupliquée stamp_icon_base64

**Objectif :** Supprimer le bloc en double dans db.js.

**Fichier à modifier :** `backend/src/db.js`

**Actions :**
1. Repérer les deux blocs consécutifs qui ajoutent `stamp_icon_base64` (vers les lignes 192–198).
2. Supprimer l’un des deux (garder un seul `if (!bizColsAfter.includes("stamp_icon_base64")) { ... }`).

**Vérification :**
- Redémarrer le backend ; pas d’erreur au démarrage. Comportement inchangé.

---

# Phase 3 — Frontend (sécurité XSS, 404, erreurs API)

## 3.1 Échapper dataDirHint (et tout contenu serveur dans le diagnostic)

**Objectif :** Éviter tout risque XSS si le backend envoie un jour du contenu variable dans ces champs.

**Fichier à modifier :** `frontend/src/main.js`

**Actions :**
1. Repérer toutes les affectations où `dataDirHint`, `data.paradoxExplanation`, `data.membersVsDevicesExplanation` (ou champs similaires du diagnostic) sont injectés dans `innerHTML`.
2. Soit utiliser une fonction `escapeHtml` déjà présente dans le fichier pour ces chaînes avant de les mettre dans le HTML, soit créer des nœuds texte (ex. `el.appendChild(document.createTextNode(data.dataDirHint))`) au lieu de `innerHTML` pour les paragraphes de diagnostic.
3. Appliquer la même règle à tout autre contenu provenant de l’API et affiché en HTML (recherche globale `data.` + `innerHTML` dans la zone diagnostic/notifications).

**Vérification :**
- Si le backend renvoie par exemple `dataDirHint: "<script>alert(1)</script>"`, rien ne doit s’exécuter ; le texte doit s’afficher échappé.

---

## 3.2 Page 404 dédiée

**Objectif :** Pour toute URL non reconnue par `getRoute()`, afficher une vue « Page introuvable » au lieu de la landing.

**Fichiers à modifier :**
- `frontend/src/main.js` — dans `getRoute()`, retourner par ex. `{ type: "404" }` pour tout path inconnu, et dans `initRouting()` afficher un bloc dédié (titre + lien vers accueil).
- `frontend/index.html` — ajouter un bloc caché par défaut, ex. `<div id="page-404" class="hidden">...</div>` avec un message et un lien vers `/`.

**Actions :**
1. Dans `getRoute()`, en dernier (avant `return { type: "landing" }`), faire un retour explicite pour les paths non listés : par exemple garder une liste de paths connus et si le path n’est dans aucune condition, retourner `{ type: "404" }`.
2. Dans `initRouting()`, gérer `route.type === "404"` : masquer landing, dashboard, app, auth, etc. ; afficher `#page-404` et y mettre un message du type « Page introuvable » + lien « Retour à l’accueil » vers `/`.
3. Dans `index.html`, ajouter le bloc `#page-404` avec les classes appropriées.

**Vérification :**
- Aller sur `https://myfidpass.fr/nimporte-quoi` → affichage de la page 404, pas de landing.

---

## 3.3 Helper central pour les erreurs API (frontend)

**Objectif :** Afficher systématiquement un message utilisateur en cas d’erreur réseau ou 500.

**Fichier à modifier :** `frontend/src/main.js` (et éventuellement extraire plus tard dans un module dédié).

**Actions :**
1. Créer une fonction globale (ou dans un petit objet utilitaire) du type :
   - `function getApiErrorMessage(res, data)` : retourne `data?.error` si présent, sinon selon `res.status` : 401 → "Session expirée. Reconnectez-vous.", 403 → "Accès refusé.", 404 → "Ressource introuvable.", 429 → "Trop de tentatives. Réessayez plus tard.", 5xx → "Erreur serveur. Réessayez plus tard.", sinon "Une erreur est survenue."
   - `function showApiError(res, data, errEl)` : si `errEl` existe, met à jour `errEl.textContent` avec `getApiErrorMessage(res, data)` et enlève la classe `hidden`.
2. Dans les handlers de formulaire (auth, création business, etc.), remplacer les blocs répétitifs qui font `data.error || "Erreur..."` par un appel à `showApiError(res, data, errEl)` et dans le `catch` du fetch appeler `showApiError(null, null, errEl)` avec un message type "Erreur réseau. Vérifiez votre connexion."
3. Cibler en priorité : auth (login, register, forgot, reset), création de business, création de membre (caisse), et au moins un ou deux autres écrans sensibles.

**Vérification :**
- Couper le réseau ou renvoyer 500 depuis le backend : l’utilisateur voit un message clair, pas une page blanche ou un silence.

---

## 3.4 Accessibilité scanner (aria-live, aria-label, focus)

**Objectif :** Améliorer l’usage par lecteurs d’écran et clavier.

**Fichier à modifier :** `frontend/src/main.js` (zone scanner caisse).

**Actions :**
1. Sur la zone qui affiche « Vérification… », « Client reconnu », « Code non reconnu », ajouter `aria-live="polite"` et `aria-atomic="true"` (et éventuellement `role="status"`).
2. Donner un `aria-label` explicite aux boutons/états (ex. « Vérification du code en cours », « Client reconnu : [nom] », « Code non reconnu »).
3. Après ouverture du panneau « Client reconnu », placer le focus sur le premier bouton d’action (ex. « 1 passage » ou « Scanner un autre ») avec `element.focus()`.

**Vérification :**
- Avec un lecteur d’écran (VoiceOver / NVDA), les états du scanner sont annoncés ; à la souris/clavier, le focus va bien au bouton après reconnaissance.

---

# Phase 4 — Qualité (ESLint, tests)

## 4.1 ESLint (racine + frontend + backend)

**Objectif :** Règles de base sur tout le repo.

**Fichiers à créer :**
- `package.json` (racine) ou dossiers : config ESLint flat ou classique.
- Option : `eslint.config.js` (flat config) à la racine pour monorepo.

**Actions :**
1. À la racine : `npm install -D eslint` (ou dans chaque sous-projet selon préférence). Pour un monorepo simple : un seul ESLint à la racine qui inclut `backend/` et `frontend/`.
2. Créer `eslint.config.js` (ou `.eslintrc.cjs`) avec :
   - `env: { node: true }` pour backend, `browser: true` pour frontend.
   - Règles : `no-unused-vars`, `no-console: warn` (ou off en dev), `prefer-const`, etc.
   - Pour le frontend avec React : `eslint-plugin-react` et règles de base.
3. Ajouter dans `package.json` (racine) : `"lint": "eslint backend/src frontend/src"` et `"lint:fix": "eslint backend/src frontend/src --fix"`.
4. Corriger les erreurs bloquantes (au moins les plus graves). Pour `no-console`, on peut laisser en `warn` pour l’instant.

**Vérification :**
- `npm run lint` s’exécute et signale un nombre connu d’avertissements/erreurs ; après corrections, 0 erreur si possible.

---

## 4.2 Tests automatisés (auth, payment, members, businesses)

**Objectif :** Couvrir les chemins critiques par des tests.

**Choix :** Backend en Node : utiliser un runner de tests (Vitest ou Mocha) + supertest pour les routes HTTP.

**Fichiers à créer :**
- `backend/package.json` — scripts `test`, dépendances `vitest` (ou `mocha`), `supertest`.
- `backend/vitest.config.js` (ou équivalent).
- `backend/src/routes/auth.test.js` (ou `__tests__/auth.test.js`).
- `backend/src/routes/payment.test.js` (webhook Stripe).
- Optionnel : `backend/src/routes/members.test.js`, `backend/src/routes/businesses.test.js` (au moins création business, création membre).

**Actions :**
1. Dans `backend/` : `npm install -D vitest supertest`. Configurer Vitest pour ESM (si besoin, `defineConfig` avec `environment: 'node'`).
2. **Auth :**
   - Test : POST `/api/auth/register` avec email/password valides → 201, body avec `user` et `token`.
   - Test : POST `/api/auth/login` avec mauvais mot de passe → 401.
   - Test : POST `/api/auth/login` avec bons identifiants → 200, `token` présent.
3. **Payment webhook :**
   - Test : POST `/api/payment/webhook` sans signature Stripe → 400.
   - Test : avec body et signature valides (utiliser `stripe.webhooks.generateTestHeaderString` ou mock) → 200 et subscription créée/mise à jour en base (mock DB ou base de test).
4. **Members / Businesses :**
   - Au moins un test : création d’un membre pour un business existant → 201 ; récupération du membre → 200.
5. Lancer les tests avec une base SQLite en mémoire ou un fichier temporaire (variable `DATA_DIR` ou équivalent pour les tests).

**Vérification :**
- `npm run test` (dans backend) passe pour les tests ajoutés.

---

# Phase 5 — Refactor main.js (découpage en modules)

**Objectif :** Réduire la taille de `main.js` en extrayant des domaines dans des modules séparés, sans changer le framework (toujours un point d’entrée unique qui appelle les init des écrans).

## 5.1 Structure cible

Créer les fichiers suivants (ou équivalents) sous `frontend/src/` :

- `frontend/src/config.js` — constantes (API_BASE, AUTH_TOKEN_KEY, getAuthToken, setAuthToken, getAuthHeaders, isDevBypassPayment, etc.).
- `frontend/src/router.js` — `getRoute()`, `initRouting()`, et la logique de mise à jour des vues (affichage/masquage des blocs selon la route).
- `frontend/src/auth.js` — tout ce qui concerne la page auth : `initAuthPage()`, formulaires login/register/forgot/reset, Google/Apple, gestion des erreurs auth.
- `frontend/src/app.js` — `initAppPage()`, sidebar, liste des businesses, création de business (lien vide).
- `frontend/src/dashboard.js` — tout le bloc dashboard (caisse, membres, transactions, paramètres, notifs, intégration, jeux, engagement, etc.). Si trop gros, subdiviser en `dashboard/caisse.js`, `dashboard/membres.js`, `dashboard/notifications.js`, etc.
- `frontend/src/checkout.js` — page choix d’offre et retour Stripe (checkout).
- `frontend/src/fidelity.js` — page fidélité client (slug), règles, jeu (roulette), engagement client.
- `frontend/src/legal.js` — chargement et affichage des pages légales (mentions, CGU, CGV, cookies).
- `frontend/src/utils/dom.js` ou `utils/html.js` — `escapeHtml`, `escapeHtmlPerimetre`, `getApiErrorMessage`, `showApiError`, etc.
- `frontend/src/main.js` — reste minimal : import des modules, point d’entrée (DOMContentLoaded), appel à `initRouting()` et aux init des écrans selon la route.

## 5.2 Ordre d’extraction recommandé

1. **Config et utils** — extraire `config.js` et `utils/dom.js` (escapeHtml, helpers API). Adapter `main.js` pour importer depuis ces modules.
2. **Router** — extraire `getRoute()` et la logique de bascule des vues dans `router.js` ; `main.js` appelle `initRouting()` depuis le module.
3. **Auth** — extraire tout le bloc auth dans `auth.js` ; `main.js` appelle `initAuthPage(initialTab)` quand `route.type === "auth"`.
4. **Legal** — extraire le chargement des markdown et l’affichage des pages légales dans `legal.js`.
5. **App** — extraire `initAppPage()` et la logique sidebar / liste businesses dans `app.js`.
6. **Checkout** — extraire la page choix d’offre et le retour Stripe dans `checkout.js`.
7. **Dashboard** — extraire par sous-domaines (caisse, membres, paramètres, notifs, etc.) dans des fichiers sous `dashboard/` ou un seul `dashboard.js` d’abord, puis découper si nécessaire.
8. **Fidelity** — extraire la page client fidélité (slug) et le jeu dans `fidelity.js`.

À chaque étape : vérifier que le build (`npm run build`) passe et que les parcours manuels (auth, app, dashboard, fidélité, checkout) fonctionnent.

---

# Phase 6 — Optionnel (améliorations long terme)

## 6.1 Helmet (en-têtes de sécurité)

- Dans `backend/` : `npm install helmet`.
- Dans `backend/src/index.js` : `import helmet from 'helmet'; app.use(helmet());` après CORS, avant les routes.
- Tester que les pages et l’API fonctionnent (notamment si des frames ou scripts sont utilisés).

## 6.2 Validation centralisée (Joi ou Zod)

- Créer un module `backend/src/validation/schemas.js` (ou par domaine : auth, members, businesses).
- Définir les schémas pour les body des routes sensibles (register, login, createMember, updateBusiness, etc.).
- Dans chaque route, appeler le schéma et retourner 400 avec les erreurs de validation si invalide.
- Documenter dans le README ou les docs que les entrées sont validées via ces schémas.

## 6.3 Logger structuré (pino)

- Remplacer progressivement `console.log` / `console.error` par un logger (ex. pino) avec niveau (info, warn, error) et sortie JSON en prod.
- Variable d’environnement `LOG_LEVEL=debug|info|warn|error`.

## 6.4 Migrations DB versionnées

- Introduire une table `schema_migrations` (version INTEGER ou nom de fichier).
- Extraire les blocs de migration de `db.js` dans des fichiers numérotés (ex. `migrations/001_initial.sql`, `002_add_stamp_icon.sql`) et exécuter au démarrage uniquement celles dont la version n’est pas en base.
- À long terme, éviter les `ALTER TABLE` en dur dans `db.js` pour les nouvelles évolutions.

## 6.5 Dashboard token (documentation / évolution)

- Dans la doc (ex. `docs/PRODUCTION.md` ou `docs/SECURITE.md`), rappeler que le lien `/dashboard?token=...` est confidentiel (ne pas le logger, ne pas le partager).
- Optionnel : prévoir une évolution avec tokens de courte durée ou renouvelables pour un accès “invité” (hors scope immédiat du plan).

---

# Récapitulatif des livrables par phase

| Phase | Livrables |
|-------|-----------|
| 1 | Démarrage refusé en prod sans secrets ; rate limit auth + members ; bypass paiement désactivé en prod ; reset dev protégé ; npm audit documenté ou corrigé |
| 2 | Middleware erreur global + 404 JSON ; db.js sans duplication stamp_icon_base64 |
| 3 | dataDirHint (et champs diagnostic) échappés ; page 404 dédiée ; helper erreurs API ; aria + focus scanner |
| 4 | ESLint configuré et exécutable ; tests auth, webhook payment, au moins 1 test members/businesses |
| 5 | main.js découpé en config, router, auth, app, dashboard, checkout, fidelity, legal, utils |
| 6 | Helmet ; validation Joi/Zod ; logger pino ; migrations versionnées ; doc dashboard token |

---

# Ordre d’exécution recommandé

1. Phase 1 en entier (sécurité critique) → déploiement et vérification en prod.
2. Phase 2 (backend) → déploiement.
3. Phase 3 (frontend sécurité et UX) → déploiement.
4. Phase 4 (ESLint puis tests) → pas obligatoire avant déploiement, mais à faire tôt pour éviter de casser les tests ensuite.
5. Phase 5 (refactor main.js) par petits pas, avec tests manuels et lint après chaque extraction.
6. Phase 6 au fil de l’eau selon priorité produit.

En cas de contrainte de temps, prioriser absolument : **1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 3.2** ; le reste peut être planifié sur les sprints suivants.
