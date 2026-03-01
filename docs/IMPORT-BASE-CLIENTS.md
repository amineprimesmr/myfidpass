# Importer la base clients d’un commerce dans MyFidpass

Quand tu démarches un commerce qui a **déjà une base clients** (ancien logiciel fidélité, caisse, Excel, etc.), il faut que ces clients soient **aussi dans MyFidpass** pour que :
- le commerçant garde ses clients et leurs points/tampons,
- les cartes (Apple Wallet, etc.) puissent être utilisées tout de suite.

Voici **tous les scénarios** et **comment ça se passe** de A à Z.

---

## 1. D’où vient la base client du commerçant ?

En général, la base existe dans l’un de ces endroits :

| Source | Ce qu’on en tire | Format typique |
|--------|-------------------|----------------|
| **Ancien logiciel fidélité** | Clients + parfois points/tampons | Export CSV, Excel, ou API |
| **Logiciel de caisse / POS** | Clients (nom, email, tél.) | CSV, Excel (Sora Caisse, Shopcaisse, etc.) |
| **Tableur (Excel, Google Sheets)** | Liste manuelle | CSV, XLSX |
| **CRM / outil marketing** | Contacts (email, nom) | CSV, export Mailchimp/Klaviyo, etc. |
| **Autre app / logiciel** | Si une API existe | API REST (à brancher) |

Donc soit le commerçant a un **fichier** (CSV, Excel), soit un **logiciel avec API** qu’on peut connecter.

---

## 2. Ce qu’on a besoin dans MyFidpass pour un “membre”

Dans notre logiciel, un client (membre) c’est :

- **email** (obligatoire)
- **name** (obligatoire)
- **points** (optionnel au départ, on peut importer un solde initial)

Un membre est toujours rattaché à **un commerce** (business). Donc pour importer, il faut : **commerce déjà créé** dans MyFidpass, puis **liste de lignes** : email, nom, et éventuellement points.

---

## 3. Scénarios possibles (de A à Z)

### Scénario A : Le commerçant a un fichier CSV ou Excel

**Cas typique** : il exporte ses clients depuis sa caisse ou un tableur.

**Étapes :**

1. **Export côté commerçant**  
   Depuis son logiciel / Excel : export CSV (ou Excel) avec au minimum **email** et **nom** (colonnes peuvent s’appeler "Email", "E-mail", "Nom", "Prénom", "Client", etc.).

2. **Format attendu pour MyFidpass**  
   Fichier CSV avec en-tête, par exemple :
   - `email` (ou `Email`, `e-mail`)
   - `name` (ou `nom`, `Nom`, `Prénom`, ou "Prénom Nom" en une colonne)

   Optionnel :
   - `points` (ou `Points`, `tampons`, `solde`) pour importer un solde de points/tampons existant.

3. **Import dans MyFidpass**  
   - Soit via l’**interface** (si on a mis en place un “Import CSV” dans le dashboard) : le commerçant choisit son commerce, uploade le CSV, on crée les membres (et on gère les doublons, voir plus bas).  
   - Soit via l’**API** : un endpoint du type `POST /api/businesses/:slug/members/import` qui accepte un CSV (ou un JSON liste de membres) et fait la même chose.

4. **Après import**  
   Les clients sont dans MyFidpass. Ils peuvent ensuite ajouter la carte (lien sur le site, QR, etc.) ; les points importés sont déjà là.

**Doublons** : si un email existe déjà pour ce commerce, on peut soit **ignorer** la ligne (ne pas créer de doublon), soit **mettre à jour** le nom / les points (upsert). À définir dans l’API (ex. option `onDuplicate: "skip" | "update"`).

---

### Scénario B : Le commerçant a seulement un Excel (pas de CSV)

Même idée que A, mais :

- Soit il **enregistre sous .csv** dans Excel (UTF-8 de préférence).
- Soit on accepte en upload un **XLSX** et on le parse côté backend (librairie type `xlsx`) pour en faire la même chose qu’un CSV.

Donc soit on impose le CSV, soit on ajoute le support XLSX.

---

### Scénario C : L’ancien logiciel a une API (export automatique)

**Cas** : l’ancien outil fidélité ou la caisse propose une **API** ou un **webhook** pour lister les clients (et éventuellement leurs points).

**Étapes :**

1. Récupérer la **doc API** (endpoints, auth, format des réponses).
2. Côté MyFidpass : soit un **script** (cron / manuel) qui appelle cette API, récupère les clients, et les envoie à notre API d’import (même format que l’import CSV).
3. Mapping des champs : leur "email" → notre `email`, leur "nom" ou "prénom + nom" → notre `name`, leur "points" ou "tampons" → notre `points`.

On ne change pas notre modèle : on alimente toujours la même table `members` via l’API d’import (ou l’équivalent en bulk).

---

### Scénario D : Pas de fichier, saisie manuelle ou progressive

Le commerçant n’a pas d’export. Alors :

- Soit il **saisit à la main** (ou copie-collé) dans le dashboard, client par client (comme aujourd’hui avec “Créer un membre” si on l’expose).
- Soit il **enregistre les clients au fil de l’eau** : à chaque passage en caisse, si le client n’est pas dans MyFidpass, on le crée (via l’app / le scan / l’intégration caisse). La “base” se remplit progressivement.

