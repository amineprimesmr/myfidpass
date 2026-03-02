# Pourquoi la notification Wallet n’affiche pas le logo (carré vert / icône par défaut)

## Ce que tu vois

Sur iPhone, la notification affiche **« Burger House »** mais l’icône est un **carré vert clair** (ou une icône par défaut) au lieu du logo du fast-food. La petite icône Wallet en bas à droite est normale : c’est iOS qui l’ajoute pour les mises à jour de pass.

## Pourquoi

Pour les **notifications Apple Wallet**, l’icône ne vient **pas** du message push. Elle vient du **fichier pass** (`.pkpass`) déjà sur l’appareil :

1. Quand tu envoies une notif, le serveur envoie juste « pass mis à jour » à l’iPhone.
2. L’iPhone affiche tout de suite la notif avec l’icône du **pass actuel** (celui déjà installé).
3. Ensuite l’iPhone redemande le pass au serveur et le met à jour.

Donc si le pass sur l’appareil a été ajouté **avant** que le logo soit enregistré (ou avec une ancienne version sans logo), la notif affiche l’**ancienne icône** (carré vert / défaut). Le nouveau pass avec le logo n’est utilisé qu’**après** ce re-téléchargement, donc souvent seulement pour la **prochaine** notif.

## Ce qu’il faut vérifier

### 1. Le commerce a bien un logo en base

- Depuis l’**app** ou le **SaaS**, enregistre (ou ré-enregistre) le **logo** pour « Burger House ».
- Vérifie que tu vois bien le logo dans les paramètres du commerce / de la carte.

### 2. Forcer un pass « à jour » avec le logo

Pour que l’icône du **prochain** message soit le logo, il faut que l’iPhone ait déjà re-téléchargé un pass qui contient ce logo. Deux possibilités :

**Option A – Envoyer une 2e notif**  
- Envoie une première notif (comme d’habitude).  
- L’iPhone va re-télécharger le pass (avec le logo si le commerce en a un).  
- La **prochaine** notif que tu envoies devrait alors afficher le logo.

**Option B – Ré-ajouter la carte (le plus fiable)**  
- Le client **supprime la carte** du Wallet.  
- Il rouvre le **lien de partage** (depuis « Partager » sur myfidpass.fr) et ré-ajoute la carte au Wallet.  
- Le pass est alors généré avec le logo tout de suite, et les prochaines notifs afficheront le logo.

### 3. Côté backend (Railway)

- À chaque **envoi de pass** (quand l’iPhone demande le pass), les logs affichent **`LOGO_IN_PASS: OUI`** ou **`LOGO_IN_PASS: NON`** et le `business` (slug).  
- Si tu vois **`logo: non`** pour Burger House, le commerce n’a pas de `logo_base64` en base : il faut enregistrer le logo depuis l’app ou le SaaS puis redéployer / vérifier que la sauvegarde fonctionne.

## En résumé

| Problème | Action |
|----------|--------|
| Commerce sans logo en base | Enregistrer le logo (app ou SaaS) pour Burger House. |
| Pass ajouté avant le logo | Envoyer une notif (pour déclencher un re-téléchargement) puis vérifier la **prochaine** notif ; ou faire ré-ajouter la carte au Wallet. |
| Vérifier côté serveur | Dans Railway → Logs, chercher **« LOGO_IN_PASS »** : `OUI` = logo en base et inclus dans le pass, `NON` = pas de logo pour ce commerce. |

Une fois le logo bien en base et un pass « à jour » (re-téléchargé ou ré-ajouté), les **prochaines** notifications Wallet devraient afficher le logo Burger House.
