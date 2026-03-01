# Apple Wallet (cartes de fidélité) : tout ce qui est possible pour le commerçant

Ce document résume **tout ce à quoi tu as accès** et **tout ce que tu peux mettre en place** quand tes clients ont la carte de fidélité dans leur Apple Wallet, pour maximiser la data et l’expérience (pour toi et pour eux).

---

## 1. Ce qu’on n’a PAS (confidentialité Apple)

- **Pas d’accès à la localisation GPS du client.**  
  Apple ne transmet jamais la position du téléphone au serveur du pass. Tu ne peux pas savoir « où est le client » en temps réel.
- **Pas d’identifiant appareil réutilisable.**  
  Le « device library identifier » envoyé à ton web service est **spécifique à toi** et **anonyme** : tu ne peux pas croiser avec d’autres apps ou ré-identifier l’appareil ailleurs.
- **Pas de données personnelles Apple.**  
  Pas d’email Apple, pas de nom Apple, pas de liste de passes d’autres commerces.

Donc : **pas de tracking de localisation**, pas de « big data » sur les déplacements. Tout ce que tu peux faire repose sur ce que **toi** tu enregistres (compte, passage en caisse, scan, etc.) et sur les **mécanismes prévus par Apple** (notifications, affichage du pass à l’écran de verrouillage, etc.).

---

## 2. Ce qu’on A déjà (dans Myfidpass)

| Fonctionnalité | Description | Intérêt commerçant |
|----------------|-------------|---------------------|
| **Web service + enregistrement appareil** | Quand le client ajoute le pass à Wallet, l’iPhone envoie à ton backend un **device library ID** et un **push token**. Tu les stockes (table `pass_registrations` ou équivalent). | Savoir **combien d’appareils** ont installé la carte ; pouvoir envoyer des **mises à jour** et des **notifications** sur le pass. |
| **Mises à jour du pass (push)** | Tu envoies une requête à APNs avec le push token ; l’iPhone recharge le pass depuis ton `webServiceURL` et affiche la nouvelle version (points, tampons, texte). | **Points / tampons à jour** sans que le client ouvre une app ; **messages** (offres, actualité) directement sur la carte. |
| **Notifications sur l’écran de verrouillage** | Si tu mets un `changeMessage` sur un champ (ex. « Tu as maintenant %@ points ! »), la mise à jour peut déclencher une **notification** sur l’écran de verrouillage. | Le client voit tout de suite qu’il a gagné des points ou reçu une offre → plus d’engagement. |
| **QR code dans le pass** | Le code contient un identifiant unique (ex. `member.id`). En caisse, tu **scannes le QR** (app ou lecteur) et tu appelles ton API pour ajouter des points / tampons. | **Identification du client** à la caisse, **historique des passages**, **data de fidélisation** (fréquence, panier moyen si tu le croises avec ton logiciel caisse). |
| **Données côté commerçant** | Pour chaque membre : nom, points/tampons, historique des opérations (si tu le logues), et la liste des **appareils enregistrés** (push tokens). | **Stats** : nombre de cartes actives, nombre d’appareils Wallet, évolution des points, rédemptions, etc. |

En résumé : **identification en caisse (QR)**, **mises à jour + notifications** sur le pass, **data fidélité** côté back-office. Pas de localisation.

---

## 3. Ce qu’on peut AJOUTER (sans toucher à la vie privée)

### 3.1 Affichage du pass sur l’écran de verrouillage près du magasin

- **Principe**  
  Tu peux ajouter dans le pass jusqu’à **10 « relevant locations »** (lat/long). Quand l’utilisateur est **près d’un de ces points**, iOS peut **proposer le pass sur l’écran de verrouillage** (sans nous envoyer sa position).
- **Intérêt**  
  Le client approche de ton commerce → il voit ta carte sans ouvrir Wallet → plus de chances qu’il pense à la présenter en caisse.
- **À faire côté technique**  
  - Stocker l’adresse / les coordonnées du commerce (ou de chaque magasin si chaîne).  
  - À la **génération du pass** (ou à sa mise à jour), remplir le champ **`locations`** du `pass.json` (jusqu’à 10 entrées : latitude, longitude, optionnellement `relevantText`, ex. « Vous êtes près du Café Dupont »).  
  - La lib **passkit-generator** peut exposer ça via les options du pass (à vérifier dans la doc / le code ; sinon, patcher le JSON du pass avant signature).  
