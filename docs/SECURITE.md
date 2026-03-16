# Sécurité — Fidpass

## Variables d'environnement obligatoires en production

Sur Railway (backend), définir au minimum :

- **JWT_SECRET** : au moins 32 caractères (ex. `openssl rand -hex 32`) — signature des tokens de connexion. En production, le serveur **refuse de démarrer** si absent.
- **PASSKIT_SECRET** : au moins 32 caractères — token d'authentification des passes Apple Wallet. En production, le serveur **refuse de démarrer** si absent.
- **FRONTEND_URL** : `https://myfidpass.fr` (CORS, redirections).
- **STRIPE_WEBHOOK_SECRET** : secret du webhook Stripe (vérification des événements).
- **RESET_SECRET** : si vous activez la route `/api/dev/reset` (recommandé : la définir uniquement en dev local et ne pas l’exposer en prod sauf besoin explicite).

Voir `backend/.env.example` et `docs/ETAPES-DEPLOIEMENT.md` pour la liste complète.

## Vulnérabilités npm (backend)

`npm audit` dans `backend/` peut remonter des vulnérabilités **haute gravité** liées à :

- **jsonwebtoken** (via la dépendance `apn` utilisée pour les notifications push Apple)
- **node-forge** (également via `apn`)

Ces vulnérabilités concernent la chaîne de dépendances du package **apn** (push APNs). L’impact est limité au flux d’envoi des notifications vers les appareils iOS ; l’auth JWT du site (login/register) utilise le package `jsonwebtoken` en version directe, déjà à jour.

**Actions recommandées :**

1. Exécuter régulièrement `cd backend && npm audit`.
2. Ne pas lancer `npm audit fix --force` sans test : cela peut mettre à jour `apn` en version majeure et casser la compatibilité.
3. Planifier une migration vers une alternative à `apn` (ou une version de `apn` sans ces dépendances vulnérables) si les notifications push sont critiques.

Dernière vérification : mars 2025. Voir [AUDIT-COMPLET-2025.md](./AUDIT-COMPLET-2025.md) pour le contexte.

## Bypass paiement (dev uniquement)

En **production** (`NODE_ENV=production`), le header `X-Dev-Bypass-Payment: 1` et la variable `DEV_BYPASS_PAYMENT=true` sont **ignorés** : on ne peut pas créer de carte sans abonnement actif.

En développement, définir `DEV_BYPASS_PAYMENT=true` dans `backend/.env` et envoyer le header depuis le front (localhost) permet de tester sans Stripe.

## Lien dashboard (token)

Le lien `/dashboard?slug=...&token=...` donne un accès complet au tableau de bord du commerce. Ce lien est **confidentiel** : ne pas le logger, ne pas le partager en clair (ex. par email non chiffré). À terme, des tokens de courte durée ou renouvelables peuvent être envisagés pour un accès « invité ».
