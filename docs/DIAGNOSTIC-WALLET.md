# Diagnostic Wallet — en 3 étapes (pour sortir de la boucle)

Faire **une seule fois** ces 3 vérifications et noter les résultats. Ça permet de voir exactement où ça bloque.

---

## 1. Persistence et appareils enregistrés

Ouvre dans le navigateur (en étant connecté ou pas, peu importte) :

**https://api.myfidpass.fr/api/health/passkit**

Tu dois voir un JSON avec notamment :
- `passRegistrationsCount` : nombre d’appareils enregistrés (0 = aucun iPhone ne s’est enregistré ou les données ont été perdues)
- `dbExists` : `true` si la base existe
- `DATA_DIR` : doit être `/data` en prod sur Railway

**Note :** Si `passRegistrationsCount` est toujours 0 même après avoir « ré-ajouté » la carte, soit l’iPhone n’appelle jamais notre API, soit le volume Railway n’est pas persistant (à chaque redémarrage les enregistrements sont perdus).

---

## 2. L’API d’enregistrement répond-elle ?

Sur la page **myfidpass.fr/app#notifications**, copie la commande **curl** proposée (Test diagnostic).

Exécute-la dans un terminal. Note **le code HTTP** à la fin (201, 401, 404, 500, etc.) :

- **201** : l’API d’enregistrement fonctionne. Si après ça tu rafraîchis la page Notifications et que le compteur reste à 0, le problème est la **persistence** (volume / DATA_DIR sur Railway).
- **401** : token invalide (mauvais membre ou PASSKIT_SECRET).
- **404** : route ou membre introuvable.
- **500** ou erreur réseau : problème serveur ou URL.

---

## 3. Volume Railway (persistence)

Sur **Railway** → ton service **fidpass-api** :

1. **Variables** : il doit y avoir **DATA_DIR** = **/data** (ou rien si ton volume est monté et que le code utilise /data par défaut).
2. **Volume** : un volume doit être **monté** sur le chemin **/data** pour que la base (et donc les enregistrements PassKit) survive aux redémarrages.

Si aucun volume n’est monté sur /data, à chaque déploiement ou redémarrage la base est réinitialisée et **pass_registrations** redevient 0. Donc même si l’iPhone s’enregistre, au prochain redémarrage tout est perdu.

---

## Résumé : quoi faire selon le résultat

| passRegistrationsCount | curl = 201 ? | Volume /data ? | Conclusion |
|------------------------|-------------|----------------|------------|
| 0 | oui | non | **Ajouter un volume Railway monté sur /data** et DATA_DIR=/data. Sans ça, les enregistrements sont perdus à chaque redémarrage. |
| 0 | oui | oui | L’iPhone n’envoie pas le POST (réseau, URL dans le pass, ou pass ajouté avant la correction des routes). Supprimer la carte, rouvrir le **lien Partager** en nav privée, télécharger un **nouveau** pass, l’ajouter au Wallet, attendre 1 min, revérifier /api/health/passkit. |
| 0 | non | - | Corriger l’API (401/404/500) selon le code retour du curl. |
| > 0 | - | - | Les appareils sont enregistrés. Si la carte ne se met pas à jour, regarder les logs Railway au moment où tu ajoutes des points (push envoyée ? GET pass ensuite ?). |

Une fois ces 3 étapes faites, on peut cibler la cause exacte au lieu de répéter les mêmes consignes.
