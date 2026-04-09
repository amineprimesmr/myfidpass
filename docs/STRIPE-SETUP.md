# Configurer Stripe pour Myfidpass

L’**essai gratuit commerçant** (accès complet sans payer) est géré par **l’application** sur **24 h** après inscription (`MERCHANT_TRIAL_HOURS`, défaut 24). Le backend **n’ajoute pas** d’essai Stripe de 7 jours sur la session Checkout : le tarif **1er mois à 1 € puis 49,99 € / mois** se configure sur le **Price Stripe** référencé par `STRIPE_PRICE_ID_STARTER`.

---

## 1. Produit et prix dans Stripe (production)

1. Tableau de bord Stripe → **Produits** → créer ou ouvrir le produit d’abonnement.
2. Créer un **prix récurrent** mensuel qui correspond à l’offre commerciale (intro **1 €** sur le premier cycle puis **49,99 €** / mois, ou équivalent selon votre configuration Stripe).
3. Copier l’**ID du prix** (`price_…`) pour `STRIPE_PRICE_ID_STARTER`.

---

## 2. Clé secrète

**Développeurs** → **Clés API** : utiliser la clé secrète **live** `sk_live_…` en production (Railway).

---

## 3. Webhook

1. **Développeurs** → **Webhooks** → **Ajouter un endpoint**.
2. **URL** : `https://<votre-api>/api/payment/webhook` (ex. votre URL Railway publique).
3. Événement : **`checkout.session.completed`**.
4. Copier le **signing secret** `whsec_…` → variable `STRIPE_WEBHOOK_SECRET`.

---

## 4. Variables d’environnement (Railway)

| Nom | Rôle |
|-----|------|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PRICE_ID_STARTER` | `price_…` (offre 1 € puis 49,99 € / mois) |
| `MERCHANT_TRIAL_HOURS` | Optionnel, ex. `24` (sinon défaut 24 h dans le code) |

---

## 5. Comportement

- **Checkout** : `POST /api/payment/create-checkout-session` crée une session **abonnement** avec ce Price, **sans** `trial_period_days` côté Stripe pour l’essai produit.
- Après paiement : webhook **`checkout.session.completed`** → mise à jour de la table `subscriptions` côté API.

---

## Résumé

1. Price Stripe conforme à l’offre → `STRIPE_PRICE_ID_STARTER`.
2. `sk_live_…` + webhook `whsec_…` sur `/api/payment/webhook`.
3. Redéployer le backend après toute modification des variables.
