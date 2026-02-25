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

Quand tu modifies le code (connexion restaurateur, dashboard, etc.), pour que **myfidpass.fr** affiche la nouvelle version :

1. **Pousser le code sur GitHub**
   - Dans le dossier du projet : `git add .` puis `git commit -m "Connexion restaurateur, redirection /app"` puis `git push`.
   - Si le projet n’est pas encore un repo Git : `git init`, puis connecte-le à ton repo (ex. `amineprimesmr/myfidpass`) et pousse.

2. **Déploiement automatique**
   - **Vercel** (frontend) : dès qu’un push est fait sur la branche connectée, un nouveau build est lancé. Attends 1 à 2 minutes.
   - **Railway** (API) : idem si le projet est lié au même repo. Un nouveau déploiement se lance après le push.

3. **Variable JWT (si pas encore faite)**
   - Sur **Railway** → ton projet → **Variables** : ajoute `JWT_SECRET` avec une valeur aléatoire longue (ex. `openssl rand -hex 32` dans un terminal). Sans ça, la connexion / inscription peuvent échouer en prod.

4. **Voir les changements sur le site**
   - Ouvre **https://myfidpass.fr** et fais un **rafraîchissement forcé** : `Cmd + Shift + R` (Mac) ou `Ctrl + Shift + R` (Windows), ou ouvre le site en navigation privée pour éviter le cache.
