# Icônes personnalisées (tampons / points sur la carte)

Ce dossier contient les **PNG utilisés à la place des emojis** sur les passes (grille de tampons, points).  
Seules les images de ce dossier (et de `assets/` à la racine) sont utilisées pour les tampons sur le pass. Aucune API externe.

## Tampons non débloqués (vide)

- **`vide.png`** : image affichée pour les cases de tampons **pas encore débloquées** sur la carte Wallet.  
  Si ce fichier est absent, les cases vides utilisent l’icône du tampon en filigrane (opacité réduite).  
  Recommandé : même taille que les icônes tampons (ex. 128×128 ou 256×256 px), fond transparent.

## Nommage

Deux façons de nommer (toutes deux reconnues) :

- **Par code Unicode** : `icon_XXXX.png` (ex. `icon_2615.png`, `icon_1f355.png`). Plusieurs codepoints : `icon_2764_fe0f.png` ou `icon_2764.png`.
- **Noms courts (alias)** : `cafe.png`, `pizza.png`, `burger.png`, `kebab.png`, `sushi.png`, `salade.png`, `croissant.png`, `steak.png`, `riz.png`, `baguette.png`, `giftgold.png`, `giftsilver.png`, `checkvert.png`, `iconcafe.png`.
- Priorité : `assets/icons/` puis `assets/` à la racine.

## Format

- **Taille** : 128×128 px ou 256×256 px recommandé.
- **Fond** : transparent (PNG).
- **Style** : cohérent entre toutes les icônes (même trait, même rendu).

## Liste des codes utiles (secteurs)

| Fichier | Emoji | Secteur |
|---------|--------|---------|
| icon_2615.png | ☕ | Café, bar |
| icon_1f355.png | 🍕 | Pizza, resto |
| icon_1f354.png | 🍔 | Fast-food, burger |
| icon_1f32e.png | 🌮 | Tacos, street food |
| icon_1f950.png | 🥐 | Boulangerie |
| icon_1f370.png | 🍰 | Pâtisserie |
| icon_1f484.png | 💄 | Beauté |
| icon_2702.png | ✂️ | Coiffure |
| icon_1f6cd.png | 🛍️ | Commerce, retail |
| icon_2b50.png | ⭐ | Générique, étoile |
| icon_2764.png | ❤️ | Cœur, fidélité |
| icon_1f381.png | 🎁 | Cadeau, récompense |

Liste complète : voir `myfidpass/Docs/ICONES_CARTES_FIDELITE.md` (dans le repo app).
