# Améliorations du logiciel commerçant Fidpass

Document d’analyse et d’inspiration pour l’interface une fois le commerçant connecté : données utiles, notifications, UX et idées d’évolution.

---

## 1. Modifications déjà appliquées

- **Bouton « Créer une carte » supprimé** du menu latéral : une seule carte par commerce, pas d’action « créer une autre carte » dans l’app.
- **Navigation par pages** : chaque entrée du menu (Vue d’ensemble, Partager, Scanner, etc.) affiche une **page à part entière**. Plus de défilement dans une même longue page : une section visible à la fois, URL avec hash (`/app#vue-ensemble`, `/app#scanner`, etc.), historique navigateur (retour / avant) fonctionnel.
- **Bannière bleue et menu haut** déjà masqués sur l’interface connectée (`/app`).

---

## 2. Notifications : ce qui est possible (Apple Wallet)

### 2.1 Principe

- **Le commerçant ne peut pas envoyer une notification « gratuite »** juste parce que le client a la carte dans le Wallet. Les notifications liées au pass passent par le **système de mise à jour du pass**.
- Quand une carte Apple Wallet est **configurée pour les mises à jour** (champs `webServiceURL` et `authenticationToken` dans le pass), l’appareil s’enregistre auprès de votre serveur et vous envoie un **push token**.
- Lorsque vous **modifiez les données du pass** (ex. points ajoutés), vous envoyez une **push à Apple (APNs)** avec ce token. L’appareil reçoit le signal, contacte votre `webServiceURL` et **télécharge la nouvelle version du pass**. La carte dans le Wallet est mise à jour.

### 2.2 Notification « visible » pour le client

- Si, lors de la mise à jour du pass, vous renseignez un **message de changement** (change message), Apple peut afficher une **notification** du type : « Votre carte [Commerce] a été mise à jour » ou un texte personnalisé (ex. « Vous avez gagné 10 points »).
- Sans message de changement, la mise à jour est **silencieuse** (données à jour dans le Wallet, pas de bannière).

En résumé : **oui, on peut « notifier » le client** en mettant à jour sa carte (points, tampons, etc.) et en associant un message de changement. Ce n’est pas une notification marketing arbitraire ; c’est lié à une **mise à jour réelle du pass**.

### 2.3 À mettre en place côté Fidpass (non fait aujourd’hui)

1. **Pass avec `webServiceURL`** : dans la génération du pass, définir l’URL de votre API (ex. `https://api.myfidpass.fr/v1/passes`) et un `authenticationToken` par pass/membre.
2. **API PassKit côté backend** :
   - `POST /v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}` : enregistrement du device + push token.
   - `GET /v1/passes/{passTypeId}/{serialNumber}` : renvoyer le `.pkpass` à jour (points, tampons, etc.).
   - `DELETE /v1/devices/...` : désenregistrement.
3. **Lors d’un ajout de points (ou tampons)** : après avoir mis à jour la BDD, récupérer les push tokens enregistrés pour ce `serialNumber` (member id) et envoyer une **push à APNs** (avec éventuellement un « change message »). Apple recommande de ne pas abuser des pushes (éviter le spam).

Une fois ce flux en place, **chaque fois que le commerçant ajoute des points**, la carte du client dans le Wallet peut se mettre à jour et, si vous le souhaitez, afficher une notification type « Vous avez gagné X points chez [Commerce] ».

---

## 3. Données et indicateurs pertinents pour le commerçant

### 3.1 Déjà présents (à garder / renforcer)

| Indicateur | Utilité |
|------------|--------|
| **Nombre de membres** | Taille de la base fidélité. |
| **Points distribués ce mois** | Activité du programme sur la période. |
| **Nombre d’opérations ce mois** | Fréquence d’utilisation (passages / ajouts de points). |
| **Liste des membres** (nom, email, points, dernière visite) | Identifier les clients, vérifier les soldes, contacter (email). |
| **Historique des transactions** | Audit, litiges, analyse des pics d’activité. |

### 3.2 Indicateurs à ajouter (recommandés)

| Indicateur | Description | Intérêt |
|------------|-------------|--------|
| **Nouveaux membres (7 j / 30 j)** | Inscriptions sur la période. | Suivi de l’adoption de la carte. |
| **Taux de réactivation** | Membres sans visite depuis X jours qui reviennent. | Mesurer l’effet de rappels ou d’offres. |
| **Points moyens par membre** | Moyenne du solde points. | Voir si les clients accumulent ou utilisent. |
| **Fréquence des passages** | Ex. nombre de passages / membre / mois. | Identifier les « réguliers » vs occasionnels. |
| **Membres inactifs (30 j / 90 j)** | Pas de transaction depuis 30 ou 90 jours. | Ciblage pour relance (email, offre). |
| **Évolution mensuelle** | Courbes ou comparaison mois N vs N-1 (membres, points, opérations). | Vision tendance. |
| **Heures / jours les plus actifs** | Répartition des transactions par jour/heure (si vous enregistrez l’heure). | Optimiser plannings, promotions ciblées. |

### 3.3 Données à enregistrer (côté backend) pour aller plus loin

- **Horodatage précis** des transactions (déjà le cas si `created_at` est renseigné).
- **Type d’opération** : passage simple vs points liés à un montant (déjà partiellement en place avec `type`).
- **Montant (€)** si saisi : permet taux de conversion € → points, panier moyen, etc.
- **Origine** : scan en caisse vs « caisse rapide » (optionnel), pour analyser l’usage du scanner.

---

