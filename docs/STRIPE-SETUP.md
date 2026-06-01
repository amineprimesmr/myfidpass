# Configurer Stripe pour Myfidpass

L’**essai gratuit commerçant** sur le **compte** (accès complet avant abonnement payant) est géré côté API : **3 j** par défaut (`MERCHANT_TRIAL_DAYS` / `MERCHANT_TRIAL_HOURS`) — aligné avec l’**essai Stripe** sur l’abonnement (`STRIPE_SUBSCRIPTION_TRIAL_DAYS`, défaut **3**).

**Offre cible (site + alignement app) :**

- **Mensuel** : 3 j d’essai Stripe, puis **1,00 €** le 1er mois, puis **49,99 €/mois** (coupon **une fois** sur le 1er prélèvement, voir ci‑dessous).
- **Annuel (recommandé)** : essai Stripe **plus long** (`STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL`, ex. **30** j ≈ 1er mois sans prélèvement), puis **399,00 €/an** à la **première** facturation puis aux renouvellements — **sans** réduire toute la première année à 1 €.
- **Annuel (alternatif rare)** : pas d’essai (`STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL=0`) + coupon **once** **398 €** → première **facture annuelle** à **1 €** (toute la 1ʳᵉ année à 1 €, pas « seulement le 1er mois »).

Le `/abonnement` (Payment Element) appelle `POST /api/payment/create-embedded-subscription` avec `{ "plan": "monthly" | "annual" }` et les `price_…` ci‑dessous.

---

## 1. Produits et prix (production)

1. **Produits** → abonnement **mensuel** : prix récurrent **49,99 €/mois** → noter `STRIPE_PRICE_ID_MONTHLY` (ou conserver l’existant en `STRIPE_PRICE_ID_STARTER`).
2. Même **produit** ou produit distinct **annuel** : **399,00 €/an** → `STRIPE_PRICE_ID_ANNUAL` (ex. `price_1TUPHO…`).

Sur la fiche **prix** Stripe, tu peux laisser **« Jours d’essai » vide** : l’essai gratuit est posé par l’API (`STRIPE_SUBSCRIPTION_TRIAL_DAYS`), pas par le prix catalogue.

### 1er prélèvement à 1,00 € (mensuel)

1. **Coupons** : montant fixe **48,99 €** de remise, durée **Une seule fois** — la **première** facture payante (après l’essai) est **1,00 €** sur **49,99 €**.
2. Railway : `STRIPE_COUPON_ID_FIRST_MONTH_1_EUR` = **id** du coupon (`jTX…` / `XXXX`), pas le code client affiché au payeur.

### Essai « premier mois » sur l’annuel (sans coupon)

1. Garde `STRIPE_PRICE_ID_ANNUAL` sur ton prix **399,00 €/an**.
2. Mensuel : `STRIPE_SUBSCRIPTION_TRIAL_DAYS=3` (inchangé).
3. Annuel : **`STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL=30`** (ou **31**) — pendant cet essai, **aucun prélèvement** du montant annuel ; à la fin, Stripe facture **399 €** pour la période annuelle suivante.
4. **Ne définis pas** `STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR` dans ce scénario (sinon tu retombes sur une 1ʳᵉ facture à 1 € pour **toute** la période annuelle).

### Alternative : 1 € sur la première facture annuelle entière (coupon)

À n’utiliser que si tu acceptes que la **première année** soit facturée **1 € au total** (ce n’est pas « 1 € le premier mois puis 399 € »).

1. Coupon séparé du mensuel : remise fixe **398,00 €**, durée **Une seule fois**.
2. Railway : `STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR` = id du coupon **et** **`STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL=0`** (sinon le coupon annuel est ignoré par l’API tant qu’un essai > 0 est configuré).
3. Si le prix annuel ≠ **399,00 €**, remise = `tarif − 1 €`.

(Option) Code promo `MYFID1EURO` pour **Payment Link** hébergé — le flux principal est le **Payment Element** sur `/paiement` / `/abonnement`.

### Code promo « 1er mois à 0 € » (`FREEDAF352`)

Coupon Stripe : remise fixe **49,99 €**, durée **Une seule fois** → première facture mensuelle à **0 €**.

Création automatisée (clé `sk_live_…` sur Railway ou en local) :

```bash
cd backend
STRIPE_SECRET_KEY=sk_live_… node scripts/create-stripe-promo-first-month-free.mjs --code FREEDAF352
```

Ou via Railway : `railway run --service fidpass-api node backend/scripts/create-stripe-promo-first-month-free.mjs --code FREEDAF352`

Utilisation au checkout Payment Link mensuel :

`https://buy.stripe.com/7sYcN53Z72N88et4Cr8Zq01?prefilled_promo_code=FREEDAF352`

### Après paiement (Payment Link)

Redirection Stripe → **`https://myfidpass.fr/merci?session_id={CHECKOUT_SESSION_ID}`** (configuré sur les Payment Links mensuel + annuel).

La page `/merci` :
1. Confirme le paiement (`GET /api/payment/checkout-success`)
2. Propose l’e-mail de connexion (prérempli depuis Stripe, modifiable)
3. Envoie un OTP (`POST /api/payment/claim/send-code`)
4. Rattache l’abonnement au compte et connecte (`POST /api/payment/claim/verify`)
5. Envoie un e-mail de bienvenue avec liens `/app` et `/get`

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
| `STRIPE_SUBSCRIPTION_TRIAL_DAYS` | Essai **mensuel** (défaut `3`). `0` = pas d’essai |
| `STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL` | Optionnel — essai **annuel** ; si vide = même valeur que la ligne du dessus. Ex. `30` |
| `STRIPE_COUPON_ID_FIRST_MONTH_1_EUR` | Id coupon **once** — 1 € sur **première** facture mensuelle |
| `STRIPE_COUPON_ID_ANNUAL_FIRST_1_EUR` | Optionnel — uniquement si **pas** d’essai annuel (`…_ANNUAL=0`) : 1 € sur la **1ʳᵉ facture annuelle** |
| `MERCHANT_TRIAL_DAYS` | Optionnel — défaut **3** j (essai compte API) |

---

## 5. Comportement

- **`/abonnement`** : choix mensuel / annuel → **Payment Element** ; période d’essai = prélèvement 0 + souvent **SetupIntent** (carte enregistrée pour la fin d’essai) — le front gère `confirm_mode` `setup` vs `payment`.
- **Vercel** : `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` (rebuild obligatoire après changement).

---

## Résumé

1. Deux `price_…` (mensuel + annuel) ; coupon mensuel **48,99 €** once pour le **1 €** post-essai court.  
2. Annuel type « 1er mois gratuit » : **`STRIPE_SUBSCRIPTION_TRIAL_DAYS_ANNUAL=30`** sans coupon annuel (ou coupon annuel seulement si essai annuel = **0**).  
3. `STRIPE_SUBSCRIPTION_TRIAL_DAYS` + essai compte `MERCHANT_TRIAL_DAYS=3`.  
4. Redéployer le backend / le frontend après modification des variables.
