# Audit post-remédiation — Fidpass (état actuel)

**Date :** 16 mars 2025  
**Contexte :** Ré-audit complet après application du [plan d’action](./PLAN-ACTION-AUDIT.md) et de l’[audit initial](./AUDIT-COMPLET-2025.md).  
**Périmètre :** 100 % du flux, tous les fichiers critiques, tests, build, lint, sécurité.

---

## 1. Synthèse exécutive

| Domaine | État | Commentaire |
|--------|------|-------------|
| **Sécurité (prod)** | ✅ Renforcée | Secrets obligatoires, rate limit, bypass désactivé en prod, reset protégé. |
| **Backend (erreurs, DB)** | ✅ Corrigé | Middleware 404/500, migration dupliquée supprimée. |
| **Frontend (XSS, 404, erreurs)** | ✅ Corrigé | Contenu serveur échappé, page 404 dédiée, helper erreurs API, a11y scanner. |
| **Qualité (lint, tests)** | 🟠 Partiel | ESLint tourne (config .cjs) mais signale des erreurs. Tests : 1 smoke OK ; tests d’intégration (auth, payment) non exécutés (chargement app bloquant). |
| **Build frontend** | 🟠 Lent | Build Vite très long (main.js ~7 917 lignes). À confirmer en local. |
| **Dette technique** | 🔴 Toujours forte | main.js monolithique (~7 900 lignes), db.js ~2 100, businesses.js ~2 400. Pas de `next(err)` dans les routes async → erreurs non propagées au middleware global. |
| **Vulnérabilités npm** | 🔴 Inchangées | 3 vulnérabilités haute gravité (apn / jsonwebtoken / node-forge) ; documentées dans SECURITE.md. |

**Verdict :** Les corrections de sécurité et de robustesse (phase 1–3) sont en place et cohérentes. La qualité de code (lint à vert, tests d’intégration stables, refactor complet de main.js) et les vulnérabilités npm restent à traiter.

---

## 2. Ce qui a été vérifié et fonctionne

### 2.1 Tests et outillage

- **Backend** : `NODE_ENV=test npx vitest run src/lib.test.js` → **1 test passé** (smoke).
- **ESLint** : Config en `eslint.config.cjs` (CommonJS) pour éviter le conflit ESM à la racine. La commande `npm run lint` **s’exécute** et analyse backend, frontend, scripts.
- **Secrets en prod** : Au démarrage, si `NODE_ENV=production` et que `JWT_SECRET` ou `PASSKIT_SECRET` est absent ou &lt; 32 caractères, le processus **quitte avec code 1**.
- **Rate limiting** : Limite auth (10/15 min) sur login/register ; limite création membres (30/15 min) sur `POST /api/businesses/:slug/members`.
- **Bypass paiement** : Condition explicite `NODE_ENV !== "production"` dans businesses.js → en prod le header `X-Dev-Bypass-Payment` est ignoré.
- **Route /api/dev/reset** : Désactivée (404) si `RESET_SECRET` non défini, en dev comme en prod.
- **404 / erreur globales** : Middleware 404 (JSON) et middleware d’erreur à 4 arguments en fin de chaîne Express.
- **Page 404 front** : `getRoute()` renvoie `{ type: "404" }` pour tout path inconnu ; bloc `#page-404` affiché, reste masqué sur les autres routes.
- **XSS (diagnostic)** : Champs `dataDirHint`, `paradoxExplanation`, `membersVsDevicesExplanation`, `helpWhenNoDevice` passés par `escapeHtmlForServer()` avant injection.
- **Helpers API** : `getApiErrorMessage()` et `showApiError()` utilisés pour login/register (et réutilisables ailleurs).
- **Helmet** : Activé sur le backend avec `contentSecurityPolicy: false`.
- **Config / utils front** : `config.js` et `utils/apiError.js` extraits ; main.js les importe (environ 100 lignes en moins).

---

## 3. Ce qui ne va pas ou reste à faire

