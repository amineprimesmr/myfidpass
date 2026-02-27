# Intégration Fidpass — Bornes, caisses et logiciels métier

Guide d’intégration pour connecter **Fidpass** (carte fidélité Apple Wallet / Google Wallet) à n’importe quel système : **borne de commande**, **logiciel de caisse**, **TPE**, **tablette**, **application métier**, etc.

---

## 1. Principe : une API universelle

Fidpass ne fournit **pas** un driver ou un plugin spécifique à chaque marque de caisse ou de borne. À la place, nous exposons une **API HTTP (REST)** que **tout système** peut appeler dès qu’il est capable de :

1. **Lire le code-barres** de la carte Fidpass (affichée sur le téléphone du client ou sur la carte physique).
2. **Envoyer une requête HTTP** (GET ou POST) vers nos serveurs, avec une clé d’authentification.

Donc : **toute caisse, borne, tablette ou logiciel** qui peut faire un appel HTTP et utiliser la valeur scannée du code-barres peut s’intégrer à Fidpass, sans développement spécifique par marque.

---

## 2. Format du code-barres Fidpass

- **Type** : PDF417 (ou équivalent 2D selon affichage).
- **Contenu (message)** : l’**identifiant unique du membre** (UUID), ex. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`.
- **Encodage** : ISO-8859-1.

Quand le client présente sa carte (Wallet ou écran), le lecteur de la caisse/borne renvoie cette chaîne. C’est cette valeur qu’il faut envoyer dans l’API sous le nom `barcode` (ou en tant qu’`memberId` selon l’endpoint).

---

## 3. Authentification

Chaque commerce dispose d’un **token d’accès** (token dashboard). Il permet d’appeler l’API au nom de ce commerce.

- **Où le trouver** : dans l’interface Fidpass (Mon espace → Partager / Intégration), ou dans l’URL du tableau de bord : `?token=...`.
- **Envoi** :
  - **Query** : `?token=VOTRE_TOKEN`
  - **Ou header** : `X-Dashboard-Token: VOTRE_TOKEN`

Pour les appels depuis un logiciel de caisse ou une borne, on recommande d’utiliser le **header** pour ne pas figurer le token dans les logs d’URL.

---

## 4. Base URL de l’API

- **Production** : `https://votre-backend.myfidpass.fr` (ou l’URL de votre API Fidpass).
- **Exemple** : si l’API est sur `https://api.myfidpass.fr`, la base est `https://api.myfidpass.fr`.

Tous les endpoints ci-dessous sont relatifs à cette base.

---

## 5. Endpoints d’intégration

### 5.1 Consulter un membre (lookup)

Permet d’afficher les infos du client (nom, solde) **sans** créditer de points. Utile pour vérifier le code ou afficher le solde sur l’écran de la caisse/borne.

**Requête**

```
GET /api/businesses/{slug}/integration/lookup?barcode={valeur_scannée}
```

- **slug** : identifiant du commerce (ex. `cafe-dupont`).
- **barcode** : valeur lue par le lecteur ( = identifiant membre, UUID).

**Authentification** : token en query (`?token=...`) ou en header `X-Dashboard-Token`.

**Réponse 200**

```json
{
  "member": {
    "id": "uuid-du-membre",
    "name": "Marie Martin",
    "email": "marie@exemple.fr",
    "points": 42,
    "last_visit_at": "2025-02-26T14:30:00.000Z"
  }
}
```

**Erreurs**

- **400** : `barcode` manquant.
- **401** : token manquant ou invalide.
- **404** : code non reconnu pour ce commerce (`MEMBER_NOT_FOUND`).

---

### 5.2 Scan + crédit en un appel (recommandé pour les bornes / caisses)

Un seul appel : vous envoyez le code-barres scanné + le montant ou « 1 passage », et Fidpass crédite les points et renvoie le nouveau solde.

**Requête**

```
POST /api/businesses/{slug}/integration/scan
Content-Type: application/json
X-Dashboard-Token: VOTRE_TOKEN

{
  "barcode": "uuid-du-membre",
  "amount_eur": 12.50,
  "visit": false
}
```

