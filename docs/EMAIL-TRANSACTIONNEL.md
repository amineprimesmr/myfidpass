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

Si `"transactionalEmailReady": false` et `"provider": "none"`, **aucun mail ne part** tant que tu n’ajoutes pas les variables ci-dessous sur Railway (service backend).

## Option A — Resend (recommandé)

1. Crée un compte sur [resend.com](https://resend.com), récupère une clé API.
2. Vérifie ton domaine `myfidpass.fr` (DNS) pour pouvoir envoyer depuis `noreply@myfidpass.fr` (ou utilise l’adresse de test fournie par Resend pendant les essais).
3. Sur **Railway** → variables du service API :

| Variable           | Exemple                    |
|--------------------|----------------------------|
| `RESEND_API_KEY`   | `re_…`                     |
| `MAIL_FROM`        | `noreply@myfidpass.fr`     |

4. Redéploie le backend si besoin.

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
