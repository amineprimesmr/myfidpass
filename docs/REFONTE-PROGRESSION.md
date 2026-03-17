# Progression de la refonte — Règles A–Z

**Références :** [REFONTE-REGLES.md](./REFONTE-REGLES.md), [BILAN-A-Z.md](./BILAN-A-Z.md).

---

## ✅ Fait

### Backend — db.js découpé (refonte complète)
- **backend/src/db/** : module db découpé en repositories &lt; 400 lignes.
  - `connection.js` : connexion SQLite, schema + migrations au démarrage.
  - `schema.js` : CREATE TABLE initial.
  - `migrations.js` : ALTER TABLE, tables engagement/games, demo business, member_categories.
  - `users.js`, `businesses.js`, `members.js`, `transactions.js`, `subscriptions.js`, `level.js`, `reset.js`.
  - `categories.js`, `passes.js`, `webpush.js`, `dashboard.js`.
  - `games-helpers.js`, `games.js` (roulette, tickets, spins), `engagement.js`, `engagement-proof.js`.
- **backend/src/db.js** : barrel qui réexporte `./db/index.js` (compatibilité des imports existants).
- Backend démarre correctement ; tests auth passent.

### Cursor (règles fixes intégrées)
- `.cursor/rules/refonte-limits.mdc` — Limites 400 lignes, 200 pour index.html, interdictions monolithes (alwaysApply).
- `.cursor/rules/refonte-frontend.mdc` — Modules par écran, dynamic import, routeur léger (globs frontend).
- `.cursor/rules/refonte-backend.mdc` — Services, repositories, routes < 15 (globs backend).
- `.cursor/rules/refonte-quality.mdc` — ESLint tous fichiers, tests, build (alwaysApply).

### Qualité et outillage
- **ESLint** : prise en charge de `*.js`, `*.jsx`, `*.ts`, `*.tsx` dans `frontend/src` et `backend` (eslint.config.cjs).
- **Script** : `scripts/start-dev.sh` affiche le port 5174 (aligné avec Vite).
- **Tests frontend** : Vitest ajouté, `frontend/src/config.test.js` (getAuthToken, setAuthToken, getAuthHeaders, API_BASE, isDevBypassPayment).

---

## 🔲 À faire (ordre recommandé)

### Backend
1. **db.js → db/**  
   Créer `backend/src/db/connection.js`, `schema.js`, `migrations.js`, puis repositories : `users.js`, `businesses.js`, `members.js`, `transactions.js`, `subscriptions.js`, `level.js`, `reset.js`, `categories.js`, `passes.js`, `webpush.js`, `dashboard.js`, `games.js`, `engagement.js`, `engagement-proof.js`.  
   Remplacer `db.js` par un barrel qui re-exporte tout. Chaque fichier < 400 lignes.

2. **routes/businesses.js** ✅  
   **Fait.** Découpage en `backend/src/routes/businesses/` : `index.js` (param slug, POST /, montage slugRouter), `slug.js` (composition), `shared.js` (helpers + rate limit), `create.js` (POST /, PATCH /:slug), `public.js` + `public-assets.js`, `assets.js`, `integration.js`, `engagement.js`, `notifications.js`, `dashboard.js`, `members.js`. Le fichier `routes/businesses.js` réexporte `./businesses/index.js`. Backend démarre correctement. Optionnel : extraire la logique lourde (ex. PATCH settings) dans `services/`.

3. **pass.js** ✅  
   **Fait.** Découpage en `backend/src/pass/` : `constants.js`, `auth.js` (getPassAuthenticationToken), `images-logo.js`, `images-strip.js`, `images-stamps.js`, `certs.js`, `build-buffers.js`, `generate.js` (generatePass). Chaque fichier < 400 lignes. `pass.js` réexporte depuis `./pass/auth.js` et `./pass/generate.js`.

### Frontend
4. **main.js → routeur + pages** ✅ (structure en place)  
   - **Fait.** `frontend/src/router/index.js` : getRoute, initRouting (async), setBuilderHeaderStep, attachBuilderHeaderNavForCheckout, updateAuthNavLinks, triggerRouteViewEnter. Show/hide des vues puis `import(\`../pages/${route.type}.js\`)` et `page.init(route)`.
   - **Fait.** Un module par écran dans `frontend/src/pages/` : `fidelity.js`, `auth.js`, `app.js`, `dashboard.js`, `checkout.js`, `templates.js`, `offers.js`, `legal.js`, `integration.js`, `not-found.js`, `landing.js`. Chaque page exporte `default { init(route) }` et délègue aux `init*` exportés par `main.js` (ou à `initClientFidelityPage` / `getLegalPageHtml`).
   - **En cours.** Modules `features/` créés : `legal.js`, `landing.js`, `offers.js`, `auth.js`, `dashboard.js`, `checkout.js`, `builder.js`, `app.js`, `fidelity-form.js`, `landing-shell.js` (pages importent depuis ces modules). `main.js` réduit (~35 lignes) ; objectif < 400 en poursuivant l’extraction (checkout, builder, app). Fait : dashboard, checkout, builder, app. Constantes : `constants/builder.js`. Utils : `utils/slugify.js`. Routeur : `navigateToBuilder`, `navigateToLanding`. Fait : fidelity-form.js, landing-shell.js ; main < 400.

5. **index.html**  
   Réduire à un shell < 200 lignes : head, polices, CSS, divs racine vides (ex. `#landing`, `#auth-app`, …), un seul script d’entrée. Déplacer le markup des vues vers des templates (ex. `frontend/src/templates/*.html`) chargés par les modules de page, ou générés par des composants.

6. **Libs lourdes en dynamique**  
   **Fait.** `html5-qrcode` est chargé en `import()` dynamique au moment d’ouvrir le scanner (dans `startScannerWithCamera`). Le bundle initial est allégé.

7. **CSS**  
   Découper `app.css` et `landing.css` (max 500 lignes/fichier). **Dérogation documentée** : commentaires en tête des fichiers ; découpage reporté (split par blocs @media complets).

### Finalisation
8. **Build**  
   Vérifier `manualChunks` (Vite) pour limiter les chunks à ~300 Ko (hors vendor). Build < 2 min.

9. **Lint**  
   ESLint : allowEmptyCatch activé ; globals (navigator, screen, requestAnimationFrame, sessionStorage, setImmediate, global) ajoutés. Erreurs no-empty et no-undef backend corrigées. Warnings no-unused-vars à traiter au fil de l’eau.

10. **Checklist**  
    Valider la checklist en fin de [REFONTE-REGLES.md](./REFONTE-REGLES.md) avant de considérer la refonte terminée.

---

## Commandes utiles

- Lint : `npm run lint` (racine)
- Build front : `npm run build` (racine)
- Tests backend : `npm run test` (dans backend/)
- Tests frontend : `npm run test` (dans frontend/)
