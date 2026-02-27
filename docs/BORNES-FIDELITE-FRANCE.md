# Bornes et fidélité en France — Marché et intégration Fidpass

Analyse du marché des « bornes » (terminaux, kiosques, logiciels caisse) liées à la fidélité en France, et comment Fidpass peut s’y connecter.

---

## Intégration universelle : une API pour toutes les caisses et bornes

**Fidpass est intégrable à n'importe quel système** (caisse, borne, TPE, tablette, logiciel métier) dès que ce système peut : (1) **lire le code-barres** de la carte Fidpass (Wallet ou écran) — la valeur lue est l'identifiant du membre (UUID) ; (2) **envoyer une requête HTTP** (GET ou POST) vers l'API Fidpass avec le token du commerce.

Il n'existe **pas** de plugin unique « Fidpass » à installer sur chaque marque de caisse ou borne : chaque éditeur a son propre logiciel. En revanche, **une seule API Fidpass** permet à tout éditeur ou intégrateur de connecter son logiciel en quelques appels HTTP. Ainsi, **la plupart des caisses et bornes peuvent s'intégrer** dès que l'éditeur ou le commerçant ajoute un appel à notre API au moment du scan.

**Documentation technique complète** : voir **[INTEGRATION-API-BORNES-CAISSES.md](./INTEGRATION-API-BORNES-CAISSES.md)** (format du code-barres, authentification, endpoints lookup et scan, exemples curl/JS/Python, gestion d'erreurs, cas d'usage).

---

## 1. De quoi parle-t-on quand on dit « borne » ?

En France, le mot **borne** recouvre plusieurs réalités :

| Type | Description | Exemples |
|------|-------------|----------|
| **Borne de commande** | Écran tactile en libre-service pour commander (restaurant, fast-food). | LogikPOS, Izipass, écrans en franchise |
| **Tablette / TPE en caisse** | Écran ou terminal utilisé par le personnel pour scanner, enregistrer, payer. | Tablette avec app fidélité (Hey Pongo, etc.) |
| **Logiciel de caisse** | Logiciel qui pilote l’encaissement et parfois la fidélité. | Lightspeed, SumUp (Tiller), solutions locales |
| **Lecteur dédié** | Lecteur de code-barres ou NFC à côté de la caisse. | SocketMobile S370, lecteurs USB/Bluetooth |

Souvent, la « borne fidélité » n’est **pas** un appareil spécifique, mais **un logiciel** (app ou caisse) qui tourne sur tablette, PC ou terminal fourni par l’éditeur.

---

## 2. Acteurs récurrents en France (fidélité + caisse / borne)

### 2.1 Fidélité intégrée à la caisse / borne

- **ZEROSIX + Izipass**  
  - Fidélité (ZEROSIX) intégrée dans le logiciel de caisse et **bornes de commande Izipass**.  
  - Inscription / identification par **numéro de téléphone**.  
  - **API** pour intégrer la fidélité dans d’autres logiciels (caisse, borne).  
  - Très orienté restauration / franchise.

- **Hey Pongo**  
  - Fidélité + commande + paiement.  
  - Compatible **TPE, bornes de commande, Click & Collect**.  
  - Identification client par **téléphone**.  
  - **API ouverte** pour connecter caisses, TPE, bornes.

- **Obypay**  
  - Commande par **QR code** à table, paiement, **programme fidélité** (ex. 3 Brasseurs).  
  - Pas de borne physique dédiée : le client scanne un QR sur la table avec son téléphone.

- **FidéliPlus, Fidelycard, FidelPass (autres)**  
  - Solutions fidélité (souvent **numérique, QR, téléphone**).  
  - Utilisées plutôt depuis une **caisse / tablette** du commerçant qu’une « borne » au sens kiosque.

### 2.2 Logiciels de caisse avec partie fidélité ou partenaires

- **Lightspeed**  
  - Caisse cloud, **fidélisation intégrée** ou via partenaires (Como, Hey Pongo, Leat).  
  - Utilisé en retail et restauration.

- **SumUp (Tiller)**  
  - Caisse sur iPad pour restaurants ; moins documenté sur la fidélité native.

- **LogikPOS**  
  - **Bornes de commande en libre-service** + logiciel de caisse pour fast-food / café.  
  - Gestion « programmes fidélité VIP » ; intégration possible avec d’autres systèmes.

En pratique, les « bornes » qui reviennent pour la fidélité en France sont surtout :

