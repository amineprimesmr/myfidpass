# Audit Fidpass — Logiciel de A à Z

Document d’analyse complète : architecture, stockage, ce qui fonctionne, ce qui ne va pas, ce qu’il faut configurer et améliorer.

---

## 1. Où est le serveur ? Comment sont gérées les données ?

### 1.1 Architecture actuelle

| Composant | Hébergement | Rôle |
|-----------|-------------|------|
| **Frontend** | **Vercel** (déployé via `git push` sur `main`) | Site web myfidpass.fr : landing, formulaire, espace commerçant (/app), pages fidélité (/fidelity/:slug). |
| **Backend (API)** | **Railway** (même dépôt, service Node) | API REST : auth, businesses, members, passes, intégration caisse, PassKit Web Service. |
| **Base de données** | **Fichier SQLite** (`fidelity.db`) sur le **même serveur** que le backend (Railway). | Utilisateurs, commerces, membres, points, transactions, logos (logo_base64), inscriptions PassKit. |

Donc : **oui, tu as un serveur** — c’est le backend sur Railway. C’est lui qui gère les données (SQLite) et la logique métier.

### 1.2 Stockage des données

- **Emplacement du fichier DB** : contrôlé par la variable d’environnement **`DATA_DIR`** dans le backend.
  - **En local** : `backend/data/fidelity.db` (créé automatiquement).
  - **Sur Railway** : par défaut le conteneur utilise un disque **éphémère** → à chaque **redéploiement**, le disque est réinitialisé et **toutes les données sont perdues** (comptes, commerces, membres, logo, etc.).

- **Persistance en production** : pour que les données survivent aux déploiements, il **faut** :
  1. Créer un **Volume** Railway et l’attacher au service backend (mount path : `/data`).
  2. Définir la variable **`DATA_DIR=/data`** sur le service.

Sans ça : à chaque `npm run deploy` (donc à chaque push), la base est réinitialisée et tu “perds” tout (y compris le logo et les changements).  
**Référence** : [docs/CONNEXION-ET-DONNEES.md](CONNEXION-ET-DONNEES.md) et [docs/ETAPES-DEPLOIEMENT.md](ETAPES-DEPLOIEMENT.md).

### 1.3 Pourquoi le logo (et les changements) disparaissent au rafraîchissement ?

Deux causes possibles :

1. **Base non persistante**  
   Si `DATA_DIR` n’est pas configuré avec un volume sur Railway, chaque déploiement recrée une base vide. Donc après un déploiement, plus de commerces, plus de logo, plus de compte.

2. **Token dashboard perdu au refresh**  
   Si tu accèdes à l’espace commerçant via le **lien magique** (URL avec `?token=...`) et que tu **rafraîchis la page**, l’URL peut être normalisée (sans `?token=...`). Le frontend n’avait pas gardé ce token → les appels API (settings, logo) partaient sans auth → 401 → pas de chargement du logo ni des paramètres.  
   **Correction prévue** : le token présent dans l’URL est maintenant sauvegardé en `sessionStorage` (par commerce). Au rafraîchissement, le frontend le réutilise pour les appels API, donc le logo et les réglages peuvent se recharger tant que la base est bien persistante.

---

## 2. Ce qui fonctionne (quand la base est persistante)

- **Inscription / connexion** (email + mot de passe, JWT).
- **Création de commerce** (nom, slug) après connexion.
- **Espace commerçant** (/app) : vue d’ensemble, partager, scanner, caisse rapide, membres, historique, personnalisation (couleurs, nom, **logo**), intégration caisse/borne.
- **Logo** : enregistrement en base (`logo_base64`), chargement via `GET /api/businesses/:slug/logo`, affichage dans l’aperçu et dans les passes.
- **Génération de passes** Apple Wallet (.pkpass) avec logo, couleurs, nom du commerce.
- **Page fidélité** (/fidelity/:slug) pour l’ajout de la carte au Wallet.
- **API d’intégration** (lookup, scan) pour bornes / caisses.
- **PassKit Web Service** (enregistrement appareil, mise à jour de pass).
- **Export CSV** (membres, transactions).
- **Statistiques** (nouveaux membres, inactifs, évolution).

---

## 3. Ce qui ne va pas ou peut poser problème

### 3.1 Critique : persistance des données en production

- **Sans volume Railway + `DATA_DIR=/data`** : la base SQLite est perdue à chaque déploiement.
- **À faire** : créer le volume, définir `DATA_DIR=/data`, redéployer. Voir [CONNEXION-ET-DONNEES.md](CONNEXION-ET-DONNEES.md).

### 3.2 Token dashboard et refresh

- **Avant** : accès par lien magique uniquement ; au refresh, le token n’était plus dans l’URL → plus d’auth → échec chargement logo/settings.
- **Après correction** : le token est mis en `sessionStorage` quand il est dans l’URL ; au refresh il est réutilisé pour les appels API (tant que l’onglet est le même).

