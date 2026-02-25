# Déploiement Fidpass (myfidpass.fr)

Ce guide décrit comment publier le SaaS Fidpass avec le domaine **myfidpass.fr**. On utilise **Vercel** pour le site (frontend) et un hébergeur Node (ex. **Railway** ou **Render**) pour l’API.

---

## Ce que tu dois faire toi-même (je ne peux pas le faire à ta place)

Tout ce qui est **config, code et fichiers** dans le repo est prêt. Il reste les actions qui demandent **ton compte** et **ton navigateur** :

| # | À faire | Où |
|---|--------|-----|
| 1 | Créer un compte (ou te connecter) | [Vercel](https://vercel.com) |
| 2 | Créer un compte (ou te connecter) | [Railway](https://railway.app) ou [Render](https://render.com) |
| 3 | Pousser le code sur GitHub (ou GitLab) si ce n’est pas déjà fait | Git |
| 4 | Sur Vercel : « Add New » → « Project » → importer le repo, **ne pas** changer le Root Directory (la racine du repo avec `vercel.json` est utilisée) | Vercel |
| 5 | Sur Vercel : ajouter la variable d’environnement `VITE_API_URL` = `https://api.myfidpass.fr` (ou l’URL Railway temporaire au début) | Vercel → Project → Settings → Environment Variables |
| 6 | Sur Vercel : dans **Domains**, ajouter `myfidpass.fr` et `www.myfidpass.fr` | Vercel → Project → Settings → Domains |
| 7 | Sur Railway (ou Render) : « New Project » → déployer depuis le même repo. Root = racine (le fichier `railway.toml` ou la config Render sera utilisée) | Railway / Render |
| 8 | Sur Railway/Render : ajouter les variables d’environnement (voir `backend/.env.example` + `FRONTEND_URL` = `https://myfidpass.fr`) | Railway / Render → Variables |
| 9 | Sur Railway/Render : mettre les **certificats Apple Wallet** sur le serveur (fichiers dans `backend/certs/` ou variables d’env si tu as adapté le code) | Ton hébergeur |
| 10 | Sur Railway/Render : ajouter le domaine personnalisé `api.myfidpass.fr` et noter la cible CNAME indiquée | Railway / Render → Settings → Domains |
| 11 | Chez **Hostinger** : soit **changer les serveurs de noms** pour ceux donnés par Vercel, soit ajouter les **enregistrements DNS** (A pour `@`, CNAME pour `www`, CNAME pour `api`) comme indiqué plus bas | Hostinger → DNS / Serveurs de noms |

Après ça, le site sera en ligne sur **myfidpass.fr** et l’API sur **api.myfidpass.fr**.

---

## Vue d’ensemble

| Composant | Rôle | Hébergement conseillé |
|-----------|------|------------------------|
| **Frontend** | Site vitrine + page carte (/fidelity/:slug) | **Vercel** (gratuit, domaine custom) |
| **Backend** | API + génération des passes Apple Wallet | **Railway** ou **Render** (Node + disque pour SQLite/certificats) |
| **Domaine** | myfidpass.fr | Géré chez **Hostinger** (DNS) ou transféré vers Vercel (nameservers) |

---

## 1. Déployer le frontend sur Vercel

1. **Compte**  
   Crée un compte sur [vercel.com](https://vercel.com) (gratuit).

2. **Projet**  
   - « Add New » → « Project ».  
   - Importe le repo Git (GitHub/GitLab).  
   - **Root Directory** : laisse à la racine (par défaut). Le fichier `vercel.json` à la racine définit déjà le build et l’output.  
   - Si Vercel te propose d’override : **Build** = `npm run build:frontend`, **Output** = `frontend/dist`, **Install** = `npm install && cd frontend && npm install`.

3. **Variables d’environnement** (dans Vercel → Project → Settings → Environment Variables) :
   - `VITE_API_URL` = `https://api.myfidpass.fr`  
   (on configurera ce sous‑domaine à l’étape 4. Tu peux mettre d’abord l’URL Railway temporaire, puis la changer.)

4. **Déploiement**  
   Déploie. Tu obtiendras une URL du type `xxx.vercel.app`. On connectera myfidpass.fr juste après.

---

## 2. Déployer le backend (Railway ou Render)

Le backend a besoin de **Node**, d’un **disque** (SQLite, dossiers `data/`, `assets/`, `certs/`) et des **variables d’environnement** (certificats Apple Wallet, etc.).

### Option A : Railway

1. Compte sur [railway.app](https://railway.app).  
2. « New Project » → « Deploy from GitHub » (ou « Empty » + push du code).  
3. Racine du projet = dossier qui contient `backend/` (ou monorepo avec `backend` à la racine).  
4. **Build** :  
   - Root directory : racine du repo (où se trouve `backend/`).  
   - Build command : `cd backend && npm install`.  
   - Start command : `cd backend && node src/index.js`.  
   - Ou à la racine : `node backend/src/index.js` si `package.json` est à la racine.  
5. **Variables d’environnement** (Railway → Variables) :
   - `NODE_ENV` = `production`
   - `PORT` = `3001` (ou la variable fournie par Railway)
   - `FRONTEND_URL` = `https://myfidpass.fr`
   - Toutes les variables du fichier `backend/.env` (Pass Type ID, certificats, etc.). Pour les certificats en prod, tu peux mettre le contenu en variables (ex. `SIGNER_CERT_PEM`) si Railway ne monte pas de volume, sinon monter un volume avec `certs/` et `data/`.
6. **Domaine** : Railway te donne une URL (ex. `xxx.railway.app`). Tu peux ajouter un custom domain `api.myfidpass.fr` dans Railway ; ils te diront quoi mettre en DNS.

### Option B : Render

1. [render.com](https://render.com) → « New » → « Web Service ».  
2. Connecte le repo, racine = dossier du projet.  
3. **Build** : `cd backend && npm install`.  
4. **Start** : `cd backend && node src/index.js` (ou `node src/index.js` si la racine du service est `backend`).  
5. Même principe pour les variables d’environnement et le custom domain `api.myfidpass.fr`.

---

## 3. Connecter myfidpass.fr au site (Vercel)

Deux façons selon si tu veux que Vercel gère le DNS ou que Hostinger garde le DNS.

### Méthode 1 : Nameservers chez Vercel (recommandé)

1. Dans Vercel : Project → **Settings** → **Domains** → Add `myfidpass.fr` et `www.myfidpass.fr`.  
2. Vercel t’indique les **nameservers** à utiliser (ex. `ns1.vercel-dns.com`, `ns2.vercel-dns.com`).  
3. Chez **Hostinger** :  
   - Va dans **Noms de domaine** → **DNS / Serveurs de noms** pour `myfidpass.fr`.  
   - Clique sur **« Changer les serveurs de noms »**.  
   - Remplace par les nameservers fournis par Vercel, enregistre.  
4. Propagation DNS : 15 min à 24 h. Après ça, `myfidpass.fr` affichera le site Vercel.

### Méthode 2 : Garder les nameservers Hostinger

1. Dans Vercel : ajoute quand même `myfidpass.fr` et `www.myfidpass.fr` dans Domains.  
2. Vercel te donnera un **enregistrement A** (ex. `76.76.21.21`) et éventuellement un **CNAME** pour `www`.  
3. Chez **Hostinger** : onglet **« Enregistrements DNS »**.  
   - **A** : Nom `@`, Pointe vers `76.76.21.21` (ou l’IP indiquée par Vercel), TTL 14400.  
   - **CNAME** (optionnel) : Nom `www`, Pointe vers `cname.vercel-dns.com` (ou la cible indiquée par Vercel).  
4. Sauvegarde. Après propagation, le site sera servi par Vercel sur myfidpass.fr.

---

## 4. Pointer api.myfidpass.fr vers le backend

Pour que le frontend appelle `https://api.myfidpass.fr` au lieu de l’URL Railway/Render :

1. **Railway / Render** : dans les paramètres du service, ajoute un **custom domain** : `api.myfidpass.fr`.  
2. Ils te donneront une cible (souvent un CNAME, ex. `xxx.railway.app` ou `xxx.onrender.com`).  
3. Chez **Hostinger** (Enregistrements DNS) :  
   - **CNAME** : Nom `api`, Pointe vers la cible fournie (ex. `xxx.railway.app`), TTL 14400.  
4. Attends la propagation.  
5. **Frontend** : dans Vercel, variable `VITE_API_URL` = `https://api.myfidpass.fr`. Redéploie si besoin.

---

## 5. Résumé des enregistrements DNS (Hostinger)

Si tu restes en DNS Hostinger :

| Type | Nom | Pointe vers / Valeur | Usage |
|------|-----|----------------------|--------|
| A    | `@` | IP fournie par Vercel (ex. 76.76.21.21) | myfidpass.fr → site |
| CNAME | `www` | cname.vercel-dns.com (ou valeur Vercel) | www.myfidpass.fr → site |
| CNAME | `api` | xxx.railway.app (ou ton backend) | api.myfidpass.fr → API |

---

## 6. Checklist finale

- [ ] Backend déployé (Railway/Render), `FRONTEND_URL=https://myfidpass.fr`, certificats Apple Wallet configurés.  
- [ ] Frontend déployé sur Vercel, `VITE_API_URL=https://api.myfidpass.fr`.  
- [ ] Domaine myfidpass.fr et www pointent vers Vercel.  
- [ ] api.myfidpass.fr pointe vers le backend.  
- [ ] Test : ouvrir `https://myfidpass.fr` → landing ; `https://myfidpass.fr/creer-ma-carte` → créateur ; `https://myfidpass.fr/fidelity/demo` → page carte (avec l’API qui répond).

---

## Certificats Apple Wallet en production

Les fichiers dans `backend/certs/` (signerCert.pem, signerKey.pem, wwdr.pem) doivent être présents sur le serveur. Sur Railway/Render :

- Soit tu les inclus dans le repo (dossier `backend/certs/` versionné, **attention** à ne pas commiter de clés dans un repo public).  
- Soit tu utilises des **variables d’environnement** (contenu PEM en base64 ou texte) et au démarrage du serveur tu écris les fichiers dans `certs/` avant de lancer Express.

Une fois tout en place, le SaaS est accessible sur **myfidpass.fr** avec l’API sur **api.myfidpass.fr**.
