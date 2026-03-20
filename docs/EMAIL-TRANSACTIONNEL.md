# E-mails transactionnels (réinitialisation mot de passe)

## Comportement actuel

- Le bouton **« Changer le mot de passe »** (Profil) et le flux **« Mot de passe oublié »** (page connexion) appellent `POST /api/auth/forgot-password`.
- Si le compte existe, le serveur crée un token et **tente d’envoyer un e-mail** avec un lien du type  
  `https://myfidpass.fr/login?reset=...`
- **Sans transport d’e-mail configuré sur le backend**, aucun mail ne part. Pour des raisons de sécurité (énumération de comptes), l’API renvoie quand même le message :  
  *« Si un compte existe avec cet email, vous recevrez un lien… »*  
  → l’utilisateur a l’impression que « ça marche » alors qu’**aucun e-mail n’a été envoyé**.

## Vérifier la configuration

Appelle (en production) :

`GET https://api.myfidpass.fr/api/health/email`

Réponse attendue quand tout est prêt :

```json
{ "transactionalEmailReady": true, "provider": "resend" }
```

ou `"provider": "smtp"`.

Si `"transactionalEmailReady": false` et `"provider": "none"`, **aucun mail ne part** tant que tu n’ajoutes pas les variables ci-dessous sur Railway (service **backend** uniquement, pas Vercel).

---

## Resend — pièges fréquents (si tu ne reçois rien)

### 1. Expéditeur `noreply@myfidpass.fr` sans domaine vérifié

Resend **refuse** l’envoi si `from` utilise un domaine que tu n’as pas ajouté et vérifié dans **Resend → Domains**.

- **Soit** tu ajoutes `myfidpass.fr` (DNS) puis tu mets par ex.  
  `MAIL_FROM=Myfidpass <noreply@myfidpass.fr>`  
  ou `RESEND_FROM=Myfidpass <noreply@myfidpass.fr>`
- **Soit** tu ne mets **pas** `MAIL_FROM` sur Railway : le backend utilise alors par défaut  
  `Myfidpass <onboarding@resend.dev>` (domaine de test Resend).

### 2. `onboarding@resend.dev` : destinataires limités

Avec l’expéditeur de test **`onboarding@resend.dev`**, Resend n’envoie en pratique qu’à **l’adresse e-mail du compte Resend** (celle avec laquelle tu t’es inscrit).

- Si ton compte Fidpass est **`…@outlook.com`** mais ton compte Resend est **`…@gmail.com`**, **tu ne recevras pas** le mail de reset sur Outlook.
- **Solutions :**
  - **Produit** : vérifie le domaine `myfidpass.fr` sur Resend + `MAIL_FROM` / `RESEND_FROM` avec `@myfidpass.fr` → tu peux envoyer à **tous** les utilisateurs.
  - **Test** : demande un reset avec un compte Fidpass dont l’e-mail est **le même** que sur Resend, ou teste avec cette adresse.

### 3. Variables sur le bon service Railway

`RESEND_API_KEY` doit être sur le **même service** que l’API Node (celui qui répond sur `api.myfidpass.fr`). Après modification : **redéployer** (Redeploy).

### 4. Logs

- **Resend** → **Logs** : statut de chaque envoi (succès / erreur / rejet).
- **Railway** → logs du service : lignes `[Email] Resend HTTP …` en cas d’erreur API.

---

## Option A — Resend (recommandé)

1. Crée un compte sur [resend.com](https://resend.com), récupère une clé API.
2. **Production (tous les utilisateurs)** : **Domains** → ajoute `myfidpass.fr`, configure les enregistrements DNS, attends « Verified ».
3. Sur **Railway** → variables du service API :

| Variable            | Exemple (production) |
|---------------------|----------------------|
| `RESEND_API_KEY`    | `re_…`               |
| `RESEND_FROM` ou `MAIL_FROM` | `Myfidpass <noreply@myfidpass.fr>` (après vérif DNS) |

4. **Test sans domaine** : laisse `MAIL_FROM` **vide** ; le serveur utilise `Myfidpass <onboarding@resend.dev>`. Rappel : le reset ne partira « visible » que vers l’e-mail de ton compte Resend.

5. Redéploie le backend si besoin.

## Option B — SMTP (fournisseur mail classique)

Sur Railway :

| Variable      | Exemple              |
|---------------|----------------------|
| `SMTP_HOST`   | `smtp.sendgrid.net` ou autre |
| `SMTP_PORT`   | `587`                |
| `SMTP_USER`   | selon le fournisseur |
| `SMTP_PASS`   | mot de passe / clé   |
| `MAIL_FROM`   | expéditeur autorisé  |

## Après configuration

1. Vérifie `GET /api/health/email` → `transactionalEmailReady: true`.
2. Redemande un lien depuis le Profil ou la page login.
3. Regarde aussi les **indésirables / spam** (Outlook peut filtrer les expéditeurs récents).

## Dépannage

- **401 / compte introuvable** : l’e-mail saisi ne correspond à aucun utilisateur en base (faute de frappe, autre adresse).
- **Compte créé uniquement avec Google / Apple** : le compte existe ; le reset par e-mail utilise l’adresse enregistrée sur le compte.
- En cas d’échec d’envoi alors que le transport est configuré, l’API renvoie **500** avec *« Impossible d’envoyer l’email »* — consulter les **logs Railway** (`[Email] Resend HTTP` ou `[Email] SMTP error`).
