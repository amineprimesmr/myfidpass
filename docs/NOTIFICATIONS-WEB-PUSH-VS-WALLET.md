# Notifications : Web Push vs Apple Wallet — explication

## On utilise bien PassKit ?

**Oui.** Fidpass utilise **PassKit** (Apple Wallet) pour les cartes fidélité sur iPhone :

- Génération des fichiers **.pkpass** (carte dans le Wallet).
- **Web Service URL** dans le pass pour que l’iPhone enregistre l’appareil auprès de notre API.
- Envoi des notifications **push** aux appareils enregistrés via les serveurs Apple (APNs).

En parallèle, le site propose aussi les **Web Push** (navigateur) pour Android / ordinateur ; sur iPhone, c’est le **Wallet (PassKit)** qui est utilisé pour les notifications.

---

## Pourquoi « Aucun appareil enregistré » + « Autoriser les notifications » sur iPhone ?

**Ce qui se passe :**

1. **Tu as des membres** → normal, la création de carte (nom, email) enregistre bien les membres en base.
2. **Le dashboard affiche « Aucun appareil enregistré »** → ça compte uniquement les appareils qui ont **déjà** envoyé leur jeton au serveur :
   - **Apple Wallet** : l’iPhone doit appeler notre API au moment où tu ajoutes le pass. Pour ça, le **fichier .pkpass** doit contenir une URL (webServiceURL). Si cette URL n’est pas dans le pass (parce que la variable `PASSKIT_WEB_SERVICE_URL` n’est pas définie sur le backend), l’iPhone **ne nous contacte jamais** → 0 appareil.
   - **Web Push** : le navigateur doit avoir affiché « Autoriser les notifications » et le client doit avoir accepté ; sur iPhone en Safari/Chrome c’est souvent **non supporté** ou limité.
3. **Quand tu scannes avec ton iPhone** pour ajouter la carte, tu vois encore « Autoriser les notifications » → c’est le **navigateur** qui demande la permission (Web Push). Sur iPhone ça ne marche souvent pas. **Mais** si le pass avait bien l’URL d’enregistrement, une fois la carte **ajoutée au Wallet**, c’est **Apple** qui enregistrerait l’appareil (sans passer par cette popup). Le problème est donc en amont : **le pass est généré sans URL**, donc même après « Ajouter à Apple Wallet », l’iPhone ne nous appelle pas.

**En résumé :** le message « Autoriser les notifications » sur iPhone est pour la notif **navigateur** (Web Push), peu fiable sur iOS. Pour que ton iPhone compte comme « appareil enregistré », il faut que **le pass contienne l’URL du serveur** → variable **`PASSKIT_WEB_SERVICE_URL`** sur Railway, puis **supprimer la carte du Wallet et la ré-ajouter** (car les anciens passes n’ont pas l’URL).

---

## Pourquoi la commande curl marche mais pas mon vrai iPhone ?

La commande curl s’exécute depuis ton ordinateur : la requête part de ton Mac vers le serveur, qui répond bien (201). Quand tu ajoutes le pass sur l’**iPhone**, c’est l’appareil (ou le réseau opérateur) qui doit appeler la même URL. Si notre serveur ne reçoit rien, le blocage est **entre l’iPhone et nous** : réglages Wallet (mises à jour activées), réseau (4G / WiFi, VPN), ou certificat SSL. Voir `docs/ANALYSE-NOTIFICATIONS-PASSKIT-COMPLETE.md` pour le détail.

---

## « Entreprise xxx introuvable » sur la page fidélité

Si l’URL utilise un slug avec une **casse différente** (ex. `alexbarber` au lieu de `alexBarber`), la page affichait « Entreprise introuvable ». Le site accepte maintenant le slug **sans tenir compte de la casse** : `myfidpass.fr/fidelity/alexbarber` et `myfidpass.fr/fidelity/alexBarber` affichent la même carte.

---

## Pourquoi « Les notifications ne sont pas supportées sur ce navigateur » ?

Sur **iPhone**, quand le client ouvre la page de la carte dans **Safari** ou **Chrome** :

- Les **notifications Web Push** (navigateur) ne sont **pas** ou peu supportées :
  - Safari iOS ne les gère correctement qu’à partir d’iOS 16.4, et souvent uniquement si le site est ajouté à l’écran d’accueil (PWA).
  - Chrome sur iOS utilise le moteur Apple (WebKit) et n’a pas les mêmes capacités que sur Android.
- Donc le site affiche « Les notifications ne sont pas supportées sur ce navigateur » : c’est une **limitation du navigateur sur iPhone**, pas un bug Fidpass.

Sur **Android** (Chrome) ou **ordinateur** (Chrome, Firefox, Edge), les Web Push fonctionnent : le client peut autoriser les notifications et les recevoir.

---

## Comment les autres logiciels carte fidélité / Wallet envoient des notifications ?

Ils n’utilisent **pas** les Web Push du navigateur pour les clients qui ont la carte dans le **Wallet**.

### 1. Clients avec la carte dans **Apple Wallet** (iPhone)

