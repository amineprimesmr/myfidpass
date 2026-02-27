# Notifications : Web Push vs Apple Wallet — explication

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

Donc : **dès qu’un client a la carte dans Apple Wallet**, il peut recevoir les notifications via Apple (APNs), sans avoir d’app et sans passer par « Autoriser les notifications » dans le navigateur. Le message « Les notifications ne sont pas supportées sur ce navigateur » concerne uniquement les **Web Push** sur ce navigateur (souvent sur iPhone) ; ça n’empêche pas les notifs **Wallet** si la carte est ajoutée au Wallet.
