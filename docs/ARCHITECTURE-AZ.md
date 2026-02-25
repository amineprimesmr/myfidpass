# Fidpass — Architecture A→Z et parcours utilisateur

Document de référence pour le parcours complet : compte obligatoire, paiement, puis accès au logiciel et génération de QR.

---

## 1. Principes

- **Compte obligatoire** : impossible de créer une carte / obtenir un QR sans être inscrit et connecté.
- **Paiement obligatoire** : impossible de créer une première carte (et d’obtenir le QR) sans abonnement payé.
- **Parcours linéaire** : Landing → Inscription/Connexion → Choix de l’offre → Paiement → Création de la carte → Accès au tableau de bord et au QR.

---

## 2. Parcours utilisateur (A→Z)

### Étape 1 — Découverte (Landing)
- Page d’accueil myfidpass.fr : valeur proposée, CTA « Créer ma carte » ou « Commencer ».
- **Pas** d’accès direct à la création de carte : le CTA mène vers **Connexion** ou **Inscription**.

### Étape 2 — Inscription ou Connexion
- **/register** : email, mot de passe (≥ 8 caractères), nom (optionnel). → Création du compte, JWT, redirection.
- **/login** : email, mot de passe. → JWT, redirection.
- Après login/register : redirection vers **/app** (espace client) ou vers **/choisir-offre** si l’utilisateur n’a pas encore d’abonnement actif.

### Étape 3 — Choix de l’offre et paiement
- **/choisir-offre** (ou /app si déjà abonné) :
  - Si l’utilisateur n’a **pas** d’abonnement actif : affichage des offres (ex. Mensuel 9€/mois, Annuel 90€/an).
  - CTA « Choisir » → appel API **création session Stripe Checkout** → redirection vers Stripe.
  - Après paiement : Stripe redirige vers **success_url** (ex. /app?payment=success) et envoie un **webhook** pour activer l’abonnement.

### Étape 4 — Création de la carte (builder)
- **/creer-ma-carte** : accessible **uniquement** si connecté **et** abonnement actif.
  - Sinon connecté → redirection **/login?redirect=/creer-ma-carte**.
  - Sinon abonnement actif → redirection **/choisir-offre**.
- Formulaire : nom du commerce, slug, couleurs, logo, etc. → **POST /api/businesses** (avec JWT).
- Après création : affichage du **lien** et du **QR code** + lien vers le tableau de bord.

### Étape 5 — Espace client (/app)
- Liste des cartes (businesses) de l’utilisateur.
- Pour chaque carte : accès au tableau de bord (stats, membres, caisse rapide), **partage du QR**, lien direct.
- Bouton « Créer une nouvelle carte » (sous réserve des limites du plan : ex. 1 carte pour Starter, 5 pour Pro).

---

## 3. Règles d’accès

| Action | Compte requis | Abonnement actif requis |
|--------|----------------|---------------------------|
| Voir la landing | Non | — |
| S’inscrire / Se connecter | — | — |
| Voir /choisir-offre | Oui | Non (c’est la page pour souscrire) |
| Accéder à /app | Oui | Oui (sinon rediriger vers /choisir-offre) |
| Accéder à /creer-ma-carte | Oui | Oui |
| POST /api/businesses | Oui (requireAuth) | Oui (vérif subscription) |
| Voir page fidélité client /fidelity/:slug | Non | — |
| Dashboard par token (lien email) | Token valide OU JWT propriétaire | — |

---

## 4. Modèle de données (ajouts)

### Table `subscriptions`
- `id` (PK), `user_id` (FK → users), `stripe_customer_id` (nullable), `stripe_subscription_id` (nullable).
- `plan_id` : ex. `starter`, `pro`.
- `status` : `active` | `canceled` | `past_due` | `trialing`.
- `current_period_end` (datetime).
- `created_at`, `updated_at`.

### Table `plans` (optionnel, ou en config)
- `id` (ex. starter, pro), `name`, `price_monthly`, `price_yearly`, `stripe_price_id_monthly`, `stripe_price_id_yearly`, `max_businesses`.

### Contrainte côté API
- **POST /api/businesses** : `requireAuth` + vérification que l’utilisateur a une subscription `status === 'active'` (ou `trialing`) et que le nombre de businesses du user &lt; `max_businesses` du plan.

