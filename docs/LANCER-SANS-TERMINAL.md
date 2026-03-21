# Lancer le projet sans taper dans le terminal

## Dans Cursor / VS Code

1. **`Cmd + Shift + P`** (macOS) ou **`Ctrl + Shift + P`** (Windows / Linux).
2. Tape **`Tasks: Run Task`** puis Entrée.
3. Choisis **`Fidpass — Dev local (backend + front + navigateur)`**.

Le navigateur s’ouvre sur **http://localhost:5174**. Aucune commande à saisir à la main.

- **Arrêter** : même menu → **`Fidpass — Arrêter dev local`**.
- **Première installation** (après un clone ou un `clean:all`) : **`Fidpass — Installer dépendances (après clone)`**, puis relance la tâche dev local.

## Ce n’est pas un bug : `/api/health`

Si tu vois une page avec seulement :

```json
{"ok":true,"service":"fidelity-api"}
```

c’est **normal** : c’est le **test technique** de l’API (proxy Vite → backend). Ce n’est **pas** l’interface Myfidpass.

- **Site / app** : **http://localhost:5174** (accueil) ou **http://localhost:5174/app** (espace pro, si connecté).
- **Santé API** : `http://localhost:5174/api/health` → JSON (pour vérifier que le backend répond).

## Panneau NPM (optionnel)

Dans la barre latérale, section **NPM Scripts** (si visible), tu peux aussi cliquer sur **`dev:local`** à la place des tâches ci-dessus.