- Quand le client **ajoute la carte à Apple Wallet**, l’iPhone enregistre automatiquement son appareil auprès de notre serveur et envoie un **jeton push Apple (APNs)**.
- Pour « notifier » ce client, on envoie une **notification APNs** à Apple avec ce jeton. L’iPhone reçoit le signal, redemande la dernière version du pass à notre serveur, et **Apple peut afficher une notification** du type « Votre carte [Commerce] a été mise à jour » (éventuellement avec un message personnalisé).
- Aucune app à part Wallet n’est nécessaire. C’est le **même principe** que les autres solutions carte fidélité + Apple Wallet.

Dans Fidpass :

- On **enregistre déjà** le jeton push quand le client ajoute la carte au Wallet.
- L’**envoi APNs** est en place : quand tu envoies une notification depuis le dashboard, les clients qui ont la carte dans **Apple Wallet** reçoivent une mise à jour (et donc une notif) via APNs, sans avoir à « autoriser les notifications » dans le navigateur. Le backend utilise le **même certificat** que pour signer les passes (SIGNER_CERT_PEM / SIGNER_KEY_PEM ou équivalent). Aucune config supplémentaire nécessaire si les passes Apple Wallet fonctionnent déjà.

### 2. Clients sur **navigateur** (Android Chrome, desktop, ou PWA sur iPhone)

- Là on utilise les **Web Push** (autorisation dans le navigateur).
- Sur iPhone dans le navigateur « normal », c’est limité ; sur Android et desktop, ça fonctionne bien.

### 3. Application mobile dédiée (type Starbucks)

- Ils ont une **app** installée, qui enregistre un jeton push (APNs / FCM). Pas le cas de Fidpass pour l’instant : pas d’app, seulement site + Wallet.

---

## En résumé

| Appareil / Contexte | Qui reçoit les notifs ? | Comment ? |
|---------------------|-------------------------|-----------|
| **iPhone + carte dans Apple Wallet** | Oui | APNs (mise à jour du pass). Pas besoin d’autorisation navigateur. |
| **Android / desktop + autorisation navigateur** | Oui | Web Push (après « Autoriser les notifications » sur le site). |
| **iPhone uniquement dans Safari/Chrome (sans carte Wallet)** | Non / limité | Web Push peu ou pas supporté sur iOS dans ce cas. |

---

## « Aucun appareil enregistré » alors que j'ai ajouté la carte en Apple Wallet

Si tu as bien ajouté la carte au Wallet mais que le dashboard affiche toujours 0 appareil, c'est en général que **le pass a été généré sans URL d'enregistrement**.

Le backend doit avoir la variable d'environnement **`PASSKIT_WEB_SERVICE_URL`** = URL publique de ton API (ex. `https://api.myfidpass.fr`, sans slash final). C'est cette URL qui est inscrite dans le pass ; au moment où l'iPhone ajoute le pass au Wallet, il appelle cette URL pour s'enregistrer. Si la variable n'est pas définie, le pass ne contient pas l'URL et l'iPhone ne contacte jamais le serveur.

**Checklist à faire (dans l’ordre) :**

1. **Railway** → ton projet → service **backend** → **Variables** → ajoute :
   - **Name** : `PASSKIT_WEB_SERVICE_URL`
   - **Value** : `https://api.myfidpass.fr` (exactement l’URL publique de ton API, **sans** slash final)
2. **Redéploie** le backend (bouton Redeploy ou nouveau push sur le dépôt).
3. **Sur ton iPhone** : supprime la carte du Wallet (carte déjà ajoutée = ancien pass sans URL).
4. Retourne sur la page de ta carte (myfidpass.fr/fidelity/ton-slug), reclique sur **« Apple Wallet »** et ajoute à nouveau la carte. Ce **nouveau** pass contiendra l’URL ; l’iPhone appellera alors le serveur et s’enregistrera.
5. Dans le dashboard, section **Notifications**, rafraîchis la page : tu devrais voir au moins **1 appareil (Apple Wallet)**.

**Test :** ouvre **https://api.myfidpass.fr/v1** dans un navigateur — tu dois voir un JSON avec `"ok": true`. Si 404, le chemin `/v1` n’est pas exposé.

Si après ça tu vois encore « Aucun appareil » : ouvre les **logs Railway** (backend). Au moment où tu ajoutes le pass au Wallet, tu devrais voir une ligne du type `[PassKit] Appareil enregistré pour le membre ...`. Si tu vois `[PassKit] Pass généré SANS webServiceURL`, la variable n’est pas prise en compte (vérifier le nom exact et redéployer).

---

Donc : **dès qu’un client a la carte dans Apple Wallet**, il peut recevoir les notifications via Apple (APNs), sans avoir d’app et sans passer par « Autoriser les notifications » dans le navigateur. Le message « Les notifications ne sont pas supportées sur ce navigateur » concerne uniquement les **Web Push** sur ce navigateur (souvent sur iPhone) ; ça n’empêche pas les notifs **Wallet** si la carte est ajoutée au Wallet.
