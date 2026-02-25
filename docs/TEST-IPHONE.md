# Tester sur iPhone (Apple Wallet)

**localhost** sur ton Mac n’est pas accessible depuis ton iPhone. Il faut utiliser l’**adresse IP** de ton Mac sur le réseau WiFi.

## Étapes

### 1. Mac et iPhone sur la même WiFi

Connecte ton Mac et ton iPhone au **même réseau WiFi**.

### 2. Trouver l’IP de ton Mac

Dans le **Terminal** sur ton Mac :

```bash
ipconfig getifaddr en0
```

Tu obtiens une adresse du type **192.168.1.42** (ou 192.168.0.x). Note-la.

*(Si `en0` ne donne rien, essaie `en1` ou regarde dans Réglages Système → Réseau.)*

### 3. Lancer le backend et le frontend

Sur ton Mac, dans deux terminaux :

```bash
cd /Users/amine/Desktop/fidelity
npm run backend
```

```bash
cd /Users/amine/Desktop/fidelity
npm run frontend
```

Quand Vite démarre, il affiche souvent une ligne **Network: http://192.168.x.x:5173** : c’est l’URL à utiliser sur l’iPhone.

### 4. Sur ton iPhone

1. Ouvre **Safari** (pas Chrome, pour le .pkpass c’est mieux avec Safari).
2. Dans la barre d’adresse, tape : **http://TON_IP:5173/fidelity/demo**  
   (remplace TON_IP par l’IP trouvée à l’étape 2, ex. `http://192.168.1.42:5173/fidelity/demo`).
3. Remplis **nom** et **email**, clique sur **Créer ma carte**.
4. Clique sur **Ajouter à Apple Wallet**.
5. Le fichier de la carte se télécharge : tu peux **Ajouter** pour l’enregistrer dans Wallet.
6. Pour la voir : **double-clic sur le bouton latéral** de l’iPhone → la carte s’affiche.

## En résumé

- **Sur le Mac** : backend + frontend tournent, tu accèdes au site via l’IP du Mac (ex. `http://192.168.1.42:5173`).
- **Sur l’iPhone** : même WiFi, tu ouvres dans Safari **http://192.168.1.42:5173/fidelity/demo** et tu suis les boutons jusqu’à « Ajouter à Apple Wallet ».
