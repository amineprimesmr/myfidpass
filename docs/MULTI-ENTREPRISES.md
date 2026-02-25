# Modèle multi-entreprises (SaaS) — Cartes fidélité Apple Wallet

Tu veux **vendre** la solution à plusieurs entreprises (fast-foods, etc.) : une seule plateforme, un seul compte Apple Developer, **une carte de fidélité par entreprise** pour leurs clients.

---

## 1. Comment Apple voit les choses (à faire une seule fois)

- **Un seul compte Apple Developer** (99 €/an) suffit.
- **Un seul Pass Type ID** pour toute la plateforme (ex. `pass.com.tonapp.fidelity`).
- **Un seul certificat** pour signer tous les passes.

Tu ne crées **pas** un Pass Type ID par client. Le contenu de la carte (nom de l’entreprise, logo, bandeau) est **dynamique** : pour chaque pass, le serveur met le bon nom, les bonnes images, etc. C’est comme ça que font les acteurs type PassKit.com, Walletpass.io : un cert, des milliers de passes différents.

Résumé : **une seule config Apple** (voir [APPLE-WALLET-SETUP.md](APPLE-WALLET-SETUP.md)), et côté code on change uniquement les **données** (entreprise, visuels) pour chaque pass.

---

## 2. Modèle métier

| Qui | Rôle |
|-----|------|
| **Toi** | Tu vends la solution. Tu ajoutes une « entreprise » (client) dans l’admin ou via l’API. Tu lui donnes **un lien** (ou un QR code). |
| **L’entreprise (ton client)** | Fast-food, resto, etc. Elle affiche le lien/QR en caisse ou sur la vitrine. Ses clients scannent ou tapent le lien. |
| **Le client final** | Client du fast-food. Il ouvre le lien → formulaire (nom, email) → « Ajouter à Apple Wallet » → il a la carte de fidélité **de cette entreprise** dans son Wallet. |

Chaque entreprise a **un lien unique** du type :

- `https://tondomaine.com/fidelity/burger-king`
- ou `https://tondomaine.com/fidelity/resto-dupont`

Les clients de Burger King vont sur le premier lien ; ceux de Resto Dupont sur le second. Chacun reçoit une carte **aux couleurs / au nom** de la bonne entreprise.

---

## 3. Comment une entreprise « obtient » sa carte (en pratique)

- **Toi** : tu crées l’entreprise dans le back-office (ou via l’API), avec nom, slug (ex. `burger-king`), visuels (logo, bandeau) si tu les as.
- **Tu génères** le lien :  
  `https://tondomaine.com/fidelity/burger-king`  
  (et éventuellement un QR code qui pointe vers ce lien).
- Tu **donnes** ce lien (et/ou le QR) à ton client (le fast-food). Il l’affiche en caisse, sur un flyer, sur la vitrine.
- **Les clients du fast-food** : ils ouvrent le lien (ou scannent le QR) → formulaire → « Ajouter à Apple Wallet » → ils ont la carte **Burger King** dans le Wallet.

Donc « obtenir la Wallet » pour une entreprise = **avoir le lien (et le QR si tu le fournis)**. Les cartes sont créées à la demande quand les clients finaux s’inscrivent via ce lien.

---

## 4. Comment les clients finaux obtiennent la carte dans Apple Wallet

1. Ils vont sur le lien de l’entreprise (ex. `.../fidelity/burger-king`).
2. Ils remplissent nom + email, cliquent sur « Créer ma carte ».
3. Ils cliquent sur « Ajouter à Apple Wallet ».
4. Le navigateur télécharge un fichier `.pkpass` (ou sur iPhone propose de l’ajouter au Wallet).
5. Ils ouvrent le pass → il s’ajoute dans Apple Wallet. Ensuite : double-clic sur le bouton latéral → la carte s’affiche.

Aucune app à télécharger : tout passe par le **lien web** que tu fournis à chaque entreprise.

---

## 5. Ce qui est en place dans le projet (technique)

- **Une seule config Apple** : un Pass Type ID, un certificat, un `TEAM_ID` dans le `.env` du backend.
- **Table `businesses`** : chaque client (fast-food, etc.) = une ligne (nom, slug, visuels, etc.).
- **Table `members`** : chaque carte = un membre lié à une **business** (`business_id`). Les points, le nom, l’email sont ceux du membre ; le pass affiche le **nom et les visuels de la business**.
- **API par slug** :
  - `GET /api/businesses/:slug` → infos publiques de l’entreprise (pour afficher son nom sur la page).
  - `POST /api/businesses/:slug/members` → créer un membre (carte) pour cette entreprise.
  - `GET /api/businesses/:slug/members/:memberId/pass` → télécharger le `.pkpass` pour ce membre (carte aux couleurs de cette entreprise).
- **Frontend** : une seule app. L’URL contient le slug : `/fidelity/:slug`. La page charge l’entreprise par slug, affiche son nom, et les boutons « Créer ma carte » / « Ajouter à Apple Wallet » appellent les routes ci-dessus.
- **Génération du pass** : à chaque fois, le backend prend la **business** du membre, utilise son nom et ses images (logo, bandeau), et génère un pass signé avec **ton** certificat (le même pour tout le monde).

---

## 6. Ajouter une nouvelle entreprise (pour toi, en tant que vendeur)

1. **Créer l’entreprise**  
   - Soit via l’API : `POST /api/businesses` avec `name`, `slug`, `organizationName`, et optionnellement les chemins ou URLs des images (logo, strip, icon).  
   - Soit via un petit back-office (à ajouter si tu veux une interface).

2. **Renseigner les visuels**  
   - Soit tu uploades des fichiers dans `backend/assets/businesses/<id>/` (logo.png, strip.png, icon.png).  
   - Soit ton API/admin accepte des URLs et le backend les utilise (selon ce qu’on a codé).

3. **Donner le lien au client**  
   - Lien : `https://tondomaine.com/fidelity/<slug>`.  
   - Tu peux générer un QR code pointant vers ce lien et le livrer au fast-food (affiche, caisse, etc.).

Après ça, l’entreprise n’a rien à « configurer » côté Apple : tout est géré par ta plateforme et ton unique compte Apple.

---

## 7. Récap : la méthode la plus simple

- **Apple** : 1 compte Developer, 1 Pass Type ID, 1 certificat (voir [APPLE-WALLET-SETUP.md](APPLE-WALLET-SETUP.md)). À faire une fois.
- **Plateforme** : 1 backend, 1 frontend, table `businesses` + `members` avec `business_id`.
- **Par entreprise** : 1 slug, 1 lien (`/fidelity/:slug`), optionnellement 1 QR code. Les cartes sont générées à la demande avec le bon branding.
- **Clients finaux** : ils n’ont qu’à ouvrir le lien (ou scanner le QR), remplir le formulaire, cliquer sur « Ajouter à Apple Wallet ». Ils n’ont pas besoin de créer de compte Apple Developer ni de « business » : tout est déjà configuré côté plateforme.

C’est le même modèle que les solutions SaaS de passes (PassKit, Walletpass, etc.) : **un cert, plusieurs « tenants » (entreprises), chaque pass personnalisé par entreprise**.
