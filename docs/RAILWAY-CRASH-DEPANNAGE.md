# Backend qui crash sur Railway — dépannage

Tu reçois des emails **« Deploy Crashed for fidpass-api »** et en ouvrant **api.myfidpass.fr** (ou **api.myfidpass.fr/api/health**) tu vois **« Application failed to respond »** ou **502 Bad Gateway**. Voici pourquoi et quoi faire.

---

## Ce qui se passe

1. **Railway** lance le backend avec `cd backend && node src/index.js`.
2. Le processus **plante avant** de pouvoir répondre aux requêtes (ou juste après le démarrage).
3. Railway redémarre (restart policy), ça replante → tu reçois un email « Deploy Crashed ».
4. Tant que le backend ne reste pas en vie, **api.myfidpass.fr** ne répond pas → le site **myfidpass.fr** affiche « Service temporairement indisponible » sur la page de connexion.

Donc : **les emails « Deploy Crashed » = le backend ne reste pas démarré.** Il faut trouver **pourquoi** il sort (exit 1) ou crash (exception).

---

## Cause 1 : Variables d’environnement manquantes (très fréquent)

En **production** (`NODE_ENV=production`), le backend **quitte immédiatement** si :

- **`JWT_SECRET`** est absent ou fait **moins de 32 caractères**
- **`PASSKIT_SECRET`** est absent ou fait **moins de 32 caractères**

Dans les **Deploy Logs** Railway, tu dois voir l’un de ces messages juste avant la fin :

- `En production, JWT_SECRET doit être défini et faire au moins 32 caractères.`
- `En production, PASSKIT_SECRET doit être défini et faire au moins 32 caractères.`

**À faire :**

1. Railway → ton service **fidpass-api** → **Variables**.
2. Vérifier que **`NODE_ENV`** = `production`.
3. Ajouter ou corriger :
   - **`JWT_SECRET`** : une chaîne **longue et aléatoire** (au moins 32 caractères). Ex. générer avec :  
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - **`PASSKIT_SECRET`** : idem, une autre chaîne longue et aléatoire (au moins 32 caractères).
4. **Redéployer** (nouveau déploiement ou « Restart ») pour que les variables soient prises en compte.

Sans ces deux secrets, le backend **refuse volontairement** de démarrer en prod pour des raisons de sécurité.

---

## Cause 2 : Base de données (SQLite) au démarrage

Au démarrage, le backend :

- lit **`DATA_DIR`** (défaut : `backend/data`) ;
- crée le dossier s’il n’existe pas ;
- ouvre le fichier **`fidelity.db`** et exécute le schéma + les migrations.

Si une de ces étapes **échoue** (dossier non créable, disque en lecture seule, erreur dans une migration), le processus **crash** avec une exception. Dans les **Deploy Logs** tu verras la stack trace (fichier `backend/src/db/connection.js` ou `runSchema` / `runMigrations`).

**À faire :**

- Si tu utilises un **volume Railway** : le monter sur **`/data`** et définir **`DATA_DIR`** = **`/data`**. Vérifier que le volume est bien en **read-write**.
- Regarder la **dernière ligne** des logs avant le crash : souvent c’est une erreur SQLite ou « ENOENT » / « EACCES ».

---

## Cause 3 : Autres erreurs au chargement (certificats, modules)

Plus rare au tout premier démarrage, mais possible :

- **Certificats Apple (PassKit)** : ils ne sont pas chargés au démarrage, seulement à la première génération de pass. Donc en général ce n’est **pas** la cause du crash initial.
- **Module natif** (ex. `better-sqlite3`) : si la version de Node ou l’OS sur Railway ne correspond pas au binaire compilé, tu peux avoir une erreur au `import`. Vérifier que le **build** Railway utilise bien les deps du dossier **backend** (nixpacks avec `python3`, `gcc`, `gnumake` pour compiler `better-sqlite3`).

---

## Checklist rapide

| Étape | Action |
|-------|--------|
| 1 | Ouvrir **Railway** → service **fidpass-api** → onglet **Deployments** → dernier déploiement → **View Logs** (Deploy Logs). |
| 2 | Lire les **dernières lignes** : message d’erreur ou `process.exit(1)` (JWT_SECRET / PASSKIT_SECRET). |
| 3 | **Variables** : `NODE_ENV=production`, `JWT_SECRET` (32+ caractères), `PASSKIT_SECRET` (32+ caractères). Optionnel mais utile : `FRONTEND_URL=https://myfidpass.fr`, `API_URL=https://api.myfidpass.fr`, `DATA_DIR=/data` si volume monté. |
| 4 | Après modification des variables → **Redeploy** ou **Restart**. |
| 5 | Attendre 1–2 min puis tester **https://api.myfidpass.fr/health** → doit répondre `{"ok":true}`. |

---

## Récap

- **Emails « Deploy Crashed »** = le backend plante au démarrage (ou juste après).
- **« Application failed to respond »** / **502** sur api.myfidpass.fr = conséquence : pas de processus qui écoute.
- **Cause la plus fréquente** : **JWT_SECRET** ou **PASSKIT_SECRET** manquant ou trop court en prod → regarder les **Deploy Logs** pour confirmer, puis corriger les variables et redéployer.

Une fois le backend stable (logs « Backend fidélité: démarré sur le port … » et **/health** qui répond), la connexion sur **myfidpass.fr** doit refonctionner.