- **barcode** (obligatoire) : valeur scannée (UUID du membre).
- **amount_eur** (optionnel) : montant en euros de la vente → les points sont calculés selon la règle du commerce (ex. 1 pt / 1 €).
- **visit** (optionnel) : si `true`, enregistre un « passage » (sans montant), points selon la règle « 1 passage = X points ».
- **points** (optionnel) : nombre de points à ajouter directement (si votre système calcule déjà les points).

Au moins l’un des trois doit être renseigné : `amount_eur`, `visit: true`, ou `points`.

**Réponse 200**

```json
{
  "member": {
    "id": "uuid-du-membre",
    "name": "Marie Martin",
    "email": "marie@exemple.fr",
    "points": 52
  },
  "points_added": 10,
  "new_balance": 52
}
```

**Erreurs**

- **400** : `barcode` manquant ou aucun critère de points (`amount_eur`, `visit`, `points`).
- **401** : token manquant ou invalide.
- **404** : code non reconnu pour ce commerce (`MEMBER_NOT_FOUND`).

---

### 5.3 Créditer des points (endpoint détaillé)

Si vous préférez **identifier le membre** (via lookup ou votre propre logique) puis **créditer les points** dans un second temps :

```
POST /api/businesses/{slug}/members/{memberId}/points
Content-Type: application/json
X-Dashboard-Token: VOTRE_TOKEN

{
  "amount_eur": 12.50,
  "visit": false,
  "points": 0
}
```

- **memberId** = identifiant du membre ( = valeur du code-barres).
- Même logique que pour `/integration/scan` : `amount_eur`, `visit: true`, ou `points`.

**Réponse 200** : `{ "id": "...", "points": 52 }`

---

## 6. Exemples de code

### 6.1 cURL — Lookup

```bash
curl -s -X GET \
  "https://api.myfidpass.fr/api/businesses/cafe-dupont/integration/lookup?barcode=UUID-DU-MEMBRE" \
  -H "X-Dashboard-Token: VOTRE_TOKEN"
```

### 6.2 cURL — Scan + crédit

```bash
curl -s -X POST \
  "https://api.myfidpass.fr/api/businesses/cafe-dupont/integration/scan" \
  -H "Content-Type: application/json" \
  -H "X-Dashboard-Token: VOTRE_TOKEN" \
  -d '{"barcode":"UUID-DU-MEMBRE","amount_eur":15.00}'
```

### 6.3 JavaScript (fetch)

