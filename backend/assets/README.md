# Assets pour la carte Apple Wallet (Store Card)

## Deux niveaux

1. **Dossier global** `backend/assets/` : logo, icon, strip utilisés par défaut pour tous les passes.
2. **Par entreprise** `backend/assets/businesses/<business-id>/` : logo.png, icon.png, strip.png. Si présents, ils remplacent les globaux pour les passes de cette entreprise. Le `<business-id>` est l’UUID renvoyé à la création de l’entreprise (POST /api/businesses).

## Fichiers et dimensions (Apple)

| Fichier     | Usage  | Taille 1x   | Taille @2x (Retina) |
|------------|--------|-------------|----------------------|
| `logo.png` | Logo en haut à gauche | 160 × 50 px  | 320 × 100 px |
| `icon.png` | Icône (écran verrouillage, etc.) | 29 × 29 px | 58 × 58 px |
| `strip.png` | Bande horizontale en haut de la carte | 375 × 123 px | 750 × 246 px |

- **Format** : PNG. Strip sans transparence recommandé (fond de la carte).
- **Logo** : fond transparent possible.
- **Strip** : bannière marque (couleurs, visuel).

Si aucun fichier n’est présent, le pass est quand même généré (texte + code-barres).
