# API MyFidpass — doc pour l’app iOS

Base URL : **`https://api.myfidpass.fr`**

Toutes les réponses JSON en cas d’erreur ont la forme : `{ "error": "Message lisible" }` (et éventuellement `code` pour certains endpoints). En cas de succès, le body est décrit ci‑dessous.

---

## 1. Auth

### 1.1 Connexion email / mot de passe

- **Méthode + chemin** : `POST /api/auth/login`
- **Body attendu** : `{ "email": "string", "password": "string" }`
- **Réponse 200** :
```json
{
  "user": { "id": "uuid", "email": "string", "name": "string | null" },
  "token": "string (JWT)",
  "businesses": [
    { "id": "uuid", "name": "string", "slug": "string", "organization_name": "string", "created_at": "string ISO", "dashboard_token": "string" }
  ]
}
```
- **Erreurs** : 400 (email/password manquants), 401 (email ou mot de passe incorrect)

---

### 1.2 Connexion Google

- **Méthode + chemin** : `POST /api/auth/google`
- **Body attendu** : `{ "idToken": "string" }` ou `{ "credential": "string" }` (token ID Google côté client)
- **Réponse 200** : même structure que login (user, token, businesses)
- **Erreurs** : 400 (config ou token manquant), 401 (token Google invalide ou expiré)

---

### 1.3 Connexion Apple

- **Méthode + chemin** : `POST /api/auth/apple`
- **Body attendu** : `{ "idToken": "string", "name": "string (optionnel)", "email": "string (optionnel)" }`  
  Le **idToken** est le JWT renvoyé par Sign in with Apple. En première connexion, l’app peut envoyer `name` et `email` si Apple les fournit côté client.
- **Réponse 200** : même structure que login (user, token, businesses)
- **Erreurs** : 400 (config ou token manquant, email non fourni par Apple), 401 (token invalide / expiré / audience incorrecte)

*Note : le site web utilise aussi un flux `POST /api/auth/apple-redirect` + `GET /api/auth/apple-exchange?code=xxx` pour le redirect Apple ; l’app native peut rester sur `POST /api/auth/apple` avec le JWT.*

---

## 2. Données commerçant (sync)

L’app peut reconstituer tout le nécessaire avec les endpoints suivants. Auth : **`Authorization: Bearer <token>`** (JWT obtenu au login / Google / Apple).

### 2.1 Utilisateur + liste des commerces

- **Méthode + chemin** : `GET /api/auth/me`
- **En-tête** : `Authorization: Bearer <token>`
- **Réponse 200** :
```json
{
  "user": { "id": "uuid", "email": "string", "name": "string | null" },
  "businesses": [
    { "id": "uuid", "name": "string", "slug": "string", "organization_name": "string", "created_at": "string", "dashboard_token": "string" }
  ],
  "subscription": { "status": "string", "planId": "string | null" } | null,
  "hasActiveSubscription": true | false
}
```
- **Erreur 401** : `{ "error": "Session invalide ou expirée", "code": "expired" | "invalid" | "user_not_found" }`

### 2.2 Paramètres / design d’un commerce (carte, couleurs, localisation)

- **Méthode + chemin** : `GET /api/businesses/:slug/dashboard/settings`  
  `:slug` = le `slug` d’un commerce dans la liste `businesses`.
- **Auth** : `Authorization: Bearer <token>` **ou** `X-Dashboard-Token: <dashboard_token>` (ou `?token=...`)
- **Réponse 200** :
```json
{
  "organizationName": "string",
  "backgroundColor": "#hex",
  "foregroundColor": "#hex",
  "labelColor": "#hex",
  "backTerms": "string | undefined",
  "backContact": "string | undefined",
  "locationLat": number | undefined,
  "locationLng": number | undefined,
  "locationRelevantText": "string | undefined",
  "locationRadiusMeters": number | undefined,
  "locationAddress": "string | undefined",
  "requiredStamps": number | undefined,
  "programType": "points" | "stamps" | undefined,
  "pointsPerEuro": number | undefined,
  "pointsPerVisit": number | undefined
}
```
- **programType** : `"points"` ou `"stamps"`. À utiliser après un scan pour afficher soit le champ « Montant du panier (€) », soit uniquement « +1 tampon ».
- **pointsPerEuro** : nombre de points par euro (ex. 1). Utilisé quand on envoie `amount_eur` au scan.
- **pointsPerVisit** : points ajoutés pour « 1 passage » (optionnel).

### 2.2bis Mise à jour des paramètres « Ma Carte » (PATCH)

