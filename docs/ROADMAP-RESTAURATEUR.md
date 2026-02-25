# Fidpass — Roadmap « Restaurateur »

Comment rendre Fidpass **beaucoup plus intéressant** pour le restaurateur : ce que font les concurrents, ce qu’on peut imaginer, et un plan concret par phases.

---

## Ce qu’on a aujourd’hui

- Carte fidélité **Apple Wallet** (points + niveau + code-barres).
- **Multi-entreprises** : un lien par commerce (`/fidelity/:slug`).
- **Créateur de carte** : personnalisation couleurs / logo / texte.
- API : créer un membre, **ajouter des points** (POST `.../members/:id/points`).
- **Pas d’interface** pour le restaurateur : il ne peut pas voir ses clients ni ajouter des points facilement.
- **Pas d’historique** des passages ni de remises automatiques.

---

## Ce que font les concurrents (benchmark)

| Fonctionnalité | Exemples (Stamp Me, SumUp Loyalty, LoyaltyLion, Kangaroo, etc.) |
|----------------|----------------------------------------------------------------|
| **Tableau de bord** | Nombre de membres, points distribués, graphiques, liste des clients. |
| **Ajout de points / tampons** | À la caisse : scan du code client ou saisie ID, montant ou « 1 passage » → points ajoutés. |
| **Règles de points** | « 1 point par 1 € dépensé », « 1 tampon par café », personnalisables. |
| **Récompenses (remises)** | « 10 points = 1 café offert », « 5 tampons = 1 croissant ». Déduction des points à l’utilisation. |
| **Historique** | Liste des transactions (qui a eu des points, quand, combien) et des remises utilisées. |
| **Notifications** | Email / SMS au client : « Vous avez gagné X points », « Vous avez une récompense à réclamer ». |
| **Mise à jour de la carte** | Carte digitale mise à jour après chaque achat (points à jour dans l’app ou sur la carte). |
| **Promos / automatisation** | « Double points ce week-end », « Anniversaire : points offerts ». |
| **Multi-établissements** | Même programme sur plusieurs adresses (franchise). |
| **Intégration caisse / POS** | Lien avec le logiciel de caisse pour ajout auto des points. |

**Atout Fidpass** : carte **dans Apple Wallet** (pas d’app à télécharger pour le client). On garde ça et on ajoute tout le reste côté **restaurateur** et **règles / données**.

---

## Vision « parfait pour le restaurateur »

1. **Un tableau de bord simple** : connexion → vue d’ensemble (membres, points donnés ce mois, remises utilisées) + liste des membres avec recherche.
2. **Caisse rapide** : scan du code-barres de la carte (ou saisie nom/email) → saisie du montant ou « 1 passage » → points ajoutés selon les règles (ex. 1 pt / 1 €).
3. **Règles configurables** : points par euro, ou 1 tampon par passage ; seuils de récompense (ex. 10 pts = 1 café offert).
4. **Remises** : quand un client a assez de points, le restaurateur « valide une remise » → points déduits, historique enregistré.
5. **Historique complet** : chaque attribution de points et chaque remise = une ligne (qui, quand, combien). Export possible.
6. **Notifications (optionnel)** : email au client après un passage (« Vous avez X points ») ou quand une récompense est disponible.
7. **Carte à jour** : la carte dans Apple Wallet se met à jour après ajout de points ou remise (PassKit Web Service).
8. **Promos** : « Double points ce week-end » (règle temporaire) ou message sur la page carte.

---

## Plan concret par phases

### Phase 1 — Dashboard + historique + caisse rapide (priorité haute)

**Objectif** : le restaurateur peut se connecter, voir ses membres, ajouter des points facilement, et avoir un historique.

- **Base de données**
  - Table **`transactions`** : `id`, `business_id`, `member_id`, `type` (`points_add` | `reward_use`), `points` (positif ou négatif), `metadata` (JSON, ex. `{ "amount_eur": 15 }`), `created_at`.
  - Table **`business_users`** (optionnel Phase 1) : pour plus tard, login du restaurateur. En Phase 1 on peut protéger le dashboard par un **lien secret** par business (ex. `/dashboard/:slug?token=xxx`).
- **API**
  - `GET /api/businesses/:slug/dashboard/stats` → nb membres, points distribués ce mois, nb remises ce mois (requiert token ou auth plus tard).
  - `GET /api/businesses/:slug/members` → liste des membres (nom, email, points, dernière transaction) avec pagination/recherche.
  - `GET /api/businesses/:slug/transactions` → historique des transactions (filtres : date, membre).
  - `POST /api/businesses/:slug/members/:memberId/points` existe déjà ; l’étendre pour enregistrer une **transaction** à chaque ajout.
- **Frontend**
  - **Dashboard restaurateur** : page `/dashboard` (ou `/dashboard/:slug`) avec lien secret en query. Blocs : stats, liste des membres (recherche), bouton « Ajouter des points » (ouvre un formulaire ou modal : membre + points ou montant € → conversion en points selon règle). Historique des dernières transactions.
  - **Caisse rapide** : même page ou sous-page « Caisse » : champ « Code membre ou email » + « Montant (€) » ou « 1 passage » → calcul des points (règle : 1 pt / 1 € ou 1 pt / passage) → envoi API + enregistrement transaction.

**Règles de points (Phase 1)**  
- Ajouter sur **business** : `points_per_euro` (ex. 1), `points_per_visit` (ex. 1), ou mode « tampons » uniquement (1 passage = 1 tampon).  
- Calcul côté backend : si le restaurateur envoie `amount_eur: 15` et `points_per_euro: 1` → 15 points.

---

### Phase 2 — Récompenses + remises

