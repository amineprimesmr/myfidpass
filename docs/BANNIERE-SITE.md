# Bannière image ou vidéo en haut du site

Pour afficher une **image** ou une **vidéo** en bannière tout en haut du site (au-dessus de la barre bleue « Essayez Fidpass GRATUITEMENT ») :

## Où mettre le fichier

1. Ouvre le dossier **`frontend/public/assets/banner/`**.
2. Dépose ton fichier en le renommant :
   - **hero.jpg** (ou **hero.png** / **hero.webp**) pour une **image** ;
   - **hero.mp4** pour une **vidéo**.

Si tu mets les deux (image + vidéo), la **vidéo** sera utilisée en priorité.

## Recommandations

- **Image** : largeur conseillée 1920px ou plus, format JPG ou WebP pour un bon compromis qualité / poids.
- **Vidéo** : format MP4, courte (quelques secondes), si possible légère pour le chargement. Elle est lue en **mute**, en **boucle**, **autoplay**.

## Organisation dans le projet

```
frontend/
  public/
    assets/
      banner/
        README.md    ← Instructions détaillées
        hero.jpg     ← À ajouter (ton image)
        hero.mp4     ← Ou à ajouter (ta vidéo)
```

Les fichiers dans `public/` sont servis tels quels : après un `npm run build` ou en dev, ton fichier est accessible à `/assets/banner/hero.jpg` (ou `hero.mp4`).

## Après modification

- En **local** : sauvegarde le fichier dans `frontend/public/assets/banner/`, rafraîchis la page.
- En **production** : ajoute le fichier dans le repo, commit, puis `npm run deploy` pour que Vercel le déploie.
