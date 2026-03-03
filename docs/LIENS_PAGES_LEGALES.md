# Pages légales — Liens SaaS Myfidpass

Toutes les pages légales du site **myfidpass.fr** (frontend fidelity) et les liens à utiliser (App Store, formulaires, etc.).

---

## Liens directs (URLs absolues)

En production, remplacez `https://myfidpass.fr` par votre domaine si différent.

| Page | URL relative | URL complète |
|------|--------------|--------------|
| **Mentions légales** | `/mentions-legales` | `https://myfidpass.fr/mentions-legales` |
| **Politique de confidentialité** | `/politique-confidentialite` | `https://myfidpass.fr/politique-confidentialite` |
| **Conditions générales d'utilisation (CGU)** | `/cgu` | `https://myfidpass.fr/cgu` |
| **Conditions générales de vente (CGV)** | `/cgv` | `https://myfidpass.fr/cgv` |
| **Cookies** | `/cookies` | `https://myfidpass.fr/cookies` |

---

## Où utiliser ces liens

- **App Store Connect** : Politique de confidentialité → `https://myfidpass.fr/politique-confidentialite`
- **Google Play** : Politique de confidentialité → idem
- **Emails (inscription, CGV)** : ajouter en pied de mail les liens CGU, CGV, Politique de confidentialité
- **App iOS (MyFidpass)** : écran « Créer un compte » ou « À propos » → lien vers politique de confidentialité et/ou mentions légales
- **Footer du site** : déjà présents (landing + checkout)

---

## Personnalisation à faire

Dans le fichier **`frontend/src/main.js`**, l’objet **`LEGAL_EDITOR`** (vers la ligne 3438) contient les infos à compléter :

- **`address`** : adresse du siège (obligatoire pour mentions légales)
- **`contact`** : email de contact (déjà `contact@myfidpass.fr`)
- **`host`** : nom de l’hébergeur (ex. Vercel, Railway, OVH)

Rechercher `LEGAL_EDITOR` dans `main.js` et mettre à jour ces champs avant mise en production.

---

## Récapitulatif des pages créées

1. **Mentions légales** — Éditeur, hébergeur, contact, renvoi RGPD.
2. **Politique de confidentialité** — Données collectées, finalités, droits RGPD, sous-traitants (à enrichir si besoin).
3. **CGU** — Acceptation, description du service, compte, usage acceptable, propriété intellectuelle, responsabilité, résiliation, droit applicable.
4. **CGV** — Offres, paiement, rétractation 14 jours, résiliation, remboursement, facturation, droit applicable.
5. **Cookies** — Types de cookies, durée, refus, droits.

Toutes les pages incluent une navigation vers les autres pages légales et « Retour à l’accueil ».
