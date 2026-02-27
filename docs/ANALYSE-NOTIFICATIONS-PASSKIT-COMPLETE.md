# Analyse complète : notifications Apple Wallet (PassKit) — pourquoi l’iPhone ne s’enregistre pas

Ce document résume l’analyse du système de A à Z et les causes possibles du blocage.

---

## 1. Ce qui fonctionne à 100 %

| Élément | Statut | Preuve |
|--------|--------|--------|
| Génération du pass avec `webServiceURL` | OK | Logs Railway : `[PassKit] Pass généré avec webServiceURL: https://api.myfidpass.fr/api/v1` |
| Variable `PASSKIT_WEB_SERVICE_URL` | OK | Définie sur Railway, utilisée dans le pass |
| Endpoint d’enregistrement (POST /api/v1/devices/.../registrations/...) | OK | Test curl depuis un ordinateur → **HTTP 201** |
| Authentification (token HMAC) | OK | Le même curl enregistre un appareil, le dashboard affiche « 1 appareil » |
| Comptage des appareils (dashboard) | OK | Après le curl, « 1 appareil (Apple Wallet) » s’affiche |
| Envoi de notification (côté serveur) | OK | Le serveur envoie bien vers les tokens enregistrés (le « 1 appareil » actuel a un faux token donc rien reçu, c’est cohérent) |

Conclusion : **le backend et la config (URL, token, API) sont corrects.** Le problème n’est pas là.

---

## 2. Ce qui ne se produit pas

Quand tu **ajoutes la carte au Wallet sur ton iPhone**, le serveur **ne reçoit aucune requête** :

- Aucune ligne `[PassKit] Requête d'enregistrement reçue` dans les logs Railway.
- Donc l’iPhone **n’appelle pas** (ou n’atteint pas) `https://api.myfidpass.fr/api/v1` au moment de l’ajout du pass.

Tout le blocage vient de cette étape : **entre l’iPhone et notre API, la requête d’enregistrement ne nous arrive jamais.**

---

## 2a. Le paradoxe : « J'ai scanné la carte du client et ajouté des points, donc la carte est dans son Wallet — mais 0 appareil enregistré »