Pas d’import de fichier dans ce cas.

---

### Scénario E : Points / tampons de l’ancien système

Si l’ancien logiciel avait des **points ou tampons** :

- **Avec import CSV** : on ajoute une colonne `points` (ou `tampons`) dans le fichier ; à l’import on crée le membre avec ce solde initial.
- **Avec API** : le script qui lit l’API de l’ancien système envoie aussi les points à notre API d’import.

On ne fait **pas** de “fusion” automatique avec un autre système en temps réel : on fait un **import initial** (une fois), puis MyFidpass devient la source de vérité (les nouveaux points viennent des scans / de l’app).

---

## 4. Récap : ce qu’il faut côté MyFidpass

Pour couvrir tout ça proprement :

| Besoin | Solution |
|--------|----------|
| Importer un fichier (CSV / Excel) | Endpoint **import** (ex. `POST /api/businesses/:slug/members/import`) + éventuellement une page “Import CSV” dans le dashboard. |
| Gérer les doublons (même email pour ce commerce) | Règle claire : par ex. “skip” (ne pas créer) ou “update” (mettre à jour nom/points). |
| Importer des points initiaux | Accepter une colonne `points` (ou équivalent) dans le CSV / le body d’import. |
| Connexion à un autre logiciel | Pas dans le scope immédiat : le commerçant exporte un CSV (ou on lui fournit un script qui appelle l’API de l’autre outil et envoie les données à notre API d’import). |

---

## 5. Format d’import recommandé (CSV)

Exemple de fichier CSV que le commerçant (ou toi) peut préparer :

```csv
email,name,points
marie.dupont@email.com,Marie Dupont,12
jean.martin@email.com,Jean Martin,0
sophie.bernard@email.com,Sophie Bernard,5
```

- **email** : obligatoire, une seule fois par commerce (sinon doublon).
- **name** : obligatoire.
- **points** : optionnel ; si absent, 0.

Encodage : **UTF-8** (avec ou sans BOM). Séparateur : **virgule** ou **point-virgule** selon la locale.

---

## 6. Côté commerçant : quoi lui dire ?

Tu peux lui expliquer comme ça :

1. **“Vous avez déjà une liste de clients (Excel, caisse, ancien logiciel) ?”**  
   → Oui : “Exportez-la en CSV avec au minimum l’email et le nom du client. On l’importe dans MyFidpass en une fois. Si vous aviez des points ou tampons, on peut les reprendre en ajoutant une colonne ‘points’.”

2. **“Vous n’avez pas de fichier ?”**  
   → “Pas de souci. Les clients seront enregistrés au fur et à mesure quand ils prendront la carte (lien ou scan en caisse).”

3. **“Mon logiciel actuel a une API / un export automatique”**  
   → “On peut brancher un import sur cet export (ou sur un fichier que vous générez régulièrement) pour garder les clients et, si possible, les points à jour jusqu’à la bascule.”

---

## 7. Technique : import en masse (API)

Un endpoint permet d’importer une liste de membres en une fois.

- **Méthode + chemin** : `POST /api/businesses/:slug/members/import`
- **Auth** : `Authorization: Bearer <token>` ou `X-Dashboard-Token` (comme le reste du dashboard).
- **Body JSON** :
```json
{
  "members": [
    { "email": "marie@email.com", "name": "Marie Dupont", "points": 12 },
    { "email": "jean@email.com", "name": "Jean Martin" }
  ],
  "onDuplicate": "skip"
}
```
  - `members` : tableau d’objets avec `email` (obligatoire), `name` (obligatoire), `points` (optionnel, défaut 0).
  - `onDuplicate` : `"skip"` (défaut) = ne pas créer si l’email existe déjà pour ce commerce ; `"update"` = mettre à jour le nom et les points du membre existant.

- **Réponse 200** :
```json
{
  "created": 2,
  "updated": 0,
  "skipped": 1,
  "errors": 0,
  "createdIds": ["uuid1", "uuid2"],
  "details": { "errors": [] }
}
```
  Si des lignes sont en erreur (email ou name manquant), elles sont listées dans `details.errors` (numéro de ligne, email, raison). Maximum 5000 membres par appel.

**CSV → JSON** : le commerçant peut exporter son fichier en CSV (colonnes email, name, points). Toi ou un outil (Excel, script, ou future page “Import” dans le dashboard) parse le CSV et envoie le tableau `members` en JSON à cet endpoint. Pas besoin d’upload de fichier côté API pour l’instant.

---

## 8. Récap

- **Aujourd’hui** : création un par un (`POST /api/businesses/:slug/members`) + **import en masse** (`POST /api/businesses/:slug/members/import`).
- **Optionnel plus tard** : page “Import CSV” dans le dashboard (upload fichier, parsing côté front, appel à l’API import).

Tu peux dire au commerçant : “Envoyez-moi votre liste (CSV ou Excel avec au minimum email et nom). Je l’importe dans MyFidpass ; vous gardez vos clients et, si vous aviez des points, on les reprend. Ensuite toute la fidélité est gérée ici.”
