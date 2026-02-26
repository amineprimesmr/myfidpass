# État du projet Fidpass

Bilan de ce qui est **prêt à 100 %** pour un lancement, et pistes d’**amélioration / optimisation** pour plus tard.

---

## ✅ Prêt à 100 % pour le lancement

| Domaine | Détail |
|--------|--------|
| **Carte client** | Apple Wallet (.pkpass) + Google Wallet (lien JWT) ; même code-barres PDF_417 (ID membre) pour les deux. |
| **Page fidélité** | Formulaire nom/email → création membre → choix « Apple Wallet » ou « Google Wallet ». |
| **Scanner caisse** | Caméra, détection PDF_417, états vérification / succès / rejet, fiche client (nom, points, dernière visite, historique), ajout de points (1 passage ou montant €). |
| **Espace commerçant (/app)** | Vue d’ensemble, partage lien/QR, caisse rapide (recherche + points), liste membres, historique, déconnexion. |
| **Auth** | Inscription, connexion, JWT, protection routes /app et /choisir-offre. |
| **API** | Businesses, members, dashboard (stats, members, transactions), pass Apple, URL Google Wallet, points. |
| **Déploiement** | Vercel (front) + Railway (back), script `npm run deploy`, docs DEPLOIEMENT + ETAPES-DEPLOIEMENT. |
| **Docs** | Apple Wallet, Google Wallet, production, déploiement, roadmap restaurateur. |

Tu peux **lancer en prod** avec ça : les clients (iOS et Android) ont une carte, le commerçant peut scanner et ajouter des points, tout le flux est cohérent.

---

## 🔶 Améliorations possibles (non bloquantes)

### Sécurité / robustesse

- **Rate limiting** : limiter le nombre de requêtes par IP sur `/api/auth/login`, `/api/auth/register` et `POST .../members` pour limiter les abus (bruteforce, création de comptes en masse). *Librairie : `express-rate-limit`.*
- **Helmet** : ajouter des en-têtes HTTP de sécurité (X-Content-Type-Options, etc.) sur le backend. *Librairie : `helmet`.*
- **Limite body** : déjà prévu ci‑dessous (express.json avec `limit`) pour éviter les body trop gros.

### UX / accessibilité

- **Scanner** : ajouter des `aria-live` / `aria-label` pour les états « Vérification… », « Client reconnu », « Code non reconnu » (lecteurs d’écran).
- **Focus** : après ouverture du panneau « Client reconnu », placer le focus sur le bouton « 1 passage » ou « Scanner un autre » pour la navigation clavier.

### Produit (roadmap)

- **Mise à jour carte après points** : PassKit Web Service pour mettre à jour le pass Apple (et éventuellement Google) après ajout de points, sans que le client recharge la carte.
- **Règles récompenses** : ex. « 10 points = 1 café offert », avec déduction des points à la validation.
- **Notifications** : email au client après un passage (« Vous avez gagné X points »).

### Technique

- **Tests** : pas de tests automatisés aujourd’hui ; à prévoir pour les routes critiques (auth, création membre, ajout de points) si le projet grossit.
- **404 / erreurs** : en SPA, une URL inconnue renvoie `index.html` ; le JS pourrait afficher une page « Page introuvable » au lieu de la landing.

---

## Résumé

- **Lancement** : oui, tout est prêt.
- **Améliorations** : sécurité (rate limit, helmet, limite body), accessibilité scanner, puis évolution produit (mise à jour pass, récompenses, notifications) selon la roadmap.
