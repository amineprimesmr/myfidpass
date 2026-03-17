# Règles de la refonte — À respecter absolument

**Objectif :** Projet propre, maintenable et **ultra rapide en dev** (modifications = recompilation ciblée, HMR efficace).  
**Statut :** Règles **fixes et non négociables** pour toute la refonte et au-delà.

---

## 1. Principes généraux (non négociables)

1. **Un fichier = une responsabilité claire.** Pas de “fourre-tout” (routing + auth + dashboard + app dans le même fichier).
2. **Petits modules.** Un changement de code ne doit retraiter que le module concerné (et ses dépendants directs), pas toute l’application.
3. **Chargement à la demande.** Les librairies et écrans lourds sont chargés uniquement quand on en a besoin (dynamic `import()`).
4. **Pas de monolithe.** Aucun fichier source ne dépasse les limites définies ci-dessous ; aucun HTML unique contenant toutes les vues.
5. **Testabilité.** Toute logique métier ou route critique doit pouvoir être testée unitairement ou par des tests d’intégration sans démarrer tout l’app.

---

## 2. Limites chiffrées (à ne jamais dépasser)

| Règle | Limite | Zone |
|-------|--------|------|
| **Lignes par fichier** | **400 lignes** max (hors généré / données) | Tout le projet |
| **Taille fichier JS/TS/JSX** | **~25 Ko** par fichier source (ordre de grandeur) | Frontend + backend |
| **Taille fichier CSS** | **500 lignes** max par fichier ; privilégier un fichier par composant/écran | Frontend |
| **Taille HTML statique** | **200 lignes** max pour `index.html` ; le reste doit venir de composants / templates | Frontend |
| **Chunk JS (build)** | **300 Ko** max par chunk après minification (hors vendor) | Frontend build |
| **Nombre de routes dans un seul fichier** | **15 routes** max par fichier route | Backend |
| **Fonctions / blocs par fichier** | **~15** blocs logiques max (ordre de grandeur) | Tout |

**Dérrogation :** Exception temporaire possible uniquement si documentée (fichier `REFONTE-REGLES.md` ou commentaire en tête de fichier) avec une date de résolution. Aucune dérogation pour créer un *nouveau* monolithe.

---

## 3. Frontend — Règles obligatoires

### 3.1 Structure

