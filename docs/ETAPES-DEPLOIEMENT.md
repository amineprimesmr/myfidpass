# Fidpass — Étapes à faire, une par une

Suis ces étapes **dans l’ordre**. À la fin, la création de carte sur myfidpass.fr fonctionnera.

---

## Étape 1 — Déployer l’API sur Railway

1. Va sur **https://railway.app** et connecte-toi (ou crée un compte avec GitHub).
2. Clique sur **« New Project »**.
3. Choisis **« Deploy from GitHub repo »** et sélectionne le repo **amineprimesmr/myfidpass** (autorise Railway si demandé).
4. Une fois le projet créé, clique sur le **service** (la boîte qui représente ton app).
5. Onglet **Settings** (ou **Variables**) :
   - **Root Directory** : laisse vide (racine du repo).
   - Railway utilise le fichier `railway.toml` à la racine pour build et start.
6. Onglet **Variables** : ajoute ces variables (bouton **+ New Variable** pour chaque) :

   | Nom | Valeur |
   |-----|--------|
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | `https://myfidpass.fr` |
   | `JWT_SECRET` | une chaîne aléatoire longue (ex. générée avec `openssl rand -hex 32`) pour la connexion restaurateur |
   | `PASS_TYPE_ID` | `pass.com.fidelity` |
   | `TEAM_ID` | ton Team ID Apple (ex. `F2CJGJ69XU`) |
   | `ORGANIZATION_NAME` | `Carte fidelite` |

   *(Ne mets pas les certificats pour l’instant si tu ne les as pas en variables ; on peut les ajouter après.)*

7. Onglet **Settings** → section **Networking** ou **Domains** :
   - Clique sur **« Generate Domain »** ou **« Add custom domain »**.
   - Note l’URL générée (ex. `fidpass-api-production-xxxx.up.railway.app`). Tu en auras besoin à l’étape 3.
8. (Optionnel) Pour **api.myfidpass.fr** :
   - Dans **Custom Domain**, ajoute **`api.myfidpass.fr`**.
   - Railway t’indiquera une cible (souvent la même URL `xxx.railway.app`). On configurera le DNS à l’étape 3.

---

## Étape 2 — Certificats Apple Wallet sur Railway

Sans les certificats, la génération de la carte Wallet ne marchera pas. Deux possibilités :

**Option A — Fichiers dans le repo (déconseillé en repo public)**  
- Garde les fichiers dans `backend/certs/` (signerCert.pem, signerKey.pem, wwdr.pem) et assure-toi qu’ils sont bien versionnés (ou envoie-les uniquement en repo **privé**). Au déploiement, ils seront sur le serveur.

**Option B — Variables d’environnement (recommandé)**  
- Sur Railway, dans **Variables**, ajoute par exemple :
  - Une variable dont la **valeur** est le **contenu entier** du fichier (copier-coller du .pem).  
  - Il faudrait alors adapter le code backend pour lire les certs depuis ces variables au démarrage et les écrire dans `backend/certs/`. Si tu ne l’as pas fait, utilise l’option A avec un repo **privé** et les 3 fichiers dans `backend/certs/`.

Pour l’instant tu peux **ignorer** si tu veux juste que « Créer ma carte » enregistre le commerce ; la **téléchargement du .pkpass** ne marchera qu’une fois les certificats en place.

---

## Étape 3 — Domaine api.myfidpass.fr (Hostinger)

1. Va sur **https://hpanel.hostinger.com** → **Noms de domaine** → **myfidpass.fr** → **DNS / Serveurs de noms** → onglet **Enregistrements DNS**.
2. Clique sur **Ajouter** (ou **Add record**).
3. Remplis :
   - **Type** : `CNAME`
   - **Nom** : `api`
   - **Cible / Pointe vers** : l’URL Railway de l’étape 1 (ex. `fidpass-api-production-xxxx.up.railway.app` — sans `https://`, juste le nom d’hôte).
   - **TTL** : `14400` (ou laisser par défaut).
4. Enregistre.
5. Attends 5 à 30 minutes (propagation DNS). Tu pourras tester avec : `https://api.myfidpass.fr/health` → doit retourner `{"ok":true}`.

---

## Étape 4 — Variable d’environnement sur Vercel

1. Va sur **https://vercel.com** → ton projet **Fidpass** (ou celui qui sert myfidpass.fr).
2. Onglet **Settings** → **Environment Variables**.
3. Ajoute une variable :
   - **Name** : `VITE_API_URL`
   - **Value** : `https://api.myfidpass.fr` (sans slash à la fin)
   - **Environments** : coche **Production** (et Preview si tu veux).