- **Limite**  
  Max 10 emplacements par pass. Pour plus de magasins, il faut choisir les 10 plus importants ou **mettre à jour le pass** pour changer la liste (ex. selon la zone du client si tu la déduis autrement, ou une liste tournante).

- **Implémenté dans Myfidpass**  
  Le commerçant renseigne **latitude**, **longitude**, **texte à l’écran de verrouillage** (optionnel) et **rayon en mètres** (100–2000 m, défaut 500) dans « Ma carte » (espace connecté). Le pass est généré avec **10 points** : 1 au centre (commerce) + 9 sur un cercle au rayon choisi, pour un **périmètre large** (Apple ne documente pas de distance exacte par point ; plusieurs points élargissent la zone d’affichage). Les coordonnées se récupèrent sur Google Maps (clic droit sur le lieu → Copier les coordonnées).

### 3.2 iBeacons (Bluetooth) en magasin

- **Principe**  
  Tu peux aussi ajouter jusqu’à **10 iBeacons** (UUID + major/minor) dans le pass. Quand le téléphone entre dans la zone d’un beacon, iOS peut **afficher le pass sur l’écran de verrouillage** (avec un `relevantText` optionnel).
- **Intérêt**  
  Plus précis qu’une seule coordonnée GPS : le pass peut apparaître **dès l’entrée en magasin** (beacon à la porte).