1. **Bornes de commande** (Izipass, LogikPOS, etc.) avec un **module fidélité** (souvent fourni par un partenaire type ZEROSIX / Hey Pongo).  
2. **Tablettes / TPE en caisse** sur lesquelles tourne une **app ou un logiciel** de fidélité (identification par téléphone ou QR).  
3. **Lecteurs de code-barres** (ou NFC) branchés à une caisse / un PC qui interroge un **back-office fidélité** (via API).

---

## 3. Comment les commerces avec « borne » gèrent la fidélité aujourd’hui

- **Identification**  
  - Souvent par **numéro de téléphone** (saisi sur la borne ou la caisse), plus rarement par scan de carte / QR / NFC.  
  - Certains systèmes utilisent la **carte bancaire** (identifiant client au paiement) pour lier automatiquement la vente à un compte fidélité.

- **Où ça se passe**  
  - Soit **sur la borne** (client saisit son numéro ou scanne sur un lecteur).  
  - Soit **à la caisse** (employé scanne une carte / un QR ou saisit le numéro).  
  - Soit **sur le téléphone du client** (QR à table, app, etc.) puis enregistrement côté serveur.

- **Technique**  
  - Le logiciel de la borne / caisse appelle une **API** du fournisseur de fidélité (ex. ZEROSIX, Hey Pongo) pour : identifier le client, récupérer son solde, créditer des points, etc.

Donc : pour un commerce avec borne, la fidélité passe en général par un **logiciel (caisse ou borne) qui parle à un back-office fidélité via API**, pas par une marque de borne physique unique.

---

## 4. Où se place Fidpass (carte Apple Wallet avec code-barres)

- Fidpass = **carte dans le Wallet** (iPhone / Android) avec **QR code** contenant l’identifiant membre.
- En caisse / borne, il faut **scanner ce QR code** (caméra, lecteur USB/Bluetooth) et **appeler l’API Fidpass** pour identifier le membre et ajouter des points.

Conséquences pour les commerces qui ont une « borne » :

1. **Pas de borne « Fidpass » dédiée**  
   Fidpass ne fournit pas de borne matérielle ; il fournit une **API** et une **interface web** (scanner sur tablette/phone).

