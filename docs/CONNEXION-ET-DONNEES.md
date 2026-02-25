# Où sont gérés les identifiants et la base de données ?

## En bref

- **Identifiants (email / mot de passe)** : gérés par l’API (backend). Le mot de passe est hashé (bcrypt) et stocké en base.
- **Base de données** : un **fichier SQLite** (`fidelity.db`) qui contient les comptes restaurateurs, les commerces, les membres, les points, etc.
- **Emplacement du fichier** : contrôlé par la variable d’environnement **`DATA_DIR`** (voir plus bas).

---

## Pourquoi la connexion ne tient pas sur Railway ?

Sur Railway, à **chaque redéploiement**, le disque du service est remis à zéro. Le fichier `fidelity.db` est donc **supprimé** → plus de comptes → « Email ou mot de passe incorrect » même avec les bons identifiants.

**Solution obligatoire** : utiliser un **volume** Railway (stockage persistant) et dire à l’API d’écrire la base dedans.

---

## Ce qu’il faut faire sur Railway (une seule fois)

1. **Créer un volume** et l’attacher au service **fidpass-api** :
   - Railway → ton projet → **Ctrl+K** (ou Cmd+K) → tape **« volume »** → **Add Volume** (ou **Create Volume**).
   - Service : **fidpass-api**.
   - **Mount path** : **`/data`** (exactement).

2. **Ajouter la variable** dans **Variables** du service **fidpass-api** :
   - **Nom** : `DATA_DIR`
   - **Valeur** : `/data`

3. **Redéployer** le service (bouton Redeploy ou un push).

Après ça, le fichier `fidelity.db` sera créé dans `/data` et **ne sera plus effacé** aux redéploiements. Tes comptes et ta connexion resteront stables.

---

## Récap technique

| Élément | Où c’est |
|--------|----------|
| Inscription / connexion | Backend → `backend/src/routes/auth.js` |
| Hash des mots de passe | bcrypt dans `auth.js` |
| Base de données | SQLite, fichier `fidelity.db` |
| Chemin du fichier | `DATA_DIR` (défaut : `backend/data/` en local) |
| Tables | `users`, `businesses`, `members`, `transactions` (dans `backend/src/db.js`) |

Sans **volume** + **DATA_DIR=/data** sur Railway, la base est perdue à chaque déploiement.
