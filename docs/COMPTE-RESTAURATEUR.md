# Compte restaurateur — Inscription, connexion, espace

## Vue d’ensemble

Les restaurateurs peuvent **créer un compte**, **se connecter** et accéder à un **espace personnel** (`/app`) où ils voient le tableau de bord de leur (ou leurs) commerce(s), sans avoir à utiliser le lien secret du dashboard.

## Flux

1. **Inscription** : `/register` — email + mot de passe (8 caractères min.) + nom optionnel. Création du compte et connexion automatique.
2. **Connexion** : `/login` — email + mot de passe. Redirection vers `/app` (ou vers `?redirect=` si fourni).
3. **Espace** : `/app` — protégé ; si pas de token, redirection vers `/login`. Affiche le premier commerce du compte avec le même dashboard (stats, caisse rapide, membres, opérations).
4. **Création de carte** : si le restaurateur est connecté quand il crée une carte via `/creer-ma-carte`, le commerce est **lié à son compte** (`user_id`). Il apparaît alors dans `/app`.

## API

- **POST /api/auth/register** — Body : `{ email, password, name? }`. Réponse : `{ user, token, businesses }`.
- **POST /api/auth/login** — Body : `{ email, password }`. Réponse : `{ user, token, businesses }`.
- **GET /api/auth/me** — Header : `Authorization: Bearer <token>`. Réponse : `{ user, businesses }`.
- **GET /api/auth/me/businesses** — Même auth. Réponse : `{ businesses }`.

Le **dashboard** (stats, members, transactions) et l’**ajout de points** acceptent soit le **token dashboard** (query `?token=` ou header `X-Dashboard-Token`), soit un **JWT** : si l’utilisateur connecté est propriétaire du commerce (`business.user_id === user.id`), l’accès est autorisé.

## Technique

- **Backend** : table `users` (id, email, password_hash, name, created_at). Table `businesses` : colonne `user_id` (optionnelle). Middleware `optionalAuth` parse le JWT sur toutes les requêtes ; `requireAuth` impose un utilisateur connecté.
- **Frontend** : token JWT stocké dans `localStorage` (clé `fidpass_token`). Les appels API depuis `/app` envoient `Authorization: Bearer <token>`.
- **Production** : définir **JWT_SECRET** (chaîne aléatoire forte) sur le backend. En dev, une valeur par défaut est utilisée.

## Liens

- Landing : lien **Connexion** dans la nav vers `/login`.
- Après création de carte (connecté) : bouton **Accéder à mon espace** vers `/app`.
- Header `/app` : **Créer une carte**, email utilisateur, **Déconnexion**.
