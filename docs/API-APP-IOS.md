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
  "locationAddress": "string | undefined"
}
```

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
| Sync stats  | GET    | `/api/businesses/:slug/dashboard/stats` |
| Sync membres | GET   | `/api/businesses/:slug/dashboard/members` |
| Sync transactions | GET | `/api/businesses/:slug/dashboard/transactions` |
| Scan + points | POST  | `/api/businesses/:slug/integration/scan` |
| Lookup client | GET   | `/api/businesses/:slug/integration/lookup?barcode=...` |

Tous les chemins sont relatifs à la base **`https://api.myfidpass.fr`**.
