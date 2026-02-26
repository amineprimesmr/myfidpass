# Bannière du site (image ou vidéo)

Pour afficher une **image** ou une **vidéo** en bannière en haut du site :

## Emplacement des fichiers

Dépose ton fichier dans ce dossier (`frontend/public/assets/banner/`) avec **exactement** l’un de ces noms :

| Fichier       | Usage                    |
|---------------|--------------------------|
| **hero.jpg**  | Bannière image (ou .png, .webp) |
| **hero.mp4**  | Bannière vidéo (lecture auto, muet, en boucle) |

- **Image** : renomme ton fichier en `hero.jpg` (ou `hero.png` / `hero.webp`) et place-le ici.  
  Formats conseillés : JPG ou WebP. Largeur recommandée : 1920px ou plus.
- **Vidéo** : renomme en `hero.mp4` et place-le ici.  
  Si les deux (image + vidéo) sont présents, la **vidéo** est utilisée en priorité.

## Après avoir ajouté le fichier

1. Recharge le site (ou redéploie si tu es en production).
2. La bannière s’affiche automatiquement en pleine largeur au-dessus de la barre bleue « Essayez Fidpass GRATUITEMENT ».

## Organisation du projet

```
frontend/
  public/              ← Fichiers servis tels quels (URL /assets/...)
    assets/
      banner/
        hero.jpg       ← Ta bannière image (à ajouter)
        hero.mp4       ← Ou ta bannière vidéo (à ajouter)
        README.md      ← Ce fichier
  src/
  index.html
```

Les fichiers dans `public/` sont copiés à la racine du site au build :  
`public/assets/banner/hero.jpg` → accessible via `/assets/banner/hero.jpg`.
