# Bannière du site (image ou vidéo)

Pour afficher une **image** ou une **vidéo** en bannière en haut du site :

## Emplacement des fichiers

Dépose ton fichier dans ce dossier (`frontend/public/assets/banner/`) avec **exactement** l’un de ces noms :

| Fichier       | Usage                    |
|---------------|--------------------------|
| **hero.mp4**  | Bannière vidéo (prioritaire, lecture auto, muet, boucle) |
| **hero.jpg**  | Bannière image (fallback si pas de vidéo ; ou .png, .webp) |

- **Vidéo** : dépose ta vidéo ici sous le nom **`hero.mp4`**. Elle s’affiche en priorité (autoplay, muet, en boucle).
- **Image** : optionnel, renomme en `hero.jpg` (ou .png / .webp) comme repli ou bannière statique.  
  Si `hero.mp4` est présent, c’est toujours la vidéo qui est utilisée.

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
