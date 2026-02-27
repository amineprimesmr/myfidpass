# Formats de cartes de fidélité (templates wallet)

Ce doc décrit les **formats** (types de programme) qu’on peut proposer pour les cartes Fidpass, ce que le projet gère déjà et ce qu’on peut ajouter pour les **templates** de cartes wallet.

---

## 1. Format **Points** (déjà en place)

- **Principe** : le client accumule des **points** (ex. 1 point par 1 € dépensé, ou 1 point par passage).
- **Affichage carte** : un solde central type **« 42 pts »** ou **« 42 points »**, avec éventuellement un **niveau** (Bronze / Argent / Or selon le total).
- **Utilisation** : le commerçant ajoute des points à chaque achat ; le client peut les échanger contre des récompenses (ex. 10 pts = 1 café offert) → on déduit des points.

**Fidpass aujourd’hui** : tout est en **points** (champ `member.points`, affiché sur Apple Pass et Google Wallet). Les templates « Classique », « Moderne », « Élégant » sont des **designs** (couleurs), pas des formats différents.

**Idée pour les templates** : garder un template **Points** comme base (avec libellé « Points » ou « pts »), éventuellement décliner en « Points + Niveau » (affichage du niveau sur la carte).

---

## 2. Format **Tampons / Stamps** (punch card)

- **Principe** : à chaque passage (ou achat d’un produit ciblé), le client reçoit **1 tampon**. Après **N tampons** (ex. 10), il a droit à une offre (ex. 1 café offert).
- **Affichage carte** : plutôt **« 7 / 10 »** ou **« 7 tampons »** avec une barre / des cases visuelles (7 cases remplies sur 10).
- **Différence avec les points** : pas de conversion € → points ; c’est du « 1 passage = 1 tampon », et un seuil fixe pour la récompense.

**Fidpass** : pas encore de mode « tampons » en base. On peut le modéliser soit :
- comme des **points** avec une règle fixe (1 passage = 1 point, récompense à 10 points), et adapter **l’affichage** sur la carte en « X / 10 » ou « X tampons » ;  
- soit ajouter un champ dédié (ex. `stamps`, `stamp_max`) et un type de programme `stamps`.

**Idée template** : un design **« Tampons »** avec libellé « Tampons » et valeur du type « 7 / 10 » ou « 7 » avec sous-texte « sur 10 ».

---

## 3. Format **Visites** (fréquence)

- **Principe** : on compte le **nombre de visites** (passages). Ex. « 5ᵉ visite offerte » ou « 10ᵉ visite = -10 € ».
- **Affichage carte** : **« 4 visites »** ou **« 4 / 5 »** (prochaine récompense au 5ᵉ passage).

Très proche des tampons ; la logique métier est la même (compteur + seuil). La différence est surtout le **wording** (« visites » vs « tampons ») et éventuellement l’affichage (nombre seul vs X/Y).

**Idée template** : design **« Visites »** avec « X visites » ou « X / Y ».

---

## 4. Format **Niveaux / Tiers** (bronze, argent, or)

- **Principe** : le client appartient à un **niveau** (Bronze → Argent → Or) selon son historique (points totaux ou dépense). Chaque niveau donne des avantages différents (taux de points, offres réservées, etc.).
- **Affichage carte** : le **niveau** est mis en avant (ex. « Or »), éventuellement avec le nombre de points en secondaire.

**Fidpass** : un **niveau** est déjà calculé à partir des points (`getLevel(member.points)`) et affiché sur l’Apple Pass. On peut en faire un template **« Niveaux »** où le niveau est l’info principale et les points en petit.

---

## 5. Format **Solde / Crédit** (carte prépayée)

- **Principe** : le client a un **solde en euros** (carte cadeau ou crédit). Chaque achat décrémente le solde.
- **Affichage carte** : **« 25 € »** ou **« 25,00 € de crédit »**.

**Fidpass** : pas de champ « solde en euros » pour l’instant. Ce serait un nouveau type de programme (stockage en centimes ou en euros, pas en points). Pour les templates wallet, on pourrait prévoir un design **« Crédit »** affichant une valeur monétaire.

---

## 6. Format **Points + Tampons** (hybride)

- **Principe** : deux compteurs (points ET tampons) sur la même carte, avec des règles différentes (ex. points pour les achats, tampons pour les cafés).
- **Affichage carte** : deux blocs, ex. **« 12 pts »** et **「 3 / 5 tampons 」**.

Plus complexe à gérer (règles, API, affichage). On peut le laisser pour une phase ultérieure et se concentrer d’abord sur **Points** et **Tampons** séparément.

---

## Synthèse : quoi proposer comme templates de cartes ?

Pour **commencer** (templates wallet « prêts à l’emploi »), tu peux proposer :

| Template   | Format affiché sur la carte      | Donnée utilisée côté backend |
|-----------|-----------------------------------|------------------------------|
| **Points** (actuel) | « X pts » ou « X points » + niveau optionnel | `member.points` (+ niveau dérivé) |
| **Tampons**        | « X / Y » ou « X tampons »       | `member.points` (ou futur `stamps`) avec seuil fixe (ex. 10) |
| **Visites**        | « X visites » ou « X / Y »       | Idem tampons, wording « visites » |
| **Niveaux**        | « Or » / « Argent » / « Bronze » + points en petit | `member.points` → `getLevel()` |

Ensuite (plus tard) :

- **Crédit** : solde en € (nouveau champ + logique métier).
- **Hybride** : points + tampons sur la même carte.

---

## Côté technique Fidpass

- **Apple Wallet (Pass)** : `pass.js` affiche déjà **Points** (primary) et **Niveau** (secondary). Pour un template « Tampons », il faudrait soit réutiliser le champ points et afficher « X / 10 », soit ajouter un champ dédié dans le pass si Apple le permet.
- **Google Wallet** : `loyaltyPoints` avec `balance.int` ; même idée : soit on garde un entier (points ou nombre de tampons), soit on ajoute un second champ si l’API le permet.
- **Créateur de carte (front)** : les 3 templates actuels (Classique, Moderne, Élégant) ne changent que les **couleurs**. Pour de vrais « formats », il faudrait en plus choisir le **type** (Points vs Tampons vs Visites) et adapter le libellé et l’affichage sur la carte (et plus tard dans l’app / dashboard).

Si tu veux, on peut détailler la prochaine étape concrète : par exemple ajouter un **choix de type** (Points / Tampons / Visites) dans le créateur de carte et adapter les libellés + la génération du pass en conséquence.
