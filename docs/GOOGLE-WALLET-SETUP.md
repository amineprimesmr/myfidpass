# Configuration Google Wallet (Android)

Pour que les clients **Android** puissent ajouter la carte de fidélité dans **Google Wallet**, il faut configurer le projet Google et ajouter deux variables d’environnement au backend.

## 1. Google Pay & Wallet Console

1. Va sur [Google Pay & Wallet Console](https://pay.google.com/business/console).
2. Connecte-toi avec un compte Google (pro ou perso).
3. **Créer un compte d’émetteur** (ou utiliser un projet existant) :
   - Nom de l’émetteur : **Fidpass** (ou ton nom de marque).
   - Tu obtiens un **Issuer ID** (chiffres, ex. `33880000000123456789`). Note-le.

## 2. Google Cloud : API et compte de service

1. Ouvre [Google Cloud Console](https://console.cloud.google.com).
2. Crée un projet ou sélectionne un projet existant.
3. **Activer l’API** : dans « APIs & Services » → « Library », cherche **Google Wallet API** et active-la.
4. **Compte de service** :
   - « APIs & Services » → « Credentials » → « Create Credentials » → « Service account ».
   - Donne un nom (ex. `fidpass-wallet`), puis « Create and Continue ».
   - Rôle : pas besoin d’ajouter de rôle pour Wallet (la clé sert uniquement à signer les JWT).
   - « Done ».
5. **Clé JSON** :
   - Clique sur le compte de service créé → onglet « Keys » → « Add Key » → « Create new key » → **JSON**.
   - Le fichier JSON est téléchargé. Ouvre-le : il contient `client_email`, `private_key`, etc.

## 3. Lier le compte de service à Google Wallet

1. Retourne dans [Google Pay & Wallet Console](https://pay.google.com/business/console).
2. Sélectionne ton compte d’émetteur (Issuer ID).
3. Va dans **« Account linking »** ou **« API access »**.
4. Associe le **service account** (email du compte de service, ex. `fidpass-wallet@mon-projet.iam.gserviceaccount.com`) à cet émetteur.

Sans cette étape, les JWT signés avec cette clé seront rejetés par Google.

## 4. Variables d’environnement (backend)

Sur **Railway** (ou ton hébergeur), ajoute :

| Variable | Valeur |
|----------|--------|
| `GOOGLE_WALLET_ISSUER_ID` | Ton Issuer ID (ex. `33880000000123456789`) |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | **Tout** le contenu du fichier JSON du compte de service (une seule ligne). En production, échappe les retours à la ligne dans la clé privée : `\n` dans la valeur. |

Exemple (la valeur est une seule chaîne JSON) :

```
GOOGLE_WALLET_ISSUER_ID=33880000000123456789
GOOGLE_WALLET_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"mon-projet","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n","client_email":"fidpass-wallet@mon-projet.iam.gserviceaccount.com",...}
```

Sous Railway, tu peux coller le JSON tel quel ; évite de modifier la clé privée à la main.

## 5. Vérification

- Redéploie le backend.
- Sur la page fidélité d’un commerce (`/fidelity/:slug`), crée une carte (nom + email).
- Après « Ta carte est prête », clique sur **Google Wallet** : une nouvelle fenêtre doit s’ouvrir sur `https://pay.google.com/gp/v/save/...` pour enregistrer la carte dans Google Wallet (sur Android ou dans Chrome).

Si tu obtiens « Google Wallet n’est pas configuré », vérifie que les deux variables sont bien définies et que le compte de service est lié à l’Issuer ID dans la console Google Wallet.

## Comportement

- **Barcode** : comme pour Apple Wallet, la carte Google Wallet affiche un **QR code** contenant l’**ID du membre**. Le **scanner en caisse** (section Scanner de l’app commerçant) fonctionne donc avec les cartes Apple et Google.
- Si les variables Google ne sont pas définies, le bouton « Google Wallet » reste affiché : au clic, l’API renvoie 503 et un message indique que Google Wallet n’est pas configuré. Les utilisateurs peuvent utiliser uniquement Apple Wallet.