- **Un point d’entrée minimal :** `index.html` ne contient que le shell (head, racine React ou div#root), les polices et **un seul** script d’entrée (ex. `main.js` ou `App.jsx`). **Aucun** markup des écrans (landing, auth, dashboard, app) dans `index.html`.
- **Un module par écran / route logique.** Chaque “page” (landing, login, register, dashboard, app caisse, app client, etc.) est un module séparé, chargé via **`import()` dynamique** depuis le routeur.
- **Routeur léger.** Le fichier de routage ne fait que : lire l’URL → décider quel module charger → afficher le composant. Il ne contient **pas** la logique métier des écrans.
- **Composants réutilisables** dans `frontend/src/components/` (ou par domaine : `components/auth/`, `components/dashboard/`, etc.). Taille max par composant : 400 lignes.

### 3.2 Imports et performances

- **Librairies lourdes en dynamique.** `html5-qrcode`, `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` (si utilisé sur un seul écran) : chargés avec `import()` **au moment d’entrer sur l’écran** qui en a besoin, pas en haut du point d’entrée.
- **Pas d’import statique** d’une grosse lib “au cas où”. Si une lib n’est utilisée que sur un écran, cet écran doit être un chunk séparé et la lib doit être dans ce chunk (via dynamic import).
- **Vite :** garder `optimizeDeps.include` pour les grosses deps pré-bundlées ; utiliser `build.rollupOptions.output.manualChunks` pour séparer vendor (react, three, etc.) et éviter des chunks > 300 Ko pour le code app.

### 3.3 CSS

- **Un fichier CSS par composant ou par écran** (ou par “zone” : auth, dashboard, app). Pas de fichier unique de 4 000+ lignes pour toute l’app.
- **Tailwind** : utiliser les utilitaires ; éviter les duplications de blocs identiques. Fichiers CSS dédiés uniquement pour ce qui ne peut pas être fait en utilitaires (thèmes, keyframes, composants complexes).
- **Max 500 lignes** par fichier CSS.

### 3.4 Interdictions frontend

- **Interdit :** Un seul fichier JS contenant routage + auth + dashboard + app caisse + app client + formulaires + géocodage + tout le reste.
- **Interdit :** Un seul `index.html` contenant le markup de toutes les vues (landing, auth, dashboard, app, etc.).
- **Interdit :** Importer en tête de fichier une lib lourde (ex. `html5-qrcode`, `three`) si elle n’est utilisée que sur un écran spécifique.

---

## 4. Backend — Règles obligatoires

### 4.1 Structure

- **Routes :** Un fichier de routes par domaine ou sous-domaine (ex. `auth.js`, `businesses.js`, `payment.js`). Chaque fichier : **max 15 routes** et **max 400 lignes**. Si on dépasse, créer des sous-routeurs ou extraire la logique dans des **services**.
- **Services :** Toute logique métier (création commerce, génération pass, envoi notification, etc.) vit dans des modules sous `backend/src/services/` (ou `backend/src/lib/`). Les routes ne font qu’appeler les services et renvoyer les réponses HTTP.
- **Données :** Accès DB dans des modules dédiés (ex. `repositories/` ou fonctions dans un `db/` découpé : `db/users.js`, `db/businesses.js`, `db/members.js`, etc.). **Pas** un seul `db.js` de 2 000+ lignes contenant schéma + migrations + toutes les requêtes.
- **Pass / Apple :** Découper `pass.js` en sous-modules (ex. signature, images, champs, registration) pour rester sous 400 lignes par fichier.

### 4.2 Limites

- **Aucun fichier backend** au-delà de **400 lignes** (sauf données pures ou généré).
- **Une route = un handler court** (validation → appel service/repository → réponse). Pas de blocs de 100+ lignes dans une route.

### 4.3 Interdictions backend

- **Interdit :** Un seul fichier contenant toutes les routes “businesses” + toute la logique métier (2 400+ lignes).
- **Interdit :** Un seul fichier DB contenant schéma + migrations + toutes les requêtes pour tous les modèles (2 000+ lignes).
- **Interdit :** Logique métier complexe directement dans les handlers de route sans extraction dans un service.

---

## 5. Qualité et outillage — Règles obligatoires

### 5.1 Lint

- **ESLint** doit s’appliquer à **tous** les fichiers sources : `*.js`, `*.jsx`, `*.ts`, `*.tsx` (ajuster `eslint.config.cjs` en conséquence). Aucun dossier source ne doit être exclu sans justification.
- **Règles minimales :** pas de `no-unused-vars` ignorés sans raison ; `prefer-const` ; pas de console en prod si une règle le demande (ou alors désactivée explicitement et documentée).
- **Pas de commit** qui introduit des erreurs ESLint sur les fichiers modifiés.

### 5.2 Tests

- **Backend :** Toute nouvelle route ou service critique doit avoir au moins un test (unitaire ou intégration). Les routes auth et payment ont déjà des tests ; les garder et les faire passer. Objectif : pas de régression sur login, register, webhook Stripe.
- **Frontend :** Mettre en place un runner de tests (ex. Vitest) et exiger au moins un test par nouveau module “écran” ou service front (ex. config, apiError). Objectif à terme : couvrir le routeur et les appels API critiques.
- **Pas d’abandon** de tests existants (ex. ne pas désactiver auth.test.js ou payment.test.js sans les remplacer).

### 5.3 Build et CI

- **Build front** doit rester sous une durée raisonnable (objectif < 2 min sur une machine standard). Si le build dépasse, revoir le découpage (chunks, lazy loading).
- **Lint + build** doivent passer avant tout déploiement (à intégrer dans le script deploy ou en pré-push si possible).

---

## 6. Nommage et organisation des dossiers

- **Frontend :**
  - `src/pages/` ou `src/screens/` : un fichier par écran (landing, login, dashboard, app-caisse, app-client, etc.).
  - `src/components/` : composants réutilisables ; sous-dossiers par domaine si besoin (`auth/`, `dashboard/`, `ui/`).
  - `src/services/` ou `src/api/` : appels API, configuration client.
  - `src/router/` ou équivalent : uniquement la logique de routage et le chargement des écrans.
- **Backend :**
  - `routes/` : uniquement définition des routes et appel des services.
  - `services/` : logique métier.
  - `db/` ou `repositories/` : schéma, migrations, requêtes (découpés par domaine).

Fichiers et dossiers en **kebab-case** ou **camelCase** selon la convention du projet (choisir une et la tenir partout).

---

## 7. Checklist de validation (avant de considérer la refonte “terminée”)

- [ ] Aucun fichier source > 400 lignes (sauf exception documentée avec date).
- [ ] `index.html` < 200 lignes ; tout le markup des vues vient de composants/modules.
- [ ] Aucun fichier JS unique contenant routage + auth + dashboard + app (main.js découpé en modules/écrans).
- [ ] Libs lourdes (html5-qrcode, three, R3F, etc.) chargées en dynamique sur l’écran concerné.
- [ ] Backend : routes < 15 par fichier ; logique métier dans services ; db/repositories découpés.
- [ ] ESLint s’applique à .js, .jsx, .ts, .tsx sur tout le code source.
- [ ] Tests backend existants passent ; au moins un test frontend en place.
- [ ] Build front < 2 min ; pas de chunk app > 300 Ko (hors vendor).
- [ ] Doc mise à jour : architecture résumée, lien vers REFONTE-REGLES.md et BILAN-A-Z.md.

---

## 8. En cas de conflit

En cas de conflit entre une contrainte de délai ou de “quick fix” et ces règles : **les règles gagnent**. On documente une dérogation temporaire (avec date de résolution) plutôt que de créer un nouveau monolithe ou de casser les limites. La vélocité long terme dépend du respect de ces règles.

---

**Références :** [BILAN-A-Z.md](./BILAN-A-Z.md), [LENTEUR-DEV.md](./LENTEUR-DEV.md), [PLAN-ACTION-AUDIT.md](./PLAN-ACTION-AUDIT.md).