- **Méthode + chemin** : `PATCH /api/businesses/:slug/dashboard/settings`
- **Auth** : idem (Bearer ou dashboard token)
- **Body JSON (snake_case ou camelCase)** :
```json
{
  "organization_name": "string (optionnel)",
  "background_color": "string hex avec ou sans # (optionnel)",
  "foreground_color": "string hex avec ou sans # (optionnel)",
  "required_stamps": number | null
}
(optionnel : nombre de tampons pour la carte type tampons)
- **Réponse** : `200` ou `204` (sans body obligatoire). Met à jour en base les paramètres utilisés par le SaaS et la génération du pass.

### 2.3 Stats du commerce

- **Méthode + chemin** : `GET /api/businesses/:slug/dashboard/stats`
- **Auth** : idem (Bearer ou dashboard token)
- **Réponse 200** :
```json
{
  "membersCount": number,
  "pointsThisMonth": number,
  "transactionsThisMonth": number,
  "newMembersLast7Days": number,
  "newMembersLast30Days": number,
  "inactiveMembers30Days": number,
  "inactiveMembers90Days": number,
  "pointsAvg": number,
  "businessName": "string"
}
```

### 2.4 Liste des membres (clients / cartes)

- **Méthode + chemin** : `GET /api/businesses/:slug/dashboard/members`  
  Query : `search`, `limit`, `offset`, `filter` (inactive30 | inactive90 | points50), `sort` (last_visit | points | name | created).
- **Auth** : idem
- **Réponse 200** :
```json
{
  "members": [
    { "id": "uuid", "name": "string", "email": "string", "points": number, "created_at": "string", "last_visit_at": "string | null" }
  ],
  "total": number
}
```

### 2.5 Historique des transactions (tampons / points)

- **Méthode + chemin** : `GET /api/businesses/:slug/dashboard/transactions`  
  Query : `limit`, `offset`, `memberId`, `days` (7 | 30 | 90), `type` (points_add | visit).
- **Auth** : idem
- **Réponse 200** :
```json
{
  "transactions": [
    {
      "id": "uuid",
      "member_id": "uuid",
      "member_name": "string",
      "member_email": "string",
      "type": "points_add",
      "points": number,
      "metadata": "string | null (JSON string)",
      "created_at": "string"
    }
  ],
  "total": number
}
```

**Sync recommandée pour l’app** : après login, appeler `GET /api/auth/me`, puis pour chaque `business.slug` : `GET .../dashboard/settings`, `GET .../dashboard/stats`, `GET .../dashboard/members`, et éventuellement `GET .../dashboard/transactions?limit=50` pour l’historique récent.

---

## 3. Enregistrement d’un scan (passage / tampon)

Quand l’app scanne le QR code d’une carte, le code contient l’**id du membre** (UUID). Un seul endpoint permet de valider le scan et d’ajouter les points en un appel.

### 3.1 Scan + crédit de points (recommandé)

- **Méthode + chemin** : `POST /api/businesses/:slug/integration/scan`
- **Auth** : `Authorization: Bearer <token>` ou `X-Dashboard-Token: <dashboard_token>`
- **Body attendu** :
```json
{
  "barcode": "string (valeur lue = member id / UUID)",
  "amount_eur": number (optionnel, montant en € pour calcul des points),
  "visit": true (optionnel, compter 1 passage),
  "points": number (optionnel, points à ajouter directement)
}
```
  Au moins un de : `amount_eur` > 0, `visit: true`, ou `points` > 0. Sinon 400.
- **Réponse 200** :
```json
{
  "member": { "id": "uuid", "name": "string", "email": "string", "points": number },
  "points_added": number,
  "new_balance": number
}
```
- **Erreurs** : 400 (barcode manquant ou aucun points spécifié), 404 (code non reconnu pour ce commerce, `code: "MEMBER_NOT_FOUND"`)

### 3.2 Lookup seul (optionnel)

Si l’app veut d’abord afficher le client sans ajouter de points :

- **Méthode + chemin** : `GET /api/businesses/:slug/integration/lookup?barcode=<member_id>`
- **Auth** : idem
- **Réponse 200** : `{ "member": { "id", "name", "email", "points", "last_visit_at" } }`  
  404 si code inconnu.

### 3.3 Ajout de points en connaissant déjà le memberId

- **Méthode + chemin** : `POST /api/businesses/:slug/members/:memberId/points`
- **Auth** : idem
- **Body** : `{ "points"?: number, "amount_eur"?: number, "visit"?: true }` (même logique que scan)
- **Réponse 200** : `{ "id": "uuid", "points": number, "points_added": number }`

---

## Récap des endpoints pour l’app

| Usage        | Méthode | Chemin |
|-------------|--------|--------|
| Login       | POST   | `/api/auth/login` |
| Google      | POST   | `/api/auth/google` |
| Apple       | POST   | `/api/auth/apple` |
| Sync user   | GET    | `/api/auth/me` |
| Sync commerce (paramètres) | GET | `/api/businesses/:slug/dashboard/settings` |
| Mise à jour design « Ma Carte » | PATCH | `/api/businesses/:slug/dashboard/settings` |
| Sync stats  | GET    | `/api/businesses/:slug/dashboard/stats` |
| Sync membres | GET   | `/api/businesses/:slug/dashboard/members` |
| Sync transactions | GET | `/api/businesses/:slug/dashboard/transactions` |
| Scan + points | POST  | `/api/businesses/:slug/integration/scan` |
| Lookup client | GET   | `/api/businesses/:slug/integration/lookup?barcode=...` |
| Télécharger pass Wallet | GET | `/api/businesses/:slug/members/:memberId/pass?template=classic` |

Tous les chemins sont relatifs à la base **`https://api.myfidpass.fr`**.

