# Connexion en production (myfidpass.fr)

## Pourquoi ça marche en local mais pas en prod ?

Plusieurs causes possibles :

### 1. **Requêtes API en cross-origin (corrigé)**

En prod, le front pouvait appeler directement `https://api.myfidpass.fr` (autre domaine) → CORS. Désormais sur **myfidpass.fr** le front utilise **`/api`** (URL relative). Vercel renvoie alors ces requêtes vers api.myfidpass.fr (rewrite). Pour le navigateur tout reste sur myfidpass.fr → **pas de CORS**.

Si tu as encore un souci après déploiement, vérifie les points suivants.

### 2. **Backend Railway qui ne démarre pas**

Depuis l’audit, le backend **refuse de démarrer en production** si :
- `JWT_SECRET` est absent ou fait moins de 32 caractères
- `PASSKIT_SECRET` est absent ou fait moins de 32 caractères

**À faire :** Railway → ton projet → service backend → **Variables** → vérifier que **JWT_SECRET** et **PASSKIT_SECRET** sont bien définis (au moins 32 caractères chacun). Puis **Redeploy** si tu viens de les ajouter.

**Vérifier :** Ouvre `https://api.myfidpass.fr/health` dans un navigateur. Si tu as une erreur ou « Impossible d’accéder au site », le backend est down (crash au démarrage ou Railway en panne).

### 3. **CORS (si tu utilisais encore l’URL absolue api.myfidpass.fr)**

Sur Railway, **FRONTEND_URL** doit être **`https://myfidpass.fr`** (sans slash final) pour que le backend accepte les requêtes venant de ce domaine. Avec le proxy Vercel (`/api`), ce n’est plus nécessaire pour la connexion, mais garde FRONTEND_URL pour les redirections (ex. après login Stripe).

### 4. **Rate limiting**

En prod, il y a une limite de **10 tentatives de connexion par 15 minutes** par IP. Si tu dépasses, tu auras « Trop de tentatives. Réessayez dans 15 minutes. » → attendre ou tester depuis une autre connexion.

---

## Résumé

1. **Déployer** la dernière version (front qui utilise `/api` sur myfidpass.fr).
2. Vérifier **Railway** : variables **JWT_SECRET** et **PASSKIT_SECRET** (≥ 32 caractères), et que le service tourne.
3. Tester **https://api.myfidpass.fr/health** pour confirmer que le backend répond.
4. Réessayer la connexion sur **myfidpass.fr**.