### 3.1 ESLint : erreurs et warnings

`npm run lint` **échoue** (exit code 1) à cause de :

- **no-empty** : Blocs `catch (_) {}` vides (db.js, pass.js, auth.js, businesses.js, etc.). Règle recommandée : au moins un commentaire ou un `// ignore` pour éviter no-empty.
- **no-unused-vars** : Arguments `next` non utilisés dans des middlewares, variables assignées mais jamais utilisées (ex. `notifications.js` VAPID_PRIVATE, pass.js, auth.js, businesses.js).
- **no-useless-assignment** : notifications.js, valeur assignée puis jamais lue.
- **prefer-const** : Variables jamais réassignées en `let` (ex. db.js).

**Impact :** Le lint ne passe pas en CI si on exige 0 erreur. **Recommandation :** Corriger les `no-empty` (commentaire ou log minimal), renommer `next` en `_next` où il est requis par la signature Express, et traiter les autres warnings par lots.

### 3.2 Tests d’intégration (auth, payment)

- **auth.test.js** et **payment.test.js** : Ils importent `app` depuis `../index.js`. Au chargement, l’initialisation complète (db, routes, etc.) **prend trop de temps ou bloque** (timeout / pas de sortie).
- **Conséquence :** Seul le smoke (`lib.test.js`) est exécutable de façon fiable. Les scénarios auth (register, login, 401, 409) et webhook Stripe (400 sans signature) ne sont pas validés automatiquement.
- **Recommandation :** Soit alléger le chargement (app de test sans tout PassKit/DB lourd), soit lancer les tests d’intégration contre une instance déjà démarrée (supertest vers une URL), soit augmenter fortement les timeouts et valider en local.

### 3.3 Build frontend

- **Observation :** `npm run build` (Vite) reste longtemps sur « transforming… » (main.js ~7 917 lignes). Le build peut **aboutir** mais dépasse facilement 1–2 minutes.
- **Risque :** En CI ou sur machine lente, timeout possible. **Recommandation :** Vérifier la durée réelle du build ; si besoin, augmenter le timeout CI ou poursuivre le découpage de main.js pour réduire la taille du bundle.

### 3.4 Propagation des erreurs vers le middleware global

- Aucune occurrence de **`next(err)`** ou **`next(e)`** dans le backend : les handlers async qui font `try/catch` renvoient eux-mêmes `res.status(500).json(...)` et n’appellent pas `next(err)`.
- **Conséquence :** Le middleware global `(err, req, res, next)` ne reçoit **jamais** d’erreur propagée. Il ne gère que les erreurs **non catchées** (ex. throw dans un sync handler). Les erreurs déjà catchées sont bien renvoyées en JSON par chaque route, mais une erreur oubliée dans un `catch` (sans réponse) pourrait laisser la requête en attente.
- **Recommandation :** Dans les routes async, dans le `catch`, soit répondre explicitement, soit appeler `next(err)` pour centraliser la réponse 500.

### 3.5 Secrets et fallbacks restants

- **auth.js** et **middleware/auth.js** : `JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production"`. En prod, index.js a déjà quitté si JWT_SECRET manque, donc le fallback n’est jamais utilisé en prod. **OK.**
- **pass.js** : `PASSKIT_SECRET || "fidpass-default-secret-change-in-production"`. Même logique. **OK.**
- **engagement-proof.js** : `PROOF_SECRET = process.env.ENGAGEMENT_PROOF_SECRET || process.env.JWT_SECRET || "fidpass-proof-secret"`. En prod, si aucune des deux variables n’est définie, fallback faible. **Recommandation :** Exiger en prod au moins `ENGAGEMENT_PROOF_SECRET` ou `JWT_SECRET` (ou refuser de démarrer / désactiver la feature engagement si secret absent).

### 3.6 Vulnérabilités npm (backend)