## 4. Améliorations UX / fonctionnalités

### 4.1 Vue d’ensemble

- **Cartes / widgets** : garder les 3 KPIs (membres, points ce mois, opérations), ajouter par exemple « Nouveaux membres (30 j) », « Membres inactifs 30 j ».
- **Mini graphique** : évolution sur 6–12 semaines (membres ou opérations) pour donner une vision tendance sans quitter la page.
- **Raccourcis** : boutons « Ouvrir le scanner », « Copier le lien partage », « Voir les membres inactifs » pour réduire le nombre de clics.

### 4.2 Partager

- **QR code téléchargeable** (PNG/PDF) pour affichage en vitrine ou en caisse.
- **Texte prêt à l’envoi** (SMS / WhatsApp) : « Ajoutez notre carte fidélité en un clic : [lien] ».
- **Aperçu de la page carte** (mini screenshot ou lien « Voir la page ») pour rassurer le commerçant.

### 4.3 Scanner

- Déjà bien avancé (caméra, vérification, affichage client, ajout de points). Idées :
  - **Son / vibration** en cas de scan réussi ou rejet.
  - **Rappel du dernier client scanné** (ex. bandeau « Dernier : Marie – 42 pts ») pour enchaîner un 2ᵉ passage sans rescan.
  - **Mode « passage uniquement »** déjà présent ; le rendre encore plus visible (ex. bouton mis en avant quand le commerçant n’a pas saisi de montant).

### 4.4 Caisse rapide

- **Recherche** (nom / email) déjà là ; ajouter une **liste récente** (derniers 5–10 clients utilisés) pour accès en 1 clic.
- **Raccourcis montants** : ex. « 1 café », « Formule déj » avec montant prédéfini et points associés (si règles métier le permettent).

### 4.5 Membres

- **Filtres** : par solde (ex. « Plus de 50 pts »), par dernière visite (« Inactifs > 30 j »), par date d’inscription.
- **Export** (CSV/Excel) : liste des membres (email, nom, points, dernière visite) pour campagnes email ou analyse hors app.
- **Fiche membre** : en cliquant sur une ligne, ouvrir une vue détail (historique des transactions, possibilité d’ajuster les points, notes internes optionnelles).
- **Tri** : par nom, par points, par dernière visite.

### 4.6 Historique

- **Filtres** : par période (7 j, 30 j, 90 j), par type (passage, points avec montant), par membre.
- **Export** des transactions (CSV) pour compta ou analyse.
- **Recherche** par nom de client ou par date.

### 4.7 Personnaliser la carte

- **Aperçu en direct** de la carte (mini rendu Wallet ou image) quand on change les couleurs / le logo.
- **Modèles prédéfinis** (secteurs : café, boulangerie, etc.) comme sur la landing, pour appliquer un thème en un clic.
- **Rappel** : « Les changements s’appliquent aux nouvelles cartes et aux mises à jour du pass (si le client a activé les mises à jour). »

### 4.8 Général

- **Sélecteur de commerce** : si un compte gère plusieurs commerces (multi-établissements), un switch en haut de la sidebar pour changer de contexte.
- **Notifications in-app** : « 3 nouveaux membres cette semaine », « Rappel : X membres inactifs depuis 30 j » (sans parler de push client ici).
- **Mode hors-ligne** (PWA) : cache des données récentes et file d’attente des actions (ex. ajout de points) pour les envoyer quand la connexion revient (avancé).
- **Raccourcis clavier** : ex. Ctrl+K pour recherche globale membre, Entrée pour valider l’ajout de points.

---

## 5. Notifications côté commerçant (in-app / email)

- **Résumé hebdo ou mensuel par email** : membres, points distribués, opérations, nouveaux membres.
- **Alertes optionnelles** : « Premier membre du jour », « 10ᵉ inscription », « Objectif X membres atteint ».
- **Dans l’app** : petite cloche ou bandeau avec « 5 nouveaux membres cette semaine » ou « 3 membres inactifs depuis 30 j » avec lien vers la liste.

Cela ne dépend pas d’Apple Wallet : c’est votre backend + envoi d’emails ou messages in-app.

---

## 6. Synthèse : ordre de priorité suggéré

1. **Court terme**  
   - Enrichir la **Vue d’ensemble** (nouveaux membres 30 j, inactifs 30 j, éventuellement un petit graphique).  
   - **Partager** : QR téléchargeable, texte prêt à copier.  
   - **Membres** : filtres (inactifs, par points), export CSV, fiche détail membre.

2. **Moyen terme**  
   - **Pass Apple Wallet avec mises à jour** : `webServiceURL`, API PassKit, envoi push après ajout de points (et optionnellement message de changement pour « notifier » le client).  
   - **Historique** : filtres, export.  
   - **Personnaliser** : aperçu live, rappel sur l’impact des changements.

3. **Plus tard**  
   - Indicateurs avancés (fréquence, réactivation, heures creuses / pleines).  
   - Multi-établissements, PWA hors ligne, notifications email pour le commerçant.

---

## 7. Références

- [Apple – Updating a Pass](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Updating.html)  
- [PassKit Web Service](https://developer.apple.com/documentation/walletpasses/adding_a_web_service_to_update_passes)  
- Notifications de mise à jour : le device reçoit une push APNs, puis appelle votre `webServiceURL` pour récupérer le pass à jour ; un « change message » peut être affiché à l’utilisateur.

---

*Document rédigé pour Fidpass – à utiliser comme base pour les évolutions du logiciel commerçant et les choix produit.*
