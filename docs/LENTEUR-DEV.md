# Pourquoi le projet est lent en développement

## Résumé

Quand tu modifies le site (surtout le frontend), **chaque sauvegarde** déclenche un retraitement lourd. Un **nouveau projet** est rapide car il a peu de code et peu de dépendances. Ici, plusieurs facteurs se cumulent.

---

## Causes principales

### 1. Un seul fichier géant : `frontend/src/main.js` (~8 000 lignes, ~373 Ko)

- **En dev** : à chaque sauvegarde, Vite doit re-parser et re-transformer **tout** le fichier.
- **HMR (Hot Module Replacement)** : Vite remplace un “module” à la fois. Comme tout l’app est dans un seul module (`main.js`), il ne peut pas remplacer “juste un bout” → souvent **rechargement complet** de la page et retraitement de tout le graphe.
- **Conséquence** : une petite modification = retraitement de milliers de lignes à chaque fois.

### 2. Grappe de dépendances énorme (~7 100+ modules)

Le build signale **7117 modules** transformés. `main.js` charge (directement ou via des sous-modules) notamment :

- `html5-qrcode`
- `client-fidelity/bootstrap.js` (et toute la branche client-fidelity)
- Composants React chargés dynamiquement : **Three.js**, **@react-three/fiber**, **@react-three/drei**, **framer-motion**, etc.

Dès qu’un fichier change, Vite peut être amené à recalculer une grosse partie de ce graphe. Plus il y a de modules, plus le travail est long.

### 3. `index.html` très gros (~2 450 lignes, ~190 Ko)

- Tout le markup (landing, auth, dashboard, app, etc.) est dans **un seul** `index.html`.
- Beaucoup de **fichiers CSS** liés (style, landing, dashboard, auth, app, app-mobile, helmet, etc.).
- Modifier le HTML ou un CSS → rechargement / retraitement. Un HTML aussi gros augmente aussi un peu le travail (parsing, liens, etc.).

### 4. Pas de découpage par “écrans” (pas de code splitting)

- **Une seule entrée** : `index.html` → `src/main.js`.
- Tout le code “métier” est dans ce fichier ou dans des imports déjà chargés au démarrage.
- Donc pas de “petits morceaux” à recompiler seuls → chaque changement touche le cœur de l’app.

### 5. Librairies lourdes chargées tôt

- **html5-qrcode** est importé en haut de `main.js` → chargé au premier chargement, même si tu n’ouvres pas le scanner.
- Les composants **Three.js / R3F** sont en `import()` dynamique, ce qui est bien, mais le reste du bundle reste très gros à cause de `main.js` et de ses imports directs.

### 6. Tailwind + gros fichiers

- Tailwind scan les fichiers pour les classes. Avec **un JS de 8 000 lignes** et **un HTML de 2 450 lignes**, il y a beaucoup de contenu à scanner → un peu plus de travail à chaque changement.

---

## Pourquoi un nouveau projet est “ultra rapide”

- **Petits fichiers** : un changement = un petit module recompilé, HMR ciblé.
- **Peu de dépendances** : peu de modules à transformer.
- **Pas de fichier monolithique** : le graphe reste petit et modulaire.

---

## Pistes d’amélioration (par impact / effort)

### Court terme (réglages sans refonte)

- **Réduire la fréquence des rebuilds** : dans `vite.config.js`, ajouter par exemple `server.watch.throttle` ou limiter les événements de watch (voir ci‑dessous).
- **Optimiser le pre-bundling** : `optimizeDeps` (inclure les grosses libs pour qu’elles soient pré‑bundlées une fois).

### Moyen terme (refactor ciblé)

- **Découper `main.js`** en plusieurs modules (par exemple : `router.js`, `auth.js`, `dashboard.js`, `app-caisse.js`, etc.) et les importer depuis `main.js`.  
  → Un changement dans un écran ne retraite que ce module + `main.js`, au lieu de tout.
- **Charger `html5-qrcode` à la demande** : `import()` dynamique uniquement quand on ouvre le flux scanner.  
  → Démarrage et rebuilds un peu plus légers.

### Long terme (architecture)

- **Extraire les écrans en composants / routes** avec `import()` dynamique (code splitting).  
  → Seul le code de l’écran modifié est retraité.
- **Réduire le HTML statique** : déplacer le markup vers des templates ou des composants générés en JS/JSX, et garder un `index.html` minimal.

---

## Réglages Vite proposés (dans ce repo)

Dans `frontend/vite.config.js` on peut ajouter :

- **`server.watch`** : limiter la sensibilité du file watcher pour éviter des rafales de rebuilds.
- **`optimizeDeps`** : forcer le pre-bundle de grosses libs (ex. `html5-qrcode`, `three`) pour accélérer le premier chargement et les invalidation suivantes.

Voir les modifications concrètes dans `frontend/vite.config.js`.