- **npm audit** : **3 vulnérabilités haute gravité** (jsonwebtoken et node-forge, via la dépendance **apn**).
- **Statut :** Documenté dans `docs/SECURITE.md`. Correction proposée : `npm audit fix --force` → changement majeur de `apn`, non appliqué pour éviter les régressions.
- **Recommandation :** Planifier une migration vers une alternative à `apn` ou une version sans ces dépendances, ou accepter le risque documenté pour les notifications push Apple.

### 3.7 Dette technique structurelle

- **main.js** : **~7 917 lignes**. Découpage amorcé (config, utils/apiError) mais tout le reste (routage, auth, app, dashboard, caisse, fidélité, checkout, légales, etc.) reste dans un seul fichier. **Impact :** maintenance difficile, risque de régressions, merge conflictuels.
- **db.js** : **~2 092 lignes**. Migrations et logique métier mélangées ; pas de versionnement des migrations.
- **businesses.js** : **~2 403 lignes**. Un seul routeur pour tout le domaine « businesses » (dashboard, membres, notifs, jeux, intégration, etc.).
- **Recommandation :** Poursuivre le découpage (router, auth, app, dashboard, fidelity, legal) comme prévu dans le plan d’action ; à terme, envisager des migrations DB versionnées.

### 3.8 Contenu légal et innerHTML

- **getLegalPageHtml()** : Retourne du HTML généré à partir de chaînes statiques (LEGAL_EDITOR, templates CGU/CGV, etc.). Pas de contenu utilisateur. **Risque XSS :** faible tant que le contenu reste contrôlé par le code. **Recommandation :** Ne pas injecter de contenu issu de l’API ou de l’utilisateur dans les pages légales sans échappement.
- **emptyCreateError.innerHTML = ...** (main.js) : Utilise du HTML pour le message d’aide (localhost vs Railway). Le contenu est contrôlé par le code, pas par l’utilisateur. **OK** tant que cela reste le cas.

### 3.9 Divers

- **npm warn "Unknown env config devdir"** : Affiché à chaque `npm run` (racine / backend / frontend). Propre à l’environnement npm, pas au code. Peut être ignoré ou traité via la config npm.
- **Tests backend** : Le script `npm run test` dans backend lance tous les tests ; si les tests d’intégration restent bloquants, envisager de n’exécuter que `src/lib.test.js` par défaut et les autres sous une commande dédiée (ex. `test:integration`).

---

## 4. Récapitulatif des actions recommandées (par priorité)

1. **Court terme**
   - Corriger les erreurs ESLint (no-empty, no-useless-assignment, next → _next) pour que `npm run lint` passe avec 0 erreur.
   - Vérifier en local que le build frontend se termine correctement et mesurer sa durée.
   - Documenter ou adapter l’exécution des tests d’intégration (timeout, app de test, ou test contre instance démarrée).

2. **Moyen terme**
   - Propager les erreurs async vers le middleware global (`next(err)` dans les catch) pour les routes critiques.
   - Renforcer engagement-proof en prod (exiger un secret ou désactiver si absent).
   - Poursuivre le découpage de main.js (router, auth, app, dashboard, etc.).

3. **Long terme**
   - Traiter les vulnérabilités npm (apn / jsonwebtoken / node-forge) ou maintenir la doc de risque.
   - Introduire des migrations DB versionnées.
   - Réduire la taille des fichiers monolithiques (db.js, businesses.js) par domaine.

---

## 5. Conclusion

Les corrections de **sécurité** (secrets, rate limit, bypass, reset) et de **robustesse** (404/500, XSS diagnostic, page 404, helpers erreurs API, a11y scanner, Helmet) sont **en place et cohérentes**. Les **tests** (smoke) et le **lint** (exécution) fonctionnent, mais le lint signale encore des erreurs à corriger et les tests d’intégration ne sont pas exécutables de façon fiable. La **dette technique** (fichiers géants, pas de propagation `next(err)`, vulnérabilités npm) reste le principal sujet pour la suite. Ce document peut servir de base pour un prochain cycle d’audit ou de mise en conformité (lint vert, tests d’intégration stables, refactor ciblé).
