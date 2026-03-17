# Où vérifier quoi : Railway vs Vercel

En bref :
- **Railway** = ton **API** (backend). C’est là que tourne le code qui envoie les notifications, génère les passes, etc.
- **Vercel** = ton **site web** (frontend) myfidpass.fr. C’est la page que les gens voient.

---

## Sur Railway (l’API)

**Site :** https://railway.app → ouvre ton projet → clique sur le **service** (ex. fidpass-api).

**Si le déploiement crash (« Deploy Crashed », api.myfidpass.fr ne répond pas)** → voir **docs/RAILWAY-CRASH-DEPANNAGE.md**. Vérifier les **Deploy Logs** et les variables **JWT_SECRET** / **PASSKIT_SECRET** (obligatoires en prod, 32+ caractères).

### 1. Variables (Variables / Settings)

À vérifier ou ajouter :

| Variable        | À quoi ça sert | Valeur type |
|-----------------|----------------|-------------|
| `API_URL`       | URL publique de ton API. **Utilisée pour l’icône des notifications** (logo du commerce). Si elle est fausse ou absente, l’icône peut ne pas s’afficher. | `https://api.myfidpass.fr` (sans slash à la fin) |
| `NODE_ENV`      | Environnement | `production` |
| `FRONTEND_URL`  | URL du site (pour CORS) | `https://myfidpass.fr` |
| `JWT_SECRET`    | **Obligatoire en prod.** Secret pour la connexion. Sinon le backend crash au démarrage. | Chaîne ≥ 32 caractères (aléatoire) |
| `PASS_TYPE_ID`  | Pour Apple Wallet | ex. `pass.com.fidelity` |
| `PASSKIT_SECRET` | **Obligatoire en prod.** Secret pour les passes Apple Wallet. Sinon le backend crash au démarrage. | Chaîne ≥ 32 caractères (aléatoire) |
| `TEAM_ID`       | Team ID Apple | ex. `F2CJGJ69XU` |
| `DATA_DIR`      | Pour garder les données (comptes, etc.) après redéploiement | `/data` (si tu as un volume monté en `/data`) |

Pour l’icône de notification : la plus importante à avoir correcte est **`API_URL`** = l’URL sous laquelle ton API est accessible (souvent `https://api.myfidpass.fr`).

### 2. Déploiement

- Chaque **push sur `main`** déclenche un nouveau déploiement.
- Tu peux voir l’état dans l’onglet **Deployments** (en cours, succès, échec).
- Après un déploiement réussi, attends 1–2 minutes puis tu peux tester l’API (ex. `https://api.myfidpass.fr/health`).

### 3. Domaine

- Dans **Settings → Networking / Domains**, tu dois avoir soit :
  - l’URL Railway (ex. `xxx.up.railway.app`), soit  
  - un domaine perso (ex. `api.myfidpass.fr`).
- `API_URL` dans les variables doit être exactement cette URL (avec `https://`).

---

## Sur Vercel (le site)

**Site :** https://vercel.com → ton projet (celui qui sert myfidpass.fr).

### 1. Variables (Settings → Environment Variables)

| Variable         | À quoi ça sert | Valeur type |
|------------------|----------------|-------------|
| `VITE_API_URL`   | URL de l’API que le site appelle (création de carte, connexion, etc.). | `https://api.myfidpass.fr` (sans slash à la fin) |

Sans `VITE_API_URL`, le front ne sait pas où est l’API → erreurs type « Erreur lors de la création ».

### 2. Déploiement

- Chaque **push sur `main`** déclenche en général un déploiement (si le repo est connecté).
- Onglet **Deployments** : tu vois les déploiements (Building → Ready).
- **Important :** si tu **ajoutes ou modifies** `VITE_API_URL`, il faut **redéployer** (bouton **Redeploy** sur le dernier déploiement) pour que la nouvelle valeur soit prise en compte.

---

## Récap pour l’icône de notification (logo)

1. **Railway** : variable **`API_URL`** = `https://api.myfidpass.fr` (ou l’URL réelle de ton API).
2. Le backend est bien déployé (dernier push fait).
3. Le commerce a un **logo enregistré** (depuis l’app ou le SaaS).

Si tout ça est bon, les prochaines notifications (Web Push) devraient afficher le logo.

---

## Liens directs

| Où  | Lien |
|-----|------|
| Railway | https://railway.app |
| Vercel  | https://vercel.com |