---

## 5. Paiement (Stripe)

- **Checkout Session** : création côté backend (POST /api/payment/create-checkout-session) avec `customer_email`, `line_items` (price_id), `success_url`, `cancel_url`, `metadata.user_id`.
- **Webhook** : `checkout.session.completed` → créer ou mettre à jour `subscriptions` pour le `user_id`, mettre `status = 'active'`, `current_period_end` depuis Stripe.
- Variables d’environnement : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (ou un par plan).

---

## 6. Frontend — Routes et gardes

- **/** : landing.
- **/login**, **/register** : auth (existant).
- **/choisir-offre** : choix du plan + redirection Stripe (nouveau).
- **/app** : si !token → /login?redirect=/app ; si pas d’abonnement actif → /choisir-offre ; sinon liste des cartes + accès dashboard / création.
- **/creer-ma-carte** : si !token → /login?redirect=/creer-ma-carte ; si pas d’abonnement actif → /choisir-offre ; sinon builder (existant).
- **/fidelity/:slug** : inchangé (public).
- **/dashboard** : inchangé (accès par token ou JWT).

---

## 7. Fichiers à créer / modifier (résumé)

| Zone | Fichier | Action |
|------|---------|--------|
| Backend | `db.js` | Ajouter tables `subscriptions`, `plans` (ou config), helpers getSubscriptionByUserId, hasActiveSubscription. |
| Backend | `routes/businesses.js` | POST / : ajouter requireAuth, vérifier hasActiveSubscription(userId), puis createBusiness avec user_id. |
| Backend | `routes/payment.js` | Nouveau : create-checkout-session, webhook Stripe. |
| Backend | `index.js` | Monter paymentRouter, config Stripe. |
| Frontend | `main.js` | Garde /creer-ma-carte (login + subscription), nouvelle route /choisir-offre, garde /app (subscription). |
| Frontend | `index.html` | Bloc HTML pour page « Choisir une offre » (liste des plans, bouton → Stripe). |
| Frontend | Landing | CTA « Créer ma carte » → /login ou /register (pas directement /creer-ma-carte). |

---

## 8. Ordre d’implémentation recommandé

1. **Backend** : requireAuth sur POST /api/businesses + refus si pas connecté (sans encore Stripe).
2. **Frontend** : redirection /creer-ma-carte → /login si pas connecté ; après login retour sur /creer-ma-carte.
3. **Backend** : table subscriptions, hasActiveSubscription ; en prod on peut mettre “subscription obligatoire” en mock (tous les users ont un abonnement actif) ou brancher Stripe.
4. **Backend** : routes Stripe (create-checkout-session, webhook) + vérif hasActiveSubscription avant création business.
5. **Frontend** : page /choisir-offre, garde /app et /creer-ma-carte (redirection si pas d’abonnement).
6. **Landing** : CTA vers login/register au lieu de /creer-ma-carte direct.
7. **UI/UX** : polish du parcours (messages, loading, erreurs).

Ce document sert de référence pour toute évolution du produit (multi-entreprises, essai gratuit, etc.).

---

## 9. État actuel (implémenté)

- **Compte obligatoire** : POST /api/businesses exige un JWT (requireAuth). /creer-ma-carte redirige vers /login si non connecté.
- **Abonnement** : table `subscriptions`, `hasActiveSubscription`, `canCreateBusiness`. À l’inscription (et au premier /me ou login si absent), un abonnement **Starter** actif est créé automatiquement pour chaque utilisateur. Aucun paiement Stripe n’est encore demandé.
- **Landing** : les CTA « Créer ma carte » / « Obtenir ma carte » mènent vers **/login** (avec `redirect=/creer-ma-carte`), plus vers /creer-ma-carte en direct.
- **Page /choisir-offre** : accessible après connexion. Si l’utilisateur a déjà un abonnement actif, redirection vers /app. Sinon affichage des offres (Starter, Pro « bientôt »). Le bouton « Accéder à mon espace » mène vers /app.
- **Prochaine étape** : brancher Stripe (création de session Checkout, webhook `checkout.session.completed`) et ne plus créer d’abonnement automatique à l’inscription ; rediriger les utilisateurs sans abonnement vers /choisir-offre puis vers le paiement Stripe.
