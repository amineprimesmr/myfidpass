# Icônes des cartes fidélité (tampons / points)

MyFidpass utilise **uniquement des PNG locaux** pour les icônes des tampons et points sur les passes Apple Wallet. Aucune API externe (Emoji.family, Noto, Twemoji, etc.).

---

## Où sont les icônes

- **Backend (génération du pass)** : `backend/assets/icons/`  
  Les fichiers sont lus au moment de générer le pass. Nommage : `icon_XXXX.png` (code Unicode) ou alias : `cafe.png`, `pizza.png`, `burger.png`, etc. Voir `backend/assets/icons/README.md`.

- **Frontend (grille de choix)** : `frontend/public/assets/icons/`  
  Les mêmes noms sont servis en `/assets/icons/xxx.png` pour la grille « Choisir une icône » dans Ma Carte (règles tampons).

- **Mapping emoji → fichier** :  
  Le backend et le frontend utilisent le même mapping (code emoji → nom de fichier). Ex. ☕ → `cafe.png` ou `icon_2615.png`, 🍕 → `pizza.png` ou `icon_1f355.png`.

---

## Données stockées

- En base et dans l’API : **un caractère emoji** (ex. `☕`, `🍕`).  
- À la génération du pass, le backend convertit cet emoji en code (ex. `2615`, `1f355`) et charge le PNG correspondant depuis `backend/assets/icons/` (ou `assets/`). Si aucun fichier n’existe, le tampon n’a pas d’icône (cercle seul ou strip sans icônes).

---

## Ajouter une icône

1. Ajouter le PNG dans `backend/assets/icons/` (et éventuellement dans `frontend/public/assets/icons/` pour l’aperçu web).
2. Nom : `icon_XXXX.png` (XXXX = code Unicode de l’emoji) ou ajouter un alias dans `ICON_ALIASES` dans `pass.js` et dans `CUSTOM_ICON_PATHS` dans le frontend.

Liste des codes et secteurs : voir `myfidpass/Docs/ICONES_CARTES_FIDELITE.md` (repo app).
