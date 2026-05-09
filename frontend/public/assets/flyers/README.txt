Fonds d’affiche proposés dans l’app (Flyer QR)

Alignement iOS : les fichiers template1.png … template11.png + manifest.json correspondent aux imagesets Xcode `Assets.xcassets/fondtemplate/template{n}.imageset` (utiliser l’asset @1x comme source pour le web).

1. Place tes images (jpg, png, webp) dans ce dossier.
2. Ajoute une entrée dans manifest.json : { "file": "nom-du-fichier.jpg", "label": "Titre affiché" }
3. Déploie : les vignettes apparaissent sous « Fonds proposés ».

Limite : même contrainte que l’import manuel (image ≤ 5 Mo ; redimensionnement automatique côté app).
