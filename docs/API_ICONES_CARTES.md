# API icônes pour les cartes fidélité

MyFidpass utilise des **icônes emoji** (style cohérent, haute qualité) pour les tampons et points sur les passes Apple Wallet / Google Wallet, sans avoir à importer manuellement des images.

---

## Source principale : Emoji.family (Fluent)

- **API** : https://www.emoji.family  
- **Gratuit**, sans clé, limites raisonnables.
- **Style** : pack **Fluent** (propre, cohérent).
- **Format** : PNG, taille paramétrable.

### Utilisation dans le projet

1. **Backend (génération des passes)**  
   Fichier : `backend/src/pass.js`  
   - Pour chaque emoji (tampon / points), le backend demande en priorité l’image à Emoji.family :  
     `GET https://www.emoji.family/api/emojis/{hexcode}/fluent/png/128`  
   - Si la requête échoue, fallback sur **Noto** (Google) puis **Twemoji** (Twitter).

2. **Frontend (dashboard SaaS)**  
   - Grille « Choisir une icône » dans **Ma Carte** (règles tampons) :  
     - Liste : `GET https://www.emoji.family/api/emojis?group=food-drink`  
     - Miniatures : `GET https://www.emoji.family/api/emojis/{hexcode}/fluent/png/40`  
   - Au clic, l’emoji est mis dans le champ « Emoji des tampons » et le pass utilise cette valeur.

### Exemples d’URLs (PNG)

- Café 128px : `https://www.emoji.family/api/emojis/2615/fluent/png/128`  
- Pizza 64px : `https://www.emoji.family/api/emojis/1f355/fluent/png/64`  
- Burger : `https://www.emoji.family/api/emojis/1f354/fluent/png/128`  

Hexcode = code Unicode en minuscules, sans préfixe (ex. `2615` pour ☕, `1f355` pour 🍕).

---

## Fallbacks (backend)

- **Noto Color Emoji** (Google) :  
  `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/png/128/emoji_u{codepoint}.png`
- **Twemoji** (Twitter) :  
  `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/{codepoint}.png`

---

## Données stockées

- En base et dans l’API : **un caractère emoji** (ex. `☕`, `🍕`), pas l’URL.
- Le backend convertit cet emoji en hexcode et appelle Emoji.family (ou les fallbacks) au moment de générer le pass.

---

## Autres options (non utilisées actuellement)

- **Fluent Emoji 3D** (jsDelivr) : WebP, style 3D Microsoft.  
  `https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@1.1.0/assets/{hexcode}.webp`
- **Swiftbite Icons** : API dédiée food, clé sur demande (beta).
- **Wicked Food** : visuels 3D type « clay », pas d’API d’image documentée.

Pour toute évolution (autre pack, cache, proxy), adapter `pass.js` et le sélecteur dans le frontend.
