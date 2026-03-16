# Tests backend

- **`npm run test`** : exécute les tests (Vitest). Utilise `DATA_DIR=./test-data` et `NODE_ENV=test`.
- **`src/lib.test.js`** : test unitaire minimal (smoke).
- **`src/routes/auth.test.js`** et **`src/routes/payment.test.js`** : tests d’intégration (auth, webhook Stripe). Ils importent l’app complète ; en environnement CI ou si le chargement est lent, les lancer séparément ou avec un timeout élevé. Pour une exécution rapide : `npx vitest run src/lib.test.js`.

En cas de timeouts sur les tests d’intégration, s’assurer que `DATA_DIR` pointe vers un répertoire vide ou dédié (ex. `./test-data`).
