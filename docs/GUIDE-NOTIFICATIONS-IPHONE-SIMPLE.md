# Notifications iPhone — guide simple

## Le problème en une phrase

Le dashboard affiche **« Aucun appareil enregistré »** parce que ton iPhone n’a pas encore dit au serveur « je suis là ». Pour que ça marche, il faut **supprimer la carte du Wallet**, en **télécharger une nouvelle** depuis le site, puis **l’ajouter à nouveau** au Wallet.

---

## Ce que tu dois faire (dans l’ordre)

### 1. Sur ton iPhone

- Ouvre l’app **Wallet** (Portefeuille).
- Trouve la **carte Fidpass** de ton commerce.
- Supprime-la (appui long ou « … » → Supprimer).

### 2. Télécharger une nouvelle carte

- Sur ton **téléphone** ou ton **ordinateur**, ouvre un navigateur.
- Va sur la page de ta carte en utilisant **exactement le lien indiqué dans le dashboard, section « Partager »** (ex. `https://www.myfidpass.fr/fidelity/ton-slug`).  
  **Important :** utilise le **lien affiché** (avec le slug), pas le nom de l’établissement. Ex. : si ton commerce s’appelle « alexBarber », l’URL peut être `.../fidelity/alex-barber` ou un autre slug — copie le lien depuis « Partager ».
- Si la page te demande **nom** et **email**, remplis et valide (ça crée ou retrouve ta carte).
- Clique sur le bouton **« Apple Wallet »**.
- Tu dois voir une proposition d’**ajouter la carte au Wallet**. Ne l’ajoute pas tout de suite si tu es sur l’ordi ; sur l’iPhone tu peux l’ajouter directement.

### 3. Ajouter la carte au Wallet sur l’iPhone

- Si tu as cliqué « Apple Wallet » sur l’iPhone : ajoute la carte quand le téléphone le propose.
- Si tu étais sur l’ordi : envoie-toi le lien de la page (ou scanne le QR du dashboard) avec ton iPhone, ouvre le lien sur l’iPhone, clique « Apple Wallet » et ajoute la carte.

### 4. Vérifier dans le dashboard

- Ouvre le **dashboard** Fidpass (myfidpass.fr/app).
- Va dans **« Notifications »** (menu à gauche).
- **Rafraîchis la page** (F5 ou tire pour rafraîchir sur mobile).
- Tu devrais voir quelque chose comme : **« 1 appareil(s) peuvent recevoir les notifications (Apple Wallet) »** au lieu de « Aucun appareil enregistré ».

---

## Si ça ne marche toujours pas

- Attends **1 à 2 minutes** après avoir ajouté la carte au Wallet, puis rafraîchis encore la section Notifications.
- Vérifie que sur **Railway** (projet → backend → Variables) tu as bien la variable **`PASSKIT_WEB_SERVICE_URL`** = **`https://api.myfidpass.fr`** (sans slash à la fin). Si tu l’as ajoutée récemment, fais un **Redeploy** du backend et refais les étapes 1 à 4.

---

## En résumé

1. Supprimer la carte du Wallet.  
2. Aller sur la page de la carte (lien du type myfidpass.fr/fidelity/ton-slug).  
3. Cliquer « Apple Wallet » pour télécharger une **nouvelle** carte.  
4. L’ajouter au Wallet sur l’iPhone.  
5. Rafraîchir la section Notifications du dashboard.

Après ça, le dashboard devrait afficher au moins 1 appareil.
