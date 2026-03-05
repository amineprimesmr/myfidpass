# Catégorie du commerce : détection automatique

## État actuel

**Aucun système automatique** ne détermine la catégorie du commerce à partir du champ « Nom de votre établissement ». Aujourd’hui :

- La **catégorie** affichée (ex. « Café », « Boulangerie ») vient du **template de carte choisi** par l’utilisateur sur la page « Créer ma carte ».
- Le nom d’établissement et, si l’utilisateur a sélectionné un lieu dans l’autocomplete Google, le `place_id` sont bien transmis au créateur de carte, mais ne servent pas à pré-sélectionner une catégorie.

## Catégories côté produit (Myfidpass)

Les catégories correspondent aux **designs** des templates de carte :

| Design (slug) | Libellé affiché | Templates (points / tampons) |
|---------------|------------------|------------------------------|
| `fastfood`    | Fast food        | fastfood-points, fastfood-tampons |
| `beauty`      | Beauté           | beauty-points, beauty-tampons |
| `coiffure`    | Coiffure        | coiffure-points, coiffure-tampons |
| `boulangerie` | Boulangerie     | boulangerie-points, boulangerie-tampons |
| `boucherie`   | Boucherie       | boucherie-points, boucherie-tampons |
| `cafe`        | Café            | cafe-points, cafe-tampons |
| (générique)   | Classique / Moderne / Élégant | classic, bold, elegant |

Ce sont les **vraies** catégories utilisées dans l’app et le SaaS (récap checkout, design de la carte, etc.).

## Peut-on faire une détection à 100 % ?

**Non.** On peut en revanche faire une **suggestion** fiable dans beaucoup de cas.

### 1. Avec Google Place ID (recommandé)

Quand l’utilisateur **choisit un établissement dans l’autocomplete Google** (champ « Nom de votre établissement »), on dispose d’un `place_id`. L’API **Place Details** renvoie un champ **`types`** (liste de types Google).

- **Avantages** : types standardisés (ex. `cafe`, `restaurant`, `bakery`, `hair_care`), bonne couverture pour les commerces déjà présents sur Google.
- **Limites** :
  - Tous les commerces ne sont pas dans Google, ou n’ont qu’un type générique (`establishment`).
  - Un même lieu peut avoir plusieurs types ; il faut définir des règles de priorité (ex. `cafe` avant `restaurant`).
  - Dépendance à la clé Google Places (déjà utilisée pour l’autocomplete et la photo).

**Mapping possible (types Google → design Myfidpass)** :

| Types Google (exemples) | Design suggéré |
|-------------------------|----------------|
| `cafe`, `bar`           | cafe |
| `restaurant`, `meal_delivery`, `meal_takeaway`, `fast_food` | fastfood |
| `bakery`                | boulangerie |
| `butcher`               | boucherie |
| `hair_care`, `beauty_salon` | coiffure ou beauty (à affiner) |
| `spa`                   | beauty |
| Sinon / inconnu         | null → laisser l’utilisateur choisir (ex. template par défaut) |

On peut donc **suggérer** une catégorie (et donc un template) à partir du `place_id`, sans garantir 100 % de justesse.

### 2. Sans Place ID (texte libre)

Si l’utilisateur **tape uniquement le nom** sans sélectionner une suggestion Google, on n’a **pas** de `place_id`, donc pas de types.

- **Option** : analyse du **texte** (nom d’établissement) par **mots-clés** (ex. « café », « bar », « boulangerie », « coiffeur », « restaurant », « fast food », « boucherie », « beauté », « spa »).
- **Limites** : faux positifs (ex. « Café de la Gare » = café, mais « La Caféothèque » = librairie), faux négatifs (orthographe, synonymes). **Pas fiable à 100 %**, mais peut aider en secours.

### 3. Synthèse

- **À 100 % automatique sans jamais se tromper** : non.
- **Suggestion automatique utile** : oui, en combinant :
  1. **Priorité** : si `place_id` présent → appel Place Details → mapping types → catégorie suggérée.
  2. **Secours** : si pas de `place_id` ou pas de type exploitable → mots-clés sur le nom.
  3. **Toujours** : l’utilisateur peut changer le template manuellement ; la suggestion pré-remplit seulement le choix par défaut.

## Implémentation (en place)

1. **Backend**  
   - Route **`GET /api/place-category?place_id=...&name=...`** (fichier `backend/src/routes/place-category.js`).  
   - Si `place_id` et clé `GOOGLE_PLACES_API_KEY` : appel Place Details avec `fields=types`, puis mapping types Google → `suggestedCategory` + `suggestedTemplateId`.  
   - Sinon (ou si aucun type mappable) : analyse par mots-clés sur `name`.  
   - Réponse : `{ suggestedCategory, suggestedTemplateId }` ou `{ suggestedCategory: null, suggestedTemplateId: null }`.

2. **Frontend**  
   - À l’ouverture du créateur de carte avec paramètres d’URL `etablissement` et/ou `place_id`, appel à `/api/place-category`.  
   - Si une suggestion est renvoyée : pré-sélection du template (`suggestedTemplateId`). L’utilisateur peut toujours changer de template.

3. **Base de données**  
   - La catégorie n’est pas stockée en base ; elle reste déduite du template choisi au moment de la création.

---

**En résumé** : on n’a pas aujourd’hui de système de catégorie automatique. Les « vraies » catégories sont celles des designs (fastfood, cafe, boulangerie, boucherie, coiffure, beauty, + classique/modern/élégant). Une détection **à 100 %** n’est pas réaliste ; une **suggestion** automatique (Google Place types + secours mots-clés) est faisable et utile, en laissant toujours le choix final à l’utilisateur.