```javascript
const slug = "cafe-dupont";
const token = "VOTRE_TOKEN";
const apiBase = "https://api.myfidpass.fr";

// Scan + crédit
async function fidpassScan(barcode, amountEur) {
  const res = await fetch(`${apiBase}/api/businesses/${slug}/integration/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dashboard-Token": token,
    },
    body: JSON.stringify({ barcode, amount_eur: amountEur }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Exemple : après scan et saisie du montant
fidpassScan("a1b2c3d4-e5f6-7890-abcd-ef1234567890", 12.5)
  .then((data) => console.log("Points ajoutés:", data.points_added, "Nouveau solde:", data.new_balance))
  .catch((e) => console.error("Erreur:", e.message));
```

### 6.4 Python

```python
import requests

API_BASE = "https://api.myfidpass.fr"
SLUG = "cafe-dupont"
TOKEN = "VOTRE_TOKEN"

def fidpass_scan(barcode: str, amount_eur: float = None, visit: bool = False):
    r = requests.post(
        f"{API_BASE}/api/businesses/{SLUG}/integration/scan",
        headers={
            "Content-Type": "application/json",
            "X-Dashboard-Token": TOKEN,
        },
        json={"barcode": barcode, "amount_eur": amount_eur, "visit": visit},
    )
    r.raise_for_status()
    return r.json()

# Exemple
data = fidpass_scan("uuid-membre", amount_eur=10.0)
print("Points ajoutés:", data["points_added"], "Solde:", data["new_balance"])
```

---

## 7. Codes d’erreur et bonnes pratiques

| Code HTTP | Code métier        | Signification                          | Action recommandée                    |
|-----------|--------------------|----------------------------------------|---------------------------------------|
| 400       | BARCODE_MISSING    | Paramètre `barcode` manquant           | Vérifier que le scan a bien été lu    |
| 400       | NO_POINTS_SPECIFIED| Aucun montant / passage / points       | Envoyer `amount_eur`, `visit` ou `points` |
| 401       | —                  | Token manquant ou invalide             | Vérifier le token du commerce         |
| 404       | MEMBER_NOT_FOUND   | Code non reconnu pour ce commerce     | Carte d’un autre commerce ou invalide ; afficher « Code non reconnu » |

- **Timeouts** : prévoir un timeout (ex. 5–10 s) et afficher un message clair en cas d’échec.
- **Réseau** : en cas d’échec temporaire, proposer « Réessayer » ou une file de requêtes à rejouer côté caisse/borne si possible.

---

## 8. Cas d’usage selon le type de système

### Caisse enregistrée / logiciel de caisse

- Au moment du paiement : scan du code-barres Fidpass (Wallet ou écran client).
- Envoi d’un **POST /integration/scan** avec `barcode` + `amount_eur` (montant de la vente).
- Affichage du message retour (ex. « +X points, solde Y ») ou erreur « Code non reconnu ».

### Borne de commande

- Après la commande : le client scanne sa carte Fidpass sur un lecteur branché à la borne.
- La borne envoie **POST /integration/scan** avec `barcode` et `amount_eur` (montant de la commande).
- Optionnel : **GET /integration/lookup** avant paiement pour afficher le solde ou le nom du client.

### Tablette dédiée « fidélité »

- Une tablette à part avec uniquement la page Fidpass (mode scanner) ou votre propre app qui appelle l’API.
- Scan du téléphone du client → **POST /integration/scan** avec `barcode` + montant ou `visit: true`.

### TPE / terminal de paiement

- Si le TPE peut exécuter un script ou appeler une URL après paiement : envoyer **POST /integration/scan** avec le `barcode` (saisi ou lu par un lecteur connecté) et le montant payé.

### Logiciel métier (gestion de stock, CRM, etc.)

- Même principe : dès que vous avez le `barcode` (membre) et le montant ou le type d’opération, un seul appel **POST /integration/scan** suffit.

---

## 9. Checklist pour les intégrateurs

- [ ] Récupérer le **slug** du commerce et le **token** (dashboard) auprès du commerçant ou depuis l’interface Fidpass.
- [ ] Configurer la **base URL** de l’API (production).
- [ ] S’assurer que le **lecteur** renvoie bien la **valeur du code-barres** (UUID) et non un autre format.
- [ ] Envoyer le token en **header** `X-Dashboard-Token` (ou en query pour les tests).
- [ ] Pour un « scan + crédit » en un appel : utiliser **POST /api/businesses/{slug}/integration/scan** avec `barcode` + `amount_eur` et/ou `visit`.
- [ ] Gérer les réponses **4xx** et les timeouts (message utilisateur, réessai si pertinent).
- [ ] Ne pas logger ni stocker le token en clair dans des fichiers accessibles.

---

## 10. Résumé

- **Une seule API** : tout système qui peut faire un **HTTP GET/POST** et utiliser la **valeur scannée du code-barres** (UUID membre) peut s’intégrer à Fidpass.
- **Deux endpoints principaux** :
  - **GET /integration/lookup** : consulter un membre (affichage solde / nom).
  - **POST /integration/scan** : scan + crédit de points en un appel (recommandé pour bornes et caisses).
- **Authentification** : token du commerce (dashboard) en header ou en query.
- Pas de driver ou plugin par marque : l’intégration est **universelle** par le biais de cette API.

Pour toute question technique ou partenariat (éditeurs de caisse, bornes, TPE), contacter l’équipe Fidpass.
