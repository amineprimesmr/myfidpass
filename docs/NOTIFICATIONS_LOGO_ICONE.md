# Icône de notification = logo de l’établissement

## Ce qui a été fait (dans le code)

- **Web Push (navigateur)** : le backend envoie le logo du commerce (redimensionné en 64×64) dans le payload sous la clé `icon`. Le service worker utilise `data.icon` pour afficher l’icône et le badge de la notification.
- **Apple Wallet (iPhone)** : les notifications PassKit sont gérées par iOS ; on ne peut pas personnaliser l’icône (limitation Apple).

## Pour que ça s’active chez toi

Les changements sont **uniquement dans le code**. Il faut :

1. **Déployer le backend** (ex. Railway) pour que les routes `notify` et `notifications/send` envoient bien le champ `icon` dans le payload.
2. **Déployer / republier le frontend** pour que le nouveau `public/sw.js` soit servi (celui qui fait `await event.data.json()` et utilise `data.icon`).
3. **Service worker** : les navigateurs mettent en cache le SW. Après déploiement du nouveau `sw.js` :
   - soit tu attends la prochaine mise à jour du SW (parfois au prochain chargement),
   - soit en dev : Chrome → Application → Service Workers → « Update on reload » puis recharger,
   - soit l’utilisateur peut se désinscrire des notifications puis se réabonner pour repartir sur le nouveau SW.

## Vérifier

- Envoie une notification depuis l’app ou le SaaS.
- **Sur navigateur (Web Push)** : l’icône de la notification doit être le logo de l’établissement (si un logo est configuré).
- **Sur iPhone (Wallet)** : l’icône reste celle du pass / du Portefeuille ; ce comportement est normal.

## Bug corrigé

Dans le service worker, `event.data.json()` est asynchrone (renvoie une Promise). Le code utilisait le résultat sans `await`, donc `data.icon` n’était jamais pris en compte. C’est corrigé : le handler fait maintenant `const parsed = await event.data.json()` puis utilise `parsed.icon`.
