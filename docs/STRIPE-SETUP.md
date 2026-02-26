# Configurer Stripe pour Fidpass

Une fois ton compte Stripe créé, suis ces étapes pour que les utilisateurs puissent payer l’abonnement (49 €/mois, 7 jours gratuits) depuis la page « Choisir une offre ».

---

## 1. Créer un produit et un prix dans Stripe

1. Dans le **tableau de bord Stripe**, va dans **Produits** (ou **Catalogue de produits** / **Products**).
2. Clique sur **+ Ajouter un produit** (ou **Add product**).
3. Renseigne :
   - **Nom** : `Fidpass`
   - **Description** (optionnel) : `Carte de fidélité Apple Wallet & Google Wallet, accès logiciel. Sans engagement.`
4. Dans la section **Prix** :
   - **Prix** : `49,00 €`
   - **Période** : **Mensuel** (recurring / tous les mois).
   - Clique sur **Enregistrer**.
5. Une fois le produit créé, ouvre le **prix** (Price) que tu viens de créer.
6. **Copie l’ID du prix** : il ressemble à `price_1xxxxxxxxxxxx` (ou `price_xxxxxxxxxxxx`). Tu en auras besoin pour le backend.

Le backend applique automatiquement **7 jours d'essai gratuit** (configuré dans le code). Tu peux rester en **Mode test** pour tester sans vrais paiements.

---

## 2. Récupérer la clé secrète Stripe

1. Dans Stripe, va dans **Développeurs** → **Clés API** (ou **Developers** → **API keys**).
2. Repère la **Clé secrète** (Secret key), qui commence par `sk_test_...` en mode test (ou `sk_live_...` en production).
3. **Copie cette clé** : tu la mettras dans les variables d’environnement du backend (Railway).

---

## 3. Configurer le webhook Stripe (pour activer l’abonnement après paiement)

Le webhook permet au backend de savoir quand un paiement a réussi et d’activer l’abonnement du compte.

1. Dans Stripe : **Développeurs** → **Webhooks** → **Ajouter un endpoint** (Add endpoint).
2. **URL de l’endpoint** :  
   `https://api.myfidpass.fr/api/payment/webhook`  
   (remplace par l’URL réelle de ton backend si différente).
3. **Événements à écouter** : sélectionne **checkout.session.completed**.
4. Clique sur **Ajouter un endpoint**.
5. Sur la fiche du webhook, ouvre **Révéler** (ou **Reveal**) à côté de **Signing secret**.
6. **Copie le secret** (il commence par `whsec_...`) : tu le mettras dans les variables d’environnement du backend.

---

## 4. Variables d’environnement sur le backend (Railway)

Dans ton projet Railway (backend Fidpass), ajoute ces variables :

| Nom | Valeur | Obligatoire |
|-----|--------|-------------|
| `STRIPE_SECRET_KEY` | Ta clé secrète Stripe (`sk_test_...` ou `sk_live_...`) | Oui pour le paiement |
| `STRIPE_WEBHOOK_SECRET` | Le signing secret du webhook (`whsec_...`) | Oui pour activer l’abonnement après paiement |
| `STRIPE_PRICE_ID_STARTER` | L’ID du prix mensuel (ex. `price_1xxxxxxxxxxxx`) | Oui pour le paiement |

Sans ces variables, le bouton « Choisir l’offre Starter » redirigera vers l’espace sans passer par Stripe (comportement de secours).

---

## 5. Comportement côté site

- **Page « Choisir une offre »** : le frontend appelle le backend pour créer une **session Stripe Checkout**. L’utilisateur est redirigé vers Stripe pour payer.
- **Après paiement** : Stripe envoie un événement **checkout.session.completed** à ton webhook. Le backend met à jour la table `subscriptions` (ou crée l’abonnement) avec `status = 'active'` et redirige l’utilisateur vers `/app`.

---

## 6. Tester en mode test

- Utilise les **cartes de test Stripe** (ex. `4242 4242 4242 4242`).
- Garde le **Mode test** activé dans Stripe tant que tu n’es pas prêt à encaisser de vrais paiements.
- En production, crée un **prix en mode live** et utilise la clé `sk_live_...` et un webhook en **live** avec l’URL de prod.

---

## Résumé

1. Créer le produit **Fidpass** et le prix **49 €/mois** → copier l’**ID du prix**.
2. Copier la **clé secrète** (Developers → API keys).
3. Créer un **webhook** vers `https://api.myfidpass.fr/api/payment/webhook`, événement **checkout.session.completed** → copier le **signing secret**.
4. Mettre **STRIPE_SECRET_KEY**, **STRIPE_WEBHOOK_SECRET** et **STRIPE_PRICE_ID_STARTER** dans Railway.
5. Redéployer le backend.

Ensuite, quand un utilisateur clique sur l’offre Starter, il sera redirigé vers Stripe pour payer, et après paiement son abonnement sera actif dans Fidpass.
