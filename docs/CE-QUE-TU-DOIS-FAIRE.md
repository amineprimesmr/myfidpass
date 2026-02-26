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

### Si tu vois des icônes d’erreur (⚠️) ou que les suggestions ne s’affichent pas

La clé Google est refusée au moment de la recherche. À vérifier **dans l’ordre** :

1. **Redéploiement Vercel**  
   Après avoir ajouté ou modifié `VITE_GOOGLE_PLACES_API_KEY`, va dans **Deployments** → **…** sur le dernier déploiement → **Redeploy**. Sans ça, le build n’a pas la clé.

2. **APIs activées** (Google Cloud → API et services)  
   Activer **Maps JavaScript API** et **Places API**. À côté de chaque API tu dois voir le bouton « Désactiver » (donc elles sont bien activées).

3. **Restriction « Référents HTTP »** (Clés et identifiants → ta clé)  
   Dans « Restriction des applications » → **Sites Web** → **URL de provenance**, ajouter exactement :
   - `https://myfidpass.fr/*`
   - `http://localhost:*`  
   Pas d’espace, pas de slash à la fin de l’URL.

4. **Restriction « Limiter la clé » / APIs autorisées** (même écran de la clé)  
   Si ta clé est limitée à certaines APIs (« 32 API » ou liste), il faut que **Maps JavaScript API** et **Places API** soient **dans la liste**. Sinon Google refuse les requêtes. Pour tester, tu peux mettre **« Ne pas restreindre la clé »** ; une fois que ça marche, tu pourras resserrer la liste.

Pour déboguer : ouvre la console du navigateur (F12 → Console) sur myfidpass.fr. Si tu vois un message `[Fidpass] Google Places: ...`, il indique si le script ne charge pas ou si la clé est refusée.

**Facturation Google Cloud :** les APIs Maps/Places exigent qu’un **compte de facturation** soit lié au projet (même pour utiliser le quota gratuit). Sans ça, les requêtes échouent. Dans la console Google Cloud : **Facturation** → associer un compte de facturation au projet « myfidpass ». Tu ne seras pas débité tant que tu restes dans le quota gratuit.

**Désactiver la recherche Google (plus d’icônes d’erreur) :** sur Vercel, ajoute la variable **`VITE_GOOGLE_PLACES_ENABLED`** = **`false`**, puis redéploie. Le champ redevient un simple champ texte, sans autocomplete et sans icônes. Tu peux garder ta clé ; pour réactiver plus tard, supprime cette variable ou mets `true` et redéploie.

---

## 3. Checklist rapide

- [ ] Backend déployé (tu as une URL du type `https://api.myfidpass.fr`).
- [ ] Sur Vercel : variable **VITE_API_URL** = cette URL. Puis redéploiement.
- [ ] Test : sur myfidpass.fr, cliquer « Créer ma carte », remplir et créer → pas d’erreur.
- [ ] (Optionnel) Variable **VITE_GOOGLE_PLACES_API_KEY** sur Vercel si tu veux les suggestions d’entreprises.

Si tout ça est coché, tu es bon.