### 3.3 Limites techniques actuelles

- **SQLite** : adapté à un petit/moyen volume ; pas de réplication multi-serveur. Pour une grosse montée en charge, il faudrait envisager PostgreSQL (ou autre) plus tard.
- **Logo en base** : stocké en `logo_base64` (TEXT). Pour beaucoup de commerces avec logos lourds, un stockage fichier (ex. S3) + URL serait plus adapté à long terme.
- **Sauvegardes** : pas de backup automatique de `fidelity.db`. À mettre en place (scripts + stockage externe) pour la prod.

---

## 4. Ce qui manque ou est à améliorer

### 4.1 Configuration / déploiement

- [ ] **Vérifier sur Railway** : volume créé, `DATA_DIR=/data` défini, redéploiement fait.
- [ ] **Variables d’environnement** : `API_URL` (ou équivalent) côté frontend pour pointer vers l’API Railway ; `FRONTEND_URL` côté backend pour CORS.
- [ ] **Sauvegardes** : automatiser des backups réguliers de `fidelity.db` (ex. vers S3 ou autre).

### 4.2 UX / robustesse

- [ ] Indication claire en cas d’**erreur réseau** ou **401** (ex. “Session expirée, reconnectez-vous” ou “Utilisez le lien reçu par e-mail”).
- [ ] **Chargement** (spinner ou skeleton) pendant le chargement des paramètres et du logo.
- [ ] Gestion **hors-ligne** ou réessai automatique sur échec API (optionnel).

### 4.3 Évolutions possibles

- [x] **Notifications push** : Web Push implémenté (section « Notifications » dans le dashboard, bouton « Activer les notifications » sur la page fidélité après inscription). En production, définir `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (générer avec `npx web-push generate-vapid-keys`).
- [ ] **Multi-commerces** : aujourd’hui l’app suppose souvent “un commerce par utilisateur” ; affiner si besoin (liste de commerces, choix du commerce actif).
- [ ] **Logos / assets** : au-delà d’un certain volume, passer à un stockage objet (S3, etc.) + URL au lieu de BLOB/base64 en base.
- [ ] **Monitoring** : logs structurés, alertes (erreurs 5xx, santé DB), tableau de bord simple (optionnel).

---

## 5. Récapitulatif technique

| Élément | Détail |
|--------|--------|
| **Frontend** | HTML/CSS/JS (Vite), déployé sur Vercel. |
| **Backend** | Node.js + Express, déployé sur Railway. |
| **Base de données** | SQLite, fichier `fidelity.db` dans `DATA_DIR` (par défaut `backend/data/` en local). |
| **Auth** | JWT (login/register) + token dashboard (lien magique) ; token dashboard persisté en `sessionStorage` par slug. |
| **Logo** | Enregistré en base (`businesses.logo_base64`), servi par `GET /api/businesses/:slug/logo`, utilisé dans les passes. |
| **Persistance** | **Indispensable en prod** : volume Railway + `DATA_DIR=/data`. |
| **Notifications push** | Web Push (VAPID). En prod : `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` dans les variables d'environnement du backend. |

---

## 6. Volume déjà configuré mais les données ne persistent pas

Si tu as bien un **volume** (ex. `fidpass-api-volume`) et **`DATA_DIR=/data`** mais que les changements ou le logo disparaissent encore :

1. **Vérifier le chemin de montage du volume**  
   Sur Railway, le volume doit être monté **exactement** au chemin **`/data`** (Mount Path = `/data`). Si le montage est par exemple `/mnt/data` ou `./data`, l’app écrit toujours dans `DATA_DIR` = `/data` = disque du conteneur, pas le volume.

2. **Appeler l’endpoint de diagnostic**  
   Après déploiement, ouvre :
   - **https://api.myfidpass.fr/api/health/db**  
   Tu devrais voir :
   - `dataDirResolved`: `/data`
   - `dbPath`: `/data/fidelity.db`
   - `dbExists`: `true`  
   Si `dbExists` est `false` ou si `dataDirResolved` n’est pas `/data`, le volume n’est pas utilisé au bon endroit.

3. **Redéployer après avoir créé le volume**  
   Une fois le volume créé et monté en `/data`, il faut **redéployer** le service (Redeploy ou nouveau push). Le premier démarrage après ça crée `fidelity.db` dans `/data`. Les déploiements suivants réutilisent ce fichier.

---

## 7. Conclusion

- Le logiciel **est fonctionnel** dès que la base est **persistante** (volume + `DATA_DIR`) et que l’auth (JWT ou token dashboard) est valide.
- La **disparition des changements au rafraîchissement** vient soit de la base réinitialisée à chaque déploiement, soit du token dashboard perdu (corrigé par la persistance en `sessionStorage`).
- **Action prioritaire** : configurer le **volume Railway** et **`DATA_DIR=/data`**, puis redéployer et vérifier que compte, commerce et logo restent après un refresh et après un nouveau déploiement.