2. **Deux façons d’utiliser Fidpass avec un point de vente**  
   - **Option A — Scanner Fidpass sur un appareil dédié**  
     - Tablette ou téléphone avec la **page Fidpass en mode scanner** (myfidpass.fr/app#scanner).  
     - Le commerçant (ou le client) présente la carte Wallet ; on scanne le code-barres.  
     - Aucune intégration avec la borne existante : la borne peut continuer à gérer commande/paiement, Fidpass gère uniquement la fidélité sur un autre écran.  

   - **Option B — Intégration API dans le logiciel de la borne / caisse**  
     - Le logiciel qui pilote la borne (ou la caisse) **lit le code-barres** (lecteur intégré ou caméra).  
     - Il envoie l’identifiant (ex. `member_id` dans le code) à **l’API Fidpass** (ex. `POST /api/businesses/:slug/members/:memberId/points`).  
     - Nécessite un **partenariat ou un dev** avec l’éditeur de la borne / caisse (comme ZEROSIX le fait avec Izipass).

---

## 5. Marques / types de « bornes » qui reviennent (France)

Résumé des acteurs qui reviennent le plus quand on parle fidélité + point de vente / borne :

| Acteur | Rôle | Fidélité | Intégration possible Fidpass |
|--------|------|----------|------------------------------|
| **Izipass** | Bornes de commande + caisse | Via ZEROSIX (téléphone) | Partenariat : leur logiciel pourrait appeler l’API Fidpass si lecture du code-barres Wallet. |
| **ZEROSIX** | Back-office fidélité + API | Oui (téléphone) | Modèle à reproduire : exposer une **API Fidpass** pour que d’autres logiciels (caisse, borne) créditent les points. |
| **Hey Pongo** | Fidélité + commande + TPE / borne | Oui (téléphone) | Idem : si leur logiciel peut lire un code-barres et appeler une API, un connecteur Fidpass est possible. |
| **LogikPOS** | Bornes commande + caisse | Fidélité VIP | Intégration possible si LogikPOS ouvre une API ou accepte un partenaire fidélité (scan + API). |
| **Lightspeed** | Caisse cloud | Fidélité + partenaires | Partenariat type « Fidpass » comme Hey Pongo / Como : app ou API pour créditer les points depuis la caisse. |
| **Obypay** | QR à table + paiement + fidélité | Oui | Plutôt concurrent sur le flux « client scanne à table » ; pas une borne au sens kiosque. |
| **Lecteurs (ex. SocketMobile)** | Matériel (QR / NFC) | Dépend du logiciel branché | Le logiciel qui reçoit le scan (caisse, borne) doit appeler l’API Fidpass. |

Donc : **ce n’est pas une marque de borne unique**, mais plutôt **quelques éditeurs de logiciel (caisse / borne)** avec qui il faudrait un partenariat ou une intégration API pour que « la borne » gère Fidpass.

---

## 6. Comment ça peut se passer concrètement pour un commerce avec borne

### Cas 1 : Commerce avec borne de commande, sans fidélité sur la borne

- Le client commande sur la **borne**, paie à la caisse.  
- Pour la fidélité : **à la caisse**, le commerçant utilise **Fidpass sur une tablette** (myfidpass.fr/app#scanner) et scanne la carte Wallet du client, ou le client montre son code-barres sur le téléphone.  
- **Aucun changement** sur la borne : Fidpass est utilisé en parallèle.

### Cas 2 : Commerce avec caisse / borne qui a déjà une fidélité (téléphone, carte maison)

- Soit le commerçant **remplace** par Fidpass (Wallet) et garde une tablette en scanner à la caisse.  
- Soit il garde son système actuel ; Fidpass ne s’intègre pas à sa borne sans **accord avec l’éditeur** (voir cas 3).

### Cas 3 : Éditeur de logiciel caisse / borne veut proposer Fidpass

- L’éditeur (ex. type Izipass, LogikPOS, ou un logiciel de caisse) :  
  - ajoute la **lecture du code-barres** Fidpass (caméra ou lecteur) ;  
  - appelle l’**API Fidpass** (identification membre + `POST .../points`) depuis son logiciel.  
- Fidpass doit alors proposer :  
  - une **API stable et documentée** (déjà en place côté Fidpass) ;  
  - éventuellement un **espace partenaire** (clés API, convention).

---

## 7. Recommandations pour Fidpass

1. **Documenter l’API**  
   - Pour les commerces avec borne / caisse « sur mesure » ou intégrateurs : documenter clairement comment, à partir d’un **scan du code-barres** (identifiant membre), appeler l’API pour ajouter des points (et si besoin récupérer le solde).  
   - Prévoir un **exemple d’appel** (curl, Postman) pour `POST .../members/:memberId/points` avec les bons paramètres (points, montant, passage, etc.).

2. **Page « Pour les intégrateurs / éditeurs »**  
   - Expliquer :  
     - Fidpass = carte dans le Wallet, code-barres = identifiant membre ;  
     - flux : scan → appel API → points crédités ;  
     - cas d’usage : caisse, borne de commande, tablette dédiée.  
   - Donner les **URL de base** et les **endpoints** essentiels (auth, ajout de points, optionnel : lecture du solde).

3. **Partenariats ciblés**  
   - Contacter les éditeurs qui reviennent (Izipass/ZEROSIX, Hey Pongo, éventuellement LogikPOS, Lightspeed) pour proposer **Fidpass comme option fidélité** (Wallet + code-barres), avec intégration via API.  
   - Leur valeur ajoutée : proposer la **carte dans le Wallet** en plus (ou à la place) de l’identification par téléphone.

4. **Matériel**  
   - Pour les commerces sans borne évoluée : recommander une **tablette** (ou un téléphone dédié) avec myfidpass.fr en mode scanner, éventuellement un **lecteur de code-barres** (USB/Bluetooth) compatible avec une future app ou une page web qui lit le scan et appelle l’API.

---

## 8. Résumé

- En France, les « bornes » fidélité sont surtout des **logiciels** (caisse, borne de commande, app sur tablette) qui s’appuient sur des **API** de fidélité (ZEROSIX, Hey Pongo, etc.).  
- Les **marques qui reviennent** pour la fidélité liée à un point de vente / borne : **ZEROSIX, Izipass, Hey Pongo, LogikPOS, Lightspeed**, et des solutions type Obypay (QR à table).  
- **Fidpass** peut déjà être utilisé avec une **tablette en mode scanner** à la caisse, sans toucher à la borne.  
- Pour que **la borne (ou la caisse) gère Fidpass directement**, il faut que le **logiciel qui pilote la borne** lise le code-barres Wallet et appelle l’**API Fidpass** ; donc **documentation API** et **partenariats** avec les éditeurs de caisse / borne sont les bons leviers.
