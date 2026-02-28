# Configuration Apple Wallet — Pass Type ID et certificats

Ce guide décrit comment obtenir tout ce qu’il faut pour signer des passes Apple Wallet (carte de fidélité) depuis ton backend.

## 1. Compte Apple Developer

- Va sur [developer.apple.com](https://developer.apple.com) et connecte-toi.
- Inscris-toi au **Apple Developer Program** (99 €/an) si ce n’est pas déjà fait.
- Tu auras besoin du **Team ID** (Identifiant d’équipe) :  
  **Account** → **Membership** → **Team ID** (10 caractères alphanumériques).

---

## 2. Créer un Pass Type ID

Un Pass Type ID identifie le **type** de pass (ici : carte de fidélité).

1. Va dans [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. Onglet **Identifiers** → bouton **+**.
3. Choisis **Pass Type IDs** → **Continue**.
4. Renseigne :
   - **Description** : ex. `Carte fidélité Fast-food`
   - **Identifier** : au format inverse DNS, ex. `pass.com.tonentreprise.fidelity`  
     (remplace `tonentreprise` par ton domaine ou nom d’app).
5. **Register**.

Tu utiliseras cet identifiant dans `backend/.env` comme `PASS_TYPE_ID`.

---

## 3. Créer le certificat Pass Type ID (signature des passes)

Ce certificat permet de signer les fichiers `.pkpass`. Il expire au bout d’un an et doit être renouvelé.

### 3.1 Créer une CSR (Certificate Signing Request) sur Mac

1. Ouvre **Keychain Access** (Trousseau d’accès).
2. Menu **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**.
3. Renseigne :
   - **User Email Address** : ton email (souvent celui du compte Apple Developer).
   - **Common Name** : ex. `Fidelity Pass`.
   - **CA Email** : laisse vide.
   - Coche **Saved to disk**.
4. **Continue** et enregistre le fichier `.certSigningRequest`.

### 3.2 Créer le certificat dans le portail Apple

1. Dans **Identifiers**, clique sur le **Pass Type ID** que tu viens de créer.
2. Clique sur **Create Certificate** (à côté de "Pass Type ID Certificate").
3. Suis les instructions : uploade ta **CSR**.
4. Télécharge le fichier `.cer` généré.
5. Double-clique sur le `.cer` pour l’installer dans le Trousseau.

### 3.3 Exporter en PEM pour le backend

1. Dans **Keychain Access**, trouve le certificat (nom lié à ton Pass Type ID).
2. Clique droit → **Export**.
3. Exporte au format **.p12** (tu devras définir un mot de passe).
4. En ligne de commande, génère les fichiers PEM :

```bash
# Remplacer fidelity.p12 par ton fichier et entrer le mot de passe à la demande
openssl pkcs12 -in fidelity.p12 -out signerCert.pem -clcerts -nokeys
openssl pkcs12 -in fidelity.p12 -out signerKey.pem -nocerts -nodes
```

Place **signerCert.pem** et **signerKey.pem** dans `backend/certs/`.  
Si tu as mis un mot de passe sur la clé, ajoute-le dans `.env` (voir plus bas).

---

## 4. Télécharger le certificat WWDR (Apple)

Apple utilise un certificat intermédiaire (WWDR) pour la chaîne de confiance.

1. Va sur [WWDR intermediate certificates](https://developer.apple.com/help/account/certificates/wwdr-intermediate-certificates/).
2. Télécharge **Worldwide Developer Relations - G4** (ou G5) au format **PEM** si proposé, sinon en `.cer`.
3. Si tu as un `.cer`, convertis-le en PEM :

```bash
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

Place **wwdr.pem** dans `backend/certs/`.

---

## 5. Récap des fichiers dans `backend/certs/`

| Fichier         | Rôle |
|-----------------|------|
| `signerCert.pem` | Certificat Pass Type ID (clé publique) |
| `signerKey.pem`  | Clé privée du certificat |
| `wwdr.pem`       | Certificat intermédiaire Apple WWDR |

Ne commite **jamais** `signerKey.pem` (ni le `.p12`) dans Git. Le dossier `certs/` est dans `.gitignore`.

### 5.1 Production (Railway) : variables d'environnement

En production, les fichiers `.pem` ne sont pas dans le repo (`.gitignore`). Tu peux passer le **contenu complet** de chaque fichier en variable d'environnement sur Railway :

| Variable Railway | Contenu |
|------------------|--------|
| `WWDR_PEM` | Contenu **entier** du fichier `wwdr.pem` (copier-coller, y compris les lignes `-----BEGIN CERTIFICATE-----` et `-----END CERTIFICATE-----`) |
| `SIGNER_CERT_PEM` | Contenu **entier** de `signerCert.pem` |
| `SIGNER_KEY_PEM` | Contenu **entier** de `signerKey.pem` |

**Comment faire :** sur ton Mac, ouvre chaque fichier dans `backend/certs/` avec un éditeur de texte, sélectionne tout (Cmd+A), copie (Cmd+C), puis sur Railway → ton service → **Variables** → **+ New Variable** → colle le contenu dans la valeur. Répète pour les 3 variables. Redéploie le service après avoir tout ajouté.

---

### 5.2 URL du service PassKit (`PASSKIT_WEB_SERVICE_URL`)

Sur Railway, définis `PASSKIT_WEB_SERVICE_URL=https://api.myfidpass.fr` (sans slash final, **sans** `/api` ni `/v1`). Le code ajoute `/api` ; Apple ajoute ensuite `/v1/devices/...` et `/v1/passes/...` à cette URL. Si tu mets `/api/v1` dans l’URL, l’iPhone appellera `/api/v1/v1/...` et les mises à jour échoueront.

### 5.3 Notifications push (APNs)

Les notifications push Wallet utilisent **le même certificat** que la signature des passes. Si tu vois « APNs non configuré » : vérifie que `PASS_TYPE_ID`, `SIGNER_CERT_PEM_BASE64` et `SIGNER_KEY_PEM_BASE64` sont bien définis sur Railway.

## 6. Variables d’environnement (`backend/.env`)

```env
# Identifiant du pass (ex. pass.com.tonentreprise.fidelity)
PASS_TYPE_ID=pass.com.tonentreprise.fidelity

# Team ID (10 caractères) — Account → Membership
TEAM_ID=XXXXXXXXXX

# Nom affiché sous la carte sur l’écran de verrouillage
ORGANIZATION_NAME=Mon Fast-Food

# Optionnel : mot de passe de la clé .p12 si tu ne l’as pas enlevé
# SIGNER_KEY_PASSPHRASE=ton_mot_de_passe
```

---

## 7. Vérification rapide

Une fois les certificats en place et le backend lancé :

- Ouvre le frontend et clique sur **Ajouter à Apple Wallet**.
- Sur iPhone : reçois le `.pkpass` (par exemple par mail ou via le navigateur), ouvre-le → **Add**.
- La carte doit s’afficher dans Wallet (double-clic sur le bouton latéral).

Si le pass est rejeté (« invalid »), vérifie :

- `PASS_TYPE_ID` identique à l’identifiant enregistré dans le portail Apple.
- `TEAM_ID` égal à ton Team ID.
- Fichiers PEM corrects (certificat + clé + WWDR) et chemins dans le code.

---

## La carte ne se met pas à jour (points n’apparaissent pas)

**Notifications lock screen :** Le guide [Sending Lock Screen Notifications](https://help.passkit.com/en/articles/4097979-sending-lock-screen-notifications) exige que le message contienne **`%@`**. C’est déjà le cas dans Fidpass (`changeMessage: "Tu as maintenant %@ points !"` dans `backend/src/pass.js`). Vérifier aussi : (1) au moins 1 appareil enregistré (page Notifications) ; (2) iPhone : Réglages → Notifications → Wallet activées.

Si tu ajoutes des points dans l’app mais que la carte dans le Wallet ne se met pas à jour :

1. **Vérifier les logs Railway** après un ajout de points :
   - **`[PassKit] Aucun appareil enregistré pour ce membre — pas de push après points.`** : l’iPhone n’a jamais enregistré cette carte auprès du serveur (pas de `pushToken`). Le client doit **supprimer la carte du Wallet**, rouvrir le **lien de partage** (depuis « Partager » sur myfidpass.fr), cliquer « Apple Wallet » et **ré-ajouter la carte**. Vérifier que `PASSKIT_WEB_SERVICE_URL` (ou `API_URL`) est bien défini sur Railway. Tester en 4G si le Wi‑Fi bloque les appels.
   - Si tu vois **`[PassKit] GET pass: 401 Unauthorized — token invalide`** : le pass dans le Wallet a été généré avec un autre `PASSKIT_SECRET` (ou l’ancien secret). **Supprime la carte du Wallet sur l’iPhone, ré-ajoute-la** (scan du QR ou lien « Ajouter à Apple Wallet »), puis réessaie d’ajouter des points. Ne change pas `PASSKIT_SECRET` une fois que des clients ont déjà ajouté la carte.
   - Si tu vois **`[PassKit] >>> PASS ENVOYÉ — ... points: X`** avec le **bon** nombre de points : le serveur envoie bien le pass à jour. Si la carte n’affiche toujours pas les points, ouvre la carte dans Wallet, tire pour rafraîchir, ou supprime/ ré-ajoute la carte une fois.

2. **Ne pas modifier `PASSKIT_SECRET`** en production après que des passes ont été distribués : chaque pass contient un jeton dérivé de ce secret ; si tu le changes, les mises à jour (GET pass) renverront 401 et la carte ne se mettra plus à jour.

3. **Troubleshooting (aligné sur [Sending Lock Screen Notifications](https://help.passkit.com/en/articles/4097979-sending-lock-screen-notifications)) :**
   - Vérifier que la carte est bien **enregistrée** pour les push (voir checklist ci‑dessus).
   - Vérifier que l’utilisateur a activé les **notifications pour Wallet** dans Réglages iPhone.
   - Le champ Points du pass contient bien **`%@`** dans le message (déjà le cas dans Fidpass).
   - En cas d’erreur côté API (routes, 401, 404), consulter les logs Railway.

---

## Design du pass : tout ce qu’on peut modifier

### Ce qu’on peut modifier (et comment)

| Élément | Modifiable ? | Comment |
|--------|--------------|--------|
| **Couleur de fond** | Oui | Template (café, fastfood, etc.) ou couleurs personnalisées du commerce (`background_color`). Ex. rouge type BURGERZ = template fastfood `#c41e3a` ou couleur custom. |
| **Couleur du texte** | Oui | `foregroundColor` (texte principal), `labelColor` (labels). Par template ou par commerce. |
| **Bandeau en haut (strip)** | Oui | Image PNG 750×288 px (ou 375×144). Déposée dans `backend/assets/strip.png` (global) ou `backend/assets/businesses/:id/strip.png` (par commerce). Sinon un dégradé aux couleurs du template est généré. Tu peux y mettre logo + nom de marque + slogan (ex. BURGERZ, BEST IN TOWN). |
| **Logo** | Oui | Logo du commerce (upload dans l’app) ou `backend/assets/logo.png` / `assets/businesses/:id/logo.png`. Affiché à gauche en haut (ex. icône burger jaune). |
| **Icône (petite)** | Oui | `backend/assets/icon.png` (29×29 ou 58×58). Utilisée par le système (notifications, liste Wallet). |
| **Nom de l’organisation** | Oui | C’est le nom du commerce (ex. BURGERZ). Affiché par Apple à côté du logo. |
| **Champs texte** | Oui | Primary (ex. « 5 / 10 » ou « Stamps: 05 »), secondary (ex. « Remaining: 10 » ou slogan), auxiliary (ex. nom du membre, actualité). Libellés et valeurs modifiables dans le code (pass.js) ou via la business. |
| **QR code** | Oui | Toujours présent ; la valeur encodée = identifiant membre (pour le scan en caisse). Le style (couleurs, coins ronds) est géré par Apple. |
| **Dos du pass** | Oui | Conditions, contact (back fields). Renseignés par le commerce. |

### Ce qu’on ne peut pas faire (limites Apple)

- **Grille d’icônes** (ex. 8 burgers : 2 remplis, 6 vides). Le pass ne permet que des champs texte et des images strip/logo/icon, pas une grille de petites images positionnées librement.
- **Position libre** des éléments. Apple impose un layout fixe : strip → header → primary → secondary → auxiliary → code-barres.
- **Coins ronds du QR** ou forme personnalisée du pass. Rendu géré par le système.
- **Plusieurs bandeaux ou images au milieu** du pass. Une seule image strip en haut.

### Exemple type « BURGERZ » : ce qu’on peut reproduire

- **Fond rouge** → template fastfood ou `background_color` rouge.
- **Logo burger jaune** → logo du commerce (upload) ou `logo.png` dans assets.
- **« BURGERZ » + « BEST IN TOWN »** → soit dans le **strip** (une seule image avec tout le visuel), soit « BURGERZ » = nom du commerce (affiché par Apple), « BEST IN TOWN » = texte dans un champ secondary (à ajouter côté code si tu veux un slogan).
- **« 020 »** (numéro de carte) → possible en secondary ou auxiliary (ex. 3 derniers chiffres du member.id ou un numéro affiché).
- **« Stamps: 05 » / « Remaining: 10 »** → on a déjà « 5 / 10 » en primary ; on peut ajouter un champ du type « Restant : 10 » ou « Stamps: 05 » en secondary (libellés/valeurs à adapter dans pass.js).
- **Grille de 8 burgers (2 remplis, 6 vides)** → **non** : impossible dans un pass Wallet.

En résumé : on peut s’approcher fortement du style BURGERZ (couleurs, strip avec marque + slogan, logo, textes type stamps/remaining), mais pas la grille d’icônes burgers. Pour un rendu « pro », le plus impactant est un **strip personnalisé** (image 750×288 avec BURGERZ + BEST IN TOWN + visuel) et un **logo** burger.

---

## Liens utiles

- [Sending Lock Screen Notifications](https://help.passkit.com/en/articles/4097979-sending-lock-screen-notifications) (PassKit) — exigence `%@`, troubleshooting.
- [Send a Push Notification to an Individual Pass Holder](https://help.passkit.com/en/articles/7731052-send-a-push-notification-to-an-individual-pass-holder) (PassKit).
- [Create Wallet identifiers and certificates (Apple)](https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates/)
- [PassKit Package Format Reference](https://developer.apple.com/library/archive/documentation/UserExperience/Reference/PassKit_Bundle/Chapters/Introduction.html)
- [WWDR intermediate certificates](https://developer.apple.com/help/account/certificates/wwdr-intermediate-certificates/)
