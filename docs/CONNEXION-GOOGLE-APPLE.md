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
