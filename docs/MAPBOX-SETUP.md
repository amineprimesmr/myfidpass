# Configurer Mapbox pour la carte « Carte & périmètre »

## 1. Récupérer le token

1. Va sur [console.mapbox.com](https://console.mapbox.com) et connecte-toi.
2. Dans la barre latérale : **Tokens** (icône `</>`).
3. Copie le **Default public token** (commence par `pk.eyJ...`).

## 2. (Recommandé) Créer un token restreint pour la prod

1. **Tokens** → **Create a token**.
2. Nom : ex. `myfidpass-production`.
3. **URL restrictions** : ajoute `https://myfidpass.fr/*` (et `https://*.vercel.app/*` si tu testes les previews).
4. **Public scopes** : coche uniquement **styles:tiles** et **fonts** (ou laisse les scopes par défaut pour les maps).
5. Crée et copie le token.

## 3. Variables d’environnement

### En local (développement)

À la racine du projet (ou dans `frontend/`), crée un fichier `.env` :

```bash
VITE_MAPBOX_ACCESS_TOKEN=pk.eyJ...ton_token_ici
```

Ne commite **jamais** ce fichier (il est dans `.gitignore`).

### En production (Vercel)

1. [vercel.com](https://vercel.com) → ton projet Myfidpass.
2. **Settings** → **Environment Variables**.
3. Ajoute :
   - **Name** : `VITE_MAPBOX_ACCESS_TOKEN`
   - **Value** : ton token Mapbox (public ou restreint).
   - **Environment** : Production (et Preview si tu veux sur les previews).
4. Redéploie le projet pour que la variable soit prise en compte.

## 4. Comportement de l’app

- Si **`VITE_MAPBOX_ACCESS_TOKEN`** est défini : la page **Carte & périmètre** utilise **Mapbox GL JS** (style sombre, rendu vectoriel).
- Sinon : la carte utilise **Carto (Voyager)** comme aujourd’hui, sans coût.

Aucune autre API Mapbox (Search, Geocoding, Navigation, etc.) n’est utilisée : uniquement l’affichage de la carte → facturation en **Map Loads** (50 000 gratuits / mois).

## 5. Surveiller la facturation

- **Account usage** sur [console.mapbox.com](https://console.mapbox.com) : tu dois voir uniquement **Map Loads for Web** augmenter.
- **Admin** → **Invoices** : pour l’historique.
- Configure une **alerte de facturation** (si disponible dans ton compte) pour être prévenu en cas de dépassement du gratuit.
