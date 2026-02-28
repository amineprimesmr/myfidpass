# Connexion avec Google et Apple

Pour afficher les boutons « Continuer avec Google » et « Continuer avec Apple » sur la page checkout et sur la page Connexion / Créer un compte :

## Google

1. Créer un projet dans [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
3. Type d’application : **Web application**.
4. Autoriser les origines JavaScript : `https://myfidpass.fr` (et `http://localhost:5173` en dev).
5. Copier l’**Client ID** (xxx.apps.googleusercontent.com).

**Backend (Railway)** : variable d’environnement  
`GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com`

**Frontend (Vercel)** : variable d’environnement  
`VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com`  
(utiliser le même Client ID que le backend)

## Apple

1. [Apple Developer](https://developer.apple.com/) → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Créer un **Services ID** (ex. `com.mydomain.myfidpass`) et l’activer pour « Sign in with Apple ».
3. Configurer les domaines et l’URL de redirection (ex. `https://myfidpass.fr/`).
4. Le **Services ID** (Identifiant) est le `APPLE_CLIENT_ID`.

**Backend (Railway)** :  
`APPLE_CLIENT_ID=com.mydomain.myfidpass`

**Frontend (Vercel)** :  
`VITE_APPLE_CLIENT_ID=com.mydomain.myfidpass`

Sans ces variables, les boutons Google et Apple sont masqués ; le reste du site (email + mot de passe) fonctionne normalement.