**Objectif** : définir des récompenses (ex. 10 pts = 1 café) et enregistrer quand un client en bénéficie (déduction des points).

- **Base de données**
  - Table **`rewards`** : `id`, `business_id`, `name` (ex. « Café offert »), `points_required`, `created_at`.
  - Table **`redemptions`** : `id`, `business_id`, `member_id`, `reward_id`, `points_used`, `created_at`.
  - Lors d’une remise : insérer dans `redemptions`, mettre à jour `members.points` (soustraire), insérer une transaction `type: reward_use`, `points: -X`.
- **API**
  - `GET/POST /api/businesses/:slug/rewards` → liste et création des récompenses.
  - `POST /api/businesses/:slug/members/:memberId/redeem` → body `{ rewardId }` → vérifier que le membre a assez de points, déduire, créer redemption + transaction.
- **Dashboard**
  - Section « Récompenses » : créer / éditer (nom, points requis). Liste des remises utilisées (qui, quand, quelle récompense).
  - Depuis la fiche membre ou la caisse : bouton « Utiliser une récompense » → choix de la récompense → envoi redeem.

---

### Phase 3 — Notifications (email)

**Objectif** : envoyer un email au client après un passage ou quand une récompense est disponible.

- **Techno** : SendGrid, Resend, Mailgun, ou SMTP.
- **Contenu** : « Vous avez gagné X points chez [Commerce]. Total : Y points. » Ou « Vous pouvez réclamer un café offert ! »
- **API** : après `POST .../points` ou `POST .../redeem`, appel à un service d’envoi d’email (queue ou synchrone).
- **Config** : dans le dashboard, option « Activer les emails » (et email d’expéditeur / template plus tard).

---

### Phase 4 — Mise à jour de la carte Apple Wallet (PassKit Web Service)

**Objectif** : quand les points changent (ajout ou remise), la carte dans le Wallet du client se met à jour automatiquement.

- **Apple exige** : un **PassKit Web Service** (endpoints en HTTPS) pour enregistrer les appareils qui ont installé le pass et envoyer des push notifications pour « mettre à jour le pass ».
- **Backend** :
  - Table **`pass_registrations`** : `id`, `member_id`, `device_library_identifier`, `push_token`, `created_at`.
  - Endpoints (documentés par Apple) : `POST /v1/devices/:deviceId/registrations/:passTypeId/:serialNumber`, `GET /v1/passes/:passTypeId/:serialNumber`, `DELETE /v1/devices/.../registrations/...`, et endpoint pour recevoir les logs.
  - Quand on appelle `addPoints` ou redeem : après mise à jour du membre, appeler l’API Apple Push pour notifier les appareils enregistrés ; le device redemande alors le pass à jour via `GET /v1/passes/...`.
- **Pass** : le `.pkpass` doit contenir l’URL du web service (et le certificat doit matcher). Déjà partiellement préparé si on a un backend HTTPS.

---

### Phase 5 — Promos, anniversaires, multi-établissements

- **Promos** : table **`promotions`** (business_id, name, type: `double_points` | `bonus_points`, start_at, end_at). Lors de l’ajout de points, si une promo est active, appliquer le multiplicateur ou le bonus.
- **Anniversaire** : champ `birthday` sur `members` (optionnel), cron ou job qui donne X points au membre à la date d’anniversaire (ou envoie un email « Bon anniversaire, X points offerts »).
- **Multi-établissements** : une même « marque » avec plusieurs `businesses` (même programme de points) : soit un `brand_id` sur businesses, soit un compte « franchise » qui voit plusieurs slugs. À préciser selon besoin.

---

## Résumé des ajouts base de données (tout compris)

| Table | Rôle |
|-------|------|
| **transactions** | Historique : chaque ajout de points ou remise (member_id, type, points, metadata, created_at). |
| **rewards** | Récompenses définies par le commerce (name, points_required). |
| **redemptions** | Utilisation d’une récompense (member_id, reward_id, points_used, created_at). |
| **business_users** | Comptes de connexion pour le restaurateur (email, hash mot de passe, business_id). |
| **pass_registrations** | Enregistrements PassKit (device + push token par membre) pour mise à jour Wallet. |
| **promotions** | Promos temporaires (double points, etc.). |

**Évolutions sur tables existantes**

- **businesses** : `points_per_euro`, `points_per_visit`, `email_notifications` (on/off), optionnel `timezone` pour anniversaires.
- **members** : `birthday` (optionnel), `last_visit_at` (optionnel, mis à jour à chaque ajout de points).

---

## Ordre de mise en œuvre recommandé

1. **Phase 1** : Dashboard (lien secret) + transactions + caisse rapide + règles points sur business. — **✅ Implémenté** (dashboard, stats, membres, transactions, ajout points avec montant € ou 1 passage, règles `points_per_euro` / `points_per_visit`).
2. **Phase 2** : Récompenses + remises (rewards, redemptions, API redeem).  
3. **Phase 3** : Emails (après points / après remise).  
4. **Phase 4** : PassKit Web Service (carte Wallet à jour).  
5. **Phase 5** : Promos, anniversaires, multi-établissements selon priorité business.

---

## Ce que tu peux faire tout de suite (sans tout développer)

- **Documenter** cette roadmap (ce fichier) et la partager.
- **Décider** la priorité : souvent Phase 1 (dashboard + historique + caisse) apporte le plus de valeur perçue pour le restaurateur.
- **Prototyper** une seule page dashboard (stats + liste membres + formulaire « Ajouter des points ») avec les API existantes + table `transactions` et lien secret, pour valider l’UX avec un vrai utilisateur.

Si tu veux, on peut détailler la **Phase 1** (schéma des tables, routes API exactes, et maquette de la page dashboard) pour la développer en premier.
