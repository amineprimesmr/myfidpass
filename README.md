# Carte de fidélité Apple Wallet — Multi-entreprises (SaaS)

Cartes de fidélité digitales pour **plusieurs entreprises** (fast-foods, restos, etc.), ajoutables dans **Apple Wallet**. Un seul compte Apple Developer, une seule plateforme : chaque entreprise a **son lien** et ses clients reçoivent une carte à son nom.

## Ce que tu obtiens

- **Une carte Store Card par entreprise** (points, niveau, code-barres), signée avec ton certificat Apple
- **Un lien par entreprise** : `https://tondomaine.com/fidelity/burger-king` → les clients de Burger King ont une carte « Burger King »
- **Backend** qui génère les passes (`.pkpass`) avec le bon nom et les visuels de chaque entreprise
- **API** pour créer des entreprises, des membres, ajouter des points, télécharger le pass

📖 **Modèle métier détaillé** : [docs/MULTI-ENTREPRISES.md](docs/MULTI-ENTREPRISES.md) (comment vendre à plusieurs entreprises, comment les clients obtiennent la carte, etc.)

## Prérequis (obligatoires)

1. **Compte Apple Developer** (99 €/an)  
   [developer.apple.com](https://developer.apple.com) → Enroll.

2. **Pass Type ID** et **certificat de signature**  
   Voir **[docs/APPLE-WALLET-SETUP.md](docs/APPLE-WALLET-SETUP.md)** pour la procédure pas à pas (Identifiers, certificat Pass Type ID, CSR, etc.).

3. **Certificat WWDR** (Apple)  
   Téléchargé une fois, utilisé pour signer tous les passes. Lien dans le doc ci-dessus.

Sans ces éléments, le backend ne pourra pas générer de `.pkpass` valide.

## Démarrage rapide

```bash
# Cloner / aller dans le projet
cd fidelity

# Tout installer (racine + backend + frontend)
npm run setup

# Configurer (voir ci-dessous)
cp backend/.env.example backend/.env
# Éditer backend/.env et placer les certificats dans backend/certs/
```

### Fichiers à placer dans `backend/certs/`

| Fichier        | Description |
|----------------|-------------|
| `signerCert.pem` | Certificat Pass Type ID (exporté en PEM) |
| `signerKey.pem`  | Clé privée du certificat (PEM) |
| `wwdr.pem`       | Certificat intermédiaire Apple WWDR (G4 ou G5) |

Voir **docs/APPLE-WALLET-SETUP.md** pour comment les obtenir.

### Variables d’environnement (`backend/.env`)

```env
PORT=3001
PASS_TYPE_ID=pass.com.tonentreprise.fidelity
TEAM_ID=XXXXXXXXXX
ORGANIZATION_NAME=Mon Fast-Food
```

Puis :

- **Sans taper de commande** : dans Cursor / VS Code → `Cmd+Shift+P` → **Tasks: Run Task** → **Fidpass — Dev local (backend + front + navigateur)**. Voir **[docs/LANCER-SANS-TERMINAL.md](docs/LANCER-SANS-TERMINAL.md)**.
- **En terminal** (si tu préfères) : `npm start` (backend + front), ou `npm run dev:local` (ouvre le navigateur sur le bon port).

- **Frontend (Vite)** : **http://localhost:5174**  
- **Backend API** : http://localhost:3001 en direct ; en dev, le front appelle **`/api/...`** sur le même port que Vite (proxy → 3001).

**Piège fréquent :** lancer uniquement `npm run dev` **dans** `frontend/` sans processus sur le port **3001** → l’app affiche « Connexion impossible ». Toujours **`npm start` à la racine** (recommandé) **ou** un terminal `npm run backend` à la racine + le front. Au démarrage, Vite affiche aussi un encadré jaune dans le terminal si l’API ne répond pas.

**Note :** `http://localhost:5174/api/health` affiche du **JSON** (`{"ok":true,...}`) — c’est le test de santé de l’API, pas l’interface. L’app : **/** ou **/app**.

Ouvrir **http://localhost:5174/fidelity/demo** (ou la racine → redirection vers la démo). Une entreprise « demo » existe par défaut. Pour une autre entreprise : **http://localhost:5174/fidelity/nom-slug** (après l’avoir créée via l’API ci-dessous).

## Architecture

```
fidelity/
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── pass.js          # Pass dynamique par entreprise
│   │   ├── db.js            # businesses + members
│   │   └── routes/          # members.js, businesses.js
│   ├── certs/
│   ├── assets/              # Logo/icon/strip globaux
│   │   └── businesses/      # Par entreprise : businesses/<id>/logo.png, strip.png, icon.png
│   └── .env
├── frontend/                # Une page par slug : /fidelity/:slug
├── docs/
│   ├── APPLE-WALLET-SETUP.md
│   └── MULTI-ENTREPRISES.md
└── README.md
```

## API (résumé)

| Méthode | Route | Description |
|--------|--------|-------------|
| **Entreprises** | | |
| GET | `/api/businesses/:slug` | Infos publiques (nom, etc.) |
| POST | `/api/businesses` | Créer une entreprise (name, slug, organizationName, …) |
| **Par entreprise** | | |
| POST | `/api/businesses/:slug/members` | Créer un membre (name, email) |
| GET | `/api/businesses/:slug/members/:memberId/pass` | Télécharger le `.pkpass` |
| POST | `/api/businesses/:slug/members/:memberId/points` | Ajouter des points |
| **Rétrocompat** | | |
| POST | `/api/members` | Créer un membre pour l’entreprise « demo » |
| GET | `/api/members/:memberId/pass` | Télécharger le pass (membre existant) |

### Créer une nouvelle entreprise (pour la revendre)

```bash
curl -X POST http://localhost:3001/api/businesses \
  -H "Content-Type: application/json" \
  -d '{"name":"Burger King","slug":"burger-king","organizationName":"Burger King"}'
```

Réponse : `link: "/fidelity/burger-king"`. Donne à ton client l’URL : **https://tondomaine.com/fidelity/burger-king** (ou un QR code pointant vers cette URL).

## Design de la carte (Wallet)

- **Style** : Store Card. **Nom sur la carte** = `organizationName` de l’entreprise.
- **Images** : par entreprise dans `backend/assets/businesses/<business-id>/` (logo.png, icon.png, strip.png). Sinon, fallback sur `backend/assets/`.

## Licence

MIT. Adapte les textes, images et `PASS_TYPE_ID` / `ORGANIZATION_NAME` à ton enseigne.
