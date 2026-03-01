# Connexion avec Google et Apple

Pour **activer** les boutons « Continuer avec Google » et « Continuer avec Apple » (checkout + page Connexion), ajoute les variables ci-dessous. Sans elles, les boutons restent visibles mais désactivés / en mode « à configurer ».

---

## Ce que tu dois faire (résumé)

| Où | Variables à ajouter |
|----|----------------------|
| **Vercel** (frontend) | `VITE_GOOGLE_CLIENT_ID` et `VITE_APPLE_CLIENT_ID` |
| **Railway** (backend) | `GOOGLE_CLIENT_ID` et `APPLE_CLIENT_ID` |

Utilise la **même valeur** de Client ID côté frontend et backend (ex. le même `xxx.apps.googleusercontent.com` pour Google).

---

## 1. Google

1. Va sur [Google Cloud Console](https://console.cloud.google.com/).
2. Crée un projet (ou choisis-en un).
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
4. Type : **Web application**.
5. Dans **Authorized JavaScript origins** : ajoute `https://myfidpass.fr` (et `http://localhost:5173` en dev).
6. Crée et copie le **Client ID** (finissant par `.apps.googleusercontent.com`).

**À configurer :**
- **Railway** (backend) : variable `GOOGLE_CLIENT_ID` = ce Client ID.
- **Vercel** (frontend) : variable `VITE_GOOGLE_CLIENT_ID` = le même Client ID.

---

## 2. Apple

1. Va sur [Apple Developer](https://developer.apple.com/) → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Crée un identifiant de type **Services ID** (ex. `com.tondomaine.myfidpass`).
3. Active **Sign in with Apple** pour ce Services ID.
4. Configure les domaines (ex. `myfidpass.fr`) et l’URL de redirection (ex. `https://myfidpass.fr/`).
5. Le **Services ID** (son identifiant) = valeur de `APPLE_CLIENT_ID`.

**À configurer :**
- **Railway** (backend) : variable `APPLE_CLIENT_ID` = ce Services ID.
- **Vercel** (frontend) : variable `VITE_APPLE_CLIENT_ID` = le même Services ID.

---

## Après avoir ajouté les variables

- **Vercel** : redéploie le frontend (ou attends le déploiement auto si tu as poussé le code).
- **Railway** : le backend recharge les variables au redémarrage.

Ensuite, rafraîchis myfidpass.fr (Cmd+Shift+R) : les boutons Google et Apple deviennent cliquables et fonctionnels.

---

## Dépannage : « La création de compte avec Apple ne fonctionne pas »

### 1. Vérifier les variables

| Où | Variable | Valeur attendue |
|----|----------|-----------------|
| **Vercel** | `VITE_APPLE_CLIENT_ID` | Ton **Services ID** Apple (ex. `fr.myfidpass.service`) |
| **Railway** | `APPLE_CLIENT_ID` | **Exactement le même** Services ID |

Si une des deux manque ou est différente, la connexion Apple échouera.

### 2. Utiliser le Services ID, pas le Bundle ID

- **Services ID** = identifiant pour « Sign in with Apple » sur le **web** (type « Services ID » dans Apple Developer).
- **Bundle ID** = identifiant d’une app iOS.

Pour myfidpass.fr il faut utiliser le **Services ID**. Si tu mets le Bundle ID dans `APPLE_CLIENT_ID` / `VITE_APPLE_CLIENT_ID`, le backend renverra une erreur du type « utilisez le Services ID ».

### 3. Configurer le domaine et l’URL de retour dans Apple Developer

1. **Certificates, Identifiers & Profiles** → **Identifiers** → ton **Services ID**.
2. **Sign in with Apple** → **Configure**.
3. **Domains and Subdomains** : ajoute `myfidpass.fr` (sans `https://`).
4. **Return URLs** : ajoute `https://myfidpass.fr/` (avec `https://` et le `/` final).

Sans ça, la popup Apple peut afficher « invalid_request » ou la connexion peut échouer.

### 4. Message « Email non fourni par Apple »

Si l’utilisateur choisit de **masquer son e-mail** la première fois, Apple peut ne pas l’envoyer. Il doit réautoriser l’app en partageant l’e-mail, ou utiliser la connexion par e-mail / Google.

### 5. Redéployer après modification des variables

- **Vercel** : redéploi automatique après sauvegarde des variables, ou « Redeploy » manuel.
- **Railway** : redémarrage du service après modification des variables (souvent automatique).
