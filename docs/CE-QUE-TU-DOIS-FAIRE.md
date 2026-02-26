# Ce que tu dois faire — en bref

## 1. Pour que le site marche (création de carte)

Sans ça, quand quelqu’un clique sur « Créer ma carte », il aura une erreur.

| Où | Quoi faire |
|----|------------|
| **Backend** (Railway, Render…) | Déployer le backend et noter l’URL (ex. `https://api.myfidpass.fr`). |
| **Vercel** (ton projet du site) | **Settings → Environment Variables** → ajouter une variable : **Name** = `VITE_API_URL`, **Value** = l’URL du backend (ex. `https://api.myfidpass.fr`, sans slash à la fin). Puis **redéployer** le site (Deployments → … → Redeploy). |
| **Backend** (variables d’env) | Mettre au minimum : `FRONTEND_URL` = `https://myfidpass.fr`, `NODE_ENV` = `production`, `JWT_SECRET` = une longue chaîne aléatoire. |

Après ça : le bouton « Créer ma carte » envoie bien les données au backend et la création fonctionne.

---

## 2. Optionnel : la recherche d’entreprise (suggestions Google)

Là, c’est pour que quand on tape dans « Nom de votre établissement », des suggestions d’entreprises apparaissent (comme sur les captures que tu as montrées).

- **Si tu ne fais rien** : le champ reste un simple champ texte. Les gens tapent le nom à la main. Ça marche très bien.
- **Si tu veux les suggestions Google** : il faut une clé API Google et l’ajouter sur Vercel. Les étapes sont dans la section [Recherche Google (autocomplete)](#recherche-google-autocomplete) de `docs/PRODUCTION.md`, ou ci‑dessous en résumé.

### Résumé pour activer la recherche Google

1. Va sur [Google Cloud Console](https://console.cloud.google.com/).
2. Crée un projet (ou choisis un projet existant).
3. Active deux APIs : **Maps JavaScript API** et **Places API** (menu « APIs & Services » → « Library », cherche chacune et clique sur « Enable »).
4. Crée une clé API : **APIs & Services** → **Credentials** → **Create credentials** → **API key**. Copie la clé.
5. (Recommandé) Restreins la clé : clique sur la clé → **Application restrictions** → **HTTP referrers** → ajoute `https://myfidpass.fr/*` et `http://localhost:*`.
6. Sur **Vercel** : **Settings → Environment Variables** → **Name** = `VITE_GOOGLE_PLACES_API_KEY`, **Value** = la clé copiée. Puis **redéployer** le site.

Après redéploiement, les suggestions d’entreprises s’afficheront quand on tape dans le champ.

### Si tu vois des icônes d’erreur (⚠️) dans le champ quand tu tapes

Ça veut dire que la clé Google est refusée au moment de la recherche. À vérifier :

1. **APIs activées** : dans Google Cloud → API et services → activer **Maps JavaScript API** et **Places API**.
2. **Restriction de la clé** : dans Clés et identifiants → ta clé → « Référents HTTP » avec au moins :
   - `https://myfidpass.fr/*`
   - `http://localhost:*`
3. **Variable Vercel** : le nom doit être exactement **`VITE_GOOGLE_PLACES_API_KEY`** (avec **VITE_** au début). Après l’avoir ajoutée ou modifiée, **redéployer** le site (sinon le build ne voit pas la clé).

Si tu préfères enlever la recherche Google : supprime la variable `VITE_GOOGLE_PLACES_API_KEY` sur Vercel et redéploie. Le champ redeviendra un simple champ texte sans icônes d’erreur.

---

## 3. Checklist rapide

- [ ] Backend déployé (tu as une URL du type `https://api.myfidpass.fr`).
- [ ] Sur Vercel : variable **VITE_API_URL** = cette URL. Puis redéploiement.
- [ ] Test : sur myfidpass.fr, cliquer « Créer ma carte », remplir et créer → pas d’erreur.
- [ ] (Optionnel) Variable **VITE_GOOGLE_PLACES_API_KEY** sur Vercel si tu veux les suggestions d’entreprises.

Si tout ça est coché, tu es bon.
