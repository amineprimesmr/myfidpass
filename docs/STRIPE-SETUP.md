# Configurer Stripe pour Myfidpass

L’**essai gratuit commerçant** sur le **compte** (accès complet avant abonnement payant) est géré côté API : **3 j** par défaut (`MERCHANT_TRIAL_DAYS` / `MERCHANT_TRIAL_HOURS`) — aligné avec l’**essai Stripe** sur l’abonnement (`STRIPE_SUBSCRIPTION_TRIAL_DAYS`, défaut **3**).

**Offre cible (site + alignement app) :**

- **Mensuel** : 3 j d’essai Stripe, puis **1,00 €** le 1er mois, puis **49,99 €/mois** (coupon **une fois** sur le 1er prélèvement, voir ci‑dessous).
- **Annuel** : 3 j d’essai Stripe, puis **399,00 €/an**.

Le `/abonnement` (Payment Element) appelle `POST /api/payment/create-embedded-subscription` avec `{ "plan": "monthly" | "annual" }` et les `price_…` ci‑dessous.

---

## 1. Produits et prix (production)

1. **Produits** → abonnement **mensuel** : prix récurrent **49,99 €/mois** → noter `STRIPE_PRICE_ID_MONTHLY` (ou conserver l’existant en `STRIPE_PRICE_ID_STARTER`).
2. Même **produit** ou produit distinct **annuel** : **399,00 €/an** → `STRIPE_PRICE_ID_ANNUAL`.

### 1er mois à 1,00 € (mensuel)

1. **Coupons** : montant fixe **48,99 €** de remise, durée **Une seule fois** — la **première** facture payante (après l’essai) est donc **1,00 €** sur un tarif 49,99 €.
2. Variable Railway : `STRIPE_COUPON_ID_FIRST_MONTH_1_EUR` = **id** du coupon (ex. `jTxxx...`), pas le code client.
3. (Option) Code promotionnel `MYFID1EURO` pour **Payment Link** hébergé (lien en tête de site) — le flux principal est le **Payment Element** sur `/abonnement`.

---

## 2. Clé secrète

**Développeurs** → **Clés API** : `sk_live_…` en production (Railway).

---

## 3. Webhook

**Développeurs** → **Webhooks** → URL `https://<api>/api/payment/webhook`  
Événements utiles : `customer.subscription.*`, `invoice.paid`, `setup_intent.succeeded`, `checkout.session.completed` (selon parcours).

---

## 4. Variables d’environnement (Railway)

| Nom | Rôle |
|-----|------|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PRICE_ID_MONTHLY` ou `STRIPE_PRICE_ID_STARTER` | `price_…` mensuel 49,99 € |
| `STRIPE_PRICE_ID_ANNUAL` | `price_…` annuel 399,00 € |
| `STRIPE_SUBSCRIPTION_TRIAL_DAYS` | `3` (0 = pas d’essai Stripe sur la souscription) |
| `STRIPE_COUPON_ID_FIRST_MONTH_1_EUR` | Id coupon **once** (mensuel uniquement) |
| `MERCHANT_TRIAL_DAYS` | Optionnel — défaut **3** j (essai compte API) |

---

## 5. Comportement

- **`/abonnement`** : choix mensuel / annuel → **Payment Element** ; période d’essai = prélèvement 0 + souvent **SetupIntent** (carte enregistrée pour la fin d’essai) — le front gère `confirm_mode` `setup` vs `payment`.
- **Vercel** : `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` (rebuild obligatoire après changement).

---

## Résumé

1. Deux `price_…` (mensuel + annuel) + coupon **once** pour le 1er mois à 1 €.  
2. `STRIPE_SUBSCRIPTION_TRIAL_DAYS=3` + `STRIPE_COUPON_ID_FIRST_MONTH_1_EUR` + essai compte `MERCHANT_TRIAL_DAYS=3`.  
3. Redéployer le backend / le frontend après modification des variables.
