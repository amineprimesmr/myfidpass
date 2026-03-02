# Icône de notification = logo de l’établissement

## Analyse du système (pourquoi le logo ne s’affichait pas)

### Deux canaux de notification

1. **Web Push (navigateur / PWA)**  
   Le backend envoie un payload JSON (title, body, **icon**) au navigateur. Le Service Worker affiche la notification avec `showNotification(title, options)` où `options.icon` = logo.

2. **Apple Wallet (PassKit)**  
   Une push APNs indique à l’iPhone « pass mis à jour ». L’icône affichée dans la notification vient **du pass** (fichiers `icon.png` dans le `.pkpass`), pas du payload push. Le backend génère ces icônes à partir du logo dans `pass.js`.

### Causes possibles du logo absent

| Cause | Web Push | Apple Wallet |
|--------|----------|--------------|
| **Logo non enregistré en base** | `business.logo_base64` vide → pas d’icône envoyée | Pass généré avec l’icône par défaut (cercle gris) |
| **Payload trop gros (limite ~4 Ko)** | Une data URL base64 (logo 64×64) peut faire dépasser la limite FCM → push rejeté ou icône ignorée | N/A (pas d’icône dans le payload APNs) |
| **Service Worker ancien** | Ancien `sw.js` ne lisait pas `data.icon` (bug corrigé : `await event.data.json()`) | N/A |
| **Pass jamais mis à jour** | N/A | L’icône du pass est celle du **dernier** .pkpass reçu. Si le pass n’a pas été re-téléchargé depuis l’ajout du logo, l’ancienne icône reste affichée. |

## Solution mise en place

### Web Push : URL d’icône au lieu de data URL

- **Nouvel endpoint public** : `GET /api/businesses/:slug/notification-icon`  
  Retourne une image PNG 96×96 (logo redimensionné). Pas d’auth : le navigateur charge cette URL au moment d’afficher la notification.

- **Payload** : au lieu d’envoyer `icon: "data:image/png;base64,..."` (lourd), on envoie `icon: "https://api.../api/businesses/{slug}/notification-icon"`. Le payload reste petit (< 4 Ko), et le navigateur récupère l’icône via cette URL.

- **Backend** : dans `POST /:slug/notify` et `POST /:slug/notifications/send`, on construit `iconUrl` à partir de `API_URL` (ou `req.protocol` + host) et on l’ajoute au payload uniquement si `business.logo_base64` est présent.

### Apple Wallet

- Dans `pass.js`, si `business.logo_base64` est présent, on génère `icon.png`, `icon@2x.png`, `icon@3x.png` à partir du logo et on les met dans le .pkpass. Lorsque l’iPhone re-télécharge le pass (après une notif ou à l’ouverture du pass), la nouvelle icône s’affiche dans les notifications suivantes.

## Configuration

- **API_URL** (production) : en production, définir `API_URL` (ex. `https://api.myfidpass.fr`) pour que l’URL d’icône dans le payload soit correcte. Sinon le backend utilise `req.protocol` et `Host`, ce qui peut être faux derrière un proxy.

## Vérifier

1. **Logo bien en base** : depuis le SaaS ou l’app, enregistrer un logo pour l’établissement. Vérifier que `GET /api/businesses/:slug/dashboard/settings` renvoie bien un `logo_url` (ou que le commerce a un logo).
2. **Web Push** : envoyer une notif depuis l’app/SaaS ; sur un client abonné (navigateur), l’icône de la notification doit être le logo (ou le fallback `/assets/logo.png` si pas de logo).
3. **Apple Wallet** : après envoi d’une notif, l’iPhone refetch le pass. La **prochaine** notification Wallet doit afficher le logo (si le pass a bien été régénéré avec le logo).