---

## 4. Carte Apple Wallet (étape 8)

Le backend génère déjà des passes signés. Pour « Tester dans l'Apple Wallet » dans l’app :

- **GET** `/api/businesses/:slug/members/:memberId/pass?template=classic`
- **Auth** : Bearer token ou X-Dashboard-Token
- **Réponse** : fichier `.pkpass` (Content-Type: application/vnd.apple.pkpass)

Il faut un **memberId** (un membre du commerce). L’app peut prendre le premier membre de la liste ou en créer un de test. Le Pass Type ID est déjà configuré côté backend.

## 5. Notifications (étape 9)

- **Clients** : après un scan, le backend envoie déjà la mise à jour PassKit au pass du client (points à jour + message). Rien à ajouter.
- **App commerçant** : les routes `POST /api/device/register` et `POST /api/businesses/:slug/notify` ne sont pas encore en place. À ajouter si tu veux des push type « Nouveau scan » dans l’app.

---

## 6. Scan et animation (Dynamic Island / post-scan)

Après avoir scanné le QR code d’une carte, l’app doit adapter l’UI selon le **type de carte** du commerce (points ou tampons). Les paramètres sont dans **`GET /api/businesses/:slug/dashboard/settings`** : `program_type` (`"points"` | `"stamps"`), `required_stamps`, `points_per_euro`, `points_per_visit`.

### 6.1 Carte en tampons uniquement

- **Comportement** : un scan = **un tampon** ajouté. Aucun montant à saisir.
- **UI recommandée** : afficher une vue type Dynamic Island (ou modal) **plus grande / étendue** avec :
  - Nom du client (optionnel, via `GET .../integration/lookup?barcode=xxx` si besoin).
  - Un seul bouton : **« +1 tampon »** (ou « Valider 1 tampon »).
- **Appel** : `POST /api/businesses/:slug/integration/scan`  
  Body : `{ "barcode": "<member_id>", "visit": true }`  
  Réponse : `{ "member", "points_added": 1, "new_balance" }` (les points = nombre de tampons côté backend).

### 6.2 Carte en points (ex. 1 point = 1 €)

- **Comportement** : le commerçant saisit le **montant du panier (€)** ; les points sont calculés côté backend (ex. `amount_eur × points_per_euro`). Option possible : « 1 passage » = `points_per_visit` points.
- **UI recommandée** : même idée d’animation / Dynamic Island **plus grande** avec :
  - Champ **« Montant du panier (€) »** (clavier numérique).
  - Bouton **« Ajouter les points »** (et éventuellement « 1 passage » si `points_per_visit` > 0).
- **Appel** : `POST /api/businesses/:slug/integration/scan`  
  Body : `{ "barcode": "<member_id>", "amount_eur": 25.50 }`  
  ou `{ "barcode": "<member_id>", "visit": true }` pour 1 passage.  
  Réponse : `{ "member", "points_added", "new_balance" }`.

### 6.3 Récap

| Type carte | Après le scan | Body envoyé |
|------------|----------------|-------------|
| Tampons    | Afficher « +1 tampon », pas de champ montant | `{ "barcode": "...", "visit": true }` |
| Points     | Afficher « Montant du panier (€) » + valider | `{ "barcode": "...", "amount_eur": X }` ou `{ "barcode": "...", "visit": true }` |

- **Dynamic Island** : prévoir une **vue étendue** (expanded) pour que le montant soit saisissable confortablement en mode points, et une vue simple « +1 tampon » en mode tampons. Le backend ne change pas ; seul l’affichage et le body de l’appel varient selon `program_type` (et éventuellement `required_stamps` pour l’affichage X/Y tampons).