C'est une incohérence apparente mais logique. Si tu as pu **scanner le QR code de la carte** du client et lui **ajouter des points**, alors :
- La carte **est bien** dans le Wallet du client (sinon il n'aurait pas pu te la montrer à scanner).
- Le client **a bien** ajouté la carte à son téléphone.

Donc la condition « l'enregistrement se fait quand le client ajoute la carte au Wallet » est remplie. Pourtant notre serveur affiche **0 appareil**. Pourquoi ?

**Deux causes possibles :**

1. **Le pass qu'il a sur son téléphone a été généré sans `webServiceURL`** (ancien déploiement, ancien lien, cache). Au moment où il a ajouté la carte, le fichier `.pkpass` qu'il a téléchargé ne contenait pas l'URL à laquelle l'iPhone doit s'enregistrer. Donc iOS n'a jamais su qu'il devait appeler notre API. → **Solution :** le client **supprime la carte du Wallet**, rouvre le **lien partagé** (depuis « Partager »), clique **« Apple Wallet »** pour télécharger un **pass neuf** (généré avec la config actuelle du serveur), puis ajoute la carte à nouveau. Ensuite vérifier les logs Railway au moment où il l'ajoute.

2. **Le pass contient bien `webServiceURL`** mais **l'iPhone ou le réseau bloque l'appel** (réglages Wallet, pare-feu, certificat SSL, opérateur). La requête ne part pas ou n'arrive jamais à notre serveur. → **Solution :** vérifier Réglages → Wallet sur l'iPhone ; tester en **4G** puis en WiFi ; vérifier que `https://api.myfidpass.fr` s'ouvre sans alerte dans Safari sur l'iPhone.

Pour vérifier que le pass généré **contient** l'URL : télécharger un `.pkpass` depuis le lien partagé, le renommer en `.zip`, ouvrir `pass.json` à l'intérieur et vérifier la présence de `"webServiceURL": "https://api.myfidpass.fr/api/v1"` et `"authenticationToken"`.

---

## 2b. Pourquoi le curl marche mais pas le vrai iPhone ?

- **Curl** : tu l’exécutes depuis ton Mac. La requête part de ton ordinateur vers `api.myfidpass.fr` → le serveur répond 201, tout va bien.
- **iPhone** : quand tu ajoutes le pass au Wallet, c’est **l’iPhone** (ou le réseau opérateur / Apple) qui doit appeler la même URL. Si cette requête est bloquée, différente (réseau, SSL, pare-feu) ou si iOS ne l’envoie pas (réglages Wallet), notre serveur ne reçoit rien.

Donc : **le serveur est bon** (preuve = curl). Le blocage est **entre l’appareil et nous** (réseau, réglages iOS, ou certificat). Voir section 3 pour les pistes.

---

## 2c. « Entreprise alexbarber introuvable » après avoir ajouté la carte

Si tu reviens sur le site et que tu vois « Entreprise « alexbarber » introuvable », c’est souvent un **slug avec une mauvaise casse** (ex. `alexbarber` au lieu de `alexBarber`). Le backend a été mis à jour pour accepter le slug **sans tenir compte de la casse** : `myfidpass.fr/fidelity/alexbarber` et `myfidpass.fr/fidelity/alexBarber` doivent maintenant tous les deux afficher la page de la carte. Pense à rafraîchir après déploiement.

---

## 3. Causes possibles (par ordre de vraisemblance)

### A. Paramètres iOS : mises à jour Wallet désactivées

**À vérifier en priorité.**

Apple documente que les utilisateurs peuvent **désactiver les mises à jour** ou les **notifications** pour Wallet ou pour un pass. Dans ce cas, l’appareil **ne fait pas** la requête d’enregistrement vers `webServiceURL`.

- Sur l’iPhone : **Réglages** → **Wallet et Apple Pay** (ou **Portefeuille**).
- Vérifier qu’aucune option ne désactive les mises à jour / notifications pour Wallet.
- Vérifier aussi : **Réglages** → **Notifications** → **Wallet** (si présent) et s’assurer que les notifications sont autorisées.

Si tout est déjà activé, on ne peut pas aller plus loin côté réglages, mais c’est la cause la plus fréquente quand « le pass s’ajoute mais le serveur ne voit rien ».

---

### B. Certificat SSL ou domaine

L’URL du service doit être en **HTTPS** et le certificat doit être **valide** (pas auto-signé) pour que l’iPhone fasse confiance et envoie la requête.

- En production, `api.myfidpass.fr` est en général derrière Railway (ou un autre hébergeur) avec un vrai certificat. Si le site est accessible en HTTPS sans alerte dans Safari, c’est en principe bon.
- Si tu as un certificat auto-signé ou une alerte de sécurité en ouvrant `https://api.myfidpass.fr` sur l’iPhone, cela peut expliquer que l’enregistrement ne parte jamais.

---

### C. Réseau (pare-feu, VPN, opérateur)

La requête d’enregistrement part **de l’iPhone** vers `https://api.myfidpass.fr`. Si un pare-feu, un VPN ou une règle opérateur bloque cette URL ou ce type de requête, elle n’arrivera jamais au serveur.

- Tester en **désactivant le WiFi** et en utilisant uniquement la **4G** (ou l’inverse), puis ré-ajouter le pass.
- Tester sans VPN si tu en utilises un.
- Tester avec un **autre réseau** (autre box, partage de connexion d’un autre téléphone) pour voir si le comportement change.

---

### D. Comportement connu d’Apple : pas de retry en cas d’échec

Si une **première** tentative d’enregistrement a échoué (réseau, erreur 4xx/5xx, certificat, etc.), Apple **ne réessaie pas** automatiquement. Il faut **supprimer le pass du Wallet** et **réinstaller un pass neuf** (en recliquant sur « Apple Wallet » depuis la page fidélité) pour qu’une nouvelle tentative soit faite.

Tu as déjà fait ça plusieurs fois, donc ce n’est pas « juste » un vieux pass qui n’a pas retenté, mais ça confirme qu’à chaque test il faut bien un **nouveau** pass et une **nouvelle** tentative.

---

### E. Format du pass (webServiceURL / authenticationToken)

Apple exige notamment :

- `webServiceURL` (avec **URL** en majuscules dans le JSON du pass).
- `authenticationToken` d’au moins **16 caractères**.

Dans notre code on utilise bien `passOptions.webServiceURL` et `passOptions.authenticationToken`, et la librairie `passkit-generator` est censée les mettre dans `pass.json`. Les logs confirment que le pass est généré avec la bonne URL. Donc **a priori** le format est bon, mais si tu veux être sûr à 100 %, il faudrait inspecter le contenu d’un `.pkpass` généré (par ex. dézipper et ouvrir `pass.json`) pour confirmer la présence de `webServiceURL` et `authenticationToken`.

---

### F. Certificat Pass Type ID (signature du pass)

Le pass est signé avec le certificat **Pass Type ID** (celui configuré dans `docs/APPLE-WALLET-SETUP.md`). Si ce certificat est **expiré** ou **révoqué**, le pass peut parfois encore s’ajouter au Wallet, mais iOS peut refuser de l’utiliser pour les mises à jour (et donc de l’enregistrer auprès du `webServiceURL`).

- Vérifier dans [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles que le certificat du Pass Type ID est **valide** et **non expiré**.
- Vérifier que le **Pass Type ID** utilisé dans le pass (`PASS_TYPE_ID` en prod) est bien celui associé à ce certificat.

---

### G. Bug ou limitation de la librairie / du flux

On utilise `passkit-generator` avec le 3ᵉ argument du constructeur comme « props » (dont `webServiceURL` et `authenticationToken`). La doc et les exemples indiquent que ces champs sont bien destinés à être écrits dans le pass. Sans inspecter le `.pkpass` réel, on ne peut pas exclure à 100 % un souci de sérialisation (ex. mauvaise casse, champ ignoré), mais les logs et le fait que le pass s’ajoute au Wallet rendent un gros bug côté URL peu probable.

---

## 4. Synthèse honnête

- **Côté serveur et config (URL, token, API, dashboard)** : tout est cohérent et validé (curl → 201, pass généré avec la bonne URL).
- **Côté iPhone** : on n’a **aucune preuve** que la requête d’enregistrement parte ou qu’elle atteigne notre API (aucun log).
- Les causes les plus plausibles sont :
  1. **Réglages iOS** (mises à jour / notifications Wallet désactivées).
  2. **Réseau** (pare-feu, VPN, opérateur) qui bloque la requête.
  3. **Certificat** (SSL du domaine ou certificat Pass Type ID) qui fait qu’iOS ne tente pas ou n’envoie pas la requête.
  4. Comportement ou limitation **côté Apple** (pas de retry, conditions peu documentées pour déclencher l’enregistrement).

On ne peut pas, depuis le code ou les logs, **forcer** l’iPhone à appeler notre URL ; on peut seulement s’assurer que notre côté est correct (ce qui est le cas) et éliminer les causes évitables (réglages, réseau, certificats).

---

## 5. Actions concrètes recommandées

1. **Sur l’iPhone**  
   - Réglages → Wallet et Apple Pay / Portefeuille : s’assurer qu’aucune option ne désactive les mises à jour.  
   - Réglages → Notifications : vérifier Wallet si l’entrée existe.

2. **Réseau**  
   - Refaire un test en **4G uniquement** (WiFi désactivé), puis en **WiFi uniquement**, après avoir supprimé le pass et ré-ajouté un **nouveau** pass (bouton « Apple Wallet » sur la page fidélité).  
   - Regarder les logs Railway **au moment précis** où tu ajoutes le pass (recherche « Requête d'enregistrement »).

3. **Certificats**  
   - Vérifier que le certificat du **Pass Type ID** est valide et non expiré sur le portail Apple Developer.  
   - Ouvrir `https://api.myfidpass.fr` dans Safari sur l’iPhone et vérifier qu’il n’y a pas d’alerte de certificat.

4. **Autre appareil**  
   - Si possible, tester avec un **autre iPhone** (autre compte Apple ou autre utilisateur) pour voir si l’enregistrement apparaît dans les logs. Cela permettrait de savoir si le problème est lié à cet appareil / à ces réglages.

5. **Inspection du pass (pour être sûr à 100 %)**  
   - Sur le site : va sur la page de ta carte, clique sur **« Apple Wallet »** pour télécharger le `.pkpass`.  
   - Sur ton ordi : renomme le fichier en `.zip`, ouvre-le et ouvre le fichier **`pass.json`** à l’intérieur.  
   - Vérifie que tu vois bien **`"webServiceURL": "https://api.myfidpass.fr/api/v1"`** et **`"authenticationToken": "..."`** (une longue chaîne).  
   - Si ces deux champs sont présents et corrects, le pass est bon. Si l’iPhone ne s’enregistre toujours pas, le blocage est côté Apple / iOS / réseau, pas côté pass.

---

## 6. Conclusion

Le système est **correct de A à Z côté backend** : génération du pass avec la bonne URL, API d’enregistrement qui répond 201, token et comptage OK. Le blocage est **uniquement** entre l’iPhone et notre serveur : la requête d’enregistrement **ne nous atteint pas**. Les causes les plus probables sont les réglages Wallet sur l’appareil, le réseau (pare-feu/VPN), ou les certificats. En vérifiant méthodiquement ces points (et si possible en testant sur un autre iPhone), on a les meilleures chances de faire apparaître l’enregistrement et donc les notifications sur ton appareil.
