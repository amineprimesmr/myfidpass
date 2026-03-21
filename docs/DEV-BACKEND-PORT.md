# Pourquoi le dashboard local affiche « connexion impossible » / `/api/health` → `Not found`

## Ce qui se passait (cause racine)

1. **Sur ton Mac**, un **premier** processus Node (le backend Fidpass) écoutait déjà sur le port **3001** (souvent une session ouverte la veille, ou un terminal oublié).

2. Tu lançais **un second** backend. Avant la correction, le code faisait : *port 3001 pris → démarrer sur 3002* **sans message visible**.

3. Le **frontend Vite** (localhost:5177 ou 5174) envoie toutes les requêtes `/api/...` vers **`http://localhost:3001`** par défaut (`VITE_PROXY_TARGET`).

4. Résultat : le navigateur parlait toujours au **vieux** processus sur **3001** (code sans `GET /api/health`, ou état incohérent), d’où **`{"error":"Not found"}`** et l’échec de `/api/auth/me`. Ce n’était **pas** un bug « mystérieux » du SaaS : c’était **deux serveurs**, **un seul port utilisé par le proxy**.

## Ce qu’on a mis en place

- Le backend **ne change plus** de port en silence si 3001 est pris : il **quitte** avec un message explicite.
- **`npm run backend`** et **`npm start`** exécutent **`scripts/free-backend-port.mjs`** : avant de démarrer, **SIGTERM** sur ce qui écoute sur 3001 (libère le fantôme).
- Commande manuelle : **`npm run backend:free-port`**.

## Est-ce que ça arrivera « en production » (myfidpass.fr) ?

**Non, pas pour cette raison précise.**

- En **production**, Railway expose **une** instance (ou un pool géré par la plateforme) sur **le port fourni par Railway**. Il n’y a pas de « Vite qui proxy vers localhost:3001 » : le front (Vercel) appelle **`api.myfidpass.fr`** (ou `/api` réécrit vers cette URL).
- Le scénario « vieux Node sur 3001 + nouveau sur 3002 » est **spécifique au développement local**.

En revanche, **pendant quelques secondes** lors d’un **déploiement** Railway/Vercel, l’API ou le front peuvent être **momentanément indisponibles** : c’est normal sur tout SaaS ; un rafraîchissement après la fin du deploy suffit en général.

## Vérification rapide en local

```bash
curl -s http://127.0.0.1:3001/api/health
```

Attendu : `{"ok":true,"service":"fidelity-api"}`.
