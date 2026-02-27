# Connecter Fidpass à ma caisse ou à ma borne — Guide commerçant

Vous avez une **caisse**, une **borne de commande** ou un **logiciel métier** déjà installé par un prestataire (installateur, éditeur de logiciel) ? Voici comment faire pour que Fidpass fonctionne avec.

---

## En résumé : vous n’avez pas à faire la technique

- **Vous** : vous transmettez un lien et votre token à la personne qui gère votre caisse/borne.
- **Votre prestataire** (installateur, support de votre logiciel de caisse) : il fait l’intégration technique en suivant la documentation. Il n’a pas besoin de compte Fidpass.

Vous n’avez pas besoin de rappeler un prestataire spécial « Fidpass » : **le même prestataire** qui a installé votre caisse ou votre borne peut faire la connexion.

---

## Étapes pour vous (commerçant)

1. Connectez-vous à votre **espace Fidpass** (lien reçu par email).
2. Allez dans **Intégration caisse / borne** (menu de gauche).
3. Dans le bloc **« Comment ça se passe ? »** :
   - Cliquez sur **« Copier le lien »** (lien à envoyer à votre prestataire).
   - Envoyez ce lien par email à la personne qui gère votre caisse ou votre borne (votre installateur, le support de votre logiciel, etc.).
   - Indiquez-lui aussi votre **token** : il est dans l’URL de votre tableau de bord quand vous y accédez par le lien reçu par email (`?token=...`). Vous pouvez copier l’URL complète et la lui envoyer, ou lui donner uniquement la partie token.
4. Votre prestataire ouvre le lien, lit la documentation, et connecte votre système à Fidpass. Il vous dira quand c’est fait.

---

## Qui fait quoi ?

| Rôle | Action |
|------|--------|
| **Vous (commerçant)** | Donner le lien + token à votre prestataire. |
| **Prestataire (installateur / support caisse)** | Lire la doc sur la page, intégrer l’API Fidpass dans votre caisse/borne. |
| **Fidpass** | Fournir l’API et la documentation. |

---

## Dois-je rappeler mon installateur ?

Oui, si vous voulez que la **borne ou la caisse** crédite automatiquement les points Fidpass quand un client scanne sa carte. C’est la même personne qui a installé votre système qui peut ajouter cette connexion (en une fois). Vous n’avez pas besoin d’un autre prestataire spécifique « Fidpass ».

Si vous préférez ne pas toucher à la caisse : vous pouvez utiliser l’**application Fidpass en mode scanner** (depuis votre téléphone ou une tablette) pour scanner la carte du client et ajouter les points à la main. Dans ce cas, pas besoin d’intégration technique.

---

## En cas de doute

- **« Mon prestataire ne connaît pas Fidpass »**  
  La page que vous lui envoyez contient toute la documentation technique. Il n’a pas besoin de compte Fidpass.

- **« Je n’ai pas de prestataire, c’est moi qui gère la caisse »**  
  Si votre logiciel ou borne peut envoyer des requêtes HTTP (sur le web), vous pouvez suivre la même documentation (section « Pour le prestataire / intégrateur ») ou faire appel à un développeur pour une petite intégration.

- **« Je veux juste scanner avec mon téléphone »**  
  Utilisez la section **Caisse rapide** / **Scanner** dans votre espace Fidpass : pas besoin d’intégration borne.