4. Clique sur **Save**.
5. **Redéploie** le projet : onglet **Deployments** → sur le dernier déploiement, menu **⋯** → **Redeploy** (ou pousse un commit sur GitHub pour déclencher un nouveau build).  
   Important : le build doit être **refait** après avoir ajouté `VITE_API_URL`, sinon le frontend ne connaîtra pas l’URL de l’API.

---

## Étape 5 — Vérifier que tout marche

1. Ouvre **https://myfidpass.fr**.
2. Va sur **« Créer ma carte »** (ou **Obtenir ma carte** → page de personnalisation).
3. Remplis nom d’établissement, lien (slug), couleurs, etc., puis clique sur **« Créer ma carte et obtenir mon lien »**.
4. Si tout est bon : tu vois l’écran de succès avec le lien et le QR code (et éventuellement « Ouvrir le tableau de bord »).
5. Si tu vois encore « Erreur lors de la création » :
   - Vérifie que `VITE_API_URL` est bien défini sur Vercel et qu’un **nouveau** déploiement a été fait après.
   - Vérifie que **https://api.myfidpass.fr/health** répond `{"ok":true}` dans le navigateur.
   - Vérifie les logs du backend sur Railway (onglet **Deployments** → **View Logs**) en cas d’erreur 500.

---

## Récap des liens utiles

| Où | Lien |
|----|------|
| Railway | https://railway.app |
| Vercel | https://vercel.com |
| Hostinger DNS | https://hpanel.hostinger.com (puis domaine myfidpass.fr → DNS) |
| Test API | https://api.myfidpass.fr/health |
| Site | https://myfidpass.fr |

Une fois les étapes 1, 3 et 4 faites (et 2 si tu veux les passes Wallet), le logiciel est en ligne et prêt à accueillir des utilisateurs.

---

## Mettre à jour le logiciel (voir les derniers changements sur myfidpass.fr)

**En résumé : tu n’as pas à modifier les Variables sur Railway à chaque changement de code.**  
Les Variables (comme `JWT_SECRET`) se configurent **une fois**. Ensuite, à chaque modification du code, il suffit de **pousser sur GitHub** : Vercel et Railway redéploient tout seuls.

1. **À faire une seule fois (config Railway)**
   - Sur **Railway** → ton service **fidpass-api** → onglet **Variables**.
   - Clique sur **+ New Variable**.
   - Nom : `JWT_SECRET`  
   - Valeur : une chaîne aléatoire (dans un terminal : `openssl rand -hex 32`, puis copie le résultat).
   - Enregistre. Sans cette variable, l’inscription / connexion peuvent échouer en prod.

2. **À chaque changement de code (habituel)**
   - Dans le dossier du projet : `git add .` puis `git commit -m "Description du changement"` puis `git push`.
   - **Aucune action sur Railway ou Vercel** : le push déclenche le déploiement automatique (Vercel pour le site, Railway pour l’API). Attends 1 à 2 minutes.

3. **Voir les changements**
   - Ouvre **https://myfidpass.fr** (pas localhost) et fais un rafraîchissement forcé : **Cmd + Shift + R** (Mac) ou **Ctrl + Shift + R** (Windows).

**Pourquoi « Erreur lors de l’inscription » en local (localhost) ?**  
En local, le frontend appelle l’API via le proxy (port 3001). Si le backend ne tourne pas sur le port 3001, la requête échoue. Pour tester l’inscription et la connexion, utilise directement **https://myfidpass.fr** (après avoir ajouté `JWT_SECRET` sur Railway).

**Pourquoi la prod affiche encore l’ancienne version (pas de « Connexion », etc.) ?**  
Si dans Vercel la **Source** du déploiement affiche toujours **« 19f5848 Initial commit »**, c’est que le projet Vercel est connecté à **un autre dépôt** que celui où tu pushes (ton code est sur `amineprimesmr/myfidpass`, Vercel déploie peut‑être `amineprimesmr/fidpass` ou un autre repo).

**Solution — connecter Vercel au bon dépôt :**
1. **Vercel** → projet **fidpass** → **Settings** (menu gauche) → **Git**.
2. Regarde la section **Connected Git Repository** : quel repo est indiqué ? (ex. `amineprimesmr/fidpass`).
3. Si ce n’est **pas** `amineprimesmr/myfidpass` :
   - Clique sur **Disconnect** pour découdre le repo actuel.
   - Puis **Connect Git Repository** → choisis **GitHub** → **Import** le repo **amineprimesmr/myfidpass** (celui où tu fais `git push`).
   - Branche de production : **main**. Enregistre.
4. Un nouveau déploiement se lancera automatiquement depuis le **dernier commit** de `main` (avec Connexion, espace /app, etc.). Attends **Ready**, puis ouvre **myfidpass.fr** et fais **Cmd + Shift + R**.