- **À faire**  
  - Acheter des **beacons BLE** (petits boîtiers).  
  - Renseigner leurs UUID/major/minor dans ton back-office (par magasin).  
  - À la génération / mise à jour du pass, remplir le champ **`beacons`** du pass (doc Apple : [Showing a Pass on the Lock Screen](https://developer.apple.com/documentation/walletpasses/showing-a-pass-on-the-lock-screen)).  
- **Limite**  
  10 beacons par pass ; il faut gérer les beacons en magasin (pile, placement).

### 3.3 Date de pertinence (`relevantDate`)

- **Principe**  
  Tu peux définir une **date (et heure) de pertinence**. iOS peut montrer le pass sur l’écran de verrouillage **à ce moment-là** (ex. jour d’une offre, créneau d’un événement).
- **Intérêt**  
  Promo « ce samedi seulement » → le pass remonte sur l’écran ce samedi ; rappel pour un événement fidélité.
- **Attention**  
  Sur certaines versions d’iOS, `relevantDate` est parfois confondu avec une date d’expiration (bug connu). À utiliser avec précaution (ex. pour des créneaux courts) et tester sur plusieurs versions.

### 3.4 Lien « au dos » du pass (back field URL)

- **Principe**  
  Sur le **revers** du pass, un champ peut contenir une **URL** (ex. ton site ou une deep link). Le client peut cliquer et ouvrir le navigateur (ou l’app si tu as un lien universel).
- **Intérêt**  
  Diriger vers : programme fidélité, CGU, formulaire de contact, offre du moment, ou même une page qui pré-remplit le numéro de carte pour éviter de rescanner.
- **À faire**  
  Lors de la génération du pass, mettre une **URL** dans un `backField` (selon ce que supporte passkit-generator ou le format pass.json).

- **Implémenté dans Myfidpass**  
  Chaque pass inclut au dos un champ **« Voir en ligne »** avec un lien cliquable (`dataDetectorTypes: PKDataDetectorTypeLink`) vers le site (ex. `https://myfidpass.fr/?ref=pass&b=slug`). Le client ouvre le site depuis le pass ; l’URL peut être utilisée pour du tracking « source=wallet » côté analytics.

### 3.5 NFC en caisse (à la place du QR)

- **Principe**  
  Le client **tient son iPhone contre un lecteur NFC** ; le lecteur lit un identifiant dans le pass (protocoles type Apple VAS / SmartTap). Ton terminal ou ta caisse envoie cet identifiant à ton API pour identifier le membre et mettre à jour les points.
- **Intérêt**  
  Expérience « tap » comme une carte bancaire ; pas besoin d’ouvrir l’écran ni de montrer un QR.
- **À faire**  
  - Côté pass : s’assurer que le pass est **compatible NFC** (format Apple, bon type de pass).  
  - Côté magasin : **lecteur NFC compatible Wallet** (ex. certains modèles VTAP, ID TECH, Zebra, etc.) et **intégration** entre lecteur et ton API (identification membre + enregistrement du passage).  
- **Contrainte**  
  Coût du matériel et de l’intégration ; moins répandu que le scan QR pour l’instant.

---

## 4. Synthèse : données et leviers pour le commerçant

| Donnée / levier | Source | Utilisation possible |
|------------------|--------|----------------------|
| **Nombre de passes installés** | Enregistrements appareil (web service) | Taux d’adoption Wallet, évolution dans le temps. |
| **Nombre d’appareils par membre** | 1 pass peut être sur plusieurs appareils (iPhone + Apple Watch, etc.) | Comprendre « combien de canaux » tu as pour notifier. |
| **Passages en caisse (scans)** | Chaque scan QR (ou NFC) → appel API | **Fréquence de visite**, **périodes** (heures, jours), **séquences** (retour après X jours). |
| **Points / tampons** | Saisie en caisse + mise à jour pass | **Engagement** (qui cumule), **taux de rédemption** (qui utilise les récompenses). |
| **Ouverture des notifications** | Pas mesurable directement | Tu peux seulement savoir que tu as **envoyé** une push ; pas si l’utilisateur a « ouvert » le pass. |
| **Affichage écran de verrouillage** | Géré par iOS (locations / beacons / date) | Tu ne reçois **aucune donnée** « le pass a été affiché » ; tu améliores seulement la **probabilité** qu’il soit vu. |
| **Clic sur lien au dos du pass** | Si tu mets une URL avec des paramètres (ex. `?member=xxx&source=wallet`) | Comptage des clics « depuis Wallet » (analytics sur ton site). |

Donc : **pas de localisation**, mais **beaucoup de data fidélité** (scans, points, historique) et **leviers UX** (notifications, affichage au bon moment, lien au dos du pass).

---

## 5. Roadmap possible (par ordre d’impact / faisabilité)

1. **Locations dans le pass** ✅ *En place*  
   Renseigner les coordonnées du commerce (ou des principaux magasins) pour que le pass apparaisse sur l’écran de verrouillage à proximité. **Peu de dev**, **effet visible** pour le client.
2. **Back field URL** ✅ *En place*  
   Lien vers ton site / offre / contact depuis le pass. **Peu de dev**, bon pour l’engagement et le trafic.
3. **`relevantDate`** (optionnel)  
   Pour des offres ou événements à date fixe ; à tester selon les versions iOS.
4. **iBeacons**  
   Si tu veux un déclenchement plus précis qu’une zone GPS (ex. entrée magasin). Nécessite **matériel** et config.
5. **Analytics dashboard**  
   Exploiter ce que tu as déjà : graphiques « passes actifs », « scans par jour / par membre », « évolution des points », « taux de rédemption ». Pas de nouvelle capacité Wallet, juste **valoriser la data** existante.
6. **NFC en caisse**  
   Quand le budget et l’équipement le permettent, proposer le « tap » en plus du QR pour une expérience premium.

---

## 6. Références utiles

- [Showing a Pass on the Lock Screen](https://developer.apple.com/documentation/walletpasses/showing-a-pass-on-the-lock-screen) (locations, beacons, relevantDate).
- [Adding a Web Service to Update Passes](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes) (enregistrement appareil, push, mises à jour).
- [Loyalty and membership passes on Apple platforms](https://developer.apple.com/wallet/loyalty-passes/) (vue d’ensemble).
- [Apple - Données Wallet et confidentialité](https://www.apple.com/legal/privacy/data/en/wallet/) (ce qu’Apple partage ou non avec les émetteurs de passes).

---

**En résumé**  
Avec les clients qui ont la carte dans Apple Wallet, tu as déjà : **identification en caisse (QR)**, **mises à jour du pass**, **notifications**, et **toute la data fidélité** que tu enregistres. Tu n’as **pas accès à la localisation**. Tu peux aller plus loin en : **affichant le pass près du magasin** (locations, éventuellement beacons), en **ajoutant un lien au dos du pass**, et en **exploitant mieux les données** (analytics, tableaux de bord) pour le commerçant.
