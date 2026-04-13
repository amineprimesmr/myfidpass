# Configurer Stripe pour Myfidpass

L’**essai gratuit commerçant** (accès complet sans payer) est géré par **l’application** sur **24 h** après inscription (`MERCHANT_TRIAL_HOURS`, défaut 24). Le tarif **« 1er mois à 1 € puis 49,99 € / mois »** côté Stripe ne tient en général **pas** dans un seul `Price` récurrent : un prix mensuel est **un seul montant par cycle**. Pour obtenir 1 € puis 49,99 €, utilisez l’une des options ci‑dessous.

---

## 1. Produit et prix dans Stripe (production)

1. Tableau de bord Stripe → **Produits** → créer ou ouvrir le produit d’abonnement.
2. Créer un **prix récurrent** mensuel à **49,99 €** (montant « normal » après l’offre de lancement).
3. Copier l’**ID du prix** (`price_…`) pour `STRIPE_PRICE_ID_STARTER` (checkout API / Payment Element).

### 1 bis. « 1 € le premier mois » avec un **Payment Link** (`buy.stripe.com`)

1. Garde le **Price** à **49,99 € / mois** sur le lien (comme aujourd’hui sur ta capture).
2. **Produits** → **Coupons** → **Nouveau coupon** :
   - **Montant fixe** : **48,99 €** de réduction (si le prix est **49,99 €**, la première facture devient **1,00 €**).
   - **Durée** : **Une seule fois** (`once`) — la réduction ne s’applique qu’à la **première** facture, les mois suivants sont à 49,99 €.
3. Depuis ce coupon, crée un **code promotionnel** (ex. `MYFID1EURO`) utilisable en caisse.
4. Dans l’URL du Payment Link, Stripe autorise le paramètre **`prefilled_promo_code`** (voir doc *Payment Links* → promotions).
5. Sur **Vercel**, pour tester la redirection depuis `/abonnement` :
   - `VITE_STRIPE_SUBSCRIPTION_PAYMENT_LINK=https://buy.stripe.com/ton_lien`
   - `VITE_STRIPE_SUBSCRIPTION_PREFILLED_PROMO=MYFID1EURO` (le code **client**, pas l’id interne).
6. **Redeploy** le frontend après avoir ajouté ces variables.

**Limite :** le Payment Link ne passe pas `metadata.user_id` comme `create-checkout-session`. Le rattachement compte Myfidpass repose surtout sur **l’email** payeur (webhook / reconcile) — l’utilisateur doit payer avec le **même email** que son compte, ou utiliser le flux API intégré.

**Alternative API (sans coupon) :** *Subscription schedules* (phases :1 mois à 1 € puis 49,99 €) — configuration plus avancée, hors Payment Link statique.

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

- **Paiement intégré** (`/abonnement` par défaut) : `POST /api/payment/create-embedded-subscription` + Payment Element.
- **Redirection Payment Link** (test) : si `VITE_STRIPE_SUBSCRIPTION_PAYMENT_LINK` est défini, `/abonnement` envoie vers ce lien (email + code promo optionnels).
- **Checkout API** : `POST /api/payment/create-checkout-session` crée une session **abonnement** avec `metadata.user_id`.
- Après paiement : webhooks (**`checkout.session.completed`**, **`invoice.paid`**, abonnements…) → mise à jour de la table `subscriptions`.

---

## Résumé

1. Price Stripe conforme à l’offre → `STRIPE_PRICE_ID_STARTER`.
2. `sk_live_…` + webhook `whsec_…` sur `/api/payment/webhook`.
3. Redéployer le backend après toute modification des variables.
